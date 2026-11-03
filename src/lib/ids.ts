import { v5 as uuidv5, v7 as uuidv7 } from "uuid";

export type Id = string;

/** Новый id: UUID v7 (упорядочен по времени создания) */
export function newId(): Id {
  return uuidv7();
}

/** Пространство имён для детерминированных id приложения */
const NAMESPACE = "6f0e1d3c-8a2b-5c4d-9e7f-0a1b2c3d4e5f";

/**
 * Детерминированный id: одинаковый на всех устройствах для одного и того же смысла.
 * Так два устройства, независимо создавшие «одно и то же», не плодят дубли:
 * - регулярный платёж на дату: detId("recurring", recurringId, date)
 * - автоотчисление от прихода: detId("auto", incomeId, goalId)
 * - продукт/магазин по имени: detId("product", key)
 * - стартовая категория: detId("category", kind, name)
 */
export function detId(...parts: (string | number)[]): Id {
  return uuidv5(parts.join(":"), NAMESPACE);
}
