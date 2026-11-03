import { addDaysISO, toISODate, type ISODate } from "@/lib/dates";
import { parseAmount } from "@/lib/money";
import { normalizeKey } from "@/lib/db/schema";

export interface QuickParse {
  type: "expense" | "income";
  /** итоговая сумма в тиынах */
  amount: number | null;
  /** если указано «2x650» — это позиция продукта */
  quantity?: number;
  unitPrice?: number;
  date: ISODate;
  tags: string[];
  description: string;
  storeId?: number;
  accountId?: number;
}

export interface QuickContext {
  today: ISODate;
  stores?: { id?: number; name: string }[];
  accounts?: { id?: number; name: string }[];
}

const DATE_WORDS: Record<string, number> = { сегодня: 0, вчера: -1, позавчера: -2 };
const QTY_RE = /^(\d+(?:[.,]\d+)?)\s*[xх×*]\s*(\d+(?:[.,]\d+)?)$/i;
const AMOUNT_RE = /^\+?\d+(?:[.,]\d+)?(?:₸|тг)?$/i;
const DATE_RE = /^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?$/;

function parseDateToken(tok: string, today: ISODate): ISODate | null {
  const m = DATE_RE.exec(tok);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  let year = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
  if (m[3] && m[3].length === 2) year += 2000;
  let d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1) return null;
  // «12.12» в ноябре — это прошлый год
  if (!m[3] && toISODate(d) > today) d = new Date(year - 1, month - 1, day);
  return toISODate(d);
}

/** Ищем самое длинное имя (магазина/счёта), которое целиком встречается среди слов строки */
function matchName<T extends { id?: number; name: string }>(words: string[], list: T[]): { item: T; used: Set<number> } | null {
  const sorted = [...list].sort((a, b) => b.name.length - a.name.length);
  for (const item of sorted) {
    const nameToks = normalizeKey(item.name).split(" ");
    for (let i = 0; i + nameToks.length <= words.length; i++) {
      if (nameToks.every((t, j) => normalizeKey(words[i + j]) === t)) {
        return { item, used: new Set(nameToks.map((_, j) => i + j)) };
      }
    }
    // «kaspi» → «Kaspi Gold»: первое слово имени, если оно достаточно длинное
    if (nameToks.length > 1 && nameToks[0].length >= 4) {
      const i = words.findIndex((w) => normalizeKey(w) === nameToks[0]);
      if (i >= 0) return { item, used: new Set([i]) };
    }
  }
  return null;
}

/**
 * Разбор строки быстрого ввода:
 *   «кофе 1200», «+350000 зарплата», «такси 2 500 вчера #работа», «молоко 2x650 магнум»
 */
export function parseQuickInput(input: string, ctx: QuickContext): QuickParse {
  let text = input.trim();
  let type: QuickParse["type"] = "expense";
  if (text.startsWith("+")) {
    type = "income";
    text = text.slice(1).trim();
  }
  // «2 500» → «2500», «1 250 000» → «1250000»
  text = text.replace(/(^|\s)(\+?\d{1,3})((?:[\s ]\d{3})+)(?=$|\s|₸)/g, (_, pre, head, rest) => pre + head + rest.replace(/[\s ]/g, ""));
  // «2 x 650» → «2x650»
  text = text.replace(/(\d)\s*([xх×*])\s*(\d)/gi, "$1$2$3");

  const words = text.split(/\s+/).filter(Boolean);
  const used = new Set<number>();
  const res: QuickParse = { type, amount: null, date: ctx.today, tags: [], description: "" };

  words.forEach((w, i) => {
    const lw = w.toLowerCase();
    if (w.startsWith("#") && w.length > 1) {
      res.tags.push(normalizeKey(w.slice(1)));
      used.add(i);
      return;
    }
    if (lw in DATE_WORDS) {
      res.date = addDaysISO(ctx.today, DATE_WORDS[lw]);
      used.add(i);
      return;
    }
    const date = parseDateToken(w, ctx.today);
    if (date) {
      res.date = date;
      used.add(i);
      return;
    }
    if (res.amount == null) {
      const q = QTY_RE.exec(w);
      if (q) {
        const quantity = Number(q[1].replace(",", "."));
        const unitPrice = parseAmount(q[2]);
        if (quantity > 0 && unitPrice) {
          res.quantity = quantity;
          res.unitPrice = unitPrice;
          res.amount = Math.round(quantity * unitPrice);
          used.add(i);
          return;
        }
      }
      if (AMOUNT_RE.test(w)) {
        if (w.startsWith("+")) res.type = "income";
        res.amount = parseAmount(w.replace(/^\+/, ""));
        used.add(i);
      }
    }
  });

  const free = () => words.map((w, i) => (used.has(i) ? null : w));
  if (ctx.stores?.length) {
    const ws = free();
    const m = matchName(ws.map((w) => w ?? "\u0000"), ctx.stores);
    if (m) {
      res.storeId = m.item.id;
      m.used.forEach((i) => used.add(i));
    }
  }
  if (ctx.accounts?.length) {
    const ws = free();
    const m = matchName(ws.map((w) => w ?? "\u0000"), ctx.accounts);
    if (m) {
      res.accountId = m.item.id;
      m.used.forEach((i) => used.add(i));
    }
  }

  res.description = words.filter((_, i) => !used.has(i)).join(" ").trim();
  return res;
}
