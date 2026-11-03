# Архитектура

## Стек

| Слой | Технология | Зачем |
| --- | --- | --- |
| Фреймворк | Next.js 16.4 (App Router, Turbopack) + React 19 + TypeScript | Знакомый стек, роутинг, сборка, статический экспорт |
| Стили | Tailwind CSS v4 | Быстро, единая дизайн-система через CSS-переменные |
| UI-компоненты | Собственные компоненты в стиле shadcn/ui поверх Radix UI | Доступность (a11y) из коробки, полный контроль над кодом |
| Хранилище | IndexedDB через Dexie 4 + `dexie-react-hooks` (`useLiveQuery`) | Локальные данные, реактивные запросы, работа офлайн |
| Синхронизация | Supabase: Postgres + RLS, Auth (email/пароль), Realtime | Одни данные на всех устройствах, см. [SYNC.md](./SYNC.md) |
| Графики | Recharts | Декларативные графики на React |
| Даты | date-fns (локаль `ru`) | Периоды, недели с понедельника, форматирование |
| Тосты | sonner | Уведомления с кнопкой «Отменить» |
| Иконки | lucide-react | Иконки интерфейса (категории — эмодзи) |
| Тесты | Vitest + fake-indexeddb | Юнит-тесты логики: деньги, парсер, отчёты, копилки |
| PWA | Свой service worker (`public/sw.js`) + манифест | Установка на телефон и офлайн без лишних зависимостей |

Приложение полностью клиентское: `output: 'export'` → набор статических файлов, деплоится куда угодно (Vercel, GitHub Pages, Netlify).

## Структура папок

```
src/
  app/                      # маршруты: тонкие page.tsx (metadata + view)
    page.tsx                # Главная
    transactions/ reports/ goals/ goals/view/ products/ products/view/
    budgets/ recurring/ categories/ settings/
  components/
    ui/                     # button, input, dialog (шторка на телефоне), dropdown, misc, money, amount-input, pickers
    layout/                 # app-shell (навигация), providers, theme, bootstrap, nav
    transactions/           # tx-editor (расход/приход/чек/копилка/корректировка), tx-list, quick-input-bar, category-grid
    balance/                # reconcile-dialog — «Сверить баланс»
    charts/                 # series-chart, category-bars, heatmap, period-picker
    goals/ budgets/ insights/
    sync/                   # auth-gate, login-screen, sync-indicator
    views/                  # экраны целиком: dashboard, transactions, reports, goals, goal-detail, …
  hooks/
    use-data.ts             # реактивные запросы к Dexie (useLiveQuery)
    use-analytics.ts        # мемоизированные расчёты: копилки, бюджеты, подсказки
    use-product-stats.ts
  lib/
    money.ts dates.ts       # тиыны, формат, парсер выражений; периоды и склонения
    quick-input.ts          # парсер быстрого ввода
    categorize.ts           # подбор категории
    ids.ts                  # UUID v7 и детерминированные v5
    db/                     # schema, db (Dexie + outbox-middleware), seed, demo, legacy (перенос старой базы)
    sync/                   # client (Supabase), mapping, remote, engine (push/pull), controller (когда синхронизировать)
    services/               # transactions, goals, recurring, catalog, data (бэкап/CSV)
    analytics/              # чистые функции: balances, reports, goals, budgets, products, insights
  test/setup.ts             # fake-indexeddb для тестов сервисов
public/                     # manifest.webmanifest, sw.js, иконки
supabase/
  migrations/               # SQL-схема для Supabase
  tests/                    # заглушка окружения Supabase и RLS-тесты для локального Postgres
```
Правило: **вся логика расчётов — чистые функции в `lib/analytics`** (принимают массивы, возвращают результат) и покрыты тестами. Компоненты только отображают.

## Модель данных

Все суммы — целые числа в **тиынах**. Даты операций — строка `YYYY-MM-DD` (локальная дата, без часовых поясов), метки времени — `number` (ms). Все `id` и ссылки — **UUID-строки** (v7 для новых записей, v5 — детерминированные, см. SYNC.md).

```ts
Category     { id, name, kind: 'expense'|'income', icon, color,
               keywords: string[], archived, order }

Transaction  { id, type: 'expense'|'income'|'goal_deposit'|'goal_withdraw'|'adjustment',
               amount,                 // тиыны; > 0, только у adjustment может быть < 0
               date,                   // 'YYYY-MM-DD'
               categoryId?,            // для expense/income без чека
               goalId?,                // для goal_*
               storeId?,               // для чека
               note, tags: string[],
               recurringId?, parentId?,// parentId: автоотчисление, созданное приходом
               createdAt, updatedAt }

PurchaseItem { id, transactionId, productId, categoryId, storeId?,
               quantity, unit, unitPrice, total, date }   // date дублируется для индексов

Product      { id, name, key, unit, categoryId, createdAt }   // key — нормализованное имя (нижний регистр, ё→е)
Store        { id, name, key }

Goal         { id, name, icon, color, target, deadline?, autoPercent,
               autoAccountId?, archived, completedAt?, createdAt }

Budget       { id, categoryId, limit, period: 'month'|'week' }

Recurring    { id, name, type: 'expense'|'income', amount, categoryId,
               frequency: 'day'|'week'|'month'|'year', interval, nextDate,
               mode: 'auto'|'remind', active, createdAt }

Template     { id, name, type: 'expense'|'income', amount, categoryId, note }

Setting      { key, value }
```

### Индексы Dexie (база `money-sync`, v1)

```
categories:    id, kind, order
transactions:  id, date, type, categoryId, goalId, storeId, recurringId, parentId, *tags
purchaseItems: id, transactionId, productId, categoryId, storeId, date
products:      id, key
stores:        id, key
goals:         id
budgets:       id, categoryId
recurring:     id, nextDate
templates:     id
settings:      &key          — локально: курсор синхронизации, владелец данных
_outbox:       &key, table   — очередь изменений на отправку
```

Старая база `money` (числовые id, v1 со счетами → v3 «единые деньги») переносится в новую при первом запуске (`lib/db/legacy.ts`), переход покрыт тестом.

## Ключевые потоки

**Расходы по категориям.** Для каждой транзакции `expense`: если у неё есть позиции чека — сумма раскладывается по `categoryId` позиций, иначе целиком идёт в `categoryId` транзакции.

**Свободные деньги.** `Σ adjustment + Σ income − Σ expense − Σ goal_deposit + Σ goal_withdraw`. Отчёты о тратах и доходах корректировки не учитывают.

**Баланс копилки.** `Σ goal_deposit − Σ goal_withdraw` по `goalId`.

**Приход с автоотчислениями.** В одной Dexie-транзакции: создаётся приход, затем для каждой копилки с `autoPercent > 0` — `goal_deposit` с `parentId = id прихода`. Удаление прихода удаляет дочерние отчисления.

**Темп копилки.** Чистые пополнения за 3 последних полных календарных месяца (или с даты создания, если копилка моложе), делённые на число дней. Так ежемесячный взнос не «выпадает» из окна из-за одного дня. Прогноз = остаток / темп.

**Бюджеты.** Траты категории за текущий месяц/неделю по разложенным расходам (чеки по позициям). Прогноз = темп × длина периода; дата исчерпания — когда при текущем темпе будет достигнут лимит. Предупреждения при пересечении 80% и 100%.

**Подсказки.** `buildInsights` — чистая функция: сравнение категорий за последние 30 дней против предыдущих 30, общий темп, рост цен продуктов, бюджеты, доля сбережений, дорогой день недели, состояние копилок. Каждая подсказка имеет вес для сортировки и ссылку.

**Регулярные платежи.** При старте приложения `processRecurring(today)` в одной rw-транзакции (без дублей при параллельных вызовах): для `mode='auto'` создаются все операции с `nextDate ≤ today` и `nextDate` сдвигается; для `mode='remind'` просроченные показываются на главной.

## Офлайн (service worker)

- `/_next/static/*`, иконки, манифест — cache-first (имена с хешем, кеш вечный).
- Навигация — network-first: свежая страница кладётся в кеш, без сети отдаётся кешированная (или главная).
- При установке заранее кешируются все страницы приложения.
- В dev-режиме SW не регистрируется.
