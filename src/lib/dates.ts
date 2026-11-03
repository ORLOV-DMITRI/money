import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { ru } from "date-fns/locale";

/** Календарная дата операции в формате YYYY-MM-DD (локальная, без часового пояса) */
export type ISODate = string;

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: ISODate): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function addDaysISO(s: ISODate, days: number): ISODate {
  return toISODate(addDays(parseISODate(s), days));
}

export function daysBetween(from: ISODate, to: ISODate): number {
  return differenceInCalendarDays(parseISODate(to), parseISODate(from));
}

/** Все даты от start до end включительно */
export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let d = parseISODate(start);
  const last = parseISODate(end);
  while (d <= last) {
    out.push(toISODate(d));
    d = addDays(d, 1);
  }
  return out;
}

export type PeriodType = "day" | "week" | "month" | "year" | "custom";

export interface Period {
  type: PeriodType;
  /** включительно */
  start: ISODate;
  /** включительно */
  end: ISODate;
}

const WEEK = { weekStartsOn: 1 as const };

export function getPeriod(type: Exclude<PeriodType, "custom">, anchor: Date | ISODate): Period {
  const d = typeof anchor === "string" ? parseISODate(anchor) : anchor;
  switch (type) {
    case "day":
      return { type, start: toISODate(d), end: toISODate(d) };
    case "week":
      return { type, start: toISODate(startOfWeek(d, WEEK)), end: toISODate(endOfWeek(d, WEEK)) };
    case "month":
      return { type, start: toISODate(startOfMonth(d)), end: toISODate(endOfMonth(d)) };
    case "year":
      return { type, start: toISODate(startOfYear(d)), end: toISODate(endOfYear(d)) };
  }
}

/** Сдвиг периода на n шагов (для custom — на его длину) */
export function shiftPeriod(p: Period, n: number): Period {
  const start = parseISODate(p.start);
  switch (p.type) {
    case "day":
      return getPeriod("day", addDays(start, n));
    case "week":
      return getPeriod("week", addWeeks(start, n));
    case "month":
      return getPeriod("month", addMonths(start, n));
    case "year":
      return getPeriod("year", addYears(start, n));
    case "custom": {
      const len = daysBetween(p.start, p.end) + 1;
      return { type: "custom", start: addDaysISO(p.start, len * n), end: addDaysISO(p.end, len * n) };
    }
  }
}

export function previousPeriod(p: Period): Period {
  return shiftPeriod(p, -1);
}

export function periodLength(p: Period): number {
  return daysBetween(p.start, p.end) + 1;
}

export function inPeriod(date: ISODate, p: Period): boolean {
  return date >= p.start && date <= p.end;
}

export function containsToday(p: Period, today: ISODate = todayISO()): boolean {
  return inPeriod(today, p);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatPeriod(p: Period): string {
  const s = parseISODate(p.start);
  const e = parseISODate(p.end);
  switch (p.type) {
    case "day":
      return cap(format(s, "EEEE, d MMMM yyyy", { locale: ru }));
    case "week":
      return s.getMonth() === e.getMonth()
        ? `${format(s, "d", { locale: ru })}–${format(e, "d MMMM yyyy", { locale: ru })}`
        : `${format(s, "d MMM", { locale: ru })} – ${format(e, "d MMM yyyy", { locale: ru })}`;
    case "month":
      return cap(format(s, "LLLL yyyy", { locale: ru }));
    case "year":
      return format(s, "yyyy");
    case "custom":
      return `${format(s, "d MMM yyyy", { locale: ru })} – ${format(e, "d MMM yyyy", { locale: ru })}`;
  }
}

/** «Сегодня», «Вчера», «Пятница, 31 октября» */
export function formatDayHeading(date: ISODate, today: ISODate = todayISO()): string {
  const diff = daysBetween(date, today);
  if (diff === 0) return "Сегодня";
  if (diff === 1) return "Вчера";
  const d = parseISODate(date);
  const sameYear = date.slice(0, 4) === today.slice(0, 4);
  return cap(format(d, sameYear ? "EEEE, d MMMM" : "EEEE, d MMMM yyyy", { locale: ru }));
}

export function formatDate(date: ISODate, pattern = "d MMM yyyy"): string {
  return format(parseISODate(date), pattern, { locale: ru });
}

export type Frequency = "day" | "week" | "month" | "year";

export function addFrequency(date: ISODate, freq: Frequency, interval = 1): ISODate {
  const d = parseISODate(date);
  switch (freq) {
    case "day":
      return toISODate(addDays(d, interval));
    case "week":
      return toISODate(addWeeks(d, interval));
    case "month":
      return toISODate(addMonths(d, interval));
    case "year":
      return toISODate(addYears(d, interval));
  }
}

export const FREQUENCY_LABEL: Record<Frequency, [string, string]> = {
  day: ["Каждый день", "дн."],
  week: ["Каждую неделю", "нед."],
  month: ["Каждый месяц", "мес."],
  year: ["Каждый год", "г."],
};

export function formatFrequency(freq: Frequency, interval: number): string {
  if (interval === 1) return FREQUENCY_LABEL[freq][0];
  return `Раз в ${interval} ${FREQUENCY_LABEL[freq][1]}`;
}

/** Русское склонение: plural(5, ['день','дня','дней']) */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
