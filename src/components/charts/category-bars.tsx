"use client";

import Link from "next/link";
import type { Category } from "@/lib/db/schema";
import type { CategoryShare } from "@/lib/analytics/reports";
import { formatMoney } from "@/lib/money";

const MAX_ROWS = 8;

/** Ранжированные полосы: цвет — у категории (сущности), подпись и сумма — всегда текстом */
export function CategoryBars({
  shares,
  categories,
  hrefFor,
}: {
  shares: CategoryShare[];
  categories: Map<number, Category>;
  hrefFor?: (categoryId: number | undefined) => string;
}) {
  let rows = shares;
  if (shares.length > MAX_ROWS) {
    const rest = shares.slice(MAX_ROWS - 1);
    rows = [
      ...shares.slice(0, MAX_ROWS - 1),
      { categoryId: -1, amount: rest.reduce((s, r) => s + r.amount, 0), share: rest.reduce((s, r) => s + r.share, 0) },
    ];
  }
  const max = Math.max(...rows.map((r) => r.amount), 1);
  return (
    <ul className="grid gap-3">
      {rows.map((r) => {
        const other = r.categoryId === -1;
        const c = r.categoryId != null && !other ? categories.get(r.categoryId) : undefined;
        const name = other ? `Остальное (${shares.length - MAX_ROWS + 1})` : (c?.name ?? "Без категории");
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span aria-hidden>{other ? "⋯" : (c?.icon ?? "📦")}</span>
                <span className="truncate">{name}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap tabular-nums">
                <span className="font-semibold">{formatMoney(r.amount)}</span>
                <span className="ml-2 inline-block w-9 text-right text-xs text-muted-foreground">{Math.round(r.share * 100)}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full" style={{ width: `${Math.max(1.5, (r.amount / max) * 100)}%`, background: other ? "var(--muted-foreground)" : (c?.color ?? "var(--muted-foreground)") }} />
            </div>
          </>
        );
        return (
          <li key={String(r.categoryId)}>
            {hrefFor && !other ? (
              <Link href={hrefFor(r.categoryId)} className="-m-1.5 block rounded-lg p-1.5 hover:bg-muted" title={`${name}: ${formatMoney(r.amount)}`}>
                {body}
              </Link>
            ) : (
              <div>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
