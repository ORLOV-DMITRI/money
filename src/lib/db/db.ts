import Dexie, { type EntityTable } from "dexie";
import type {
  Account,
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
  accounts!: EntityTable<Account, "id">;
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
  }
}

export const db = new MoneyDB();

export const ALL_TABLES = [
  "accounts",
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
