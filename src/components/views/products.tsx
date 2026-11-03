"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge, EmptyState, IconBubble, Segmented, Skeleton } from "@/components/ui/misc";
import { useProductStats } from "@/hooks/use-product-stats";
import { useLookups } from "@/hooks/use-data";
import { formatMoney, formatPercent } from "@/lib/money";
import { normalizeKey } from "@/lib/db/schema";
import { formatDate } from "@/lib/dates";

type Sort = "spent" | "count" | "inflation";

export function PriceChange({ pct }: { pct: number | null }) {
  if (pct == null || Math.abs(pct) < 1) return null;
  return <Badge tone={pct > 0 ? "bad" : "good"}>{pct > 0 ? "▲" : "▼"} {formatPercent(Math.abs(pct))}</Badge>;
}

export function ProductsView() {
  const list = useProductStats();
  const lookups = useLookups();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("spent");

  const rows = useMemo(() => {
    if (!list) return undefined;
    const query = normalizeKey(q);
    const change = (s: (typeof list)[number]["stats"]) => s.changeSixMonths ?? s.changeSinceFirst ?? -Infinity;
    return list
      .filter((r) => r.stats.count > 0 && (!query || r.product.key.includes(query)))
      .sort((a, b) => (sort === "spent" ? b.stats.totalSpent - a.stats.totalSpent : sort === "count" ? b.stats.count - a.stats.count : change(b.stats) - change(a.stats)));
  }, [list, q, sort]);

  return (
    <>
      <PageHeader title="Продукты и цены" description="Записывай покупки чеком — и я покажу, как меняются цены и где дешевле" />
      <Card className="mb-4">
        <CardContent className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Найти продукт" className="pl-9" aria-label="Поиск продукта" />
          </div>
          <Segmented
            value={sort}
            onChange={setSort}
            className="sm:w-96"
            options={[
              { value: "spent", label: "По тратам" },
              { value: "count", label: "Частые" },
              { value: "inflation", label: "Рост цены" },
            ]}
          />
        </CardContent>
      </Card>
      {!rows ? (
        <Skeleton className="h-96" />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="🧾" title={q ? "Ничего не нашлось" : "Продуктов пока нет"} description="Добавь чек: «+» → вкладка «Чек», или быстрым вводом: «молоко 2x650 magnum»" />
        </Card>
      ) : (
        <Card>
          <CardContent className="px-2 sm:px-3">
            <ul>
              {rows.map(({ product, stats }) => {
                const cat = lookups.categories.get(product.categoryId);
                return (
                  <li key={product.id}>
                    <Link href={`/products/view/?id=${product.id}`} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-muted">
                      <IconBubble icon={cat?.icon ?? "📦"} color={cat?.color} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium">{product.name}</span>
                          <PriceChange pct={stats.changeSixMonths ?? stats.changeSinceFirst} />
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {stats.count} покуп. · последняя {stats.last ? formatDate(stats.last.date, "d MMM") : "—"}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-semibold tabular-nums">
                          {formatMoney(stats.last?.price ?? 0)}
                          <span className="text-xs font-normal text-muted-foreground">/{product.unit}</span>
                        </span>
                        <span className="block text-xs text-muted-foreground tabular-nums">всего {formatMoney(stats.totalSpent)}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
