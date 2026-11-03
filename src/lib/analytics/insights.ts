import { addDaysISO, daysBetween, formatDate, getPeriod, parseISODate, toISODate, type ISODate } from "@/lib/dates";
import { formatMoney, formatPercent, percentChange } from "@/lib/money";
import type { Budget, Category, Goal, Product, PurchaseItem, Transaction } from "@/lib/db/schema";
import { budgetStatus } from "./budgets";
import { goalStats } from "./goals";
import { productStats } from "./products";
import { byCategory, expenseEntries, weekdayAverages } from "./reports";
import { subMonths } from "date-fns";

export type InsightTone = "good" | "bad" | "neutral";

export interface Insight {
  id: string;
  icon: string;
  text: string;
  tone: InsightTone;
  href?: string;
  /** важность для сортировки */
  weight: number;
}

export interface InsightInput {
  today: ISODate;
  txs: Transaction[];
  items: PurchaseItem[];
  categories: Category[];
  products: Product[];
  budgets: Budget[];
  goals: Goal[];
}

const WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
/** Минимальная сумма, чтобы сравнение категорий было осмысленным: 5 000 ₸ */
const MIN_CATEGORY_BASE = 5_000_00;

export function buildInsights(input: InsightInput): Insight[] {
  const { today, txs, items, categories, products, budgets, goals } = input;
  const out: Insight[] = [];
  const catById = new Map(categories.map((c) => [c.id!, c]));
  const entries = expenseEntries(txs, items);

  // 1. Категории: месяц-к-месяцу на одинаковом отрезке (1..сегодняшнее число)
  const month = getPeriod("month", today);
  const mtd = { type: "custom" as const, start: month.start, end: today };
  const prevStart = toISODate(subMonths(parseISODate(month.start), 1));
  const dayOfMonth = daysBetween(month.start, today);
  const prevEndCandidate = addDaysISO(prevStart, dayOfMonth);
  const prevEnd = prevEndCandidate >= month.start ? addDaysISO(month.start, -1) : prevEndCandidate;
  const prev = { type: "custom" as const, start: prevStart, end: prevEnd };
  const cur = new Map(byCategory(entries, mtd).map((c) => [c.categoryId, c.amount]));
  const old = byCategory(entries, prev);
  const changes = old
    .filter((c) => c.categoryId != null && c.amount >= MIN_CATEGORY_BASE)
    .map((c) => ({ id: c.categoryId!, from: c.amount, to: cur.get(c.categoryId) ?? 0 }))
    .map((c) => ({ ...c, pct: percentChange(c.from, c.to) ?? 0 }))
    .filter((c) => Math.abs(c.pct) >= 25)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, 2);
  for (const c of changes) {
    const cat = catById.get(c.id);
    if (!cat) continue;
    const more = c.pct > 0;
    out.push({
      id: `cat-${c.id}`,
      icon: cat.icon,
      text: `На «${cat.name}» в этом месяце ушло на ${formatPercent(Math.abs(c.pct))} ${more ? "больше" : "меньше"}, чем за то же время в прошлом (${formatMoney(c.to)} против ${formatMoney(c.from)})`,
      tone: more ? "bad" : "good",
      href: `/transactions/?category=${c.id}`,
      weight: 60 + Math.min(30, Math.abs(c.pct) / 5),
    });
  }

  // 2. Общий темп расходов месяца
  let curTotal = 0;
  let prevTotal = 0;
  for (const e of entries) {
    if (e.date >= mtd.start && e.date <= mtd.end) curTotal += e.amount;
    if (e.date >= prev.start && e.date <= prev.end) prevTotal += e.amount;
  }
  const pace = percentChange(prevTotal, curTotal);
  if (pace != null && prevTotal >= MIN_CATEGORY_BASE * 4 && Math.abs(pace) >= 10) {
    out.push({
      id: "pace",
      icon: pace > 0 ? "📈" : "📉",
      text: `С начала месяца ты тратишь на ${formatPercent(Math.abs(pace))} ${pace > 0 ? "больше" : "меньше"}, чем в прошлом месяце к этому числу`,
      tone: pace > 0 ? "bad" : "good",
      href: "/reports/",
      weight: 55,
    });
  }

  // 3. Личная инфляция по продуктам
  const itemsByProduct = new Map<number, PurchaseItem[]>();
  for (const it of items) {
    const l = itemsByProduct.get(it.productId);
    if (l) l.push(it);
    else itemsByProduct.set(it.productId, [it]);
  }
  const priceChanges: { p: Product; pct: number; six: boolean }[] = [];
  for (const p of products) {
    const its = itemsByProduct.get(p.id!);
    if (!its || its.length < 3) continue;
    const s = productStats(its, p.unit, today);
    const pct = s.changeSixMonths ?? s.changeSinceFirst;
    if (pct != null && Math.abs(pct) >= 10) priceChanges.push({ p, pct, six: s.changeSixMonths != null });
  }
  priceChanges.sort((a, b) => b.pct - a.pct);
  for (const c of priceChanges.slice(0, 2)) {
    out.push({
      id: `price-${c.p.id}`,
      icon: c.pct > 0 ? "🏷️" : "🎉",
      text: `${c.p.name} ${c.pct > 0 ? "подорожал(о)" : "подешевел(о)"} на ${formatPercent(Math.abs(c.pct))} ${c.six ? "за полгода" : "с первой покупки"}`,
      tone: c.pct > 0 ? "bad" : "good",
      href: `/products/view/?id=${c.p.id}`,
      weight: 50 + Math.min(20, Math.abs(c.pct) / 2),
    });
  }

  // 4. Бюджеты, которые закончатся раньше срока
  for (const b of budgets) {
    const st = budgetStatus(b, entries, today);
    const cat = catById.get(b.categoryId);
    if (!cat) continue;
    if (st.level === "over") {
      out.push({
        id: `budget-${b.id}`,
        icon: "🚨",
        text: `Бюджет на «${cat.name}» превышен на ${formatMoney(st.spent - st.limit)}`,
        tone: "bad",
        href: "/budgets/",
        weight: 90,
      });
    } else if (st.exhaustDate && st.exhaustDate < st.period.end) {
      out.push({
        id: `budget-${b.id}`,
        icon: "⏳",
        text: `При текущем темпе бюджет на «${cat.name}» закончится ${formatDate(st.exhaustDate, "d MMMM")}`,
        tone: "bad",
        href: "/budgets/",
        weight: 80,
      });
    }
  }

  // 5. Доля сбережений за последние 3 полных месяца + текущий
  const from3 = toISODate(subMonths(parseISODate(month.start), 3));
  let income = 0;
  let saved = 0;
  for (const tx of txs) {
    if (tx.date < from3 || tx.date > today) continue;
    if (tx.type === "income") income += tx.amount;
    if (tx.type === "goal_deposit") saved += tx.amount;
    if (tx.type === "goal_withdraw") saved -= tx.amount;
  }
  if (income > 0 && saved > 0) {
    const rate = (saved / income) * 100;
    out.push({
      id: "savings-rate",
      icon: "🐷",
      text: `Ты откладываешь в копилки в среднем ${formatPercent(rate)} дохода${rate >= 10 ? " — отличный темп!" : ""}`,
      tone: rate >= 10 ? "good" : "neutral",
      href: "/goals/",
      weight: 40,
    });
  }

  // 6. Самый дорогой день недели (последние 90 дней)
  const last90 = { type: "custom" as const, start: addDaysISO(today, -89), end: today };
  const wd = weekdayAverages(txs, last90);
  const avg = wd.reduce((s, v) => s + v, 0) / 7;
  const maxIdx = wd.indexOf(Math.max(...wd));
  if (avg > 0 && wd[maxIdx] > avg * 1.4) {
    out.push({
      id: "weekday",
      icon: "📅",
      text: `Самый дорогой день недели — ${WEEKDAYS[maxIdx]}: в среднем ${formatMoney(wd[maxIdx])} против ${formatMoney(Math.round(avg))} в обычный день`,
      tone: "neutral",
      href: "/reports/",
      weight: 30,
    });
  }

  // 7. Копилки: отстаём от графика / цель близко
  for (const g of goals) {
    if (g.archived || g.completedAt) continue;
    const gtx = txs.filter((t) => t.goalId === g.id);
    const st = goalStats(g, gtx, today);
    if (st.reached) {
      out.push({ id: `goal-${g.id}`, icon: "🎉", text: `Копилка «${g.name}» собрана! Можно закрывать цель`, tone: "good", href: `/goals/view/?id=${g.id}`, weight: 85 });
    } else if (st.required && st.onTrack === false) {
      out.push({
        id: `goal-${g.id}`,
        icon: g.icon,
        text: `Чтобы успеть с «${g.name}» к ${formatDate(g.deadline!, "d MMMM")}, откладывай по ${formatMoney(st.required.perWeek)} в неделю`,
        tone: "neutral",
        href: `/goals/view/?id=${g.id}`,
        weight: 45,
      });
    } else if (st.progress >= 0.9) {
      out.push({ id: `goal-${g.id}`, icon: g.icon, text: `До цели «${g.name}» осталось всего ${formatMoney(st.remaining)}`, tone: "good", href: `/goals/view/?id=${g.id}`, weight: 45 });
    }
  }

  return out.sort((a, b) => b.weight - a.weight);
}
