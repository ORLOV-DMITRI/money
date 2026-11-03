"use client";

import type { Id } from "@/lib/ids";
import { Download, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, NativeSelect } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { TxList } from "@/components/transactions/tx-list";
import { useTxEditor } from "@/components/transactions/tx-editor";
import { useItems, useLookups, useToday, useTransactions } from "@/hooks/use-data";
import { expenseEntries } from "@/lib/analytics/reports";
import { addDaysISO, getPeriod, previousPeriod, type ISODate } from "@/lib/dates";
import { normalizeKey, type PurchaseItem, type TransactionType } from "@/lib/db/schema";
import { formatMoney, parseAmount } from "@/lib/money";
import { downloadFile, exportCSV } from "@/lib/services/data";

type PeriodPreset = "month" | "prev-month" | "30d" | "90d" | "year" | "all" | "custom";
type TypeFilter = "all" | "expense" | "income" | "goal" | "adjustment";

const PAGE = 100;

function presetRange(p: PeriodPreset, today: ISODate, from: string, to: string): { start: ISODate; end: ISODate } | null {
  switch (p) {
    case "month":
      return getPeriod("month", today);
    case "prev-month":
      return previousPeriod(getPeriod("month", today));
    case "30d":
      return { start: addDaysISO(today, -29), end: today };
    case "90d":
      return { start: addDaysISO(today, -89), end: today };
    case "year":
      return getPeriod("year", today);
    case "custom":
      return from && to ? { start: from, end: to } : null;
    case "all":
      return null;
  }
}

export function TransactionsView() {
  const params = useSearchParams();
  const router = useRouter();
  const txs = useTransactions();
  const items = useItems();
  const lookups = useLookups();
  const today = useToday();
  const openEditor = useTxEditor();

  const hasDeepLink = params.has("category") || params.has("tag");
  const [q, setQ] = useState(params.get("q") ?? "");
  const [preset, setPreset] = useState<PeriodPreset>((params.get("period") as PeriodPreset) ?? (hasDeepLink ? "all" : "month"));
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [type, setType] = useState<TypeFilter>((params.get("type") as TypeFilter) ?? "all");
  const [category, setCategory] = useState(params.get("category") ?? "");
  const [tag, setTag] = useState(params.get("tag") ?? "");
  const [limit, setLimit] = useState(PAGE);

  const itemsByTx = useMemo(() => {
    const m = new Map<Id, PurchaseItem[]>();
    for (const it of items ?? []) {
      const l = m.get(it.transactionId);
      if (l) l.push(it);
      else m.set(it.transactionId, [it]);
    }
    return m;
  }, [items]);

  const allTags = useMemo(() => [...new Set((txs ?? []).flatMap((t) => t.tags))].sort(), [txs]);

  const filtered = useMemo(() => {
    if (!txs) return undefined;
    const range = presetRange(preset, today, from, to);
    const query = normalizeKey(q);
    const qAmount = query ? parseAmount(query) : null;
    const catId = category || null;
    const types: Record<TypeFilter, TransactionType[] | null> = {
      all: null,
      expense: ["expense"],
      income: ["income"],
      goal: ["goal_deposit", "goal_withdraw"],
      adjustment: ["adjustment"],
    };
    const allowed = types[type];
    return txs.filter((t) => {
      if (range && (t.date < range.start || t.date > range.end)) return false;
      if (allowed && !allowed.includes(t.type)) return false;
      if (tag && !t.tags.includes(tag)) return false;
      const its = itemsByTx.get(t.id);
      if (catId != null && t.categoryId !== catId && !its?.some((i) => i.categoryId === catId)) return false;
      if (query) {
        if (qAmount != null && t.amount === qAmount) return true;
        const hay = [
          t.note,
          t.categoryId != null ? lookups.categories.get(t.categoryId)?.name : "",
          t.storeId != null ? lookups.stores.get(t.storeId)?.name : "",
          t.goalId != null ? lookups.goals.get(t.goalId)?.name : "",
          ...t.tags,
          ...(its ?? []).map((i) => lookups.products.get(i.productId)?.name ?? ""),
        ]
          .join(" ")
          .toLowerCase()
          .replace(/ё/g, "е");
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [txs, preset, today, from, to, q, category, type, tag, itemsByTx, lookups]);

  const totals = useMemo(() => {
    if (!filtered) return null;
    const catId = category || null;
    let expense = 0;
    if (catId != null) {
      // при фильтре по категории чеки считаем только по позициям этой категории
      expense = expenseEntries(filtered, items ?? []).filter((e) => e.categoryId === catId).reduce((s, e) => s + e.amount, 0);
    } else {
      expense = filtered.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    }
    const income = filtered.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
    return { expense, income };
  }, [filtered, category, items]);

  const active = q || type !== "all" || category || tag || preset !== "month";
  const reset = () => {
    setQ("");
    setType("all");
    setCategory("");
    setTag("");
    setPreset("month");
    router.replace("/transactions/");
  };

  const categories = [...lookups.categories.values()].sort((a, b) => (a.kind === b.kind ? a.order - b.order : a.kind === "expense" ? -1 : 1));

  return (
    <>
      <PageHeader
        title="Операции"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={async () => downloadFile(await exportCSV(), `operations-${today}.csv`, "text/csv;charset=utf-8")}>
              <Download /> CSV
            </Button>
            <Button size="sm" onClick={() => openEditor()} className="hidden md:inline-flex">
              Добавить
            </Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: заметка, продукт, магазин, сумма…" className="pl-9" aria-label="Поиск" />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NativeSelect aria-label="Период" value={preset} onChange={(e) => setPreset(e.target.value as PeriodPreset)}>
              <option value="month">Этот месяц</option>
              <option value="prev-month">Прошлый месяц</option>
              <option value="30d">30 дней</option>
              <option value="90d">90 дней</option>
              <option value="year">Этот год</option>
              <option value="all">Всё время</option>
              <option value="custom">Свой период…</option>
            </NativeSelect>
            <NativeSelect aria-label="Тип" value={type} onChange={(e) => setType(e.target.value as TypeFilter)}>
              <option value="all">Все типы</option>
              <option value="expense">Расходы</option>
              <option value="income">Приходы</option>
              <option value="goal">Копилки</option>
              <option value="adjustment">Корректировки</option>
            </NativeSelect>
            <NativeSelect aria-label="Категория" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Все категории</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                  {c.kind === "income" ? " (доход)" : ""}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect aria-label="Тег" value={tag} onChange={(e) => setTag(e.target.value)}>
              <option value="">Все теги</option>
              {allTags.map((t) => (
                <option key={t} value={t}>
                  #{t}
                </option>
              ))}
            </NativeSelect>
          </div>
          {preset === "custom" && (
            <div className="grid grid-cols-2 gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="С" />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="По" />
            </div>
          )}
          {filtered && totals && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="text-muted-foreground">
                {filtered.length} операций · расход <span className="font-semibold text-foreground">{formatMoney(totals.expense)}</span>
                {totals.income > 0 && (
                  <>
                    {" "}
                    · приход <span className="font-semibold text-income">{formatMoney(totals.income)}</span>
                  </>
                )}
              </p>
              {active && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X /> Сбросить фильтры
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!filtered ? (
        <Skeleton className="h-96" />
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState icon="🔍" title="Ничего не нашлось" description="Попробуй изменить фильтры или период" />
        </Card>
      ) : (
        <Card>
          <CardContent className="px-2 sm:px-3">
            <TxList txs={filtered.slice(0, limit)} lookups={lookups} items={items} />
            {filtered.length > limit && (
              <Button variant="outline" className="mt-3 w-full" onClick={() => setLimit((l) => l + PAGE)}>
                Показать ещё {Math.min(PAGE, filtered.length - limit)}
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
