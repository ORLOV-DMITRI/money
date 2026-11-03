import { describe, expect, it } from "vitest";
import { parseQuickInput } from "./quick-input";

const ctx = {
  today: "2026-11-03",
  stores: [{ id: "1", name: "Magnum" }, { id: "2", name: "Зелёный базар" }],
};

describe("parseQuickInput", () => {
  it("простой расход", () => {
    expect(parseQuickInput("кофе 1200", ctx)).toMatchObject({ type: "expense", amount: 120_000, description: "кофе", date: "2026-11-03" });
  });
  it("приход через +", () => {
    expect(parseQuickInput("+350000 зарплата", ctx)).toMatchObject({ type: "income", amount: 35_000_000, description: "зарплата" });
    expect(parseQuickInput("зарплата +350 000", ctx)).toMatchObject({ type: "income", amount: 35_000_000 });
  });
  it("сумма с пробелами, дата словом и тег", () => {
    expect(parseQuickInput("такси 2 500 вчера #работа", ctx)).toMatchObject({
      amount: 250_000,
      date: "2026-11-02",
      tags: ["работа"],
      description: "такси",
    });
  });
  it("количество × цена и магазин", () => {
    expect(parseQuickInput("молоко 2x650 magnum", ctx)).toMatchObject({
      amount: 130_000,
      quantity: 2,
      unitPrice: 65_000,
      storeId: "1",
      description: "молоко",
    });
    expect(parseQuickInput("помидоры 1,5 х 900 зелёный базар", ctx)).toMatchObject({ quantity: 1.5, amount: 135_000, storeId: "2", description: "помидоры" });
  });
  it("дата числом: будущая дата без года — это прошлый год", () => {
    expect(parseQuickInput("подарок 5000 25.12", ctx).date).toBe("2025-12-25");
    expect(parseQuickInput("подарок 5000 01.11", ctx).date).toBe("2026-11-01");
  });
  it("магазин по первому слову длинного названия", () => {
    expect(parseQuickInput("бананы 900 зелёный", ctx)).toMatchObject({ storeId: "2", description: "бананы" });
  });
  it("без суммы", () => {
    expect(parseQuickInput("просто текст", ctx).amount).toBeNull();
  });
});
