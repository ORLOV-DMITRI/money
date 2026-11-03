import Dexie from "dexie";
import { detId, newId } from "@/lib/ids";
import { LegacyMoneyDB, SYNCED_TABLES, type MoneyDB, type SyncedTable } from "./db";
import { normalizeKey } from "./schema";

type Row = Record<string, unknown>;
export type LegacyTables = Partial<Record<string, Row[]>>;

/** Ссылки между таблицами: поле → таблица, на которую оно указывает */
const REFS: Record<string, string> = {
  categoryId: "categories",
  goalId: "goals",
  storeId: "stores",
  recurringId: "recurring",
  parentId: "transactions",
  transactionId: "transactions",
  productId: "products",
};

/**
 * Переводит данные со старыми числовыми id (база v1–v3 или резервная копия v1) в новый формат:
 * - счета и переводы убираются, начальные остатки → корректировка «Начальный остаток»;
 * - числовые id → UUID; категории, продукты и магазины получают детерминированные id,
 *   чтобы совпасть с теми же сущностями на других устройствах;
 * - все ссылки между таблицами переписываются.
 */
export function convertLegacyTables(input: LegacyTables): Record<SyncedTable, Row[]> {
  const src: LegacyTables = { ...input };

  // «Единые деньги» для копий, сделанных до отказа от счетов
  if (src.accounts?.length) {
    const initial = src.accounts.filter((a) => !a.archived).reduce((s, a) => s + Number(a.initialBalance ?? 0), 0);
    const txs = (src.transactions ?? []).filter((t) => t.type !== "transfer");
    if (initial !== 0) {
      const first = [...txs].sort((a, b) => String(a.date).localeCompare(String(b.date)))[0];
      const now = Date.now();
      txs.push({ id: -1, type: "adjustment", amount: initial, date: first?.date ?? new Date().toISOString().slice(0, 10), note: "Начальный остаток", tags: [], createdAt: now, updatedAt: now });
    }
    src.transactions = txs;
  } else if (src.transactions) {
    src.transactions = src.transactions.filter((t) => t.type !== "transfer");
  }

  const maps: Record<string, Map<unknown, string>> = {};
  for (const t of SYNCED_TABLES) {
    const m = new Map<unknown, string>();
    for (const row of src[t] ?? []) {
      let id: string;
      if (t === "categories") id = detId("category", String(row.kind), String(row.name));
      else if (t === "products") id = detId("product", normalizeKey(String(row.name)));
      else if (t === "stores") id = detId("store", normalizeKey(String(row.name)));
      else id = typeof row.id === "string" ? row.id : newId();
      m.set(row.id, id);
    }
    maps[t] = m;
  }

  const out = {} as Record<SyncedTable, Row[]>;
  for (const t of SYNCED_TABLES) {
    out[t] = (src[t] ?? []).map((row) => {
      const next: Row = { ...row, id: maps[t].get(row.id) };
      delete next.accountId;
      delete next.toAccountId;
      for (const [field, target] of Object.entries(REFS)) {
        if (next[field] == null) continue;
        const mapped = maps[target]?.get(next[field]);
        if (mapped) next[field] = mapped;
        else delete next[field]; // ссылка «в никуда» — отбрасываем
      }
      if (t === "products" || t === "stores") next.key = normalizeKey(String(row.name));
      return next;
    });
  }
  return out;
}

/** Переносит данные из старой локальной базы «money», если она есть, и удаляет её. */
export async function migrateLegacy(target: MoneyDB, legacyName = "money"): Promise<boolean> {
  if (!(await Dexie.exists(legacyName))) return false;
  const legacy = new LegacyMoneyDB(legacyName);
  const tables: LegacyTables = {};
  try {
    await legacy.open();
    for (const t of legacy.tables) tables[t.name] = await t.toArray();
  } catch (e) {
    // повреждённая или чужая база с таким именем — не мешаем приложению открыться
    console.warn("legacy migration skipped", e);
    return false;
  } finally {
    legacy.close();
  }
  const hasData = (tables.transactions?.length ?? 0) + (tables.goals?.length ?? 0) > 0;
  if (hasData) {
    const converted = convertLegacyTables(tables);
    await target.transaction("rw", SYNCED_TABLES.map((t) => target.table(t)), async () => {
      for (const t of SYNCED_TABLES) if (converted[t].length) await target.table(t).bulkPut(converted[t]);
    });
  }
  await Dexie.delete(legacyName);
  return hasData;
}
