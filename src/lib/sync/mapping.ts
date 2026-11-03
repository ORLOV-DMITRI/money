import type { SyncedTable } from "@/lib/db/db";

/** Строка в Postgres: snake_case + служебные поля */
export type ServerRow = Record<string, unknown> & { id: string; synced_at?: string; deleted_at?: string | null };

export const SERVER_TABLE: Record<SyncedTable, string> = {
  categories: "categories",
  products: "products",
  stores: "stores",
  goals: "goals",
  transactions: "transactions",
  purchaseItems: "purchase_items",
  budgets: "budgets",
  recurring: "recurring",
  templates: "templates",
};

/** Поля, имена которых в Postgres зарезервированы или неудобны */
const RENAME: Record<string, string> = { order: "sort_order", limit: "limit_amount", interval: "every_n" };
const RENAME_BACK = Object.fromEntries(Object.entries(RENAME).map(([a, b]) => [b, a]));
const SERVER_ONLY = new Set(["user_id", "synced_at", "deleted_at"]);

const toSnake = (k: string) => RENAME[k] ?? k.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
const toCamel = (k: string) => RENAME_BACK[k] ?? k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toServer(row: Record<string, unknown>, userId: string): ServerRow {
  const out: Record<string, unknown> = { user_id: userId, deleted_at: null };
  for (const [k, v] of Object.entries(row)) out[toSnake(k)] = v === undefined ? null : v;
  return out as ServerRow;
}

export function fromServer(row: ServerRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (SERVER_ONLY.has(k) || v === null) continue; // null → поле отсутствует, как в локальных данных
    out[toCamel(k)] = v;
  }
  return out;
}
