import Dexie, { type EntityTable } from "dexie";
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

  constructor(name = "money") {
    super(name);
    this.version(1).stores({
      accounts: "++id, order",
      categories: "++id, kind, order",
      transactions:
        "++id, date, type, accountId, toAccountId, categoryId, goalId, storeId, recurringId, parentId, *tags",
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

export const db = new MoneyDB();

export const ALL_TABLES = [
  "categories",
  "transactions",
  "purchaseItems",
  "products",
  "stores",
  "goals",
  "budgets",
  "recurring",
  "templates",
  "settings",
] as const;

export type TableName = (typeof ALL_TABLES)[number];
