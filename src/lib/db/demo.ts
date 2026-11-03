import { subMonths } from "date-fns";
import { db } from "./db";
import { ensureSeeded } from "./seed";
import { normalizeKey, type PurchaseItem, type Transaction, type Unit } from "./schema";
import { resetAll } from "@/lib/services/data";
import { processRecurring } from "@/lib/services/recurring";
import { addFrequency, daysBetween, eachDay, parseISODate, toISODate, type ISODate } from "@/lib/dates";
import { autoDeposits } from "@/lib/analytics/goals";

/** Детерминированный ГПСЧ, чтобы демо выглядело одинаково от запуска к запуску */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProductSeed {
  name: string;
  unit: Unit;
  category: string;
  /** цена за единицу в тенге в начале периода */
  price: number;
  /** рост цены за месяц, доля */
  inflation: number;
  qty: [number, number];
  /** вероятность попасть в чек */
  p: number;
}

const PRODUCTS: ProductSeed[] = [
  { name: "Молоко 2,5%", unit: "л", category: "Продукты", price: 560, inflation: 0.03, qty: [1, 2], p: 0.7 },
  { name: "Хлеб", unit: "шт", category: "Продукты", price: 230, inflation: 0.01, qty: [1, 2], p: 0.7 },
  { name: "Яйца С1", unit: "уп", category: "Продукты", price: 820, inflation: 0.025, qty: [1, 1], p: 0.4 },
  { name: "Сыр", unit: "кг", category: "Продукты", price: 4400, inflation: 0.015, qty: [0.3, 0.5], p: 0.3 },
  { name: "Куриное филе", unit: "кг", category: "Продукты", price: 2300, inflation: 0.012, qty: [0.8, 1.5], p: 0.45 },
  { name: "Говядина", unit: "кг", category: "Продукты", price: 4600, inflation: 0.02, qty: [0.8, 1.5], p: 0.3 },
  { name: "Картофель", unit: "кг", category: "Продукты", price: 220, inflation: 0.02, qty: [2, 3], p: 0.35 },
  { name: "Помидоры", unit: "кг", category: "Продукты", price: 900, inflation: 0.06, qty: [0.5, 1.5], p: 0.4 },
  { name: "Огурцы", unit: "кг", category: "Продукты", price: 700, inflation: 0.05, qty: [0.5, 1], p: 0.35 },
  { name: "Бананы", unit: "кг", category: "Продукты", price: 880, inflation: 0.005, qty: [1, 1.5], p: 0.4 },
  { name: "Яблоки", unit: "кг", category: "Продукты", price: 650, inflation: 0.01, qty: [1, 2], p: 0.35 },
  { name: "Гречка", unit: "уп", category: "Продукты", price: 560, inflation: 0.01, qty: [1, 1], p: 0.15 },
  { name: "Рис", unit: "кг", category: "Продукты", price: 620, inflation: 0.008, qty: [1, 1], p: 0.15 },
  { name: "Масло сливочное", unit: "уп", category: "Продукты", price: 1350, inflation: 0.02, qty: [1, 1], p: 0.2 },
  { name: "Кофе молотый", unit: "уп", category: "Продукты", price: 3300, inflation: 0.03, qty: [1, 1], p: 0.1 },
  { name: "Чай", unit: "уп", category: "Продукты", price: 1150, inflation: 0.005, qty: [1, 1], p: 0.1 },
  { name: "Йогурт", unit: "шт", category: "Продукты", price: 340, inflation: 0.01, qty: [2, 4], p: 0.35 },
  { name: "Вода 5 л", unit: "шт", category: "Продукты", price: 580, inflation: 0, qty: [1, 2], p: 0.25 },
  { name: "Стиральный порошок", unit: "уп", category: "Дом и быт", price: 3100, inflation: 0.01, qty: [1, 1], p: 0.06 },
  { name: "Средство для посуды", unit: "шт", category: "Дом и быт", price: 950, inflation: 0.01, qty: [1, 1], p: 0.08 },
  { name: "Шампунь", unit: "шт", category: "Красота", price: 2100, inflation: 0.005, qty: [1, 1], p: 0.05 },
];

/** Магазин → ценовой коэффициент */
const STORES: [string, number][] = [
  ["Magnum", 0.97],
  ["Small", 1.0],
  ["Galmart", 1.12],
  ["Арбуз.kz", 1.04],
  ["Зелёный базар", 0.9],
];

export async function loadDemoData(today: ISODate): Promise<void> {
  await resetAll();
  await ensureSeeded();

  const rnd = mulberry32(20261103);
  const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const between = (a: number, b: number) => a + rnd() * (b - a);
  const roundTo = (v: number, step: number) => Math.round(v / step) * step;
  const tiyn = (tenge: number) => Math.round(tenge) * 100;

  const start = toISODate(subMonths(new Date(parseISODate(today).getFullYear(), parseISODate(today).getMonth(), 1), 4));
  const startTs = parseISODate(start).getTime();
  const now = Date.now();

  const cats = await db.categories.toArray();
  const cat = (name: string, kind: "expense" | "income" = "expense") => cats.find((c) => c.name === name && c.kind === kind)!.id!;

  // Магазины и продукты
  const storeIds = (await db.stores.bulkAdd(STORES.map(([name]) => ({ name, key: normalizeKey(name) })), { allKeys: true })) as number[];
  const productIds = (await db.products.bulkAdd(
    PRODUCTS.map((p) => ({ name: p.name, key: normalizeKey(p.name), unit: p.unit, categoryId: cat(p.category), createdAt: startTs })),
    { allKeys: true },
  )) as number[];

  // Копилки (до операций, чтобы зарплата делала автоотчисления)
  const deadlineVacation = toISODate(new Date(parseISODate(today).getFullYear(), parseISODate(today).getMonth() + 5, 15));
  const [gVacation, gLaptop, gCushion, gDeposit] = (await db.goals.bulkAdd(
    [
      { name: "Отпуск в Турции", icon: "🏖️", color: "#0ea5e9", target: tiyn(1_200_000), deadline: deadlineVacation, autoPercent: 10, archived: false, createdAt: startTs },
      { name: "Новый ноутбук", icon: "💻", color: "#8b5cf6", target: tiyn(750_000), autoPercent: 0, archived: false, createdAt: startTs },
      { name: "Подушка безопасности", icon: "🛟", color: "#16a34a", target: tiyn(2_000_000), autoPercent: 5, archived: false, createdAt: startTs },
      { name: "Депозит", icon: "🏦", color: "#4f46e5", target: tiyn(1_000_000), autoPercent: 0, archived: false, createdAt: startTs },
    ],
    { allKeys: true },
  )) as number[];

  const txs: Omit<Transaction, "id">[] = [];
  const receipts: { tx: Omit<Transaction, "id">; items: Omit<PurchaseItem, "id" | "transactionId">[] }[] = [];
  const base = (t: Partial<Transaction> & Pick<Transaction, "type" | "amount" | "date">): Omit<Transaction, "id"> => ({
    note: "",
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...t,
  });

  const days = eachDay(start, today);
  const monthIndex = (d: ISODate) => {
    const a = parseISODate(start);
    const b = parseISODate(d);
    return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + (b.getDate() - 1) / 30;
  };
  const currentMonth = today.slice(0, 7);

  // Стартовый остаток и деньги на депозите
  txs.push(base({ type: "adjustment", amount: tiyn(685_000), date: start, note: "Начальный остаток" }));
  txs.push(base({ type: "goal_deposit", amount: tiyn(450_000), date: start, goalId: gDeposit, note: "Перевёл на депозит" }));

  for (const d of days) {
    const wd = (parseISODate(d).getDay() + 6) % 7; // 0 = пн
    const weekend = wd >= 5;
    const recent = daysBetween(d, today) < 30;

    // Кофе в будни
    if (!weekend && rnd() < 0.75) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(1100, 1700), 50)), date: d, categoryId: cat("Кафе и рестораны"), note: pick(["Кофе", "Латте", "Капучино"]) }));
    }
    // Обед в будни
    if (!weekend && rnd() < 0.6) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(2400, 3800), 100)), date: d, categoryId: cat("Кафе и рестораны"), note: "Обед" }));
    }
    // Такси: чаще в пятницу и на выходных
    if (rnd() < (wd === 4 ? 0.8 : weekend ? 0.45 : 0.25)) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(1200, 3200), 10)), date: d, categoryId: cat("Такси"), note: "Такси", tags: !weekend && rnd() < 0.4 ? ["работа"] : [] }));
    }
    // Автобус
    if (!weekend && rnd() < 0.5) {
      txs.push(base({ type: "expense", amount: tiyn(200), date: d, categoryId: cat("Транспорт"), note: "Проезд" }));
    }
    // Доставка еды — в последний месяц заметно чаще (для подсказки)
    if (rnd() < (weekend ? 0.35 : 0.08) * (recent ? 2.5 : 1)) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(3500, 8500), 10)), date: d, categoryId: cat("Доставка еды"), note: pick(["Wolt", "Glovo", "Яндекс Еда"]) }));
    }
    // Чек из магазина
    if (rnd() < (weekend ? 0.55 : 0.22)) {
      const sIdx = Math.floor(rnd() * STORES.length);
      const factor = STORES[sIdx][1];
      const items: Omit<PurchaseItem, "id" | "transactionId">[] = [];
      PRODUCTS.forEach((p, i) => {
        if (rnd() > p.p) return;
        const unitPrice = tiyn(roundTo(p.price * Math.pow(1 + p.inflation, monthIndex(d)) * factor * between(0.97, 1.03), 5));
        const quantity = p.unit === "кг" ? Math.round(between(p.qty[0], p.qty[1]) * 1000) / 1000 : Math.round(between(p.qty[0], p.qty[1]));
        items.push({ productId: productIds[i], categoryId: cat(p.category), storeId: storeIds[sIdx], quantity, unit: p.unit, unitPrice, total: Math.round(quantity * unitPrice / 100) * 100, date: d });
      });
      if (items.length) {
        const total = items.reduce((s, i) => s + i.total, 0);
        receipts.push({ tx: base({ type: "expense", amount: total, date: d, categoryId: cat("Продукты"), storeId: storeIds[sIdx] }), items });
      }
    }
    // Развлечения на выходных
    if (weekend && rnd() < 0.15) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(3000, 12000), 500)), date: d, categoryId: cat("Развлечения"), note: pick(["Кино", "Боулинг", "Концерт", "Квест"]) }));
    }
    // Аптека
    if (rnd() < 0.05) {
      txs.push(base({ type: "expense", amount: tiyn(roundTo(between(1500, 9000), 10)), date: d, categoryId: cat("Здоровье"), note: "Аптека" }));
    }
    const dom = parseISODate(d).getDate();
    // Раз в месяц: одежда, барбер, кешбэк
    if (dom === 12) txs.push(base({ type: "expense", amount: tiyn(roundTo(between(12000, 38000), 500)), date: d, categoryId: cat("Одежда и обувь"), note: pick(["Кроссовки", "Футболка", "Джинсы", "Куртка"]) }));
    if (dom === 18) txs.push(base({ type: "expense", amount: tiyn(6000), date: d, categoryId: cat("Красота"), note: "Барбер" }));
    if (dom === 2) txs.push(base({ type: "income", amount: tiyn(roundTo(between(3000, 8000), 1)), date: d, categoryId: cat("Кешбэк и бонусы", "income"), note: "Kaspi бонусы" }));
    if (dom === 28) {
      // проценты капитализируются: приход и сразу обратно в копилку «Депозит»
      const interest = tiyn(roundTo(between(2500, 3500), 1));
      txs.push(base({ type: "income", amount: interest, date: d, categoryId: cat("Проценты по депозиту", "income"), note: "Вознаграждение по депозиту" }));
      txs.push(base({ type: "goal_deposit", amount: interest, date: d, goalId: gDeposit, note: "Капитализация" }));
    }
    // Фриланс иногда
    if (dom === 20 && rnd() < 0.6) {
      txs.push(base({ type: "income", amount: tiyn(roundTo(between(60000, 160000), 5000)), date: d, categoryId: cat("Фриланс", "income"), note: "Лендинг для клиента" }));
    }
    // Ручные пополнения ноутбука
    if (dom === 26) txs.push(base({ type: "goal_deposit", amount: tiyn(roundTo(between(40000, 70000), 5000)), date: d, goalId: gLaptop, note: "" }));
  }

  // Подарок с тегом
  txs.push(base({ type: "expense", amount: tiyn(25000), date: toISODate(subMonths(parseISODate(today), 2)), categoryId: cat("Подарки"), note: "Подарок маме", tags: ["др мамы"] }));
  txs.push(base({ type: "expense", amount: tiyn(9000), date: toISODate(subMonths(parseISODate(today), 2)), categoryId: cat("Подарки"), note: "Цветы", tags: ["др мамы"] }));

  await db.transaction("rw", db.transactions, db.purchaseItems, async () => {
    await db.transactions.bulkAdd(txs);
    for (const r of receipts) {
      const id = (await db.transactions.add(r.tx)) as number;
      await db.purchaseItems.bulkAdd(r.items.map((i) => ({ ...i, transactionId: id })));
    }
  });

  // Регулярные платежи: «авто» материализуются движком, история «напоминаний» — вручную
  const firstOn = (day: number) => {
    const s = parseISODate(start);
    return toISODate(new Date(s.getFullYear(), s.getMonth(), day));
  };
  await db.recurring.bulkAdd([
    { name: "Зарплата", type: "income", amount: tiyn(650_000), categoryId: cat("Зарплата", "income"), frequency: "month", interval: 1, nextDate: firstOn(5), mode: "auto", active: true, createdAt: startTs },
    { name: "Аренда квартиры", type: "expense", amount: tiyn(180_000), categoryId: cat("Жильё"), frequency: "month", interval: 1, nextDate: firstOn(7), mode: "auto", active: true, createdAt: startTs },
    { name: "Мобильная связь", type: "expense", amount: tiyn(4_500), categoryId: cat("Связь и интернет"), frequency: "month", interval: 1, nextDate: firstOn(15), mode: "auto", active: true, createdAt: startTs },
    { name: "Spotify", type: "expense", amount: tiyn(1_990), categoryId: cat("Подписки"), frequency: "month", interval: 1, nextDate: firstOn(9), mode: "auto", active: true, createdAt: startTs },
    { name: "Фитнес-клуб", type: "expense", amount: tiyn(17_000), categoryId: cat("Спорт"), frequency: "month", interval: 1, nextDate: firstOn(3), mode: "auto", active: true, createdAt: startTs },
  ]);
  await processRecurring(today);

  // «Напоминания»: прошлые месяцы оплачены, текущий ждёт подтверждения
  const remind = [
    { name: "Коммунальные услуги", amount: 24_000, cat: "Коммунальные", day: 1 },
    { name: "Домашний интернет", amount: 7_990, cat: "Связь и интернет", day: 10 },
  ];
  for (const r of remind) {
    let date = firstOn(r.day);
    const id = await db.recurring.add({ name: r.name, type: "expense", amount: tiyn(r.amount), categoryId: cat(r.cat), frequency: "month", interval: 1, nextDate: date, mode: "remind", active: true, createdAt: startTs });
    while (date.slice(0, 7) < currentMonth) {
      const amount = r.cat === "Коммунальные" ? tiyn(roundTo(r.amount * between(0.85, 1.25), 10)) : tiyn(r.amount);
      await db.transactions.add(base({ type: "expense", amount, date, categoryId: cat(r.cat), note: r.name, recurringId: id }));
      date = addFrequency(date, "month");
    }
    await db.recurring.update(id, { nextDate: date });
  }

  // Подушку пополняем и с фриланса тоже (автоотчисления для ручных приходов)
  const goals = await db.goals.toArray();
  const freelance = await db.transactions.where("categoryId").equals(cat("Фриланс", "income")).toArray();
  for (const inc of freelance) {
    for (const dep of autoDeposits(inc.amount, goals)) {
      await db.transactions.add({ ...base({ type: "goal_deposit", amount: dep.amount, date: inc.date, goalId: dep.goalId, note: "Автоотчисление" }), parentId: inc.id });
    }
  }
  // Немного сняли из подушки на непредвиденное
  await db.transactions.add(base({ type: "goal_withdraw", amount: tiyn(20_000), date: toISODate(subMonths(parseISODate(today), 1)), goalId: gCushion, note: "Ремонт телефона" }));
  void gVacation;

  // Бюджеты и шаблоны
  await db.budgets.bulkAdd([
    { categoryId: cat("Продукты"), limit: tiyn(110_000), period: "month" },
    { categoryId: cat("Кафе и рестораны"), limit: tiyn(55_000), period: "month" },
    { categoryId: cat("Такси"), limit: tiyn(25_000), period: "month" },
    { categoryId: cat("Доставка еды"), limit: tiyn(20_000), period: "month" },
    { categoryId: cat("Развлечения"), limit: tiyn(8_000), period: "week" },
  ]);
  await db.templates.bulkAdd([
    { name: "Кофе", type: "expense", amount: tiyn(1_400), categoryId: cat("Кафе и рестораны"), note: "Кофе" },
    { name: "Обед", type: "expense", amount: tiyn(3_000), categoryId: cat("Кафе и рестораны"), note: "Обед" },
    { name: "Проезд", type: "expense", amount: tiyn(200), categoryId: cat("Транспорт"), note: "Проезд" },
    { name: "Такси", type: "expense", amount: tiyn(2_000), categoryId: cat("Такси"), note: "Такси" },
  ]);
}
