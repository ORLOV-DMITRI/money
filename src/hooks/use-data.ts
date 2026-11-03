"use client";

import type { Id } from "@/lib/ids";
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { balanceTotals, goalBalances } from "@/lib/analytics/balances";
import { todayISO } from "@/lib/dates";
import type { Category, Goal, Product, Store } from "@/lib/db/schema";

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy("order").toArray(), []);
}
/** Все операции, новые сверху */
export function useTransactions() {
  return useLiveQuery(async () => {
    const list = await db.transactions.toArray();
    return list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt || (b.id < a.id ? -1 : 1) : a.date < b.date ? 1 : -1));
  }, []);
}
export function useItems() {
  return useLiveQuery(() => db.purchaseItems.toArray(), []);
}
export function useProducts() {
  return useLiveQuery(() => db.products.toArray(), []);
}
export function useStores() {
  return useLiveQuery(() => db.stores.toArray(), []);
}
export function useGoals() {
  return useLiveQuery(() => db.goals.toArray(), []);
}
export function useBudgets() {
  return useLiveQuery(() => db.budgets.toArray(), []);
}
export function useRecurring() {
  return useLiveQuery(() => db.recurring.toArray(), []);
}
export function useTemplates() {
  return useLiveQuery(() => db.templates.toArray(), []);
}

function byId<T extends { id: Id }>(list: T[] | undefined): Map<Id, T> {
  return new Map((list ?? []).map((x) => [x.id, x]));
}

export interface Lookups {
  categories: Map<Id, Category>;
  goals: Map<Id, Goal>;
  stores: Map<Id, Store>;
  products: Map<Id, Product>;
}

export function useLookups(): Lookups {
  const categories = useCategories();
  const goals = useGoals();
  const stores = useStores();
  const products = useProducts();
  return useMemo(
    () => ({ categories: byId(categories), goals: byId(goals), stores: byId(stores), products: byId(products) }),
    [categories, goals, stores, products],
  );
}

export function useBalances() {
  const goals = useGoals();
  const txs = useTransactions();
  return useMemo(() => {
    if (!goals || !txs) return undefined;
    return { goals: goalBalances(txs), totals: balanceTotals(goals, txs) };
  }, [goals, txs]);
}

/** Сегодняшняя дата, которая сама обновится после полуночи */
export function useToday() {
  const [today, setToday] = useState(() => todayISO());
  useEffect(() => {
    const t = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(t);
  }, []);
  return today;
}
