"use client";

import type { Id } from "@/lib/ids";
import { CornerDownLeft, HelpCircle, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { useCategories, useProducts, useStores, useTransactions, useToday } from "@/hooks/use-data";
import { parseQuickInput } from "@/lib/quick-input";
import { suggestCategory } from "@/lib/categorize";
import { normalizeKey } from "@/lib/db/schema";
import { formatDayHeading } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { addReceipt, addTransaction, deleteTransaction } from "@/lib/services/transactions";
import { cn } from "@/lib/utils";

const EXAMPLES = ["кофе 1200", "+350000 зарплата", "такси 2 500 вчера #работа", "молоко 2x650 magnum", "обед 1500+1200"];

export function QuickInputBar({ className }: { className?: string }) {
  const [text, setText] = useState("");
  const [help, setHelp] = useState(false);
  const today = useToday();
  const categories = useCategories();
  const stores = useStores();
  const products = useProducts();
  const txs = useTransactions();

  const plan = useMemo(() => {
    if (!text.trim() || !categories) return null;
    const p = parseQuickInput(text, { today, stores });
    const history = (txs ?? []).filter((t) => t.type === p.type && t.note && t.categoryId != null).slice(0, 500).map((t) => ({ note: t.note, categoryId: t.categoryId! }));
    const product = p.type === "expense" ? products?.find((x) => x.key === normalizeKey(p.description)) : undefined;
    const categoryId =
      product?.categoryId ??
      suggestCategory(p.description, categories, history, p.type) ??
      categories.find((c) => c.kind === p.type && c.name.startsWith("Проч"))?.id;
    const asItem = p.type === "expense" && (p.quantity != null || product != null);
    return { ...p, categoryId, product, asItem };
  }, [text, today, categories, stores, products, txs]);

  const cat = plan?.categoryId != null ? categories?.find((c) => c.id === plan.categoryId) : undefined;
  const store = plan?.storeId != null ? stores?.find((s) => s.id === plan.storeId) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan) return;
    if (!plan.amount) return toast.error("Не вижу сумму. Например: «кофе 1200»");
    try {
      let id: Id;
      if (plan.asItem) {
        const quantity = plan.quantity ?? 1;
        id = await addReceipt({
          date: plan.date,
          storeName: store?.name,
          tags: plan.tags,
          items: [
            {
              productName: plan.product?.name ?? plan.description,
              categoryId: plan.categoryId!,
              quantity,
              unit: plan.product?.unit ?? "шт",
              unitPrice: plan.unitPrice ?? Math.round(plan.amount / quantity),
              total: plan.amount,
            },
          ],
        });
      } else {
        const desc = plan.description ? plan.description.charAt(0).toUpperCase() + plan.description.slice(1) : "";
        id = (
          await addTransaction({
            type: plan.type,
            amount: plan.amount,
            date: plan.date,
            categoryId: plan.categoryId,
            storeId: plan.storeId,
            note: desc,
            tags: plan.tags,
          })
        ).id;
      }
      setText("");
      toast.success(`${plan.type === "income" ? "Приход" : "Расход"} ${formatMoney(plan.amount)} · ${cat?.icon ?? ""} ${cat?.name ?? ""}`, {
        action: {
          label: "Отменить",
          onClick: () => void deleteTransaction(id),
        },
      });
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className={cn("rounded-2xl border bg-card p-2 shadow-card", className)}>
      <form onSubmit={submit} className="flex items-center gap-2">
        <Zap className="ml-2 size-4 shrink-0 text-primary" aria-hidden />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Быстрый ввод: кофе 1200"
          aria-label="Быстрый ввод операции"
          autoComplete="off"
          enterKeyHint="done"
          className="h-10 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => setHelp((h) => !h)} aria-label="Подсказка по быстрому вводу" aria-expanded={help}>
          <HelpCircle />
        </Button>
        <Button type="submit" size="sm" disabled={!plan?.amount} aria-label="Записать">
          <CornerDownLeft />
        </Button>
      </form>
      {plan && (
        <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1 pt-2" aria-live="polite">
          <Badge tone={plan.type === "income" ? "good" : "neutral"}>{plan.type === "income" ? "Приход" : plan.asItem ? "Покупка" : "Расход"}</Badge>
          {plan.amount ? (
            <Badge tone="primary">
              {plan.quantity != null && `${plan.quantity} × ${formatMoney(plan.unitPrice!)} = `}
              {formatMoney(plan.amount)}
            </Badge>
          ) : (
            <Badge tone="bad">нет суммы</Badge>
          )}
          {cat && (
            <Badge>
              {cat.icon} {cat.name}
            </Badge>
          )}
          {plan.description && <Badge>«{plan.description}»</Badge>}
          {store && <Badge>🏪 {store.name}</Badge>}
          <Badge>{formatDayHeading(plan.date, today)}</Badge>
          {plan.tags.map((t) => (
            <Badge key={t} tone="primary">
              #{t}
            </Badge>
          ))}
        </div>
      )}
      {help && (
        <div className="space-y-1.5 px-2 pb-2 pt-2 text-xs text-muted-foreground">
          <p>Пиши как в заметке, я пойму:</p>
          <div className="flex flex-wrap gap-1.5">
            {EXAMPLES.map((ex) => (
              <button key={ex} type="button" onClick={() => setText(ex)} className="rounded-full bg-muted px-2 py-1 font-mono text-foreground hover:bg-primary-soft">
                {ex}
              </button>
            ))}
          </div>
          <p>«+» в начале — приход. «2x650» — количество × цена (запишется как продукт). «вчера», «12.10» — дата. «#тег» — тег. Название магазина тоже распознаётся. Можно считать: «1500+1200».</p>
        </div>
      )}
    </div>
  );
}
