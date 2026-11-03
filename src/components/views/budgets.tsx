"use client";

import type { Id } from "@/lib/ids";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, NativeSelect } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { EmptyState, Segmented, Skeleton } from "@/components/ui/misc";
import { BudgetRow } from "@/components/budgets/budget-row";
import { useBudgetStatuses } from "@/hooks/use-analytics";
import { useBudgets, useCategories, useLookups } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import type { Budget, BudgetPeriod } from "@/lib/db/schema";
import { formatMoney } from "@/lib/money";

export function BudgetsView() {
  const statuses = useBudgetStatuses();
  const lookups = useLookups();
  const [edit, setEdit] = useState<Budget | "new" | null>(null);
  const monthly = (statuses ?? []).filter((s) => s.budget.period === "month");
  const total = monthly.reduce((s, b) => s + b.status.limit, 0);
  const spent = monthly.reduce((s, b) => s + b.status.spent, 0);

  return (
    <>
      <PageHeader
        title="Бюджеты"
        description={monthly.length ? `В этом месяце: ${formatMoney(spent)} из ${formatMoney(total)}` : "Лимиты на категории: предупрежу на 80% и при превышении"}
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus /> Новый бюджет
          </Button>
        }
      />
      {!statuses ? (
        <Skeleton className="h-64" />
      ) : statuses.length === 0 ? (
        <Card>
          <EmptyState icon="🎯" title="Бюджетов пока нет" description="Например: «Кафе — 50 000 ₸ в месяц». Я покажу прогресс, прогноз и сколько можно тратить в день" action={<Button onClick={() => setEdit("new")}>Задать бюджет</Button>} />
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-6">
            {statuses.map(({ budget, status }) => (
              <BudgetRow key={budget.id} budget={budget} category={lookups.categories.get(budget.categoryId)} status={status} detailed onClick={() => setEdit(budget)} />
            ))}
          </CardContent>
        </Card>
      )}
      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        {edit != null && <BudgetDialog budget={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function BudgetDialog({ budget, onDone }: { budget?: Budget; onDone: () => void }) {
  const categories = (useCategories() ?? []).filter((c) => c.kind === "expense" && !c.archived);
  const budgets = useBudgets() ?? [];
  const confirm = useConfirm();
  const used = new Set(budgets.filter((b) => b.id !== budget?.id).map((b) => `${b.categoryId}:${b.period}`));
  const [categoryId, setCategoryId] = useState<Id | undefined>(budget?.categoryId);
  const [limit, setLimit] = useState<number | null>(budget?.limit ?? null);
  const [period, setPeriod] = useState<BudgetPeriod>(budget?.period ?? "month");
  const cat = categoryId ?? categories.find((c) => !used.has(`${c.id}:${period}`))?.id;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limit || cat == null) return toast.error("Укажи категорию и лимит");
    if (used.has(`${cat}:${period}`)) return toast.error("Для этой категории уже есть такой бюджет");
    if (budget) await db.budgets.update(budget.id, { categoryId: cat, limit, period });
    else await db.budgets.add({ categoryId: cat, limit, period });
    toast.success("Бюджет сохранён");
    onDone();
  };

  return (
    <DialogContent title={budget ? "Бюджет" : "Новый бюджет"} size="sm">
      <form onSubmit={save} className="grid gap-4">
        <Field label="Категория">
          <NativeSelect value={cat ?? ""} onChange={(e) => setCategoryId(e.target.value)}>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Segmented
          value={period}
          onChange={setPeriod}
          options={[
            { value: "month", label: "В месяц" },
            { value: "week", label: "В неделю" },
          ]}
        />
        <Field label="Лимит">
          <AmountInput value={limit} onChange={setLimit} autoFocus={!budget} ariaLabel="Лимит" />
        </Field>
        <Button type="submit">Сохранить</Button>
        {budget && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!(await confirm({ title: "Удалить бюджет?", confirmText: "Удалить", destructive: true }))) return;
              await db.budgets.delete(budget.id);
              onDone();
            }}
          >
            <Trash2 /> Удалить
          </Button>
        )}
      </form>
    </DialogContent>
  );
}
