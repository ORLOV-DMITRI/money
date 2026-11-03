import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, parseAmount, percentChange } from "./money";

const nb = (s: string) => s.replace(/ /g, " ");

describe("formatMoney", () => {
  it("форматирует целые тенге с разделителем тысяч", () => {
    expect(nb(formatMoney(1_250_000))).toBe("12 500 ₸");
  });
  it("показывает тиыны, только если они есть", () => {
    expect(nb(formatMoney(125_050))).toBe("1 250,50 ₸");
  });
  it("знаки", () => {
    expect(nb(formatMoney(-50_000))).toBe("−500 ₸");
    expect(nb(formatMoney(50_000, { sign: true }))).toBe("+500 ₸");
    expect(nb(formatMoney(0, { sign: true }))).toBe("0 ₸");
  });
  it("компактный формат", () => {
    expect(nb(formatMoneyCompact(35_000_000))).toBe("350 тыс");
    expect(nb(formatMoneyCompact(120_000_000))).toBe("1,2 млн");
  });
});

describe("parseAmount", () => {
  it.each([
    ["12500", 1_250_000],
    ["12 500", 1_250_000],
    ["12500,5", 1_250_050],
    ["12500.5", 1_250_050],
    ["1200+850", 205_000],
    ["2x650", 130_000],
    ["2х650", 130_000],
    ["(1200+300)/2", 75_000],
    ["5 000 ₸", 500_000],
  ])("%s → %d", (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });
  it.each(["", "abc", "0", "-5", "1/0", "1++", "12,5,3"])("отклоняет %s", (input) => {
    expect(parseAmount(input)).toBeNull();
  });
});

it("percentChange", () => {
  expect(percentChange(100, 150)).toBe(50);
  expect(percentChange(0, 10)).toBeNull();
});
