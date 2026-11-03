import type { Id } from "@/lib/ids";
import type { Transaction } from "@/lib/db/schema";

type Tx = Pick<Transaction, "type" | "amount" | "goalId">;

/** Как операция меняет «свободные» деньги (не в копилках) */
export function freeDelta(tx: Pick<Transaction, "type" | "amount">): number {
  switch (tx.type) {
    case "income":
    case "goal_withdraw":
    case "adjustment": // может быть отрицательной
      return tx.amount;
    case "expense":
    case "goal_deposit":
      return -tx.amount;
  }
}

export function goalBalances(txs: Tx[]): Map<Id, number> {
  const map = new Map<Id, number>();
  for (const tx of txs) {
    if (tx.goalId == null) continue;
    if (tx.type === "goal_deposit") map.set(tx.goalId, (map.get(tx.goalId) ?? 0) + tx.amount);
    if (tx.type === "goal_withdraw") map.set(tx.goalId, (map.get(tx.goalId) ?? 0) - tx.amount);
  }
  return map;
}

export interface BalanceTotals {
  /** свободные деньги — можно тратить */
  free: number;
  /** в копилках */
  saved: number;
  total: number;
}

export function balanceTotals(goals: { id: Id; archived: boolean }[], txs: Tx[]): BalanceTotals {
  const free = txs.reduce((s, t) => s + freeDelta(t), 0);
  const gb = goalBalances(txs);
  // деньги закрытой копилки всё равно существуют — считаем все
  const saved = goals.reduce((s, g) => s + (gb.get(g.id) ?? 0), 0);
  return { free, saved, total: free + saved };
}
