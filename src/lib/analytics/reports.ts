import { addMonths, format } from "date-fns";
import { ru } from "date-fns/locale";
import { eachDay, inPeriod, parseISODate, periodLength, toISODate, type ISODate, type Period } from "@/lib/dates";
import type { PurchaseItem, Transaction } from "@/lib/db/schema";

/** Расход, разложенный по категории: одна запись на позицию чека или на всю операцию */
export interface ExpenseEntry {
  txId: number;
  date: ISODate;
  categoryId: number | undefined;
  amount: number;
}

export function groupItemsByTx<T extends Pick<PurchaseItem, "transactionId">>(items: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const it of items) {
    const list = map.get(it.transactionId);
    if (list) list.push(it);
    else map.set(it.transactionId, [it]);
  }
  return map;
}

/**
 * Раскладывает расходы по категориям. Чек делится по категориям позиций;
 * если сумма позиций не совпала с суммой операции, остаток идёт в категорию операции.
 */
export function expenseEntries(
  txs: Transaction[],
  items: Pick<PurchaseItem, "transactionId" | "categoryId" | "total">[],
): ExpenseEntry[] {
  const byTx = groupItemsByTx(items);
  const out: ExpenseEntry[] = [];
  for (const tx of txs) {
    if (tx.type !== "expense" || tx.id == null) continue;
    const its = byTx.get(tx.id);
    if (!its?.length) {
      out.push({ txId: tx.id, date: tx.date, categoryId: tx.categoryId, amount: tx.amount });
      continue;
    }
    let rest = tx.amount;
    for (const it of its) {
      out.push({ txId: tx.id, date: tx.date, categoryId: it.categoryId, amount: it.total });
      rest -= it.total;
    }
    if (rest !== 0) out.push({ txId: tx.id, date: tx.date, categoryId: tx.categoryId, amount: rest });
  }
  return out;
}

export interface PeriodSummary {
  income: number;
  expense: number;
  net: number;
  /** чистые пополнения копилок */
  saved: number;
  avgDailyExpense: number;
  count: number;
}

export function summarize(txs: Transaction[], period: Period, today?: ISODate): PeriodSummary {
  let income = 0;
  let expense = 0;
  let saved = 0;
  let count = 0;
  for (const tx of txs) {
    if (!inPeriod(tx.date, period)) continue;
    if (tx.type === "income") (income += tx.amount), count++;
    else if (tx.type === "expense") (expense += tx.amount), count++;
    else if (tx.type === "goal_deposit") saved += tx.amount;
    else if (tx.type === "goal_withdraw") saved -= tx.amount;
  }
  // Для текущего периода делим на прошедшие дни, а не на всю длину
  let days = periodLength(period);
  if (today && inPeriod(today, period)) days = eachDay(period.start, today).length;
  return { income, expense, net: income - expense, saved, avgDailyExpense: days ? Math.round(expense / days) : 0, count };
}

export interface CategoryShare {
  categoryId: number | undefined;
  amount: number;
  share: number;
}

export function byCategory(entries: ExpenseEntry[], period: Period): CategoryShare[] {
  const map = new Map<number | undefined, number>();
  let total = 0;
  for (const e of entries) {
    if (!inPeriod(e.date, period)) continue;
    map.set(e.categoryId, (map.get(e.categoryId) ?? 0) + e.amount);
    total += e.amount;
  }
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .filter((c) => c.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

export function incomeByCategory(txs: Transaction[], period: Period): CategoryShare[] {
  const map = new Map<number | undefined, number>();
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== "income" || !inPeriod(tx.date, period)) continue;
    map.set(tx.categoryId, (map.get(tx.categoryId) ?? 0) + tx.amount);
    total += tx.amount;
  }
  return [...map.entries()]
    .map(([categoryId, amount]) => ({ categoryId, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface SeriesPoint {
  key: string;
  label: string;
  income: number;
  expense: number;
}

export function dailySeries(txs: Transaction[], period: Period): SeriesPoint[] {
  const days = eachDay(period.start, period.end);
  const map = new Map(days.map((d) => [d, { income: 0, expense: 0 }]));
  for (const tx of txs) {
    const p = map.get(tx.date);
    if (!p) continue;
    if (tx.type === "income") p.income += tx.amount;
    if (tx.type === "expense") p.expense += tx.amount;
  }
  const short = days.length <= 7;
  return days.map((d) => ({
    key: d,
    label: format(parseISODate(d), short ? "EEEEEE" : "d", { locale: ru }),
    ...map.get(d)!,
  }));
}

export function monthlySeries(txs: Transaction[], period: Period): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  let d = parseISODate(period.start);
  d = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = parseISODate(period.end);
  const idx = new Map<string, SeriesPoint>();
  while (d <= end) {
    const key = toISODate(d).slice(0, 7);
    const p = { key, label: format(d, "LLL", { locale: ru }).replace(".", ""), income: 0, expense: 0 };
    out.push(p);
    idx.set(key, p);
    d = addMonths(d, 1);
  }
  for (const tx of txs) {
    if (!inPeriod(tx.date, period)) continue;
    const p = idx.get(tx.date.slice(0, 7));
    if (!p) continue;
    if (tx.type === "income") p.income += tx.amount;
    if (tx.type === "expense") p.expense += tx.amount;
  }
  return out;
}

/** Ряд для графика: по дням до ~2 месяцев, иначе по месяцам */
export function seriesFor(txs: Transaction[], period: Period): SeriesPoint[] {
  return periodLength(period) > 62 ? monthlySeries(txs, period) : dailySeries(txs, period);
}

export interface TopItem<K> {
  id: K;
  amount: number;
  count: number;
}

export function topProducts(
  items: Pick<PurchaseItem, "productId" | "total" | "date">[],
  period: Period,
  limit = 10,
): TopItem<number>[] {
  const map = new Map<number, TopItem<number>>();
  for (const it of items) {
    if (!inPeriod(it.date, period)) continue;
    const t = map.get(it.productId) ?? { id: it.productId, amount: 0, count: 0 };
    t.amount += it.total;
    t.count++;
    map.set(it.productId, t);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function topStores(txs: Transaction[], period: Period, limit = 10): TopItem<number>[] {
  const map = new Map<number, TopItem<number>>();
  for (const tx of txs) {
    if (tx.type !== "expense" || tx.storeId == null || !inPeriod(tx.date, period)) continue;
    const t = map.get(tx.storeId) ?? { id: tx.storeId, amount: 0, count: 0 };
    t.amount += tx.amount;
    t.count++;
    map.set(tx.storeId, t);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}

export function byTag(txs: Transaction[], period: Period): TopItem<string>[] {
  const map = new Map<string, TopItem<string>>();
  for (const tx of txs) {
    if (tx.type !== "expense" || !inPeriod(tx.date, period)) continue;
    for (const tag of tx.tags) {
      const t = map.get(tag) ?? { id: tag, amount: 0, count: 0 };
      t.amount += tx.amount;
      t.count++;
      map.set(tag, t);
    }
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount);
}

/** Средний расход по дням недели (0 = понедельник) за период */
export function weekdayAverages(txs: Transaction[], period: Period): number[] {
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const d of eachDay(period.start, period.end)) counts[(parseISODate(d).getDay() + 6) % 7]++;
  for (const tx of txs) {
    if (tx.type !== "expense" || !inPeriod(tx.date, period)) continue;
    sums[(parseISODate(tx.date).getDay() + 6) % 7] += tx.amount;
  }
  return sums.map((s, i) => (counts[i] ? Math.round(s / counts[i]) : 0));
}
