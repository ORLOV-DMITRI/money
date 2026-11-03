import { db } from "@/lib/db/db";
import type { Recurring } from "@/lib/db/schema";
import { addFrequency, type ISODate } from "@/lib/dates";
import { addTransaction } from "./transactions";
import { detId } from "@/lib/ids";
import type { Id } from "@/lib/db/schema";

/** Платёж по регулярному правилу на дату — один и тот же id на всех устройствах */
export function recurringTxId(recurringId: Id, date: ISODate): Id {
  return detId("recurring", recurringId, date);
}

/** Защита от бесконечного цикла, если дата сильно в прошлом */
const MAX_CATCH_UP = 400;

/**
 * Создаёт все просроченные операции для регулярных платежей в режиме «авто».
 * Возвращает число созданных операций.
 */
export async function processRecurring(today: ISODate): Promise<number> {
  // Одна rw-транзакция: параллельные вызовы (StrictMode, две вкладки) выполнятся по очереди
  // и второй увидит уже сдвинутые даты — без дублей.
  return db.transaction("rw", db.recurring, db.transactions, db.goals, () => processInTx(today));
}

async function processInTx(today: ISODate): Promise<number> {
  const due = await db.recurring.where("nextDate").belowOrEqual(today).toArray();
  let created = 0;
  for (const r of due) {
    if (!r.active || r.mode !== "auto") continue;
    let next = r.nextDate;
    let guard = 0;
    while (next <= today && guard++ < MAX_CATCH_UP) {
      await addTransaction({
        id: recurringTxId(r.id, next),
        type: r.type,
        amount: r.amount,
        date: next,
        categoryId: r.categoryId,
        note: r.name,
        recurringId: r.id,
      });
      created++;
      next = addFrequency(next, r.frequency, r.interval);
    }
    await db.recurring.update(r.id, { nextDate: next });
  }
  return created;
}

/** Напоминания: активные платежи в режиме «напоминание», срок которых наступил */
export function dueReminders(list: Recurring[], today: ISODate): Recurring[] {
  return list
    .filter((r) => r.active && r.mode === "remind" && r.nextDate <= today)
    .sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1));
}

/** Записать платёж по напоминанию и сдвинуть следующую дату */
export async function confirmRecurring(r: Recurring, opts: { amount?: number; date?: ISODate } = {}): Promise<Id> {
  const { id } = await addTransaction({
    id: recurringTxId(r.id, r.nextDate),
    type: r.type,
    amount: opts.amount ?? r.amount,
    date: opts.date ?? r.nextDate,
    categoryId: r.categoryId,
    note: r.name,
    recurringId: r.id,
  });
  await db.recurring.update(r.id, { nextDate: addFrequency(r.nextDate, r.frequency, r.interval) });
  return id;
}

export async function skipRecurring(r: Recurring): Promise<void> {
  await db.recurring.update(r.id, { nextDate: addFrequency(r.nextDate, r.frequency, r.interval) });
}
