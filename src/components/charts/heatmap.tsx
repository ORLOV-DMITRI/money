"use client";

import { eachDay, formatDate, parseISODate, type Period } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import type { SeriesPoint } from "@/lib/analytics/reports";
import { cn } from "@/lib/utils";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const STEPS = [0, 0.18, 0.36, 0.56, 0.8];

/** Календарь трат за месяц: один оттенок, светлее — меньше. Число дня и сумма в подсказке. */
export function SpendingHeatmap({ period, daily, today }: { period: Period; daily: SeriesPoint[]; today: string }) {
  const days = eachDay(period.start, period.end);
  const byDay = new Map(daily.map((d) => [d.key, d.expense]));
  const values = days.map((d) => byDay.get(d) ?? 0).filter((v) => v > 0).sort((a, b) => a - b);
  // квантили, чтобы один крупный день не «выжигал» шкалу
  const q = (p: number) => values[Math.min(values.length - 1, Math.floor(p * values.length))] ?? 0;
  const thresholds = [q(0.25), q(0.5), q(0.75), q(0.92)];
  const level = (v: number) => (v <= 0 ? 0 : 1 + thresholds.filter((t) => v > t).length);
  const lead = (parseISODate(period.start).getDay() + 6) % 7;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] text-muted-foreground">
        {WD.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {Array.from({ length: lead }).map((_, i) => (
          <span key={`e${i}`} />
        ))}
        {days.map((d) => {
          const v = byDay.get(d) ?? 0;
          const l = Math.min(level(v), 4);
          const future = d > today;
          return (
            <div
              key={d}
              title={`${formatDate(d, "d MMMM")}: ${v ? formatMoney(v) : "без трат"}`}
              className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] tabular-nums", future && "opacity-40", d === today && "ring-2 ring-primary")}
              style={{ background: l === 0 ? "var(--muted)" : `color-mix(in oklch, var(--chart-expense) ${STEPS[l] * 100 + 12}%, var(--card))`, color: l >= 3 ? "white" : undefined }}
            >
              {Number(d.slice(8))}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
        меньше
        {[0, 1, 2, 3, 4].map((l) => (
          <span key={l} className="size-3 rounded" style={{ background: l === 0 ? "var(--muted)" : `color-mix(in oklch, var(--chart-expense) ${STEPS[l] * 100 + 12}%, var(--card))` }} />
        ))}
        больше
      </div>
    </div>
  );
}
