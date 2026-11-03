"use client";

import Link from "next/link";
import type { Goal } from "@/lib/db/schema";
import type { GoalStats } from "@/lib/analytics/goals";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { Badge, IconBubble, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function goalStatusLine(g: Goal, s: GoalStats): { text: string; tone: "good" | "bad" | "neutral" } {
  if (g.completedAt) return { text: "Цель закрыта 🎉", tone: "good" };
  if (s.reached) return { text: "Цель достигнута! 🎉", tone: "good" };
  if (s.overdue) return { text: `Срок прошёл ${formatDate(g.deadline!, "d MMM")}`, tone: "bad" };
  if (s.required) {
    const per = s.daysLeft! > 60 ? `${formatMoney(s.required.perMonth)}/мес` : s.daysLeft! > 14 ? `${formatMoney(s.required.perWeek)}/нед` : `${formatMoney(s.required.perDay)}/день`;
    return { text: `Откладывай ${per}, чтобы успеть к ${formatDate(g.deadline!, "d MMM")}`, tone: s.onTrack ? "good" : "neutral" };
  }
  if (s.forecastDate) return { text: `При текущем темпе — к ${formatDate(s.forecastDate, "d MMM yyyy")}`, tone: "neutral" };
  return { text: "Пополни, чтобы увидеть прогноз", tone: "neutral" };
}

export function GoalCard({ goal, stats, compact }: { goal: Goal; stats: GoalStats; compact?: boolean }) {
  const status = goalStatusLine(goal, stats);
  return (
    <Link
      href={`/goals/view/?id=${goal.id}`}
      className={cn("block rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40", goal.completedAt && "opacity-70")}
    >
      <div className="flex items-center gap-3">
        <IconBubble icon={goal.icon} color={goal.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{goal.name}</p>
          <p className="text-sm tabular-nums text-muted-foreground">
            <span className="font-medium text-foreground">{formatMoney(stats.balance)}</span> из {formatMoney(goal.target)}
          </p>
        </div>
        <span className="text-sm font-semibold tabular-nums" style={{ color: goal.color }}>
          {Math.floor(Math.min(stats.progress, 9.99) * 100)}%
        </span>
      </div>
      <Progress value={stats.progress} color={goal.color} className="mt-3" />
      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          <span className={cn("text-muted-foreground", status.tone === "bad" && "text-destructive", status.tone === "good" && "text-income")}>{status.text}</span>
          {goal.autoPercent > 0 && !goal.completedAt && <Badge tone="primary">авто {goal.autoPercent}%</Badge>}
        </div>
      )}
    </Link>
  );
}
