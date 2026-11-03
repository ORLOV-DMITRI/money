"use client";

import type { Id } from "@/lib/ids";
import { useMemo } from "react";
import { productStats, type ProductStats } from "@/lib/analytics/products";
import type { Product, PurchaseItem } from "@/lib/db/schema";
import { useItems, useProducts, useToday } from "./use-data";

export function useProductStats(): { product: Product; stats: ProductStats; items: PurchaseItem[] }[] | undefined {
  const products = useProducts();
  const items = useItems();
  const today = useToday();
  return useMemo(() => {
    if (!products || !items) return undefined;
    const by = new Map<Id, PurchaseItem[]>();
    for (const it of items) {
      const l = by.get(it.productId);
      if (l) l.push(it);
      else by.set(it.productId, [it]);
    }
    return products.map((p) => {
      const its = by.get(p.id) ?? [];
      return { product: p, items: its, stats: productStats(its, p.unit, today) };
    });
  }, [products, items, today]);
}
