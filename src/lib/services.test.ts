import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db/db";
import { ensureSeeded } from "./db/seed";
import { addReceipt, addTransaction, deleteTransaction, reconcileBalance, restoreSnapshot } from "./services/transactions";
import { processRecurring } from "./services/recurring";
import { exportBackup, importBackup, resetAll } from "./services/data";
import { loadDemoData } from "./db/demo";
import { buildInsights } from "./analytics/insights";

beforeEach(async () => {
  await resetAll();
});

describe("операции", () => {
  it("приход создаёт автоотчисления, удаление их убирает, отмена возвращает", async () => {
    await ensureSeeded();
    const goalId = await db.goals.add({ name: "Отпуск", icon: "🏖️", color: "#000", target: 100, autoPercent: 10, archived: false, createdAt: 0 });
    const { id, autoDeposits } = await addTransaction({ type: "income", amount: 100_000, date: "2026-11-01" });
    expect(autoDeposits).toEqual([{ goalId, amount: 10_000 }]);
    expect(await db.transactions.where("parentId").equals(id).count()).toBe(1);

    const snap = await deleteTransaction(id);
    expect(await db.transactions.count()).toBe(0);
    await restoreSnapshot(snap);
    expect(await db.transactions.count()).toBe(2);
  });

  it("чек создаёт продукты и магазин один раз", async () => {
    const item = { productName: "молоко", categoryId: "1", quantity: 2, unit: "л" as const, unitPrice: 60_000, total: 120_000 };
    await addReceipt({ date: "2026-11-01", storeName: "Magnum", items: [item] });
    await addReceipt({ date: "2026-11-02", storeName: "magnum ", items: [{ ...item, productName: "Молоко" }] });
    expect(await db.products.count()).toBe(1);
    expect(await db.stores.count()).toBe(1);
    expect((await db.products.toArray())[0].name).toBe("Молоко");
    expect(await db.purchaseItems.count()).toBe(2);
  });

  it("нулевая и отрицательная сумма запрещены, кроме корректировки", async () => {
    await expect(addTransaction({ type: "expense", amount: 0, date: "2026-11-01" })).rejects.toThrow();
    await expect(addTransaction({ type: "income", amount: -5, date: "2026-11-01" })).rejects.toThrow();
    await expect(addTransaction({ type: "adjustment", amount: 0, date: "2026-11-01" })).rejects.toThrow();
    await expect(addTransaction({ type: "adjustment", amount: -5, date: "2026-11-01" })).resolves.toBeDefined();
  });

  it("сверка баланса пишет корректировку на разницу", async () => {
    expect(await reconcileBalance(100_000, 100_000, "2026-11-01")).toBe(0);
    expect(await db.transactions.count()).toBe(0);
    expect(await reconcileBalance(90_000, 100_000, "2026-11-01")).toBe(-10_000);
    const [t] = await db.transactions.toArray();
    expect(t).toMatchObject({ type: "adjustment", amount: -10_000 });
  });
});

it("регулярные платежи догоняют пропущенные даты без дублей", async () => {
  await db.recurring.add({ name: "Аренда", type: "expense", amount: 100, categoryId: "1", frequency: "month", interval: 1, nextDate: "2026-08-07", mode: "auto", active: true, createdAt: 0 });
  const [a, b] = await Promise.all([processRecurring("2026-11-03"), processRecurring("2026-11-03")]);
  expect(a + b).toBe(3);
  expect((await db.recurring.toArray())[0].nextDate).toBe("2026-11-07");
});

it("резервная копия: экспорт → сброс → импорт", async () => {
  await ensureSeeded();
  await addTransaction({ type: "expense", amount: 500, date: "2026-11-01", categoryId: "1", tags: ["#Тест"] });
  const backup = JSON.parse(JSON.stringify(await exportBackup()));
  await resetAll();
  expect(await db.transactions.count()).toBe(0);
  await importBackup(backup);
  const [t] = await db.transactions.toArray();
  expect(t.tags).toEqual(["тест"]);
  await expect(importBackup({ foo: 1 })).rejects.toThrow();
});

it("демо-данные загружаются и дают подсказки", async () => {
  await loadDemoData("2026-11-03");
  const all = await db.transactions.toArray();
  const goals = await db.goals.toArray();
  const { balanceTotals } = await import("./analytics/balances");
  const totals = balanceTotals(goals, all);
  expect(totals.free).toBeGreaterThan(0);
  expect(goals.find((g) => g.name === "Депозит")).toBeDefined();
  expect(await db.transactions.count()).toBeGreaterThan(300);
  expect(await db.purchaseItems.count()).toBeGreaterThan(100);
  const insights = buildInsights({
    today: "2026-11-03",
    txs: await db.transactions.toArray(),
    items: await db.purchaseItems.toArray(),
    categories: await db.categories.toArray(),
    products: await db.products.toArray(),
    budgets: await db.budgets.toArray(),
    goals: await db.goals.toArray(),
  });
  expect(insights.length).toBeGreaterThan(2);
}, 30_000);

it("перенос старой базы: числовые id → UUID, счета → «Начальный остаток», связи сохраняются", async () => {
  const { LegacyMoneyDB, MoneyDB } = await import("./db/db");
  const { migrateLegacy } = await import("./db/legacy");
  const { seedCategoryId } = await import("./db/seed");
  const legacyName = "money-legacy-test";
  // старая база v1 (со счетами)
  const Dexie = (await import("dexie")).default;
  const v1 = new Dexie(legacyName);
  v1.version(1).stores({
    accounts: "++id, order",
    categories: "++id, kind, order",
    transactions: "++id, date, type, accountId, toAccountId, categoryId, goalId, storeId, recurringId, parentId, *tags",
    purchaseItems: "++id, transactionId, productId, categoryId, storeId, date",
    products: "++id, &key",
    stores: "++id, &key",
    goals: "++id",
    budgets: "++id, categoryId",
    recurring: "++id, nextDate",
    templates: "++id",
    settings: "&key",
  });
  await v1.open();
  await v1.table("accounts").bulkAdd([
    { name: "Нал", initialBalance: 1000, archived: false },
    { name: "Карта", initialBalance: 5000, archived: false },
  ]);
  await v1.table("categories").add({ name: "Продукты", kind: "expense", icon: "🛒", color: "#000", keywords: [], archived: false, order: 0 });
  await v1.table("stores").add({ name: "Magnum", key: "magnum" });
  await v1.table("products").add({ name: "Молоко", key: "молоко", unit: "л", categoryId: 1, createdAt: 0 });
  await v1.table("goals").add({ name: "Отпуск", icon: "🏖️", color: "#000", target: 1, autoPercent: 0, archived: false, createdAt: 0 });
  await v1.table("transactions").bulkAdd([
    { type: "expense", amount: 300, date: "2026-10-02", accountId: 1, categoryId: 1, storeId: 1, tags: [], note: "" },
    { type: "transfer", amount: 999, date: "2026-10-03", accountId: 2, toAccountId: 1, tags: [], note: "" },
    { type: "goal_deposit", amount: 50, date: "2026-10-04", accountId: 2, goalId: 1, tags: [], note: "" },
  ]);
  await v1.table("purchaseItems").add({ transactionId: 1, productId: 1, categoryId: 1, storeId: 1, quantity: 1, unit: "л", unitPrice: 300, total: 300, date: "2026-10-02" });
  await v1.table("recurring").add({ name: "Аренда", type: "expense", amount: 1, accountId: 2, categoryId: 1, frequency: "month", interval: 1, nextDate: "2026-11-07", mode: "auto", active: true, createdAt: 0 });
  v1.close();
  // при открытии LegacyMoneyDB поднимает её до v3, затем переносим в новую
  void LegacyMoneyDB;

  const target = new MoneyDB("money-sync-migration-test");
  expect(await migrateLegacy(target, legacyName)).toBe(true);
  expect(await Dexie.exists(legacyName)).toBe(false);

  const txs = await target.transactions.toArray();
  expect(txs.map((t) => t.type).sort()).toEqual(["adjustment", "expense", "goal_deposit"]);
  expect(txs.find((t) => t.type === "adjustment")).toMatchObject({ amount: 6000, date: "2026-10-02", note: "Начальный остаток" });
  expect(txs.every((t) => typeof t.id === "string" && !("accountId" in t))).toBe(true);

  const cat = await target.categories.toArray();
  expect(cat[0].id).toBe(seedCategoryId({ kind: "expense", name: "Продукты" })); // совпадёт со стартовой на другом устройстве
  const expense = txs.find((t) => t.type === "expense")!;
  const [item] = await target.purchaseItems.toArray();
  const [product] = await target.products.toArray();
  const [store] = await target.stores.toArray();
  const [goal] = await target.goals.toArray();
  expect(expense).toMatchObject({ categoryId: cat[0].id, storeId: store.id });
  expect(item).toMatchObject({ transactionId: expense.id, productId: product.id, storeId: store.id });
  expect(txs.find((t) => t.type === "goal_deposit")!.goalId).toBe(goal.id);
  expect(await target.recurring.toArray()).toEqual([expect.objectContaining({ categoryId: cat[0].id })]);
  // перенесённые данные стоят в очереди на отправку
  expect(await target._outbox.count()).toBeGreaterThanOrEqual(8);
  target.close();
});

it("перенос не падает, если под старым именем лежит пустая или чужая база", async () => {
  const Dexie = (await import("dexie")).default;
  const { MoneyDB } = await import("./db/db");
  const { migrateLegacy } = await import("./db/legacy");
  const name = "money-empty-legacy";
  const junk = new Dexie(name);
  junk.version(1).stores({ something: "id" });
  await junk.open();
  junk.close();
  const target = new MoneyDB("money-sync-empty-legacy");
  await expect(migrateLegacy(target, name)).resolves.toBe(false);
  target.close();
});
