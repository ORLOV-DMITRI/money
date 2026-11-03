import { ALL_TABLES, db, type TableName } from "@/lib/db/db";
import { ensureSeeded } from "@/lib/db/seed";
import { fromTiyn } from "@/lib/money";

export const BACKUP_FORMAT = "money-backup";
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  tables: Record<TableName, unknown[]>;
}

export async function exportBackup(): Promise<Backup> {
  const tables = {} as Record<TableName, unknown[]>;
  await db.transaction("r", ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) tables[t] = await db.table(t).toArray();
  });
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), tables };
}

export function isBackup(x: unknown): x is Backup {
  if (!x || typeof x !== "object") return false;
  const b = x as Partial<Backup>;
  return b.format === BACKUP_FORMAT && typeof b.version === "number" && !!b.tables && typeof b.tables === "object";
}

/** Полностью заменяет данные содержимым резервной копии */
export async function importBackup(raw: unknown): Promise<void> {
  if (!isBackup(raw)) throw new Error("Это не похоже на резервную копию приложения");
  if (raw.version > BACKUP_VERSION) throw new Error("Копия сделана более новой версией приложения");
  await db.transaction("rw", ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) {
      await db.table(t).clear();
      const rows = raw.tables[t];
      if (Array.isArray(rows) && rows.length) await db.table(t).bulkAdd(rows);
    }
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction("rw", ALL_TABLES.map((t) => db.table(t)), async () => {
    for (const t of ALL_TABLES) await db.table(t).clear();
  });
  await ensureSeeded();
}

const TYPE_LABEL: Record<string, string> = {
  expense: "Расход",
  income: "Приход",
  adjustment: "Корректировка",
  goal_deposit: "В копилку",
  goal_withdraw: "Из копилки",
};

function csvCell(v: string | number): string {
  const s = String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV для Excel: разделитель «;», запятая в дробной части, BOM для кириллицы */
export async function exportCSV(): Promise<string> {
  const [txs, categories, goals, stores, items, products] = await Promise.all([
    db.transactions.orderBy("date").toArray(),
    db.categories.toArray(),
    db.goals.toArray(),
    db.stores.toArray(),
    db.purchaseItems.toArray(),
    db.products.toArray(),
  ]);
  const name = <T extends { id?: number; name: string }>(list: T[], id?: number) => list.find((x) => x.id === id)?.name ?? "";
  const itemsByTx = new Map<number, string[]>();
  for (const it of items) {
    const p = name(products, it.productId);
    const l = itemsByTx.get(it.transactionId) ?? [];
    l.push(`${p} ${it.quantity}${it.unit}`);
    itemsByTx.set(it.transactionId, l);
  }
  const header = ["Дата", "Тип", "Сумма", "Категория", "Копилка", "Магазин", "Позиции", "Заметка", "Теги"];
  const rows = txs.map((t) => [
    t.date,
    TYPE_LABEL[t.type],
    String(fromTiyn(t.type === "expense" || t.type === "goal_deposit" ? -t.amount : t.amount)).replace(".", ","),
    name(categories, t.categoryId),
    name(goals, t.goalId),
    name(stores, t.storeId),
    (itemsByTx.get(t.id!) ?? []).join(", "),
    t.note,
    t.tags.join(", "),
  ]);
  return "﻿" + [header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n");
}

export function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
