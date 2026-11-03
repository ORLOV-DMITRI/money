import { db } from "@/lib/db/db";
import type { Id, PurchaseItem, Transaction, TransactionType, Unit } from "@/lib/db/schema";
import { detId } from "@/lib/ids";
import { autoDeposits } from "@/lib/analytics/goals";
import { getOrCreateProduct, getOrCreateStore } from "./catalog";
import type { ISODate } from "@/lib/dates";

export interface TxInput {
  /** задать id явно (детерминированные id регулярных платежей) */
  id?: Id;
  type: TransactionType;
  amount: number;
  date: ISODate;
  categoryId?: Id;
  goalId?: Id;
  storeId?: Id;
  note?: string;
  tags?: string[];
  recurringId?: Id;
}

export interface ReceiptItemInput {
  productName: string;
  categoryId: Id;
  quantity: number;
  unit: Unit;
  unitPrice: number;
  total: number;
}

export interface ReceiptInput {
  date: ISODate;
  storeName?: string;
  note?: string;
  tags?: string[];
  items: ReceiptItemInput[];
}

/** Снимок для «Отменить» после удаления */
export interface TxSnapshot {
  transactions: Transaction[];
  items: PurchaseItem[];
}

function cleanTags(tags: string[] | undefined): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim().toLowerCase().replace(/^#/, "")).filter(Boolean))];
}

function build(input: TxInput): Omit<Transaction, "id"> {
  const now = Date.now();
  return {
    type: input.type,
    amount: input.amount,
    date: input.date,
    categoryId: input.categoryId,
    goalId: input.goalId,
    storeId: input.storeId,
    note: (input.note ?? "").trim(),
    tags: cleanTags(input.tags),
    recurringId: input.recurringId,
    createdAt: now,
    updatedAt: now,
  };
}

function validate(input: TxInput) {
  if (!Number.isInteger(input.amount)) throw new Error("Сумма должна быть в тиынах");
  if (input.type === "adjustment" ? input.amount === 0 : !(input.amount > 0)) throw new Error("Сумма должна быть больше нуля");
  if ((input.type === "goal_deposit" || input.type === "goal_withdraw") && input.goalId == null) {
    throw new Error("Не выбрана копилка");
  }
}

export interface AddResult {
  id: Id;
  /** автоотчисления в копилки, созданные приходом */
  autoDeposits: { goalId: Id; amount: number }[];
}

/** Создаёт операцию. Для прихода — сразу и автоотчисления в копилки. */
export async function addTransaction(input: TxInput, opts: { skipAuto?: boolean } = {}): Promise<AddResult> {
  validate(input);
  return db.transaction("rw", db.transactions, db.goals, async () => {
    // с явным id — put: повторное создание того же регулярного платежа идемпотентно
    const id = input.id ? await db.transactions.put({ ...build(input), id: input.id }) : await db.transactions.add(build(input));
    let deposits: AddResult["autoDeposits"] = [];
    if (input.type === "income" && !opts.skipAuto) {
      deposits = autoDeposits(input.amount, await db.goals.toArray());
      for (const d of deposits) {
        // id детерминирован: если тот же приход (например, регулярная зарплата) создан на двух устройствах,
        // отчисления тоже совпадут, а не задвоятся
        await db.transactions.put({
          ...build({ type: "goal_deposit", amount: d.amount, date: input.date, goalId: d.goalId, note: "Автоотчисление" }),
          id: detId("auto", id, d.goalId),
          parentId: id,
        });
      }
    }
    return { id, autoDeposits: deposits };
  });
}

export async function updateTransaction(id: Id, input: TxInput): Promise<void> {
  validate(input);
  await db.transaction("rw", db.transactions, async () => {
    const old = await db.transactions.get(id);
    if (!old) throw new Error("Операция не найдена");
    const next = build(input);
    await db.transactions.put({ ...next, id, createdAt: old.createdAt, parentId: old.parentId });
    // автоотчисления следуют за датой прихода
    if (old.type === "income") {
      await db.transactions.where("parentId").equals(id).modify({ date: input.date });
    }
  });
}

export async function addReceipt(input: ReceiptInput): Promise<Id> {
  if (!input.items.length) throw new Error("Добавь хотя бы одну позицию");
  const total = input.items.reduce((s, i) => s + i.total, 0);
  if (!(total > 0)) throw new Error("Сумма чека должна быть больше нуля");
  return db.transaction("rw", [db.transactions, db.purchaseItems, db.products, db.stores], async () => {
    const storeId = input.storeName ? await getOrCreateStore(input.storeName) : undefined;
    const main = mostExpensiveCategory(input.items);
    const txId = await db.transactions.add(
      build({ type: "expense", amount: total, date: input.date, categoryId: main, storeId, note: input.note, tags: input.tags }),
    );
    await writeItems(txId, input, storeId);
    return txId;
  });
}

export async function updateReceipt(txId: Id, input: ReceiptInput): Promise<void> {
  if (!input.items.length) throw new Error("Добавь хотя бы одну позицию");
  const total = input.items.reduce((s, i) => s + i.total, 0);
  await db.transaction("rw", [db.transactions, db.purchaseItems, db.products, db.stores], async () => {
    const old = await db.transactions.get(txId);
    if (!old) throw new Error("Операция не найдена");
    const storeId = input.storeName ? await getOrCreateStore(input.storeName) : undefined;
    await db.transactions.put({
      ...build({ type: "expense", amount: total, date: input.date, categoryId: mostExpensiveCategory(input.items), storeId, note: input.note, tags: input.tags }),
      id: txId,
      createdAt: old.createdAt,
    });
    await db.purchaseItems.where("transactionId").equals(txId).delete();
    await writeItems(txId, input, storeId);
  });
}

function mostExpensiveCategory(items: ReceiptItemInput[]): Id {
  const sums = new Map<Id, number>();
  for (const i of items) sums.set(i.categoryId, (sums.get(i.categoryId) ?? 0) + i.total);
  return [...sums.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

async function writeItems(txId: Id, input: ReceiptInput, storeId: Id | undefined) {
  for (const it of input.items) {
    const productId = await getOrCreateProduct(it.productName, it.unit, it.categoryId);
    await db.purchaseItems.add({
      transactionId: txId,
      productId,
      categoryId: it.categoryId,
      storeId,
      quantity: it.quantity,
      unit: it.unit,
      unitPrice: it.unitPrice,
      total: it.total,
      date: input.date,
    });
  }
}

/** Удаляет операцию вместе с позициями чека и автоотчислениями. Возвращает снимок для отмены. */
export async function deleteTransaction(id: Id): Promise<TxSnapshot> {
  return db.transaction("rw", db.transactions, db.purchaseItems, async () => {
    const tx = await db.transactions.get(id);
    if (!tx) return { transactions: [], items: [] };
    const children = await db.transactions.where("parentId").equals(id).toArray();
    const items = await db.purchaseItems.where("transactionId").equals(id).toArray();
    await db.transactions.bulkDelete([id, ...children.map((c) => c.id)]);
    await db.purchaseItems.where("transactionId").equals(id).delete();
    return { transactions: [tx, ...children], items };
  });
}

export async function restoreSnapshot(s: TxSnapshot): Promise<void> {
  await db.transaction("rw", db.transactions, db.purchaseItems, async () => {
    await db.transactions.bulkPut(s.transactions);
    await db.purchaseItems.bulkPut(s.items);
  });
}

/**
 * Сверка баланса: пользователь говорит, сколько свободных денег у него на самом деле,
 * мы записываем корректировку на разницу. Возвращает разницу (0 — всё сходится).
 */
export async function reconcileBalance(actualFree: number, currentFree: number, date: ISODate, note = "Сверка баланса"): Promise<number> {
  const diff = actualFree - currentFree;
  if (diff !== 0) await addTransaction({ type: "adjustment", amount: diff, date, note });
  return diff;
}
