import { normalizeKey, type Category } from "@/lib/db/schema";

export interface HistoryHint {
  note: string;
  categoryId: number;
}

function tokens(text: string): string[] {
  return normalizeKey(text)
    .split(/[^\p{L}\p{N}-]+/u)
    .filter(Boolean);
}

/**
 * Подбор категории по описанию:
 * 1) точное совпадение описания с прошлой операцией (самая свежая побеждает);
 * 2) ключевые слова категорий (длиннее совпадение — выше вес);
 * 3) частичное совпадение слов с историей.
 */
export function suggestCategory(
  text: string,
  categories: Pick<Category, "id" | "keywords" | "name" | "kind" | "archived">[],
  history: HistoryHint[] = [],
  kind: "expense" | "income" = "expense",
): number | undefined {
  const norm = normalizeKey(text);
  if (!norm) return undefined;
  const active = categories.filter((c) => c.kind === kind && !c.archived && c.id != null);
  const activeIds = new Set(active.map((c) => c.id));

  // history ожидается от новых к старым
  const exact = history.find((h) => normalizeKey(h.note) === norm && activeIds.has(h.categoryId));
  if (exact) return exact.categoryId;

  const toks = tokens(norm);
  let best: { id: number; score: number } | undefined;
  for (const c of active) {
    const words = [...c.keywords, normalizeKey(c.name)];
    for (const kw of words) {
      const k = normalizeKey(kw);
      if (!k) continue;
      let hit = false;
      if (k.includes(" ")) hit = norm.includes(k);
      else hit = toks.some((t) => t === k || (k.length >= 4 && t.startsWith(k)) || (t.length >= 4 && k.startsWith(t)));
      if (hit && (!best || k.length > best.score)) best = { id: c.id!, score: k.length };
    }
  }
  if (best) return best.id;

  for (const h of history) {
    if (!activeIds.has(h.categoryId)) continue;
    const ht = tokens(h.note);
    if (toks.some((t) => t.length >= 3 && ht.includes(t))) return h.categoryId;
  }
  return undefined;
}
