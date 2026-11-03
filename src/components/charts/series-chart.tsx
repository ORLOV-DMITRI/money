"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SeriesPoint } from "@/lib/analytics/reports";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { formatDate } from "@/lib/dates";

interface TipProps {
  active?: boolean;
  payload?: { dataKey: string; value: number; payload: SeriesPoint }[];
}

function Tip({ active, payload, monthly }: TipProps & { monthly: boolean }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium">{monthly ? formatDate(p.key + "-01", "LLLL yyyy") : formatDate(p.key, "EEEE, d MMMM")}</p>
      {payload.map((s) => (
        <p key={s.dataKey} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: s.dataKey === "income" ? "var(--chart-income)" : "var(--chart-expense)" }} />
          <span className="text-muted-foreground">{s.dataKey === "income" ? "Приход" : "Расход"}</span>
          <span className="ml-auto font-semibold tabular-nums">{formatMoney(s.value)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Динамика: по дням — один ряд расходов (без легенды), по месяцам — приход и расход рядом с легендой.
 */
export function SeriesChart({ data, monthly }: { data: SeriesPoint[]; monthly: boolean }) {
  const showIncome = monthly;
  return (
    <div>
      {showIncome && (
        <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-income" /> Приход
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm bg-chart-expense" /> Расход
          </span>
        </div>
      )}
      <div className="h-56 w-full" role="img" aria-label={monthly ? "Приход и расход по месяцам" : "Расходы по дням"}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap={monthly ? "22%" : "18%"}>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" minTickGap={8} />
            <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => formatMoneyCompact(v)} />
            <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.6 }} content={<Tip monthly={monthly} />} />
            {showIncome && <Bar dataKey="income" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={28} />}
            <Bar dataKey="expense" fill="var(--chart-expense)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
