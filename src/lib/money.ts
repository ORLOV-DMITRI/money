/**
 * Деньги в приложении хранятся целым числом тиынов (1 ₸ = 100 тиын).
 * Конвертация в тенге происходит только на границе UI.
 */

export const TIYN_IN_TENGE = 100;

export function toTiyn(tenge: number): number {
  return Math.round(tenge * TIYN_IN_TENGE);
}

export function fromTiyn(tiyn: number): number {
  return tiyn / TIYN_IN_TENGE;
}

const groupFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const fracFmt = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Заменяем узкие неразрывные пробелы ICU на обычные неразрывные — стабильно во всех шрифтах. */
function normalizeSpaces(s: string): string {
  return s.replace(/[  ]/g, " ");
}

export interface FormatMoneyOptions {
  /** Показывать «+» у положительных сумм */
  sign?: boolean;
  /** Без символа валюты */
  plain?: boolean;
}

/** 1250000 тиын → «12 500 ₸», 125050 → «1 250,50 ₸» */
export function formatMoney(tiyn: number, opts: FormatMoneyOptions = {}): string {
  const negative = tiyn < 0;
  const abs = Math.abs(tiyn);
  const body = abs % TIYN_IN_TENGE === 0 ? groupFmt.format(abs / 100) : fracFmt.format(abs / 100);
  const prefix = negative ? "−" : opts.sign && tiyn > 0 ? "+" : "";
  return normalizeSpaces(`${prefix}${body}${opts.plain ? "" : " ₸"}`);
}

/** Короткий формат для осей графиков: «350 тыс», «1,2 млн» */
export function formatMoneyCompact(tiyn: number): string {
  const tenge = Math.abs(tiyn) / 100;
  const sign = tiyn < 0 ? "−" : "";
  if (tenge >= 1_000_000) {
    return normalizeSpaces(`${sign}${trim(tenge / 1_000_000)} млн`);
  }
  if (tenge >= 1_000) {
    return normalizeSpaces(`${sign}${trim(tenge / 1_000)} тыс`);
  }
  return `${sign}${Math.round(tenge)}`;
}

function trim(n: number): string {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: n < 10 ? 1 : 0 }).format(n);
}

/** Значение для поля ввода: 1250050 → «12500,5» */
export function tiynToInput(tiyn: number): string {
  const tenge = tiyn / 100;
  return String(tenge).replace(".", ",");
}

/**
 * Разбор пользовательского ввода суммы в тиыны.
 * Принимает «12500», «12 500», «12500,5», «12.500,50» не принимает (неоднозначно),
 * а также выражения: «1200+850», «2*650», «2x650», «(1200+300)/2».
 * Возвращает null, если ввод некорректен или результат не положительный.
 */
export function parseAmount(input: string): number | null {
  const src = input
    .trim()
    .replace(/[\s  ]/g, "")
    .replace(/₸|тг|тенге/gi, "")
    .replace(/,/g, ".")
    .replace(/[xх×]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-");
  if (!src) return null;
  if (!/^[\d.+\-*/()]+$/.test(src)) return null;

  let pos = 0;
  const peek = () => src[pos];

  function number(): number {
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(pos));
    if (!m) throw new Error("number expected");
    pos += m[0].length;
    return parseFloat(m[0]);
  }
  function factor(): number {
    if (peek() === "-") {
      pos++;
      return -factor();
    }
    if (peek() === "(") {
      pos++;
      const v = expr();
      if (peek() !== ")") throw new Error(") expected");
      pos++;
      return v;
    }
    return number();
  }
  function term(): number {
    let v = factor();
    while (peek() === "*" || peek() === "/") {
      const op = src[pos++];
      const r = factor();
      if (op === "/" && r === 0) throw new Error("division by zero");
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function expr(): number {
    let v = term();
    while (peek() === "+" || peek() === "-") {
      const op = src[pos++];
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }

  try {
    const value = expr();
    if (pos !== src.length || !Number.isFinite(value) || value <= 0) return null;
    return toTiyn(value);
  } catch {
    return null;
  }
}

/** Процент изменения b относительно a (null, если база нулевая) */
export function percentChange(from: number, to: number): number | null {
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

export function formatPercent(p: number, opts: { sign?: boolean } = {}): string {
  const r = Math.round(p);
  const prefix = r < 0 ? "−" : opts.sign && r > 0 ? "+" : "";
  return `${prefix}${Math.abs(r)}%`;
}
