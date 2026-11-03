"use client";

import { useMemo, useState } from "react";
import type { Category, Transaction } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

/** Сетка категорий: самые используемые — первыми */
export function CategoryGrid({
  categories,
  kind,
  value,
  onChange,
  txs,
  limit = 11,
}: {
  categories: Category[];
  kind: "expense" | "income";
  value: number | undefined;
  onChange: (id: number) => void;
  txs?: Transaction[];
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const sorted = useMemo(() => {
    const usage = new Map<number, number>();
    for (const t of (txs ?? []).slice(0, 400)) if (t.categoryId != null) usage.set(t.categoryId, (usage.get(t.categoryId) ?? 0) + 1);
    return categories
      .filter((c) => c.kind === kind && (!c.archived || c.id === value))
      .sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.order - b.order);
  }, [categories, kind, txs, value]);

  let shown = expanded ? sorted : sorted.slice(0, limit);
  // выбранная категория всегда видна
  if (!expanded && value != null && !shown.some((c) => c.id === value)) {
    const sel = sorted.find((c) => c.id === value);
    if (sel) shown = [...shown.slice(0, limit - 1), sel];
  }

  return (
    <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
      {shown.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onChange(c.id)}
          aria-pressed={value === c.id}
          className={cn(
            "flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-xl border border-transparent px-1 py-1.5 text-center transition-colors hover:bg-muted",
            value === c.id && "border-primary bg-primary-soft",
          )}
        >
          <span className="text-xl leading-none" aria-hidden>
            {c.icon}
          </span>
          <span className="line-clamp-2 text-[11px] leading-tight">{c.name}</span>
        </button>
      ))}
      {sorted.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-h-16 flex-col items-center justify-center rounded-xl px-1 text-[11px] text-muted-foreground hover:bg-muted"
        >
          <span className="text-xl leading-none">{expanded ? "▴" : "⋯"}</span>
          {expanded ? "Свернуть" : "Ещё"}
        </button>
      )}
    </div>
  );
}
