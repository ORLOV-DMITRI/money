import type { Category } from "./schema";
import { db } from "./db";

type CategorySeed = Omit<Category, "id" | "archived" | "order">;

export const DEFAULT_EXPENSE_CATEGORIES: CategorySeed[] = [
  { name: "Продукты", kind: "expense", icon: "🛒", color: "#22c55e", keywords: ["продукты", "магазин", "супермаркет", "молоко", "хлеб", "яйца", "мясо", "овощи", "фрукты", "сыр"] },
  { name: "Кафе и рестораны", kind: "expense", icon: "☕", color: "#f97316", keywords: ["кофе", "латте", "капучино", "обед", "ужин", "кафе", "ресторан", "бургер", "пицца", "шаурма", "донер"] },
  { name: "Доставка еды", kind: "expense", icon: "🛵", color: "#fb923c", keywords: ["доставка", "glovo", "wolt", "яндекс еда"] },
  { name: "Транспорт", kind: "expense", icon: "🚌", color: "#3b82f6", keywords: ["автобус", "проезд", "метро", "онай", "onay"] },
  { name: "Такси", kind: "expense", icon: "🚕", color: "#eab308", keywords: ["такси", "яндекс go", "uber", "indrive", "индрайв"] },
  { name: "Авто", kind: "expense", icon: "⛽", color: "#64748b", keywords: ["бензин", "заправка", "аи-92", "аи-95", "мойка", "парковка", "штраф", "сто"] },
  { name: "Жильё", kind: "expense", icon: "🏠", color: "#8b5cf6", keywords: ["аренда", "квартира", "ипотека"] },
  { name: "Коммунальные", kind: "expense", icon: "💡", color: "#a855f7", keywords: ["коммуналка", "свет", "газ", "вода", "отопление", "ксж", "osi", "оси"] },
  { name: "Связь и интернет", kind: "expense", icon: "📱", color: "#06b6d4", keywords: ["интернет", "мобильный", "связь", "beeline", "kcell", "tele2", "activ"] },
  { name: "Подписки", kind: "expense", icon: "🔁", color: "#0ea5e9", keywords: ["подписка", "netflix", "spotify", "youtube", "icloud", "chatgpt", "claude"] },
  { name: "Здоровье", kind: "expense", icon: "💊", color: "#ef4444", keywords: ["аптека", "лекарства", "врач", "анализы", "стоматолог", "клиника"] },
  { name: "Спорт", kind: "expense", icon: "🏋️", color: "#10b981", keywords: ["спортзал", "фитнес", "абонемент", "бассейн", "тренировка"] },
  { name: "Одежда и обувь", kind: "expense", icon: "👕", color: "#ec4899", keywords: ["одежда", "обувь", "кроссовки", "куртка", "джинсы"] },
  { name: "Дом и быт", kind: "expense", icon: "🧴", color: "#14b8a6", keywords: ["бытовая химия", "порошок", "мыло", "шампунь", "посуда"] },
  { name: "Развлечения", kind: "expense", icon: "🎬", color: "#f43f5e", keywords: ["кино", "концерт", "театр", "боулинг", "игры", "steam"] },
  { name: "Образование", kind: "expense", icon: "📚", color: "#6366f1", keywords: ["курсы", "книга", "книги", "обучение", "репетитор"] },
  { name: "Подарки", kind: "expense", icon: "🎁", color: "#d946ef", keywords: ["подарок", "цветы", "букет"] },
  { name: "Красота", kind: "expense", icon: "💇", color: "#f472b6", keywords: ["стрижка", "барбер", "маникюр", "салон", "косметика"] },
  { name: "Путешествия", kind: "expense", icon: "✈️", color: "#0284c7", keywords: ["билет", "авиабилет", "отель", "гостиница", "поезд"] },
  { name: "Прочее", kind: "expense", icon: "📦", color: "#94a3b8", keywords: [] },
];

export const DEFAULT_INCOME_CATEGORIES: CategorySeed[] = [
  { name: "Зарплата", kind: "income", icon: "💼", color: "#16a34a", keywords: ["зарплата", "зп", "аванс", "оклад"] },
  { name: "Фриланс", kind: "income", icon: "💻", color: "#0891b2", keywords: ["фриланс", "заказ", "проект"] },
  { name: "Подарки", kind: "income", icon: "🎁", color: "#c026d3", keywords: ["подарили", "подарок"] },
  { name: "Кешбэк и бонусы", kind: "income", icon: "💸", color: "#ca8a04", keywords: ["кешбэк", "кэшбэк", "бонус", "бонусы"] },
  { name: "Проценты по депозиту", kind: "income", icon: "🏦", color: "#4f46e5", keywords: ["проценты", "депозит", "вознаграждение"] },
  { name: "Возврат долга", kind: "income", icon: "🤝", color: "#059669", keywords: ["долг", "вернул", "вернула", "возврат"] },
  { name: "Прочие доходы", kind: "income", icon: "➕", color: "#64748b", keywords: [] },
];

/** Заполняет пустую базу стартовыми категориями. Безопасно вызывать многократно. */
export async function ensureSeeded(): Promise<void> {
  await db.transaction("rw", db.categories, async () => {
    if ((await db.categories.count()) === 0) {
      await db.categories.bulkAdd(
        [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES].map((c, i) => ({
          ...c,
          archived: false,
          order: i,
        })),
      );
    }
  });
}
