"use client";

import type { Budget, Category } from "@/lib/db/schema";
import type { BudgetStatus } from "@/lib/analytics/budgets";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { IconBubble, Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function BudgetRow({ budget, category, status, detailed, onClick }: { budget: Budget; category?: Category; status: BudgetStatus; detailed?: boolean; onClick?: () => void }) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp type={onClick ? "button" : undefined} onClick={onClick} className={cn("block w-full text-left", onClick && "rounded-xl p-2 -m-2 hover:bg-muted")}>
      <div className="flex items-center gap-3">
        <IconBubble icon={category?.icon ?? "📦"} color={category?.color} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-medium">
              {category?.name ?? "?"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">/ {budget.period === "week" ? "нед" : "мес"}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap text-sm tabular-nums">
              <span className={cn("font-semibold", status.level === "over" && "text-destructive")}>{formatMoney(status.spent, { plain: true })}</span>
              <span className="text-muted-foreground"> / {formatMoney(status.limit)}</span>
            </span>
          </div>
          <Progress value={status.ratio} tone={status.level} className="mt-1.5" />
        </div>
      </div>
      {detailed && (
        <p className="mt-2 pl-11 text-xs text-muted-foreground">
          {status.level === "over"
            ? `Превышен на ${formatMoney(status.spent - status.limit)}`
            : `Осталось ${formatMoney(status.remaining)} · можно ${formatMoney(status.dailyAllowance)} в день`}
          {status.exhaustDate && status.level !== "over" && <span className="text-destructive"> · закончится ~{formatDate(status.exhaustDate, "d MMM")}</span>}
          {!status.exhaustDate && status.level === "ok" && status.forecast > 0 && ` · прогноз ${formatMoney(status.forecast)}`}
        </p>
      )}
    </Comp>
  );
}
