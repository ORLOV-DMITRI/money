import { addDaysISO, daysBetween, toISODate, type ISODate } from "@/lib/dates";
import type { Goal, Transaction } from "@/lib/db/schema";

export const PACE_WINDOW_DAYS = 90;

export interface GoalStats {
  balance: number;
  target: number;
  remaining: number;
  /** 0..1 (может быть > 1) */
  progress: number;
  reached: boolean;
  /** дней до дедлайна (включая сегодня), если он есть */
  daysLeft?: number;
  overdue: boolean;
  /** сколько надо откладывать, чтобы успеть к дедлайну */
  required?: { perDay: number; perWeek: number; perMonth: number };
  /** фактический темп пополнений, тиын/день */
  pacePerDay: number;
  /** прогноз даты достижения по текущему темпу */
  forecastDate?: ISODate;
  /** успеваем ли к дедлайну при текущем темпе */
  onTrack?: boolean;
}

export function goalStats(
  goal: Pick<Goal, "target" | "deadline" | "createdAt">,
  txs: Pick<Transaction, "type" | "amount" | "date">[],
  today: ISODate,
): GoalStats {
  let balance = 0;
  for (const tx of txs) {
    if (tx.type === "goal_deposit") balance += tx.amount;
    if (tx.type === "goal_withdraw") balance -= tx.amount;
  }
  const remaining = Math.max(0, goal.target - balance);
  const reached = balance >= goal.target && goal.target > 0;

  // Темп: чистые пополнения за окно (не длиннее срока жизни копилки)
  const firstDate = txs.reduce<ISODate | null>((m, t) => (m == null || t.date < m ? t.date : m), null);
  const created = toISODate(new Date(goal.createdAt));
  const start = [firstDate ?? today, created].sort()[0];
  const windowDays = Math.max(1, Math.min(PACE_WINDOW_DAYS, daysBetween(start, today) + 1));
  const windowStart = addDaysISO(today, -(windowDays - 1));
  let net = 0;
  for (const tx of txs) {
    if (tx.date < windowStart || tx.date > today) continue;
    if (tx.type === "goal_deposit") net += tx.amount;
    if (tx.type === "goal_withdraw") net -= tx.amount;
  }
  const pacePerDay = net > 0 ? net / windowDays : 0;

  const stats: GoalStats = {
    balance,
    target: goal.target,
    remaining,
    progress: goal.target > 0 ? balance / goal.target : 0,
    reached,
    overdue: false,
    pacePerDay,
  };

  if (!reached && pacePerDay > 0) {
    stats.forecastDate = addDaysISO(today, Math.ceil(remaining / pacePerDay));
  }

  if (goal.deadline) {
    const daysLeft = daysBetween(today, goal.deadline) + 1;
    stats.daysLeft = daysLeft;
    stats.overdue = !reached && daysLeft <= 0;
    if (!reached && daysLeft > 0) {
      const perDay = remaining / daysLeft;
      // округляем вверх до целых тенге
      const up = (v: number) => Math.ceil(v / 100) * 100;
      stats.required = { perDay: up(perDay), perWeek: up(perDay * 7), perMonth: up(perDay * 30.44) };
      stats.onTrack = stats.forecastDate != null && stats.forecastDate <= goal.deadline;
    }
  }
  return stats;
}

/** Суммы автоотчислений от прихода по копилкам с autoPercent > 0 */
export function autoDeposits(
  income: number,
  goals: Pick<Goal, "id" | "autoPercent" | "archived" | "completedAt">[],
): { goalId: number; amount: number }[] {
  const out: { goalId: number; amount: number }[] = [];
  let left = income;
  for (const g of goals) {
    if (g.id == null || g.archived || g.completedAt || g.autoPercent <= 0) continue;
    // Округляем до целых тенге — копейки в копилке никому не нужны
    const amount = Math.min(left, Math.round((income * g.autoPercent) / 100 / 100) * 100);
    if (amount <= 0) continue;
    out.push({ goalId: g.id, amount });
    left -= amount;
  }
  return out;
}
