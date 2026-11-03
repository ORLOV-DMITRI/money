import type { Frequency, ISODate } from "@/lib/dates";
import type { Id } from "@/lib/ids";

export type { Id };

/** Все суммы — целые тиыны. */
export type Tiyn = number;

export type CategoryKind = "expense" | "income";

export interface Category {
  id: Id;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** слова для быстрого ввода, в нижнем регистре */
  keywords: string[];
  archived: boolean;
  order: number;
}

/**
 * adjustment — корректировка баланса: стартовый остаток или сверка с реальностью.
 * Только у неё amount может быть отрицательным; в отчёты по тратам не попадает.
 */
export type TransactionType = "expense" | "income" | "goal_deposit" | "goal_withdraw" | "adjustment";

export interface Transaction {
  id: Id;
  type: TransactionType;
  amount: Tiyn;
  date: ISODate;
  categoryId?: Id;
  goalId?: Id;
  storeId?: Id;
  note: string;
  tags: string[];
  recurringId?: Id;
  /** автоотчисление в копилку, порождённое приходом parentId */
  parentId?: Id;
  createdAt: number;
  updatedAt: number;
}

export type Unit = "шт" | "кг" | "г" | "л" | "мл" | "уп";
export const UNITS: Unit[] = ["шт", "кг", "г", "л", "мл", "уп"];

export interface PurchaseItem {
  id: Id;
  transactionId: Id;
  productId: Id;
  categoryId: Id;
  storeId?: Id;
  quantity: number;
  unit: Unit;
  /** цена за единицу */
  unitPrice: Tiyn;
  total: Tiyn;
  date: ISODate;
}

export interface Product {
  id: Id;
  name: string;
  /** нормализованное имя для поиска и уникальности */
  key: string;
  unit: Unit;
  categoryId: Id;
  createdAt: number;
}

export interface Store {
  id: Id;
  name: string;
  key: string;
}

export interface Goal {
  id: Id;
  name: string;
  icon: string;
  color: string;
  target: Tiyn;
  deadline?: ISODate;
  /** 0–100: процент от каждого прихода, который автоматически уходит в копилку */
  autoPercent: number;
  archived: boolean;
  completedAt?: number;
  createdAt: number;
}

export type BudgetPeriod = "month" | "week";

export interface Budget {
  id: Id;
  categoryId: Id;
  limit: Tiyn;
  period: BudgetPeriod;
}

export type RecurringMode = "auto" | "remind";

export interface Recurring {
  id: Id;
  name: string;
  type: "expense" | "income";
  amount: Tiyn;
  categoryId: Id;
  frequency: Frequency;
  interval: number;
  nextDate: ISODate;
  mode: RecurringMode;
  active: boolean;
  createdAt: number;
}

export interface Template {
  id: Id;
  name: string;
  type: "expense" | "income";
  amount: Tiyn;
  categoryId: Id;
  note: string;
}

export interface Setting {
  key: string;
  value: unknown;
}

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}
