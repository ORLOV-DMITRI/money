import { db } from "@/lib/db/db";
import { normalizeKey, type Unit } from "@/lib/db/schema";

/** Находит магазин по имени или создаёт новый. Вызывать внутри rw-транзакции с db.stores. */
export async function getOrCreateStore(name: string): Promise<number | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const key = normalizeKey(clean);
  const found = await db.stores.where("key").equals(key).first();
  if (found) return found.id;
  return db.stores.add({ name: clean, key });
}

/** Находит продукт по имени или создаёт новый. Вызывать внутри rw-транзакции с db.products. */
export async function getOrCreateProduct(name: string, unit: Unit, categoryId: number): Promise<number> {
  const clean = name.trim();
  const key = normalizeKey(clean);
  const found = await db.products.where("key").equals(key).first();
  if (found) return found.id!;
  return db.products.add({ name: clean.charAt(0).toUpperCase() + clean.slice(1), key, unit, categoryId, createdAt: Date.now() });
}
