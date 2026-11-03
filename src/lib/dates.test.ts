import { describe, expect, it } from "vitest";
import { addFrequency, formatDayHeading, getPeriod, plural, previousPeriod, shiftPeriod } from "./dates";

describe("периоды", () => {
  it("неделя начинается с понедельника", () => {
    expect(getPeriod("week", "2026-11-03")).toMatchObject({ start: "2026-11-02", end: "2026-11-08" });
  });
  it("месяц и сдвиг", () => {
    const m = getPeriod("month", "2026-03-31");
    expect(m).toMatchObject({ start: "2026-03-01", end: "2026-03-31" });
    expect(previousPeriod(m)).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(shiftPeriod(m, 12)).toMatchObject({ start: "2027-03-01" });
  });
  it("произвольный период сдвигается на свою длину", () => {
    expect(shiftPeriod({ type: "custom", start: "2026-01-01", end: "2026-01-10" }, -1)).toMatchObject({
      start: "2025-12-22",
      end: "2025-12-31",
    });
  });
});

it("addFrequency: 31 января + месяц = 28 февраля", () => {
  expect(addFrequency("2026-01-31", "month")).toBe("2026-02-28");
  expect(addFrequency("2026-01-01", "week", 2)).toBe("2026-01-15");
});

it("formatDayHeading", () => {
  expect(formatDayHeading("2026-11-03", "2026-11-03")).toBe("Сегодня");
  expect(formatDayHeading("2026-11-02", "2026-11-03")).toBe("Вчера");
  expect(formatDayHeading("2026-10-31", "2026-11-03")).toBe("Суббота, 31 октября");
});

it("plural", () => {
  expect(plural(1, ["день", "дня", "дней"])).toBe("день");
  expect(plural(3, ["день", "дня", "дней"])).toBe("дня");
  expect(plural(11, ["день", "дня", "дней"])).toBe("дней");
  expect(plural(22, ["день", "дня", "дней"])).toBe("дня");
});
