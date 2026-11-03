import { db } from "@/lib/db/db";
import type { ISODate } from "@/lib/dates";
import { addTransaction } from "./transactions";

export async function depositToGoal(goalId: number, accountId: number, amount: number, date: ISODate, note = "") {
  return addTransaction({ type: "goal_deposit", goalId, accountId, amount, date, note });
}

export async function withdrawFromGoal(goalId: number, accountId: number, amount: number, date: ISODate, note = "") {
  return addTransaction({ type: "goal_withdraw", goalId, accountId, amount, date, note });
}

export async function completeGoal(goalId: number) {
  await db.goals.update(goalId, { completedAt: Date.now(), autoPercent: 0 });
}

export async function reopenGoal(goalId: number) {
  await db.goals.update(goalId, { completedAt: undefined, archived: false });
}

/** Удаление копилки: её операции удаляются, деньги «возвращаются» на счета */
export async function deleteGoal(goalId: number) {
  await db.transaction("rw", db.goals, db.transactions, async () => {
    await db.transactions.where("goalId").equals(goalId).delete();
    await db.goals.delete(goalId);
  });
}
