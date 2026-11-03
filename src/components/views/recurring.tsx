"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, NativeSelect } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Badge, EmptyState, IconBubble, Segmented, Skeleton, Switch } from "@/components/ui/misc";
import { useCategories, useLookups, useRecurring, useToday } from "@/hooks/use-data";
import { db } from "@/lib/db/db";
import type { Recurring, RecurringMode } from "@/lib/db/schema";
import { formatDayHeading, formatFrequency, type Frequency } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { confirmRecurring, processRecurring } from "@/lib/services/recurring";

export function RecurringView() {
  const list = useRecurring();
  const lookups = useLookups();
  const today = useToday();
  const [edit, setEdit] = useState<Recurring | "new" | null>(null);
  const sorted = [...(list ?? [])].sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDate < b.nextDate ? -1 : 1));
  const monthlyExpense = (list ?? [])
    .filter((r) => r.active && r.type === "expense")
    .reduce((s, r) => s + (r.amount * { day: 30.44, week: 4.35, month: 1, year: 1 / 12 }[r.frequency]) / r.interval, 0);

  return (
    <>
      <PageHeader
        title="Регулярные платежи"
        description={monthlyExpense > 0 ? `Обязательные траты ≈ ${formatMoney(Math.round(monthlyExpense / 100) * 100)} в месяц` : "Подписки, аренда, коммуналка, зарплата"}
        actions={
          <Button onClick={() => setEdit("new")}>
            <Plus /> Добавить
          </Button>
        }
      />
      {!list ? (
        <Skeleton className="h-64" />
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon="🔁" title="Регулярных платежей нет" description="Добавь аренду, подписки или зарплату — в режиме «авто» я буду записывать их сама, в режиме «напоминание» — подскажу на главной" action={<Button onClick={() => setEdit("new")}>Добавить</Button>} />
        </Card>
      ) : (
        <Card>
          <CardContent className="px-2 sm:px-3">
            <ul>
              {sorted.map((r) => {
                const c = lookups.categories.get(r.categoryId);
                const due = r.active && r.nextDate <= today;
                return (
                  <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setEdit(r)}>
                      <IconBubble icon={c?.icon ?? "🔁"} color={c?.color} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate font-medium">{r.name}</span>
                          <Badge tone={r.mode === "auto" ? "primary" : "neutral"}>{r.mode === "auto" ? "авто" : "напоминание"}</Badge>
                          {due && r.mode === "remind" && <Badge tone="warn">пора</Badge>}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatFrequency(r.frequency, r.interval)} · {r.active ? `следующий: ${formatDayHeading(r.nextDate, today).toLowerCase()}` : "на паузе"}
                        </span>
                      </span>
                      <span className={`font-semibold tabular-nums ${r.type === "income" ? "text-income" : ""}`}>
                        {r.type === "income" ? "+" : "−"}
                        {formatMoney(r.amount)}
                      </span>
                    </button>
                    {due && r.mode === "remind" ? (
                      <Button size="sm" onClick={() => confirmRecurring(r).then(() => toast.success("Записано"))}>
                        Записать
                      </Button>
                    ) : (
                      <Switch
                        checked={r.active}
                        label={r.active ? "Поставить на паузу" : "Возобновить"}
                        onCheckedChange={async (v) => {
                          await db.recurring.update(r.id, { active: v });
                          if (v) await processRecurring(today);
                        }}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      <Dialog open={edit != null} onOpenChange={(o) => !o && setEdit(null)}>
        {edit != null && <RecurringDialog item={edit === "new" ? undefined : edit} onDone={() => setEdit(null)} />}
      </Dialog>
    </>
  );
}

function RecurringDialog({ item, onDone }: { item?: Recurring; onDone: () => void }) {
  const categories = useCategories() ?? [];
  const today = useToday();
  const confirm = useConfirm();
  const [name, setName] = useState(item?.name ?? "");
  const [type, setType] = useState<"expense" | "income">(item?.type ?? "expense");
  const [amount, setAmount] = useState<number | null>(item?.amount ?? null);
  const [categoryId, setCategoryId] = useState<number | undefined>(item?.categoryId);
  const [frequency, setFrequency] = useState<Frequency>(item?.frequency ?? "month");
  const [interval, setInterval] = useState(item?.interval ?? 1);
  const [nextDate, setNextDate] = useState(item?.nextDate ?? today);
  const [mode, setMode] = useState<RecurringMode>(item?.mode ?? "remind");

  const cats = categories.filter((c) => c.kind === type && !c.archived);
  const cat = categoryId != null && cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !amount || cat == null) return toast.error("Заполни название и сумму");
    const data = { name: name.trim(), type, amount, categoryId: cat, frequency, interval: Math.max(1, interval), nextDate, mode };
    if (item) await db.recurring.update(item.id, data);
    else await db.recurring.add({ ...data, active: true, createdAt: Date.now() });
    const created = await processRecurring(today);
    toast.success(created ? `Сохранено, записано платежей: ${created}` : "Сохранено");
    onDone();
  };

  return (
    <DialogContent title={item ? "Регулярный платёж" : "Новый регулярный платёж"}>
      <form onSubmit={save} className="grid gap-4">
        <Segmented
          value={type}
          onChange={setType}
          options={[
            { value: "expense", label: "Расход" },
            { value: "income", label: "Приход" },
          ]}
        />
        <Field label="Название">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Аренда, интернет, Netflix…" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Сумма">
            <AmountInput value={amount} onChange={setAmount} ariaLabel="Сумма" />
          </Field>
          <Field label="Следующая дата">
            <Input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
          </Field>
        </div>
        <Field label="Категория">
          <NativeSelect value={cat ?? ""} onChange={(e) => setCategoryId(Number(e.target.value))}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-[5rem_1fr] gap-3">
          <Field label="Каждые">
            <Input type="number" min={1} max={365} value={interval} onChange={(e) => setInterval(Number(e.target.value) || 1)} />
          </Field>
          <Field label="Период">
            <NativeSelect value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
              <option value="day">день</option>
              <option value="week">неделя</option>
              <option value="month">месяц</option>
              <option value="year">год</option>
            </NativeSelect>
          </Field>
        </div>
        <Field label="Режим" hint={mode === "auto" ? "Операция запишется сама в нужный день (при открытии приложения)" : "На главной появится напоминание с кнопкой «Записать»"}>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "remind", label: "Напоминание" },
              { value: "auto", label: "Авто" },
            ]}
          />
        </Field>
        <Button type="submit">Сохранить</Button>
        {item && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive"
            onClick={async () => {
              if (!(await confirm({ title: `Удалить «${item.name}»?`, description: "Уже записанные операции останутся.", confirmText: "Удалить", destructive: true }))) return;
              await db.recurring.delete(item.id);
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
