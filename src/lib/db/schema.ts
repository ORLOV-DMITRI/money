import type { Frequency, ISODate } from "@/lib/dates";

/** Все суммы — целые тиыны. */
export type Tiyn = number;

export type AccountType = "cash" | "card" | "deposit" | "other";

export interface Account {
  id: number;
  name: string;
  type: AccountType;
  icon: string;
  color: string;
  initialBalance: Tiyn;
  archived: boolean;
  order: number;
  createdAt: number;
}

export type CategoryKind = "expense" | "income";

export interface Category {
  id: number;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** слова для быстрого ввода, в нижнем регистре */
  keywords: string[];
  archived: boolean;
  order: number;
}

export type TransactionType = "expense" | "income" | "transfer" | "goal_deposit" | "goal_withdraw";

export interface Transaction {
  id: number;
  type: TransactionType;
  amount: Tiyn;
  date: ISODate;
  accountId: number;
  toAccountId?: number;
  categoryId?: number;
  goalId?: number;
  storeId?: number;
  note: string;
  tags: string[];
  recurringId?: number;
  /** автоотчисление в копилку, порождённое приходом parentId */
  parentId?: number;
  createdAt: number;
  updatedAt: number;
}

export type Unit = "шт" | "кг" | "г" | "л" | "мл" | "уп";
export const UNITS: Unit[] = ["шт", "кг", "г", "л", "мл", "уп"];

export interface PurchaseItem {
  id: number;
  transactionId: number;
  productId: number;
  categoryId: number;
  storeId?: number;
  quantity: number;
  unit: Unit;
  /** цена за единицу */
  unitPrice: Tiyn;
  total: Tiyn;
  date: ISODate;
}

export interface Product {
  id: number;
  name: string;
  /** нормализованное имя для поиска и уникальности */
  key: string;
  unit: Unit;
  categoryId: number;
  createdAt: number;
}

export interface Store {
  id: number;
  name: string;
  key: string;
}

export interface Goal {
  id: number;
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
  id: number;
  categoryId: number;
  limit: Tiyn;
  period: BudgetPeriod;
}

export type RecurringMode = "auto" | "remind";

export interface Recurring {
  id: number;
  name: string;
  type: "expense" | "income";
  amount: Tiyn;
  accountId: number;
  categoryId: number;
  frequency: Frequency;
  interval: number;
  nextDate: ISODate;
  mode: RecurringMode;
  active: boolean;
  createdAt: number;
}

export interface Template {
  id: number;
  name: string;
  type: "expense" | "income";
  amount: Tiyn;
  accountId: number;
  categoryId: number;
  note: string;
}

export interface Setting {
  key: string;
  value: unknown;
}


export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  cash: "Наличные",
  card: "Карта",
  deposit: "Депозит",
  other: "Другое",
};

export function normalizeKey(name: string): string {
  return name.trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
}
