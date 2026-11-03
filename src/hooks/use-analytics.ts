"use client";

import { useMemo } from "react";
import { buildInsights } from "@/lib/analytics/insights";
import { budgetStatus } from "@/lib/analytics/budgets";
import { goalStats } from "@/lib/analytics/goals";
import { expenseEntries } from "@/lib/analytics/reports";
import { useBudgets, useCategories, useGoals, useItems, useProducts, useToday, useTransactions } from "./use-data";

export function useExpenseEntries() {
  const txs = useTransactions();
  const items = useItems();
  return useMemo(() => (txs && items ? expenseEntries(txs, items) : undefined), [txs, items]);
}

export function useGoalStats() {
  const goals = useGoals();
  const txs = useTransactions();
  const today = useToday();
  return useMemo(() => {
    if (!goals || !txs) return undefined;
    return goals.map((g) => ({ goal: g, stats: goalStats(g, txs.filter((t) => t.goalId === g.id), today) }));
  }, [goals, txs, today]);
}

export function useBudgetStatuses() {
  const budgets = useBudgets();
  const entries = useExpenseEntries();
  const today = useToday();
  return useMemo(() => {
    if (!budgets || !entries) return undefined;
    return budgets.map((b) => ({ budget: b, status: budgetStatus(b, entries, today) })).sort((a, b) => b.status.ratio - a.status.ratio);
  }, [budgets, entries, today]);
}

export function useInsights() {
  const txs = useTransactions();
  const items = useItems();
  const categories = useCategories();
  const products = useProducts();
  const budgets = useBudgets();
  const goals = useGoals();
  const today = useToday();
  return useMemo(() => {
    if (!txs || !items || !categories || !products || !budgets || !goals) return undefined;
    return buildInsights({ today, txs, items, categories, products, budgets, goals });
  }, [txs, items, categories, products, budgets, goals, today]);
}
