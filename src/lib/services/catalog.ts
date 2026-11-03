import { db } from "@/lib/db/db";
import { normalizeKey, type Id, type Unit } from "@/lib/db/schema";
import { detId } from "@/lib/ids";

/**
 * Магазин по имени: ищем по ключу, иначе создаём с детерминированным id —
 * если тот же магазин заведут на другом устройстве, это будет одна и та же запись.
 */
export async function getOrCreateStore(name: string): Promise<Id | undefined> {
  const clean = name.trim();
  if (!clean) return undefined;
  const key = normalizeKey(clean);
  const found = await db.stores.where("key").equals(key).first();
  if (found) return found.id;
  const id = detId("store", key);
  await db.stores.put({ id, name: clean, key });
  return id;
}

/** Продукт по имени: та же логика, что у магазинов. */
export async function getOrCreateProduct(name: string, unit: Unit, categoryId: Id): Promise<Id> {
  const clean = name.trim();
  const key = normalizeKey(clean);
  const found = await db.products.where("key").equals(key).first();
  if (found) return found.id;
  const id = detId("product", key);
  await db.products.put({ id, name: clean.charAt(0).toUpperCase() + clean.slice(1), key, unit, categoryId, createdAt: Date.now() });
  return id;
}
