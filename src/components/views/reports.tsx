"use client";

import type { Id } from "@/lib/ids";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { PeriodPicker } from "@/components/charts/period-picker";
import { SeriesChart } from "@/components/charts/series-chart";
import { CategoryBars } from "@/components/charts/category-bars";
import { SpendingHeatmap } from "@/components/charts/heatmap";
import { InsightList } from "@/components/insights/insight-list";
import { useItems, useLookups, useToday, useTransactions } from "@/hooks/use-data";
import { useInsights } from "@/hooks/use-analytics";
import {
  byCategory,
  byTag,
  dailySeries,
  expenseEntries,
  incomeByCategory,
  seriesFor,
  summarize,
  topProducts,
  topStores,
  weekdayAverages,
} from "@/lib/analytics/reports";
import { addDaysISO, daysBetween, getPeriod, periodLength, previousPeriod, type Period } from "@/lib/dates";
import { formatMoney, formatPercent, percentChange } from "@/lib/money";
import { cn } from "@/lib/utils";

const WD = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function ReportsView() {
  const today = useToday();
  const [period, setPeriod] = useState<Period>(() => getPeriod("month", today));
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const txs = useTransactions();
  const items = useItems();
  const lookups = useLookups();
  const insights = useInsights();

  const data = useMemo(() => {
    if (!txs || !items) return undefined;
    // Для текущего (незаконченного) периода сравниваем с тем же числом дней прошлого
    const full = previousPeriod(period);
    const elapsedEnd = period.end > today ? today : period.end;
    const elapsed = daysBetween(period.start, elapsedEnd) + 1;
    const prev = elapsedEnd < period.end ? { ...full, end: [addDaysISO(full.start, elapsed - 1), full.end].sort()[0] } : full;
    const entries = expenseEntries(txs, items);
    const series = seriesFor(txs, period);
    return {
      cur: summarize(txs, period, today),
      prev: summarize(txs, prev),
      expenseCats: byCategory(entries, period),
      incomeCats: incomeByCategory(txs, period),
      series,
      monthly: periodLength(period) > 62,
      daily: period.type === "month" ? dailySeries(txs, period) : null,
      products: topProducts(items, period, 8),
      stores: topStores(txs, period, 6),
      tags: byTag(txs, period),
      weekdays: elapsed >= 14 ? weekdayAverages(txs, { ...period, end: elapsedEnd }) : null,
      partial: elapsedEnd < period.end,
    };
  }, [txs, items, period, today]);

  const link = (categoryId: Id | undefined) => `/transactions/?category=${categoryId ?? ""}&period=custom&from=${period.start}&to=${period.end}`;

  return (
    <>
      <PageHeader title="Отчёты" />
      <Card className="mb-4">
        <CardContent>
          <PeriodPicker period={period} onChange={setPeriod} today={today} />
        </CardContent>
      </Card>

      {!data ? (
        <Skeleton className="h-96" />
      ) : data.cur.count === 0 ? (
        <Card>
          <EmptyState icon="📭" title="За этот период операций нет" description="Выбери другой период или добавь операцию" />
        </Card>
      ) : (
        <div className="grid gap-4">
          {/* Итоги */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile label="Расход" value={data.cur.expense} prev={data.prev.expense} badWhenUp />
            <SummaryTile label="Приход" value={data.cur.income} prev={data.prev.income} />
            <SummaryTile label="Итог" value={data.cur.net} prev={data.prev.net} signed />
            <SummaryTile label="В день, в среднем" value={data.cur.avgDailyExpense} prev={data.prev.avgDailyExpense} badWhenUp />
          </div>
          {data.partial && <p className="-mt-2 text-xs text-muted-foreground">Период ещё идёт — сравниваем с тем же числом дней прошлого периода</p>}
          {data.cur.saved !== 0 && (
            <p className="text-sm text-muted-foreground">
              🐷 За период в копилки отложено <span className="font-semibold text-foreground">{formatMoney(data.cur.saved)}</span>
              {data.cur.income > 0 && <> — это {formatPercent((data.cur.saved / data.cur.income) * 100)} от прихода</>}
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Структура</CardTitle>
                <Segmented
                  size="sm"
                  className="w-auto"
                  value={kind}
                  onChange={setKind}
                  options={[
                    { value: "expense", label: "Расходы" },
                    { value: "income", label: "Доходы" },
                  ]}
                />
              </CardHeader>
              <CardContent>
                {(kind === "expense" ? data.expenseCats : data.incomeCats).length ? (
                  <CategoryBars shares={kind === "expense" ? data.expenseCats : data.incomeCats} categories={lookups.categories} hrefFor={link} />
                ) : (
                  <p className="text-sm text-muted-foreground">Нет данных</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{data.monthly ? "По месяцам" : "Расходы по дням"}</CardTitle>
              </CardHeader>
              <CardContent>
                <SeriesChart data={data.series} monthly={data.monthly} />
              </CardContent>
            </Card>

            {data.daily && (
              <Card>
                <CardHeader>
                  <CardTitle>Календарь трат</CardTitle>
                </CardHeader>
                <CardContent>
                  <SpendingHeatmap period={period} daily={data.daily} today={today} />
                </CardContent>
              </Card>
            )}

            {data.weekdays && (
              <Card>
                <CardHeader>
                  <CardTitle>Средний расход по дням недели</CardTitle>
                </CardHeader>
                <CardContent>
                  <WeekdayBars values={data.weekdays} />
                </CardContent>
              </Card>
            )}

            {data.products.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Топ продуктов</CardTitle>
                  <Link href="/products/" className="text-sm text-primary hover:underline">
                    Все продукты
                  </Link>
                </CardHeader>
                <CardContent>
                  <RankList
                    rows={data.products.map((p) => ({
                      key: String(p.id),
                      label: lookups.products.get(p.id)?.name ?? "?",
                      sub: `${p.count} покуп.`,
                      amount: p.amount,
                      href: `/products/view/?id=${p.id}`,
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {data.stores.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Магазины</CardTitle>
                </CardHeader>
                <CardContent>
                  <RankList
                    rows={data.stores.map((s) => ({
                      key: String(s.id),
                      label: `🏪 ${lookups.stores.get(s.id)?.name ?? "?"}`,
                      sub: `${s.count} чек.`,
                      amount: s.amount,
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {data.tags.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>По тегам</CardTitle>
                </CardHeader>
                <CardContent>
                  <RankList
                    rows={data.tags.map((t) => ({
                      key: t.id,
                      label: `#${t.id}`,
                      sub: `${t.count} опер.`,
                      amount: t.amount,
                      href: `/transactions/?tag=${encodeURIComponent(t.id)}`,
                    }))}
                  />
                </CardContent>
              </Card>
            )}

            {insights && insights.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Подсказки</CardTitle>
                </CardHeader>
                <CardContent>
                  <InsightList insights={insights} />
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryTile({ label, value, prev, badWhenUp, signed }: { label: string; value: number; prev: number; badWhenUp?: boolean; signed?: boolean }) {
  const ch = percentChange(prev, value);
  const up = value > prev;
  const bad = badWhenUp ? up : !up;
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums", signed && value > 0 && "text-income", signed && value < 0 && "text-destructive")}>
        {formatMoney(value, { sign: signed })}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {value === prev ? (
          "как в прошлом периоде"
        ) : prev === 0 && !signed ? (
          "в прошлом периоде не было"
        ) : ch == null ? (
          "к прошлому периоду: —"
        ) : (
          <>
            <span className={bad ? "text-destructive" : "text-income"}>{up ? "▲" : "▼"} {signed ? formatMoney(Math.abs(value - prev)) : formatPercent(Math.abs(ch))}</span> к прошлому
          </>
        )}
      </p>
    </Card>
  );
}

function RankList({ rows }: { rows: { key: string; label: string; sub?: string; amount: number; href?: string }[] }) {
  return (
    <ol className="grid gap-1">
      {rows.map((r, i) => {
        const inner = (
          <>
            <span className="w-5 text-xs text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
            {r.sub && <span className="text-xs text-muted-foreground">{r.sub}</span>}
            <span className="w-28 text-right text-sm font-semibold tabular-nums">{formatMoney(r.amount)}</span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted">
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-2 px-1.5 py-1.5">{inner}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function WeekdayBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  const top = values.indexOf(max);
  return (
    <div className="flex h-40 items-end gap-2" role="list" aria-label="Средний расход по дням недели">
      {values.map((v, i) => (
        <div key={i} role="listitem" className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${WD[i]}: ${formatMoney(v)}`}>
          <span className={cn("text-[10px] tabular-nums text-muted-foreground", i !== top && "opacity-0 group-hover:opacity-100")}>{formatMoney(v, { plain: true })}</span>
          <div className="w-full rounded-t bg-chart-expense transition-opacity" style={{ height: `${Math.max(2, (v / max) * 72)}%`, opacity: i === top ? 1 : 0.45 }} />
          <span className={cn("text-xs", i === top ? "font-semibold" : "text-muted-foreground")}>{WD[i]}</span>
        </div>
      ))}
    </div>
  );
}
