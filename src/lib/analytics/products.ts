import { addDaysISO, type ISODate } from "@/lib/dates";
import { percentChange } from "@/lib/money";
import type { PurchaseItem, Unit } from "@/lib/db/schema";

/** Перевод цены за единицу в базовую единицу продукта (г → кг, мл → л) */
const UNIT_FACTOR: Partial<Record<Unit, { base: Unit; factor: number }>> = {
  г: { base: "кг", factor: 1000 },
  мл: { base: "л", factor: 1000 },
};

export function normalizeUnitPrice(unitPrice: number, unit: Unit, baseUnit: Unit): number {
  if (unit === baseUnit) return unitPrice;
  const f = UNIT_FACTOR[unit];
  if (f && f.base === baseUnit) return unitPrice * f.factor;
  const g = UNIT_FACTOR[baseUnit];
  if (g && g.base === unit) return unitPrice / g.factor;
  return unitPrice;
}

export interface PricePoint {
  date: ISODate;
  price: number;
  storeId?: number;
}

export interface StorePrice {
  storeId: number | undefined;
  avg: number;
  min: number;
  last: number;
  count: number;
}

export interface ProductStats {
  count: number;
  totalSpent: number;
  totalQty: number;
  history: PricePoint[];
  first?: PricePoint;
  last?: PricePoint;
  min: number;
  max: number;
  avg: number;
  /** изменение последней цены относительно первой покупки, % */
  changeSinceFirst: number | null;
  /** изменение относительно цены ~полгода назад, % */
  changeSixMonths: number | null;
  byStore: StorePrice[];
}

export function productStats(
  items: Pick<PurchaseItem, "date" | "unitPrice" | "unit" | "quantity" | "total" | "storeId">[],
  baseUnit: Unit,
  today: ISODate,
): ProductStats {
  const sorted = [...items].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const history: PricePoint[] = sorted.map((it) => ({
    date: it.date,
    price: Math.round(normalizeUnitPrice(it.unitPrice, it.unit, baseUnit)),
    storeId: it.storeId,
  }));
  const prices = history.map((h) => h.price);
  const totalSpent = sorted.reduce((s, i) => s + i.total, 0);
  const totalQty = sorted.reduce((s, i) => s + i.quantity, 0);
  const first = history[0];
  const last = history[history.length - 1];

  // Цена полгода назад: последняя покупка не позже today-180, но не старше 9 месяцев
  const sixAgo = addDaysISO(today, -180);
  const tooOld = addDaysISO(today, -270);
  const past = [...history].reverse().find((h) => h.date <= sixAgo && h.date >= tooOld);

  const storeMap = new Map<number | undefined, PricePoint[]>();
  for (const h of history) {
    const l = storeMap.get(h.storeId);
    if (l) l.push(h);
    else storeMap.set(h.storeId, [h]);
  }
  const byStore: StorePrice[] = [...storeMap.entries()]
    .map(([storeId, pts]) => ({
      storeId,
      avg: Math.round(pts.reduce((s, p) => s + p.price, 0) / pts.length),
      min: Math.min(...pts.map((p) => p.price)),
      last: pts[pts.length - 1].price,
      count: pts.length,
    }))
    .sort((a, b) => a.avg - b.avg);

  return {
    count: sorted.length,
    totalSpent,
    totalQty,
    history,
    first,
    last,
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
    avg: prices.length ? Math.round(prices.reduce((s, p) => s + p, 0) / prices.length) : 0,
    changeSinceFirst: first && last && history.length > 1 ? percentChange(first.price, last.price) : null,
    changeSixMonths: past && last ? percentChange(past.price, last.price) : null,
    byStore,
  };
}
