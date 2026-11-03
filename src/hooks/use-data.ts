"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useMemo, useState } from "react";
import { db } from "@/lib/db/db";
import { accountBalances, balanceTotals, goalBalances } from "@/lib/analytics/balances";
import { todayISO } from "@/lib/dates";
import type { Account, Category, Goal, Product, Store } from "@/lib/db/schema";

export function useAccounts() {
  return useLiveQuery(() => db.accounts.orderBy("order").toArray(), []);
}
export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy("order").toArray(), []);
}
/** Все операции, новые сверху */
export function useTransactions() {
  return useLiveQuery(async () => {
    const list = await db.transactions.toArray();
    return list.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt || b.id - a.id : a.date < b.date ? 1 : -1));
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

function byId<T extends { id: number }>(list: T[] | undefined): Map<number, T> {
  return new Map((list ?? []).map((x) => [x.id, x]));
}

export interface Lookups {
  accounts: Map<number, Account>;
  categories: Map<number, Category>;
  goals: Map<number, Goal>;
  stores: Map<number, Store>;
  products: Map<number, Product>;
}

export function useLookups(): Lookups {
  const accounts = useAccounts();
  const categories = useCategories();
  const goals = useGoals();
  const stores = useStores();
  const products = useProducts();
  return useMemo(
    () => ({ accounts: byId(accounts), categories: byId(categories), goals: byId(goals), stores: byId(stores), products: byId(products) }),
    [accounts, categories, goals, stores, products],
  );
}

export function useBalances() {
  const accounts = useAccounts();
  const goals = useGoals();
  const txs = useTransactions();
  return useMemo(() => {
    if (!accounts || !goals || !txs) return undefined;
    return {
      accounts: accountBalances(accounts, txs),
      goals: goalBalances(txs),
      totals: balanceTotals(accounts, goals, txs),
    };
  }, [accounts, goals, txs]);
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
