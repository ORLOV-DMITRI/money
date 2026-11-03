import { db } from "@/lib/db/db";
import type { ISODate } from "@/lib/dates";
import type { Id } from "@/lib/db/schema";
import { addTransaction } from "./transactions";

export async function depositToGoal(goalId: Id, amount: number, date: ISODate, note = "") {
  return addTransaction({ type: "goal_deposit", goalId, amount, date, note });
}

export async function withdrawFromGoal(goalId: Id, amount: number, date: ISODate, note = "") {
  return addTransaction({ type: "goal_withdraw", goalId, amount, date, note });
}

export async function completeGoal(goalId: Id) {
  await db.goals.update(goalId, { completedAt: Date.now(), autoPercent: 0 });
}

export async function reopenGoal(goalId: Id) {
  await db.goals.update(goalId, { completedAt: undefined, archived: false });
}

/** Удаление копилки: её операции удаляются, деньги возвращаются в свободные */
export async function deleteGoal(goalId: Id) {
  await db.transaction("rw", db.goals, db.transactions, async () => {
    await db.transactions.where("goalId").equals(goalId).delete();
    await db.goals.delete(goalId);
  });
}
