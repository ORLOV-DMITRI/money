import { addDaysISO, daysBetween, getPeriod, inPeriod, periodLength, type ISODate, type Period } from "@/lib/dates";
import type { Budget } from "@/lib/db/schema";
import type { ExpenseEntry } from "./reports";

export type BudgetLevel = "ok" | "warn" | "over";

export const WARN_RATIO = 0.8;

export interface BudgetStatus {
  period: Period;
  spent: number;
  limit: number;
  remaining: number;
  ratio: number;
  level: BudgetLevel;
  /** прогноз трат к концу периода по текущему темпу */
  forecast: number;
  /** когда при текущем темпе закончится лимит (если раньше конца периода) */
  exhaustDate?: ISODate;
  /** сколько можно тратить в день до конца периода */
  dailyAllowance: number;
}

export function budgetLevel(ratio: number): BudgetLevel {
  if (ratio > 1) return "over";
  if (ratio >= WARN_RATIO) return "warn";
  return "ok";
}

export function budgetPeriod(b: Pick<Budget, "period">, today: ISODate): Period {
  return getPeriod(b.period, today);
}

export function budgetStatus(
  b: Pick<Budget, "categoryId" | "limit" | "period">,
  entries: ExpenseEntry[],
  today: ISODate,
): BudgetStatus {
  const period = budgetPeriod(b, today);
  let spent = 0;
  for (const e of entries) if (e.categoryId === b.categoryId && inPeriod(e.date, period)) spent += e.amount;
  const total = periodLength(period);
  const elapsed = Math.min(total, daysBetween(period.start, today) + 1);
  const daysLeft = total - elapsed + 1;
  const pace = elapsed > 0 ? spent / elapsed : 0;
  const forecast = Math.round(pace * total);
  const ratio = b.limit > 0 ? spent / b.limit : 0;
  const status: BudgetStatus = {
    period,
    spent,
    limit: b.limit,
    remaining: b.limit - spent,
    ratio,
    level: budgetLevel(ratio),
    forecast,
    dailyAllowance: Math.max(0, Math.floor((b.limit - spent) / daysLeft)),
  };
  if (pace > 0 && spent < b.limit) {
    const date = addDaysISO(period.start, Math.ceil(b.limit / pace) - 1);
    if (date <= period.end) status.exhaustDate = date;
  }
  return status;
}

/** Порог, который пересекла категория после новой траты: для предупреждения */
export function crossedThreshold(before: number, after: number, limit: number): BudgetLevel | null {
  if (limit <= 0) return null;
  const a = before / limit;
  const b = after / limit;
  if (a <= 1 && b > 1) return "over";
  if (a < WARN_RATIO && b >= WARN_RATIO) return "warn";
  return null;
}
