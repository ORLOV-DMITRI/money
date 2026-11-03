import Dexie, { type DBCore, type DBCoreMutateRequest, type EntityTable, type Middleware } from "dexie";
import { newId } from "@/lib/ids";
import type {
  Budget,
  Category,
  Goal,
  Product,
  PurchaseItem,
  Recurring,
  Setting,
  Store,
  Template,
  Transaction,
} from "./schema";

/** Таблицы, которые синхронизируются с сервером (в порядке зависимостей для отправки) */
export const SYNCED_TABLES = [
  "categories",
  "products",
  "stores",
  "goals",
  "transactions",
  "purchaseItems",
  "budgets",
  "recurring",
  "templates",
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export const ALL_TABLES = [...SYNCED_TABLES, "settings"] as const;
export type TableName = (typeof ALL_TABLES)[number];

/** Запись очереди отправки: «строка table/id изменилась локально» */
export interface OutboxEntry {
  /** `${table}:${id}` */
  key: string;
  table: SyncedTable;
  id: string;
  /** версия изменения: после успешной отправки удаляем запись, только если версия не сменилась */
  rev: string;
}

const SYNCED = new Set<string>(SYNCED_TABLES);
export const OUTBOX = "_outbox";

/**
 * DBCore-middleware:
 *  1) выдаёт UUID v7 новым строкам без id;
 *  2) в той же транзакции записывает каждое изменение синхронизируемых таблиц в _outbox.
 * Благодаря этому сервисы ничего не знают о синхронизации.
 */
const outboxMiddleware: Middleware<DBCore> = {
  stack: "dbcore",
  name: "outbox",
  create(down) {
    return {
      ...down,
      transaction(stores, mode, options) {
        const touchesSynced = mode === "readwrite" && stores.some((s) => SYNCED.has(s));
        return down.transaction(touchesSynced && !stores.includes(OUTBOX) ? [...stores, OUTBOX] : stores, mode, options);
      },
      table(name) {
        const table = down.table(name);
        if (!SYNCED.has(name)) return table;
        return {
          ...table,
          async mutate(req: DBCoreMutateRequest) {
            let keys: string[] = [];
            if (req.type === "add" || req.type === "put") {
              for (const v of req.values as { id?: string }[]) if (v.id == null) v.id = newId();
              keys = (req.values as { id: string }[]).map((v) => v.id);
            } else if (req.type === "delete") {
              keys = req.keys as string[];
            } else if (req.type === "deleteRange") {
              const found = await table.query({ trans: req.trans, values: false, query: { index: table.schema.primaryKey, range: req.range } });
              keys = found.result as string[];
            }
            const res = await table.mutate(req);
            if (keys.length) {
              await down.table(OUTBOX).mutate({
                trans: req.trans,
                type: "put",
                values: keys.map((id) => ({ key: `${name}:${id}`, table: name as SyncedTable, id, rev: newId() }) satisfies OutboxEntry),
              });
            }
            return res;
          },
        };
      },
    };
  },
};

export class MoneyDB extends Dexie {
  categories!: EntityTable<Category, "id">;
  transactions!: EntityTable<Transaction, "id">;
  purchaseItems!: EntityTable<PurchaseItem, "id">;
  products!: EntityTable<Product, "id">;
  stores!: EntityTable<Store, "id">;
  goals!: EntityTable<Goal, "id">;
  budgets!: EntityTable<Budget, "id">;
  recurring!: EntityTable<Recurring, "id">;
  templates!: EntityTable<Template, "id">;
  settings!: EntityTable<Setting, "key">;
  _outbox!: EntityTable<OutboxEntry, "key">;

  constructor(name = "money-sync") {
    super(name);
    // Новая база: строковые UUID-ключи (Dexie не умеет менять тип первичного ключа в старой).
    // Данные из старой «money» с числовыми id переносит migrateLegacy().
    this.version(1).stores({
      categories: "id, kind, order",
      transactions: "id, date, type, categoryId, goalId, storeId, recurringId, parentId, *tags",
      purchaseItems: "id, transactionId, productId, categoryId, storeId, date",
      products: "id, key",
      stores: "id, key",
      goals: "id",
      budgets: "id, categoryId",
      recurring: "id, nextDate",
      templates: "id",
      settings: "&key",
      [OUTBOX]: "&key, table",
    });
    this.use(outboxMiddleware);
  }
}

export const db = new MoneyDB();

/** Старая база (до синхронизации): числовые id. Нужна только для переноса данных. */
export class LegacyMoneyDB extends Dexie {
  constructor(name = "money") {
    super(name);
    this.version(1).stores({
      accounts: "++id, order",
      categories: "++id, kind, order",
      transactions: "++id, date, type, accountId, toAccountId, categoryId, goalId, storeId, recurringId, parentId, *tags",
      purchaseItems: "++id, transactionId, productId, categoryId, storeId, date",
      products: "++id, &key",
      stores: "++id, &key",
      goals: "++id",
      budgets: "++id, categoryId",
      recurring: "++id, nextDate",
      templates: "++id",
      settings: "&key",
    });
    // v2: «единые деньги» — без счетов и переводов.
    // Начальные остатки счетов превращаются в одну корректировку «Начальный остаток».
    this.version(2)
      .stores({
        transactions: "++id, date, type, categoryId, goalId, storeId, recurringId, parentId, *tags",
      })
      .upgrade(async (tx) => {
        const accounts = (await tx.table("accounts").toArray()) as { initialBalance?: number; archived?: boolean }[];
        const initial = accounts.filter((a) => !a.archived).reduce((s, a) => s + (a.initialBalance ?? 0), 0);
        const txs = tx.table("transactions");
        await txs.where("type").equals("transfer").delete();
        await txs.toCollection().modify((t: Record<string, unknown>) => {
          delete t.accountId;
          delete t.toAccountId;
        });
        if (initial !== 0) {
          const first = (await txs.orderBy("date").first()) as { date: string } | undefined;
          const now = Date.now();
          await txs.add({ type: "adjustment", amount: initial, date: first?.date ?? new Date().toISOString().slice(0, 10), note: "Начальный остаток", tags: [], createdAt: now, updatedAt: now });
        }
        for (const name of ["recurring", "templates"]) {
          await tx.table(name).toCollection().modify((r: Record<string, unknown>) => {
            delete r.accountId;
          });
        }
      });
    this.version(3).stores({ accounts: null });
  }
}
