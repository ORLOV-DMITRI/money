"use client";

import { ArrowDownLeft, ArrowUpRight, Bell, ChevronRight, Scale, Sparkles } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, IconBubble, Skeleton } from "@/components/ui/misc";
import { Dialog } from "@/components/ui/dialog";
import { Label } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { ReconcileDialog } from "@/components/balance/reconcile-dialog";
import { Money } from "@/components/ui/money";
import { QuickInputBar } from "@/components/transactions/quick-input-bar";
import { TxList } from "@/components/transactions/tx-list";
import { useTxEditor } from "@/components/transactions/tx-editor";
import { GoalCard } from "@/components/goals/goal-card";
import { BudgetRow } from "@/components/budgets/budget-row";
import { InsightList } from "@/components/insights/insight-list";
import { useBalances, useCategories, useItems, useLookups, useRecurring, useTemplates, useToday, useTransactions } from "@/hooks/use-data";
import { useBudgetStatuses, useGoalStats, useInsights } from "@/hooks/use-analytics";
import { summarize } from "@/lib/analytics/reports";
import { formatDayHeading, formatPeriod, getPeriod, previousPeriod } from "@/lib/dates";
import { formatMoney, formatPercent, percentChange } from "@/lib/money";
import { confirmRecurring, dueReminders, skipRecurring } from "@/lib/services/recurring";
import { addTransaction, deleteTransaction } from "@/lib/services/transactions";
import { loadDemoData } from "@/lib/db/demo";
import { cn } from "@/lib/utils";

export function DashboardView() {
  const txs = useTransactions();
  const today = useToday();
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [start, setStart] = useState<number | null>(null);
  const openEditor = useTxEditor();

  if (!txs) return <DashboardSkeleton />;

  if (txs.length === 0) {
    return (
      <div className="mx-auto max-w-xl pt-6">
        <Card>
          <CardContent className="grid gap-5 p-6 text-center sm:p-8">
            <div>
              <div className="text-4xl" aria-hidden>
                👋
              </div>
              <h1 className="mt-2 text-lg font-semibold">Привет! Это ваш учёт денег в тенге</h1>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                Записывайте расходы и приходы, собирайте копилки, следите за ценами и смотрите отчёты.
              </p>
            </div>
            <form
              className="grid gap-2 text-left"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!start) return toast.error("Введи сумму");
                await addTransaction({ type: "adjustment", amount: start, date: today, note: "Начальный остаток" });
                toast.success("Отлично, можно записывать траты!");
              }}
            >
              <Label htmlFor="start-balance">Сколько у вас сейчас денег? (наличные + карты, без депозита)</Label>
              <div className="flex gap-2">
                <AmountInput id="start-balance" value={start} onChange={setStart} className="flex-1" />
                <Button type="submit">Начать</Button>
              </div>
              <p className="text-xs text-muted-foreground">Депозит и накопления потом добавишь копилками.</p>
            </form>
            <div className="flex flex-col items-center gap-1 border-t pt-4">
              <Button
                variant="ghost"
                disabled={loadingDemo}
                onClick={async () => {
                  setLoadingDemo(true);
                  await loadDemoData(today);
                  setLoadingDemo(false);
                  toast.success("Демо-данные загружены. Сбросить их можно в настройках");
                }}
              >
                <Sparkles /> {loadingDemo ? "Заполняю…" : "Или посмотреть на примере"}
              </Button>
              <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => openEditor()}>
                Начать без остатка
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <BalanceCard />
        <QuickInputBar />
        <TemplatesRow />
        <Reminders />
        <RecentCard />
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <InsightsCard />
        <GoalsCard />
        <BudgetsCard />
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="grid gap-4">
      <Skeleton className="h-44" />
      <Skeleton className="h-14" />
      <Skeleton className="h-64" />
    </div>
  );
}

function BalanceCard() {
  const [reconcile, setReconcile] = useState(false);
  const balances = useBalances();
  const txs = useTransactions();
  const today = useToday();
  const month = getPeriod("month", today);
  const stats = useMemo(() => {
    if (!txs) return undefined;
    const cur = summarize(txs, month, today);
    // честное сравнение: прошлый месяц до того же числа
    const prev = previousPeriod(month);
    const day = Number(today.slice(8));
    const prevEnd = prev.start.slice(0, 8) + String(Math.min(day, Number(prev.end.slice(8)))).padStart(2, "0");
    const prevSame = summarize(txs, { type: "custom", start: prev.start, end: prevEnd });
    return { cur, change: percentChange(prevSame.expense, cur.expense) };
  }, [txs, month, today]);

  if (!balances || !stats) return <Skeleton className="h-44" />;
  const { totals } = balances;
  return (
    <Card className="overflow-hidden">
      <Dialog open={reconcile} onOpenChange={setReconcile}>
        {reconcile && <ReconcileDialog onDone={() => setReconcile(false)} />}
      </Dialog>
      <div className="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm text-muted-foreground">Всего денег</p>
          <Button variant="ghost" size="sm" className="-mr-2 -mt-1 h-7" onClick={() => setReconcile(true)}>
            <Scale /> Сверить
          </Button>
        </div>
        <p className="mt-1 text-4xl font-bold tracking-tight tabular-nums">{formatMoney(totals.total)}</p>
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span>
            <span className="text-muted-foreground">Свободно </span>
            <span className={cn("font-semibold tabular-nums", totals.free < 0 && "text-destructive")}>{formatMoney(totals.free)}</span>
          </span>
          <Link href="/goals/" className="hover:underline">
            <span className="text-muted-foreground">В копилках </span>
            <span className="font-semibold tabular-nums">{formatMoney(totals.saved)}</span>
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x border-t">
        <Stat icon={<ArrowDownLeft className="size-4 text-income" />} label="Приход" value={<Money value={stats.cur.income} kind="income" sign={false} />} />
        <Stat
          icon={<ArrowUpRight className="size-4" />}
          label="Расход"
          value={<span className="tabular-nums">{formatMoney(stats.cur.expense)}</span>}
          extra={
            stats.change != null && (
              <span className={cn("text-[11px]", stats.change > 0 ? "text-destructive" : "text-income")}>{formatPercent(stats.change, { sign: true })} к прошл.</span>
            )
          }
        />
        <Stat label="Итог месяца" value={<Money value={stats.cur.net} kind="auto" />} />
      </div>
      <p className="border-t px-5 py-2 text-xs text-muted-foreground">{formatPeriod(getPeriod("month", today))} · в среднем {formatMoney(stats.cur.avgDailyExpense)} в день</p>
    </Card>
  );
}

function Stat({ icon, label, value, extra }: { icon?: React.ReactNode; label: string; value: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="min-w-0 px-3 py-3 sm:px-5">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon}
        {label}
      </p>
      <p className="mt-0.5 truncate text-sm font-semibold sm:text-base">{value}</p>
      {extra}
    </div>
  );
}

function TemplatesRow() {
  const templates = useTemplates();
  const categories = useCategories();
  const today = useToday();
  if (!templates?.length) return null;
  return (
    <div className="-mx-4 flex gap-2 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:flex-wrap sm:px-0" aria-label="Шаблоны">
      {templates.map((t) => {
        const c = categories?.find((x) => x.id === t.categoryId);
        return (
          <button
            key={t.id}
            type="button"
            onClick={async () => {
              const { id } = await addTransaction({ type: t.type, amount: t.amount, categoryId: t.categoryId, note: t.note, date: today });
              toast.success(`${t.name}: ${formatMoney(t.amount)}`, {
                action: { label: "Отменить", onClick: () => void deleteTransaction(id) },
              });
            }}
            className="flex shrink-0 items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm shadow-card transition-colors hover:border-primary/50"
          >
            <span aria-hidden>{c?.icon}</span>
            {t.name}
            <span className="tabular-nums text-muted-foreground">{formatMoney(t.amount)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Reminders() {
  const recurring = useRecurring();
  const categories = useCategories();
  const today = useToday();
  const due = recurring ? dueReminders(recurring, today) : [];
  if (!due.length) return null;
  return (
    <Card className="border-warning/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-warning" /> Пора оплатить
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 pt-3">
        {due.map((r) => {
          const c = categories?.find((x) => x.id === r.categoryId);
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-3">
              <IconBubble icon={c?.icon ?? "🔁"} color={c?.color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDayHeading(r.nextDate, today)} · {formatMoney(r.amount)}
                </p>
              </div>
              <div className="flex w-full justify-end gap-1.5 sm:w-auto">
                <Button size="sm" variant="ghost" onClick={() => skipRecurring(r).then(() => toast("Пропущено до следующего раза"))}>
                  Пропустить
                </Button>
                <Button size="sm" onClick={() => confirmRecurring(r).then(() => toast.success(`${r.name}: записано`))}>
                  Записать
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function RecentCard() {
  const txs = useTransactions();
  const items = useItems();
  const lookups = useLookups();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Последние операции</CardTitle>
        <Button asChild variant="link" size="sm">
          <Link href="/transactions/">
            Все <ChevronRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="px-2 pt-2 sm:px-3">
        <TxList txs={(txs ?? []).slice(0, 12)} lookups={lookups} items={items} />
      </CardContent>
    </Card>
  );
}

function InsightsCard() {
  const insights = useInsights();
  if (!insights?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" /> Подсказки
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-3">
        <InsightList insights={insights.slice(0, 4)} />
      </CardContent>
    </Card>
  );
}

function GoalsCard() {
  const goals = useGoalStats();
  const active = (goals ?? []).filter((g) => !g.goal.archived && !g.goal.completedAt);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Копилки</CardTitle>
        <Button asChild variant="link" size="sm">
          <Link href="/goals/">
            Все <ChevronRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-2 pt-3">
        {active.length ? (
          active.slice(0, 3).map(({ goal, stats }) => <GoalCard key={goal.id} goal={goal} stats={stats} />)
        ) : (
          <p className="text-sm text-muted-foreground">
            Пока нет копилок.{" "}
            <Link href="/goals/" className="text-primary hover:underline">
              Создать
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function BudgetsCard() {
  const statuses = useBudgetStatuses();
  const lookups = useLookups();
  if (!statuses?.length) return null;
  const over = statuses.filter((s) => s.status.level !== "ok").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Бюджеты {over > 0 && <Badge tone="bad">{over} на грани</Badge>}
        </CardTitle>
        <Button asChild variant="link" size="sm">
          <Link href="/budgets/">
            Все <ChevronRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 pt-3">
        {statuses.slice(0, 4).map(({ budget, status }) => (
          <BudgetRow key={budget.id} budget={budget} category={lookups.categories.get(budget.categoryId)} status={status} />
        ))}
      </CardContent>
    </Card>
  );
}
