"use client";

import { Repeat } from "lucide-react";
import { useMemo } from "react";
import type { Lookups } from "@/hooks/use-data";
import type { PurchaseItem, Transaction } from "@/lib/db/schema";
import { formatDayHeading, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { IconBubble } from "@/components/ui/misc";
import { Money } from "@/components/ui/money";
import { useTxEditor } from "./tx-editor";
import { cn } from "@/lib/utils";

export function describeTx(tx: Transaction, l: Lookups, items?: PurchaseItem[]) {
  const cat = tx.categoryId != null ? l.categories.get(tx.categoryId) : undefined;
  const store = tx.storeId != null ? l.stores.get(tx.storeId) : undefined;
  switch (tx.type) {
    case "adjustment":
      return { icon: "⚖️", color: "#64748b", title: tx.note || "Корректировка баланса", subtitle: "Не учитывается в отчётах" };
    case "goal_deposit":
    case "goal_withdraw": {
      const g = tx.goalId != null ? l.goals.get(tx.goalId) : undefined;
      const dep = tx.type === "goal_deposit";
      return {
        icon: g?.icon ?? "🐷",
        color: g?.color,
        title: `${dep ? "В копилку" : "Из копилки"} «${g?.name ?? "?"}»`,
        subtitle: tx.note || (dep ? "отложено" : "вернулось в свободные"),
      };
    }
    default: {
      const products = items?.map((i) => l.products.get(i.productId)?.name).filter(Boolean) ?? [];
      const itemsTitle = products.length ? (products.length > 3 ? `${products.slice(0, 3).join(", ")} и ещё ${products.length - 3}` : products.join(", ")) : "";
      return {
        icon: items?.length ? "🧾" : (cat?.icon ?? "📦"),
        color: cat?.color,
        title: tx.note || (store && items?.length ? store.name : "") || itemsTitle || cat?.name || "Без категории",
        subtitle: [items?.length ? itemsTitle || cat?.name : (cat?.name ?? null), store && !(tx.note === "" && items?.length) ? store.name : null]
          .filter(Boolean)
          .join(" · "),
      };
    }
  }
}

export function TxRow({ tx, lookups, items, showDate }: { tx: Transaction; lookups: Lookups; items?: PurchaseItem[]; showDate?: boolean }) {
  const open = useTxEditor();
  const d = describeTx(tx, lookups, items);
  const neutral = tx.type === "goal_deposit" || tx.type === "goal_withdraw";
  return (
    <button type="button" onClick={() => open({ txId: tx.id })} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-muted">
      <IconBubble icon={d.icon} color={d.color} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate font-medium">{d.title}</span>
          {tx.recurringId != null && <Repeat className="size-3.5 shrink-0 text-muted-foreground" aria-label="Регулярный платёж" />}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {showDate && <>{formatDayHeading(tx.date)} · </>}
          {d.subtitle}
          {tx.tags.length > 0 && <span className="text-primary"> {tx.tags.map((t) => `#${t}`).join(" ")}</span>}
        </span>
      </span>
      {neutral ? (
        <span className={cn("tabular-nums whitespace-nowrap text-muted-foreground")}>{formatMoney(tx.amount)}</span>
      ) : tx.type === "adjustment" ? (
        <span className="tabular-nums whitespace-nowrap text-muted-foreground">{formatMoney(tx.amount, { sign: true })}</span>
      ) : (
        <Money value={tx.amount} kind={tx.type === "income" ? "income" : "expense"} className="font-semibold" />
      )}
    </button>
  );
}

export function TxList({ txs, lookups, items, groupByDay = true }: { txs: Transaction[]; lookups: Lookups; items?: PurchaseItem[]; groupByDay?: boolean }) {
  const itemsByTx = useMemo(() => {
    const m = new Map<number, PurchaseItem[]>();
    for (const it of items ?? []) {
      const l = m.get(it.transactionId);
      if (l) l.push(it);
      else m.set(it.transactionId, [it]);
    }
    return m;
  }, [items]);

  const groups = useMemo(() => {
    if (!groupByDay) return [{ date: "", txs }];
    const out: { date: string; txs: Transaction[] }[] = [];
    for (const t of txs) {
      const last = out[out.length - 1];
      if (last && last.date === t.date) last.txs.push(t);
      else out.push({ date: t.date, txs: [t] });
    }
    return out;
  }, [txs, groupByDay]);

  const today = todayISO();
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {groups.map((g) => {
        const spent = g.txs.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
        const earned = g.txs.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
        return (
          <section key={g.date || "all"} className="min-w-0">
            {groupByDay && (
              <div className="flex items-baseline justify-between px-2 pb-1 text-xs font-medium text-muted-foreground">
                <h3>{formatDayHeading(g.date, today)}</h3>
                <span className="tabular-nums">
                  {earned > 0 && <span className="text-income">+{formatMoney(earned, { plain: true })} </span>}
                  {spent > 0 && <span>−{formatMoney(spent)}</span>}
                </span>
              </div>
            )}
            <div>
              {g.txs.map((t) => (
                <TxRow key={t.id} tx={t} lookups={lookups} items={itemsByTx.get(t.id)} showDate={!groupByDay} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
