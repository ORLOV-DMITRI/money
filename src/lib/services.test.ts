import { beforeEach, describe, expect, it } from "vitest";
import { db } from "./db/db";
import { ensureSeeded } from "./db/seed";
import { addReceipt, addTransaction, deleteTransaction, restoreSnapshot } from "./services/transactions";
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
    const { id, autoDeposits } = await addTransaction({ type: "income", amount: 100_000, date: "2026-11-01", accountId: 1 });
    expect(autoDeposits).toEqual([{ goalId, amount: 10_000 }]);
    expect(await db.transactions.where("parentId").equals(id).count()).toBe(1);

    const snap = await deleteTransaction(id);
    expect(await db.transactions.count()).toBe(0);
    await restoreSnapshot(snap);
    expect(await db.transactions.count()).toBe(2);
  });

  it("чек создаёт продукты и магазин один раз", async () => {
    const item = { productName: "молоко", categoryId: 1, quantity: 2, unit: "л" as const, unitPrice: 60_000, total: 120_000 };
    await addReceipt({ date: "2026-11-01", accountId: 1, storeName: "Magnum", items: [item] });
    await addReceipt({ date: "2026-11-02", accountId: 1, storeName: "magnum ", items: [{ ...item, productName: "Молоко" }] });
    expect(await db.products.count()).toBe(1);
    expect(await db.stores.count()).toBe(1);
    expect((await db.products.toArray())[0].name).toBe("Молоко");
    expect(await db.purchaseItems.count()).toBe(2);
  });

  it("перевод на тот же счёт запрещён", async () => {
    await expect(addTransaction({ type: "transfer", amount: 1, date: "2026-11-01", accountId: 1, toAccountId: 1 })).rejects.toThrow();
  });
});

it("регулярные платежи догоняют пропущенные даты без дублей", async () => {
  await db.recurring.add({ name: "Аренда", type: "expense", amount: 100, accountId: 1, categoryId: 1, frequency: "month", interval: 1, nextDate: "2026-08-07", mode: "auto", active: true, createdAt: 0 });
  const [a, b] = await Promise.all([processRecurring("2026-11-03"), processRecurring("2026-11-03")]);
  expect(a + b).toBe(3);
  expect((await db.recurring.toArray())[0].nextDate).toBe("2026-11-07");
});

it("резервная копия: экспорт → сброс → импорт", async () => {
  await ensureSeeded();
  await addTransaction({ type: "expense", amount: 500, date: "2026-11-01", accountId: 1, categoryId: 1, tags: ["#Тест"] });
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
