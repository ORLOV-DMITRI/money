import type { Account, Transaction } from "@/lib/db/schema";

type Tx = Pick<Transaction, "type" | "amount" | "accountId" | "toAccountId" | "goalId">;

/** Дельта, которую операция вносит в баланс счёта accountId */
export function accountDelta(tx: Tx, accountId: number): number {
  let d = 0;
  if (tx.accountId === accountId) {
    switch (tx.type) {
      case "income":
      case "goal_withdraw":
        d += tx.amount;
        break;
      case "expense":
      case "transfer":
      case "goal_deposit":
        d -= tx.amount;
        break;
    }
  }
  if (tx.type === "transfer" && tx.toAccountId === accountId) d += tx.amount;
  return d;
}

export function accountBalances(
  accounts: Pick<Account, "id" | "initialBalance">[],
  txs: Tx[],
): Map<number, number> {
  const map = new Map<number, number>();
  for (const a of accounts) if (a.id != null) map.set(a.id, a.initialBalance);
  for (const tx of txs) {
    if (map.has(tx.accountId)) map.set(tx.accountId, map.get(tx.accountId)! + accountDelta(tx, tx.accountId));
    if (tx.type === "transfer" && tx.toAccountId != null && tx.toAccountId !== tx.accountId && map.has(tx.toAccountId)) {
      map.set(tx.toAccountId, map.get(tx.toAccountId)! + tx.amount);
    }
  }
  return map;
}

export function goalBalances(txs: Tx[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const tx of txs) {
    if (tx.goalId == null) continue;
    if (tx.type === "goal_deposit") map.set(tx.goalId, (map.get(tx.goalId) ?? 0) + tx.amount);
    if (tx.type === "goal_withdraw") map.set(tx.goalId, (map.get(tx.goalId) ?? 0) - tx.amount);
  }
  return map;
}

export interface BalanceTotals {
  /** на счетах — можно тратить */
  free: number;
  /** в копилках */
  saved: number;
  total: number;
}

export function balanceTotals(
  accounts: Pick<Account, "id" | "initialBalance" | "archived">[],
  goals: { id?: number; archived: boolean }[],
  txs: Tx[],
): BalanceTotals {
  const acc = accountBalances(accounts, txs);
  const free = accounts.filter((a) => !a.archived).reduce((s, a) => s + (acc.get(a.id!) ?? 0), 0);
  const gb = goalBalances(txs);
  const saved = goals.filter((g) => !g.archived).reduce((s, g) => s + (gb.get(g.id!) ?? 0), 0);
  return { free, saved, total: free + saved };
}
