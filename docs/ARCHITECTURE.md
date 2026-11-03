# Архитектура

## Стек

| Слой | Технология | Зачем |
| --- | --- | --- |
| Фреймворк | Next.js 16 (App Router) + React 19 + TypeScript | Знакомый стек, роутинг, сборка, статический экспорт |
| Стили | Tailwind CSS v4 | Быстро, единая дизайн-система через CSS-переменные |
| UI-компоненты | Собственные компоненты в стиле shadcn/ui поверх Radix UI | Доступность (a11y) из коробки, полный контроль над кодом |
| Хранилище | IndexedDB через Dexie 4 + `dexie-react-hooks` (`useLiveQuery`) | Локальные данные, реактивные запросы, работа офлайн |
| Графики | Recharts | Декларативные графики на React |
| Даты | date-fns (локаль `ru`) | Периоды, недели с понедельника, форматирование |
| Тосты | sonner | Уведомления с кнопкой «Отменить» |
| Иконки | lucide-react | Иконки интерфейса (категории — эмодзи) |
| Тесты | Vitest + fake-indexeddb | Юнит-тесты логики: деньги, парсер, отчёты, копилки |

Приложение полностью клиентское: `output: 'export'` → набор статических файлов, деплоится куда угодно (Vercel, GitHub Pages, Netlify).

## Структура папок

```
src/
  app/                    # маршруты Next.js (тонкие страницы, только композиция)
    page.tsx              # Главная
    transactions/         # Операции
    goals/                # Копилки (детали: /goals/view?id=…)
    reports/              # Отчёты
    products/             # Продукты (детали: /products/view?id=…)
    budgets/              # Бюджеты
    recurring/            # Регулярные платежи
    settings/             # Настройки, счета, категории, данные
  components/
    ui/                   # базовые компоненты (button, dialog, sheet, input…)
    layout/               # навигация, оболочка
    transactions/ goals/ reports/ …  # компоненты фич
  lib/
    money.ts              # тиыны ↔ тенге, форматирование, парсинг ввода суммы
    dates.ts              # периоды, навигация по периодам
    quick-input.ts        # парсер быстрого ввода
    db/
      schema.ts           # типы сущностей
      db.ts               # Dexie, версии схемы
      seed.ts             # стартовые категории, демо-данные
    services/             # бизнес-логика, работающая с БД (транзакции, копилки, регулярные…)
    analytics/            # чистые функции: балансы, отчёты, прогнозы, инсайты
  hooks/                  # React-хуки поверх useLiveQuery
```

Правило: **вся логика расчётов — чистые функции в `lib/analytics`** (принимают массивы, возвращают результат) и покрыты тестами. Компоненты только отображают.

## Модель данных

Все суммы — целые числа в **тиынах**. Даты операций — строка `YYYY-MM-DD` (локальная дата, без часовых поясов), метки времени — `number` (ms).

```ts
Account      { id, name, type: 'cash'|'card'|'deposit'|'other', icon, color,
               initialBalance, archived, order, createdAt }

Category     { id, name, kind: 'expense'|'income', icon, color,
               keywords: string[], archived, order }

Transaction  { id, type: 'expense'|'income'|'transfer'|'goal_deposit'|'goal_withdraw',
               amount,                 // > 0, тиыны
               date,                   // 'YYYY-MM-DD'
               accountId,              // счёт списания/зачисления
               toAccountId?,           // для transfer
               categoryId?,            // для expense/income без чека
               goalId?,                // для goal_*
               storeId?,               // для чека
               note, tags: string[],
               recurringId?, parentId?,// parentId: автоотчисление, созданное приходом
               createdAt, updatedAt }

PurchaseItem { id, transactionId, productId, categoryId, storeId?,
               quantity, unit, unitPrice, total, date }   // date дублируется для индексов

Product      { id, name, unit, categoryId, createdAt }
Store        { id, name }

Goal         { id, name, icon, color, target, deadline?, autoPercent,
               autoAccountId?, archived, completedAt?, createdAt }

Budget       { id, categoryId, limit, period: 'month'|'week' }

Recurring    { id, name, type: 'expense'|'income', amount, accountId, categoryId,
               frequency: 'day'|'week'|'month'|'year', interval, nextDate,
               mode: 'auto'|'remind', active, createdAt }

Template     { id, name, type: 'expense'|'income', amount, accountId, categoryId, note }

Setting      { key, value }
```

### Индексы Dexie (v1)

```
accounts:      ++id, order
categories:    ++id, kind, order
transactions:  ++id, date, type, accountId, toAccountId, categoryId, goalId, storeId, recurringId, parentId, *tags
purchaseItems: ++id, transactionId, productId, categoryId, storeId, date
products:      ++id, &name
stores:        ++id, &name
goals:         ++id
budgets:       ++id, categoryId
recurring:     ++id, nextDate
templates:     ++id
settings:      &key
```

## Ключевые потоки

**Расходы по категориям.** Для каждой транзакции `expense`: если у неё есть позиции чека — сумма раскладывается по `categoryId` позиций, иначе целиком идёт в `categoryId` транзакции.

**Баланс счёта.** `initialBalance + Σ income − Σ expense − Σ transfer(out) + Σ transfer(in) − Σ goal_deposit + Σ goal_withdraw`.

**Баланс копилки.** `Σ goal_deposit − Σ goal_withdraw` по `goalId`.

**Приход с автоотчислениями.** В одной Dexie-транзакции: создаётся приход, затем для каждой копилки с `autoPercent > 0` — `goal_deposit` с `parentId = id прихода`. Удаление прихода удаляет дочерние отчисления.

**Регулярные платежи.** При старте приложения `processRecurring(today)`: для `mode='auto'` создаются все операции с `nextDate ≤ today` и `nextDate` сдвигается; для `mode='remind'` просроченные показываются на главной.
