"use client";

import { ArrowLeft, CheckCircle2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, useConfirm } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown";
import { Badge, EmptyState, IconBubble, Progress, Skeleton } from "@/components/ui/misc";
import { TxList } from "@/components/transactions/tx-list";
import { useTxEditor } from "@/components/transactions/tx-editor";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { goalStatusLine } from "@/components/goals/goal-card";
import { useGoals, useLookups, useToday, useTransactions } from "@/hooks/use-data";
import { goalStats } from "@/lib/analytics/goals";
import { formatDate, plural } from "@/lib/dates";
import { formatMoney, formatMoneyCompact } from "@/lib/money";
import { completeGoal, deleteGoal, reopenGoal } from "@/lib/services/goals";
import { cn } from "@/lib/utils";

export function GoalDetailView() {
  const id = Number(useSearchParams().get("id"));
  const goals = useGoals();
  const txs = useTransactions();
  const lookups = useLookups();
  const today = useToday();
  const openEditor = useTxEditor();
  const confirm = useConfirm();
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  const goal = goals?.find((g) => g.id === id);
  const goalTxs = useMemo(() => (txs ?? []).filter((t) => t.goalId === id), [txs, id]);
  const stats = useMemo(() => (goal ? goalStats(goal, goalTxs, today) : undefined), [goal, goalTxs, today]);

  const chart = useMemo(() => {
    const asc = [...goalTxs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
    let bal = 0;
    const byDate = new Map<string, number>();
    for (const t of asc) {
      bal += t.type === "goal_deposit" ? t.amount : -t.amount;
      byDate.set(t.date, bal);
    }
    const pts = [...byDate.entries()].map(([date, balance]) => ({ date, balance }));
    if (pts.length && pts[pts.length - 1].date < today) pts.push({ date: today, balance: bal });
    return pts;
  }, [goalTxs, today]);

  if (!goals || !txs) return <Skeleton className="h-96" />;
  if (!goal || !stats)
    return (
      <Card>
        <EmptyState icon="🤷" title="Копилка не найдена" action={<Button asChild><Link href="/goals/">К копилкам</Link></Button>} />
      </Card>
    );

  const status = goalStatusLine(goal, stats);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href="/goals/">
            <ArrowLeft /> Копилки
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Действия">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => setEditing(true)}>
              <Pencil /> Изменить
            </DropdownMenuItem>
            {goal.completedAt ? (
              <DropdownMenuItem onSelect={() => reopenGoal(goal.id)}>
                <RotateCcw /> Открыть снова
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onSelect={() => completeGoal(goal.id).then(() => toast.success("Цель закрыта 🎉"))}>
                <CheckCircle2 /> Закрыть цель
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={async () => {
                const ok = await confirm({
                  title: `Удалить «${goal.name}»?`,
                  description: "Все пополнения и снятия удалятся, деньги вернутся на счета, с которых пополняли.",
                  confirmText: "Удалить",
                  destructive: true,
                });
                if (!ok) return;
                await deleteGoal(goal.id);
                router.push("/goals/");
                toast("Копилка удалена");
              }}
            >
              <Trash2 /> Удалить
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="overflow-hidden">
        <div className="p-5" style={{ background: `linear-gradient(135deg, color-mix(in oklch, ${goal.color} 16%, transparent), transparent 70%)` }}>
          <div className="flex items-center gap-3">
            <IconBubble icon={goal.icon} color={goal.color} size="lg" />
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold">{goal.name}</h1>
              <p className={cn("text-sm text-muted-foreground", status.tone === "good" && "text-income", status.tone === "bad" && "text-destructive")}>{status.text}</p>
            </div>
          </div>
          <div className="mt-5 flex items-end justify-between gap-3">
            <p className="text-3xl font-bold tabular-nums">{formatMoney(stats.balance)}</p>
            <p className="pb-1 text-sm text-muted-foreground tabular-nums">из {formatMoney(goal.target)}</p>
          </div>
          <Progress value={stats.progress} color={goal.color} className="mt-2 h-3" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={() => openEditor({ mode: "goal", goalId: goal.id, goalDirection: "deposit" })} disabled={!!goal.completedAt}>
              Пополнить
            </Button>
            <Button variant="outline" onClick={() => openEditor({ mode: "goal", goalId: goal.id, goalDirection: "withdraw" })} disabled={stats.balance <= 0}>
              Снять
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0">
          <Tile label="Осталось" value={formatMoney(stats.remaining)} />
          <Tile label="Темп" value={stats.pacePerDay > 0 ? `${formatMoney(Math.round((stats.pacePerDay * 30.44) / 100) * 100)}/мес` : "—"} hint="в среднем за 3 месяца" />
          <Tile label="Прогноз" value={stats.reached ? "Готово 🎉" : stats.forecastDate ? formatDate(stats.forecastDate, "d MMM yyyy") : "—"} />
          <Tile
            label={goal.deadline ? `До ${formatDate(goal.deadline, "d MMM yyyy")}` : "Срок"}
            value={stats.required ? `${formatMoney(stats.required.perMonth)}/мес` : goal.deadline ? (stats.reached ? "успели" : "прошёл") : "не задан"}
            hint={stats.daysLeft != null && stats.daysLeft > 0 ? `${stats.daysLeft} ${plural(stats.daysLeft, ["день", "дня", "дней"])}` : undefined}
          />
        </div>
      </Card>

      <div className="mt-4 flex flex-wrap gap-2">
        {goal.autoPercent > 0 && !goal.completedAt && <Badge tone="primary">Автоотчисление {goal.autoPercent}% с каждого прихода</Badge>}
        {stats.required && stats.onTrack === true && <Badge tone="good">Успеваешь к сроку при текущем темпе</Badge>}
        {stats.required && stats.onTrack === false && <Badge tone="warn">Нужно {formatMoney(stats.required.perWeek)} в неделю, чтобы успеть</Badge>}
      </div>

      {chart.length > 1 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle>Как копилось</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56" role="img" aria-label="График накопления">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="goalFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={goal.color} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={goal.color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(d: string) => formatDate(d, "d MMM")} minTickGap={24} />
                  <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => formatMoneyCompact(v)} domain={[0, (max: number) => Math.max(max, goal.target)]} />
                  <ReferenceLine y={goal.target} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "цель", position: "insideTopRight", fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-xl border bg-card px-3 py-2 text-xs shadow-lg">
                          <p className="text-muted-foreground">{formatDate(payload[0].payload.date, "d MMMM yyyy")}</p>
                          <p className="font-semibold tabular-nums">{formatMoney(payload[0].payload.balance)}</p>
                        </div>
                      ) : null
                    }
                  />
                  <Area type="stepAfter" dataKey="balance" stroke={goal.color} strokeWidth={2} fill="url(#goalFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>История</CardTitle>
          <span className="text-sm text-muted-foreground">{goalTxs.length}</span>
        </CardHeader>
        <CardContent className="px-2 sm:px-3">
          {goalTxs.length ? <TxList txs={goalTxs} lookups={lookups} /> : <p className="px-2 text-sm text-muted-foreground">Пополнений пока не было</p>}
        </CardContent>
      </Card>

      <Dialog open={editing} onOpenChange={setEditing}>
        {editing && <GoalDialog goal={goal} onDone={() => setEditing(false)} />}
      </Dialog>
    </>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
