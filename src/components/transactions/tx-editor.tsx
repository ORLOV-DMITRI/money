"use client";

import type { Id } from "@/lib/ids";
import { Plus, Trash2, X } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, useConfirm } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, inputClass } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Segmented } from "@/components/ui/misc";
import { CategoryGrid } from "./category-grid";
import { db } from "@/lib/db/db";
import { normalizeKey, UNITS, type Category, type Transaction, type Unit } from "@/lib/db/schema";
import { formatMoney, parseAmount, tiynToInput } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { suggestCategory } from "@/lib/categorize";
import { autoDeposits } from "@/lib/analytics/goals";
import { budgetPeriod, crossedThreshold } from "@/lib/analytics/budgets";
import { expenseEntries } from "@/lib/analytics/reports";
import {
  addReceipt,
  addTransaction,
  deleteTransaction,
  restoreSnapshot,
  updateReceipt,
  updateTransaction,
} from "@/lib/services/transactions";
import { useBalances, useCategories, useGoals, useProducts, useStores, useTransactions } from "@/hooks/use-data";
import { cn } from "@/lib/utils";

export type EditorMode = "expense" | "income" | "receipt" | "goal" | "adjustment";

export interface EditorRequest {
  mode?: EditorMode;
  txId?: Id;
  goalId?: Id;
  goalDirection?: "deposit" | "withdraw";
  preset?: Partial<Pick<Transaction, "amount" | "categoryId" | "note" | "date">>;
}

const EditorContext = React.createContext<(r?: EditorRequest) => void>(() => {});

export function useTxEditor() {
  return React.useContext(EditorContext);
}

export function TxEditorProvider({ children }: { children: React.ReactNode }) {
  const [req, setReq] = React.useState<(EditorRequest & { key: number }) | null>(null);
  const [open, setOpen] = React.useState(false);
  const openEditor = React.useCallback((r: EditorRequest = {}) => {
    setReq({ ...r, key: Date.now() });
    setOpen(true);
  }, []);
  return (
    <EditorContext.Provider value={openEditor}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        {req && <EditorDialog key={req.key} req={req} onDone={() => setOpen(false)} />}
      </Dialog>
    </EditorContext.Provider>
  );
}

/* ------------------------------------------------------------------ */

const MODE_TABS: { value: Exclude<EditorMode, "goal" | "adjustment">; label: string }[] = [
  { value: "expense", label: "Расход" },
  { value: "income", label: "Приход" },
  { value: "receipt", label: "Чек" },
];

function EditorDialog({ req, onDone }: { req: EditorRequest; onDone: () => void }) {
  const editing = req.txId != null;
  const [loaded, setLoaded] = React.useState<{ tx?: Transaction; mode: EditorMode } | null>(editing ? null : { mode: req.mode ?? (req.goalId != null ? "goal" : "expense") });
  const [mode, setMode] = React.useState<EditorMode>(req.mode ?? (req.goalId != null ? "goal" : "expense"));

  React.useEffect(() => {
    if (!editing) return;
    (async () => {
      const t = await db.transactions.get(req.txId!);
      if (!t) return onDone();
      const hasItems = (await db.purchaseItems.where("transactionId").equals(t.id).count()) > 0;
      const m: EditorMode = t.type === "goal_deposit" || t.type === "goal_withdraw" ? "goal" : hasItems ? "receipt" : t.type;
      setLoaded({ tx: t, mode: m });
      setMode(m);
    })();
  }, [editing, req.txId, onDone]);

  const confirm = useConfirm();
  const remove = async () => {
    if (!loaded?.tx) return;
    const ok = await confirm({
      title: "Удалить операцию?",
      description: loaded.tx.type === "income" ? "Автоотчисления в копилки от этого прихода тоже удалятся." : undefined,
      confirmText: "Удалить",
      destructive: true,
    });
    if (!ok) return;
    const snap = await deleteTransaction(loaded.tx.id);
    onDone();
    toast("Операция удалена", { action: { label: "Отменить", onClick: () => restoreSnapshot(snap) } });
  };

  const titles: Record<EditorMode, string> = {
    expense: "Расход",
    income: "Приход",
    adjustment: "Корректировка",
    receipt: "Чек",
    goal: "Копилка",
  };

  return (
    <DialogContent title={editing ? `Изменить: ${titles[mode].toLowerCase()}` : "Новая операция"} size={mode === "receipt" ? "lg" : "md"}>
      {!editing && mode !== "goal" && mode !== "adjustment" && <Segmented className="mb-4" value={mode as Exclude<EditorMode, "goal" | "adjustment">} onChange={setMode} options={MODE_TABS} />}
      {!loaded ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Загрузка…</div>
      ) : (
        <>
          {(mode === "expense" || mode === "income") && <SimpleForm key={mode} kind={mode} tx={loaded.tx} req={req} onDone={onDone} />}
          {mode === "adjustment" && loaded.tx && <AdjustmentForm tx={loaded.tx} onDone={onDone} />}
          {mode === "receipt" && <ReceiptForm tx={loaded.tx} onDone={onDone} />}
          {mode === "goal" && <GoalForm tx={loaded.tx} req={req} onDone={onDone} />}
          {editing && (
            <Button variant="ghost" className="mt-2 w-full text-destructive" onClick={remove}>
              <Trash2 /> Удалить операцию
            </Button>
          )}
        </>
      )}
    </DialogContent>
  );
}

/* ------------------------------------------------------------------ */

function TagsInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Field label="Теги" hint="Через пробел или запятую: отпуск, др мамы">
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="#отпуск" autoComplete="off" />
    </Field>
  );
}

function parseTags(s: string): string[] {
  return s
    .split(/[,#]/)
    .flatMap((part) => (part.includes(",") ? part.split(",") : [part]))
    .map((t) => t.trim())
    .filter(Boolean);
}

async function warnBudget(categoryId: Id | undefined, amount: number, date: string, categories: Category[]) {
  if (categoryId == null) return;
  const budgets = await db.budgets.where("categoryId").equals(categoryId).toArray();
  for (const b of budgets) {
    const period = budgetPeriod(b, todayISO());
    if (date < period.start || date > period.end) continue;
    const txs = await db.transactions.where("date").between(period.start, period.end, true, true).toArray();
    const items = await db.purchaseItems.where("date").between(period.start, period.end, true, true).toArray();
    const after = expenseEntries(txs, items).filter((e) => e.categoryId === categoryId).reduce((s, e) => s + e.amount, 0);
    const level = crossedThreshold(after - amount, after, b.limit);
    const cat = categories.find((c) => c.id === categoryId);
    if (level === "over") toast.error(`Бюджет «${cat?.name}» превышен: ${formatMoney(after)} из ${formatMoney(b.limit)}`);
    else if (level === "warn") toast.warning(`Бюджет «${cat?.name}» израсходован на ${Math.round((after / b.limit) * 100)}%`);
  }
}

function SimpleForm({ kind, tx, req, onDone }: { kind: "expense" | "income"; tx?: Transaction; req: EditorRequest; onDone: () => void }) {
  const categories = useCategories() ?? [];
  const txs = useTransactions();
  const goals = useGoals();
  const p = req.preset ?? {};

  const [amount, setAmount] = React.useState<number | null>(tx?.amount ?? p.amount ?? null);
  const [categoryId, setCategoryId] = React.useState<Id | undefined>(tx?.categoryId ?? p.categoryId);
  const [categoryTouched, setCategoryTouched] = React.useState(tx != null || p.categoryId != null);
  const [date, setDate] = React.useState(tx?.date ?? p.date ?? todayISO());
  const [note, setNote] = React.useState(tx?.note ?? p.note ?? "");
  const [tags, setTags] = React.useState(tx?.tags.join(", ") ?? "");
  const [saving, setSaving] = React.useState(false);

  const history = React.useMemo(
    () => (txs ?? []).filter((t) => t.type === kind && t.note && t.categoryId != null).slice(0, 500).map((t) => ({ note: t.note, categoryId: t.categoryId! })),
    [txs, kind],
  );

  const onNote = (v: string) => {
    setNote(v);
    if (!categoryTouched) {
      const s = suggestCategory(v, categories, history, kind);
      if (s != null) setCategoryId(s);
    }
  };

  const preview = kind === "income" && !tx && amount ? autoDeposits(amount, goals ?? []) : [];

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return toast.error("Введи сумму");
    const cat = categoryId ?? categories.find((c) => c.kind === kind && c.name.startsWith("Проч"))?.id;
    const input = { type: kind, amount, date, categoryId: cat, note, tags: parseTags(tags) };
    setSaving(true);
    try {
      if (tx) {
        await updateTransaction(tx.id, input);
        toast.success("Сохранено");
      } else {
        const res = await addTransaction(input);
        if (res.autoDeposits.length) {
          const sum = res.autoDeposits.reduce((s, d) => s + d.amount, 0);
          toast.success(`Приход записан, ${formatMoney(sum)} отложено в копилки 🐷`, {
            action: {
              label: "Без отчислений",
              onClick: async () => {
                await db.transactions.where("parentId").equals(res.id).delete();
              },
            },
          });
        } else {
          toast.success(kind === "income" ? "Приход записан" : "Расход записан");
        }
      }
      if (kind === "expense") await warnBudget(cat, tx ? amount - tx.amount : amount, date, categories);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <AmountInput value={amount} onChange={setAmount} size="lg" autoFocus={!tx} ariaLabel="Сумма" />
      <Field label="Описание">
        <Input value={note} onChange={(e) => onNote(e.target.value)} placeholder={kind === "expense" ? "Кофе, такси, обед…" : "Зарплата, фриланс…"} autoComplete="off" />
      </Field>
      <div className="grid gap-1.5">
        <span className="text-sm font-medium text-muted-foreground">Категория</span>
        <CategoryGrid
          categories={categories}
          kind={kind}
          value={categoryId}
          txs={txs}
          onChange={(id) => {
            setCategoryId(id);
            setCategoryTouched(true);
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <TagsInput value={tags} onChange={setTags} />
      </div>
      {preview.length > 0 && (
        <div className="rounded-xl bg-primary-soft p-3 text-sm">
          <p className="font-medium">Автоотчисления в копилки</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {preview.map((d) => {
              const g = goals?.find((x) => x.id === d.goalId);
              return (
                <li key={d.goalId}>
                  {g?.icon} {g?.name} ({g?.autoPercent}%) — {formatMoney(d.amount)}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <Button type="submit" size="lg" disabled={saving}>
        {tx ? "Сохранить" : kind === "expense" ? "Записать расход" : "Записать приход"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

function GoalForm({ tx, req, onDone }: { tx?: Transaction; req: EditorRequest; onDone: () => void }) {
  const goals = useGoals();
  const balances = useBalances();
  const [direction, setDirection] = React.useState<"deposit" | "withdraw">(tx ? (tx.type === "goal_withdraw" ? "withdraw" : "deposit") : (req.goalDirection ?? "deposit"));
  const [goalId, setGoalId] = React.useState<Id | undefined>(tx?.goalId ?? req.goalId);
  const [amount, setAmount] = React.useState<number | null>(tx?.amount ?? null);
  const [date, setDate] = React.useState(tx?.date ?? todayISO());
  const [note, setNote] = React.useState(tx?.note ?? "");

  const active = (goals ?? []).filter((g) => !g.archived || g.id === goalId);
  const gid = goalId ?? active[0]?.id;
  const goalBalance = (balances?.goals.get(gid ?? -1) ?? 0) + (tx && tx.type === "goal_withdraw" ? tx.amount : 0);

  if (goals && !active.length) return <p className="py-6 text-center text-sm text-muted-foreground">Сначала создай копилку.</p>;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return toast.error("Введи сумму");
    if (direction === "withdraw" && amount > goalBalance) return toast.error(`В копилке только ${formatMoney(goalBalance)}`);
    try {
      const input = { type: direction === "deposit" ? ("goal_deposit" as const) : ("goal_withdraw" as const), amount, date, goalId: gid, note };
      if (tx) await updateTransaction(tx.id, input);
      else await addTransaction(input);
      toast.success(direction === "deposit" ? "Копилка пополнена 🐷" : "Деньги вернулись в свободные");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <Segmented
        value={direction}
        onChange={setDirection}
        options={[
          { value: "deposit", label: "Пополнить" },
          { value: "withdraw", label: "Снять" },
        ]}
      />
      <AmountInput value={amount} onChange={setAmount} size="lg" autoFocus={!tx} ariaLabel="Сумма" />
      <Field label="Копилка" hint={`Сейчас в копилке ${formatMoney(goalBalance)}`}>
        <NativeSelect value={gid ?? ""} onChange={(e) => setGoalId(e.target.value)}>
          {active.map((g) => (
            <option key={g.id} value={g.id}>
              {g.icon} {g.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      {direction === "deposit" && balances && amount != null && amount > balances.totals.free && (
        <p className="text-xs text-warning">Свободных денег сейчас {formatMoney(balances.totals.free)} — после пополнения уйдёшь в минус</p>
      )}
      <Button type="submit" size="lg">
        {tx ? "Сохранить" : direction === "deposit" ? "Пополнить" : "Снять"}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------ */

interface ItemRow {
  key: number;
  productName: string;
  quantity: string;
  unit: Unit;
  unitPrice: number | null;
  total: number | null;
  categoryId: Id | undefined;
}

let rowSeq = 1;
const emptyRow = (): ItemRow => ({ key: rowSeq++, productName: "", quantity: "1", unit: "шт", unitPrice: null, total: null, categoryId: undefined });

function qtyOf(s: string): number {
  const v = parseFloat(s.replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : 0;
}

function ReceiptForm({ tx, onDone }: { tx?: Transaction; onDone: () => void }) {
  const categories = useCategories() ?? [];
  const products = useProducts();
  const stores = useStores();

  const [date, setDate] = React.useState(tx?.date ?? todayISO());
  const [store, setStore] = React.useState("");
  const [note, setNote] = React.useState(tx?.note ?? "");
  const [tags, setTags] = React.useState(tx?.tags.join(", ") ?? "");
  const [rows, setRows] = React.useState<ItemRow[]>([emptyRow()]);
  const [saving, setSaving] = React.useState(false);

  // загрузка позиций при редактировании
  React.useEffect(() => {
    if (!tx) return;
    (async () => {
      const items = await db.purchaseItems.where("transactionId").equals(tx.id).toArray();
      const prods = await db.products.bulkGet(items.map((i) => i.productId));
      if (tx.storeId != null) setStore((await db.stores.get(tx.storeId))?.name ?? "");
      setRows(
        items.map((it, i) => ({
          key: rowSeq++,
          productName: prods[i]?.name ?? "",
          quantity: String(it.quantity).replace(".", ","),
          unit: it.unit,
          unitPrice: it.unitPrice,
          total: it.total,
          categoryId: it.categoryId,
        })),
      );
    })();
  }, [tx]);

  const defaultCategory = categories.find((c) => c.kind === "expense" && c.name === "Продукты")?.id ?? categories.find((c) => c.kind === "expense")?.id;
  const total = rows.reduce((s, r) => s + (r.total ?? 0), 0);

  const update = (key: number, patch: Partial<ItemRow>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onProduct = async (row: ItemRow, name: string) => {
    const p = products?.find((x) => x.key === normalizeKey(name));
    if (!p) return update(row.key, { productName: name });
    const last = (await db.purchaseItems.where("productId").equals(p.id).toArray()).sort((a, b) => (a.date < b.date ? 1 : -1))[0];
    const unitPrice = row.unitPrice ?? last?.unitPrice ?? null;
    const unit = last?.unit ?? p.unit;
    const q = qtyOf(row.quantity) || 1;
    update(row.key, {
      productName: p.name,
      unit,
      categoryId: row.categoryId ?? p.categoryId,
      unitPrice,
      total: unitPrice != null ? Math.round(unitPrice * q) : row.total,
    });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const incomplete = rows.find((r) => r.productName.trim() && !r.total);
    if (incomplete) return toast.error(`Укажи цену или сумму для «${incomplete.productName.trim()}»`);
    const filled = rows.filter((r) => r.productName.trim() && r.total);
    if (!filled.length) return toast.error("Добавь хотя бы одну позицию с названием и суммой");
    const input = {
      date,
      storeName: store,
      note,
      tags: parseTags(tags),
      items: filled.map((r) => {
        const quantity = qtyOf(r.quantity) || 1;
        return {
          productName: r.productName,
          categoryId: r.categoryId ?? defaultCategory!,
          quantity,
          unit: r.unit,
          unitPrice: r.unitPrice ?? Math.round(r.total! / quantity),
          total: r.total!,
        };
      }),
    };
    setSaving(true);
    try {
      if (tx) await updateReceipt(tx.id, input);
      else await addReceipt(input);
      toast.success(`Чек на ${formatMoney(input.items.reduce((s, i) => s + i.total, 0))} записан`);
      const cats = [...new Set(input.items.map((i) => i.categoryId))];
      for (const c of cats) {
        const sum = input.items.filter((i) => i.categoryId === c).reduce((s, i) => s + i.total, 0);
        await warnBudget(c, tx ? 0 : sum, date, categories);
      }
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Магазин">
          <Input value={store} onChange={(e) => setStore(e.target.value)} list="stores-list" placeholder="Magnum" autoComplete="off" />
          <datalist id="stores-list">
            {stores?.map((s) => (
              <option key={s.id} value={s.name} />
            ))}
          </datalist>
        </Field>
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
      </div>

      <datalist id="products-list">
        {products?.map((p) => (
          <option key={p.id} value={p.name} />
        ))}
      </datalist>

      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Позиции</span>
          <span className="text-sm text-muted-foreground">{rows.filter((r) => r.total).length} шт.</span>
        </div>
        {rows.map((r, idx) => (
          <div key={r.key} className="grid gap-2 rounded-xl border p-2.5 sm:grid-cols-[1fr_auto]">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`Продукт ${idx + 1}`}
                value={r.productName}
                list="products-list"
                placeholder="Продукт"
                onChange={(e) => update(r.key, { productName: e.target.value })}
                onBlur={(e) => onProduct(r, e.target.value)}
                autoComplete="off"
                className="flex-1"
              />
              <NativeSelect
                aria-label="Категория позиции"
                value={r.categoryId ?? defaultCategory ?? ""}
                onChange={(e) => update(r.key, { categoryId: e.target.value })}
                className="w-14 shrink-0 [&_select]:px-2 [&_select]:pr-6 [&_svg]:right-1.5"
              >
                {categories
                  .filter((c) => c.kind === "expense" && !c.archived)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.icon} {c.name}
                    </option>
                  ))}
              </NativeSelect>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Удалить позицию"
                onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((x) => x.key !== r.key) : [emptyRow()]))}
              >
                <X />
              </Button>
            </div>
            <div className="grid grid-cols-[4.5rem_4rem_1fr_1fr] items-start gap-2 sm:grid-cols-[4.5rem_4rem_7rem_7rem]">
              <input
                aria-label="Количество"
                inputMode="decimal"
                className={cn(inputClass, "px-2 text-center")}
                value={r.quantity}
                onChange={(e) => {
                  const q = qtyOf(e.target.value);
                  update(r.key, { quantity: e.target.value, total: r.unitPrice != null && q ? Math.round(r.unitPrice * q) : r.total });
                }}
              />
              <select aria-label="Единица" className={cn(inputClass, "px-2")} value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value as Unit })}>
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <RowAmount
                label="Цена за ед."
                value={r.unitPrice}
                onChange={(v) => {
                  const q = qtyOf(r.quantity) || 1;
                  update(r.key, { unitPrice: v, total: v != null ? Math.round(v * q) : r.total });
                }}
              />
              <RowAmount
                label="Сумма"
                value={r.total}
                onChange={(v) => {
                  const q = qtyOf(r.quantity) || 1;
                  update(r.key, { total: v, unitPrice: v != null ? Math.round(v / q) : r.unitPrice });
                }}
              />
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          <Plus /> Добавить позицию
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <TagsInput value={tags} onChange={setTags} />
      </div>

      <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 border-t bg-card px-5 py-3">
        <div>
          <p className="text-xs text-muted-foreground">Итого</p>
          <p className="text-xl font-semibold tabular-nums">{formatMoney(total)}</p>
        </div>
        <Button type="submit" size="lg" disabled={saving}>
          {tx ? "Сохранить чек" : "Записать чек"}
        </Button>
      </div>
    </form>
  );
}

/** Компактное поле суммы для строки чека: держит текст, пока его редактируют */
function RowAmount({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const [text, setText] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  // Пока поле в фокусе — показываем то, что набирают; иначе — значение из строки чека
  const shown = focused ? text : value != null ? tiynToInput(value) : "";
  return (
    <div className="relative">
      <input
        aria-label={label}
        placeholder={label}
        inputMode="decimal"
        className={cn(inputClass, "pr-6 tabular-nums")}
        value={shown}
        onFocus={() => {
          setText(value != null ? tiynToInput(value) : "");
          setFocused(true);
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setText(e.target.value);
          onChange(parseAmount(e.target.value));
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₸</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function AdjustmentForm({ tx, onDone }: { tx: Transaction; onDone: () => void }) {
  const [sign, setSign] = React.useState<"plus" | "minus">(tx.amount < 0 ? "minus" : "plus");
  const [amount, setAmount] = React.useState<number | null>(Math.abs(tx.amount));
  const [date, setDate] = React.useState(tx.date);
  const [note, setNote] = React.useState(tx.note);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount) return toast.error("Введи сумму");
    try {
      await updateTransaction(tx.id, { type: "adjustment", amount: sign === "minus" ? -amount : amount, date, note });
      toast.success("Сохранено");
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <form onSubmit={save} className="grid gap-4">
      <p className="text-sm text-muted-foreground">Корректировка меняет баланс, но не попадает в отчёты о тратах и доходах.</p>
      <Segmented
        value={sign}
        onChange={setSign}
        options={[
          { value: "plus", label: "Добавить" },
          { value: "minus", label: "Убрать" },
        ]}
      />
      <AmountInput value={amount} onChange={setAmount} size="lg" ariaLabel="Сумма" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label="Заметка">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <Button type="submit" size="lg">
        Сохранить
      </Button>
    </form>
  );
}
