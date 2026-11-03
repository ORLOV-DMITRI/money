"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { GoalCard } from "@/components/goals/goal-card";
import { GoalDialog } from "@/components/goals/goal-dialog";
import { useGoalStats } from "@/hooks/use-analytics";
import { formatMoney } from "@/lib/money";

export function GoalsView() {
  const goals = useGoalStats();
  const [open, setOpen] = useState(false);
  const active = (goals ?? []).filter((g) => !g.goal.archived && !g.goal.completedAt);
  const done = (goals ?? []).filter((g) => g.goal.archived || g.goal.completedAt);
  const saved = active.reduce((s, g) => s + g.stats.balance, 0);
  const target = active.reduce((s, g) => s + g.goal.target, 0);

  return (
    <>
      <PageHeader
        title="Копилки"
        description={active.length ? `Накоплено ${formatMoney(saved)} из ${formatMoney(target)}` : undefined}
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus /> Новая копилка
          </Button>
        }
      />
      {!goals ? (
        <Skeleton className="h-48" />
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="🐷"
            title="Копилок пока нет"
            description="Поставь цель — отпуск, ноутбук или подушку безопасности. Я посчитаю, сколько откладывать, и покажу прогноз"
            action={<Button onClick={() => setOpen(true)}>Создать копилку</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {active.map(({ goal, stats }) => (
              <GoalCard key={goal.id} goal={goal} stats={stats} />
            ))}
          </div>
          {done.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-sm font-semibold text-muted-foreground">Закрытые цели</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {done.map(({ goal, stats }) => (
                  <GoalCard key={goal.id} goal={goal} stats={stats} compact />
                ))}
              </div>
            </>
          )}
        </>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        {open && <GoalDialog onDone={() => setOpen(false)} />}
      </Dialog>
    </>
  );
}
