import { describe, expect, it } from "vitest";
import type { Transaction } from "@/lib/db/schema";
import { accountBalances, balanceTotals, goalBalances } from "./balances";
import { autoDeposits, goalStats } from "./goals";
import { budgetStatus, crossedThreshold } from "./budgets";
import { byCategory, expenseEntries, summarize } from "./reports";
import { normalizeUnitPrice, productStats } from "./products";
import { getPeriod } from "@/lib/dates";

let seq = 1;
const tx = (t: Partial<Transaction> & Pick<Transaction, "type" | "amount">): Transaction => ({
  id: seq++,
  date: "2026-11-01",
  accountId: 1,
  note: "",
  tags: [],
  createdAt: 0,
  updatedAt: 0,
  ...t,
});

describe("балансы", () => {
  const txs = [
    tx({ type: "income", amount: 1000 }),
    tx({ type: "expense", amount: 300 }),
    tx({ type: "transfer", amount: 200, toAccountId: 2 }),
    tx({ type: "goal_deposit", amount: 100, goalId: 7 }),
    tx({ type: "goal_withdraw", amount: 40, goalId: 7, accountId: 2 }),
  ];
  it("счета учитывают переводы и копилки", () => {
    const b = accountBalances([{ id: 1, initialBalance: 50 }, { id: 2, initialBalance: 0 }], txs);
    expect(b.get(1)).toBe(50 + 1000 - 300 - 200 - 100);
    expect(b.get(2)).toBe(200 + 40);
  });
  it("копилки и итог: перевод не меняет общий баланс", () => {
    expect(goalBalances(txs).get(7)).toBe(60);
    const t = balanceTotals(
      [{ id: 1, initialBalance: 50, archived: false }, { id: 2, initialBalance: 0, archived: false }],
      [{ id: 7, archived: false }],
      txs,
    );
    expect(t).toEqual({ free: 690, saved: 60, total: 750 });
    expect(t.total).toBe(50 + 1000 - 300);
  });
});

describe("отчёты", () => {
  it("чек раскладывается по категориям позиций, остаток — в категорию операции", () => {
    const r = tx({ type: "expense", amount: 1000, categoryId: 1 });
    const simple = tx({ type: "expense", amount: 500, categoryId: 2 });
    const items = [
      { transactionId: r.id!, categoryId: 1, total: 600 },
      { transactionId: r.id!, categoryId: 3, total: 300 },
    ];
    const cats = byCategory(expenseEntries([r, simple], items), getPeriod("month", "2026-11-01"));
    expect(cats.map((c) => [c.categoryId, c.amount])).toEqual([
      [1, 700],
      [2, 500],
      [3, 300],
    ]);
    expect(cats.reduce((s, c) => s + c.share, 0)).toBeCloseTo(1);
  });
  it("итоги не учитывают переводы, средний расход — по прошедшим дням", () => {
    const s = summarize(
      [tx({ type: "income", amount: 1000 }), tx({ type: "expense", amount: 300, date: "2026-11-02" }), tx({ type: "transfer", amount: 999, toAccountId: 2 })],
      getPeriod("month", "2026-11-01"),
      "2026-11-03",
    );
    expect(s).toMatchObject({ income: 1000, expense: 300, net: 700, avgDailyExpense: 100 });
  });
});

describe("копилки", () => {
  const goal = { target: 100_000, createdAt: new Date(2026, 7, 1).getTime() };
  it("требуемый темп к дедлайну и прогноз", () => {
    const txs = [
      { type: "goal_deposit" as const, amount: 9_000, date: "2026-08-05" },
      { type: "goal_deposit" as const, amount: 9_000, date: "2026-10-05" },
    ];
    const s = goalStats({ ...goal, deadline: "2026-11-12" }, txs, "2026-11-03");
    expect(s.balance).toBe(18_000);
    expect(s.daysLeft).toBe(10);
    expect(s.required!.perDay).toBe(8_200);
    // окно 90 дней: 06.08–03.11, августовское пополнение в него не входит
    expect(s.pacePerDay).toBeCloseTo(100);
    expect(s.forecastDate).toBe("2029-01-31"); // 82 000 / 100 = 820 дней
    expect(s.onTrack).toBe(false);
  });
  it("без пополнений нет прогноза; достигнутая цель", () => {
    expect(goalStats(goal, [], "2026-11-03").forecastDate).toBeUndefined();
    expect(goalStats(goal, [{ type: "goal_deposit", amount: 100_000, date: "2026-11-01" }], "2026-11-03").reached).toBe(true);
  });
  it("автоотчисления: процент, округление до тенге, пропуск закрытых", () => {
    const d = autoDeposits(65_000_000, [
      { id: 1, autoPercent: 10, archived: false },
      { id: 2, autoPercent: 5, archived: false },
      { id: 3, autoPercent: 50, archived: true },
      { id: 4, autoPercent: 5, archived: false, completedAt: 1 },
    ]);
    expect(d).toEqual([
      { goalId: 1, amount: 6_500_000 },
      { goalId: 2, amount: 3_250_000 },
    ]);
    expect(autoDeposits(12_345, [{ id: 1, autoPercent: 7, archived: false }])).toEqual([{ goalId: 1, amount: 900 }]);
  });
});

describe("бюджеты", () => {
  it("уровень, прогноз и дата исчерпания", () => {
    const entries = [
      { txId: 1, date: "2026-11-01", categoryId: 5, amount: 30_000 },
      { txId: 2, date: "2026-11-02", categoryId: 5, amount: 30_000 },
      { txId: 3, date: "2026-11-02", categoryId: 6, amount: 99_999 },
      { txId: 4, date: "2026-10-31", categoryId: 5, amount: 99_999 },
    ];
    const s = budgetStatus({ categoryId: 5, limit: 100_000, period: "month" }, entries, "2026-11-03");
    expect(s.spent).toBe(60_000);
    expect(s.level).toBe("ok");
    expect(s.forecast).toBe(600_000);
    expect(s.exhaustDate).toBe("2026-11-05");
  });
  it("пересечение порогов", () => {
    expect(crossedThreshold(70, 85, 100)).toBe("warn");
    expect(crossedThreshold(85, 101, 100)).toBe("over");
    expect(crossedThreshold(50, 120, 100)).toBe("over");
    expect(crossedThreshold(85, 90, 100)).toBeNull();
  });
});

describe("продукты", () => {
  it("нормализация единиц", () => {
    expect(normalizeUnitPrice(5, "г", "кг")).toBe(5000);
    expect(normalizeUnitPrice(1000, "кг", "г")).toBe(1);
  });
  it("история цен, инфляция и сравнение магазинов", () => {
    const it = (date: string, unitPrice: number, storeId: number) => ({ date, unitPrice, unit: "л" as const, quantity: 1, total: unitPrice, storeId });
    const s = productStats([it("2026-05-01", 500, 1), it("2026-05-10", 520, 2), it("2026-11-01", 600, 1)], "л", "2026-11-03");
    expect(s.changeSinceFirst).toBeCloseTo(20);
    // последняя покупка не позже 07.05 — это 01.05 по 500
    expect(s.changeSixMonths).toBeCloseTo(20);
    expect(s.byStore[0]).toMatchObject({ storeId: 2, avg: 520 });
    expect(s.min).toBe(500);
  });
});
