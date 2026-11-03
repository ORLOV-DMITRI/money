-- Деньги: схема для синхронизации (local-first).
-- Каждая строка принадлежит пользователю: PK (user_id, id), доступ — только к своим строкам (RLS).
-- synced_at ставит сервер — это курсор, по которому устройства забирают изменения.
-- deleted_at — мягкое удаление, чтобы удаление «доехало» до других устройств.
-- Внешних ключей нет намеренно: устройства отправляют изменения пачками и в любом порядке.

create or replace function public.money_touch() returns trigger
language plpgsql as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;

create table public.categories (
  user_id    uuid not null default auth.uid(),
  id         uuid not null,
  name       text not null,
  kind       text not null check (kind in ('expense', 'income')),
  icon       text not null default '📦',
  color      text not null default '#64748b',
  keywords   text[] not null default '{}',
  archived   boolean not null default false,
  sort_order integer not null default 0,
  synced_at  timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.transactions (
  user_id      uuid not null default auth.uid(),
  id           uuid not null,
  type         text not null check (type in ('expense', 'income', 'goal_deposit', 'goal_withdraw', 'adjustment')),
  amount       bigint not null check (amount <> 0),        -- тиыны
  date         date not null,
  category_id  uuid,
  goal_id      uuid,
  store_id     uuid,
  note         text not null default '',
  tags         text[] not null default '{}',
  recurring_id uuid,
  parent_id    uuid,
  created_at   bigint not null,                             -- мс, время устройства
  updated_at   bigint not null,
  synced_at    timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.purchase_items (
  user_id        uuid not null default auth.uid(),
  id             uuid not null,
  transaction_id uuid not null,
  product_id     uuid not null,
  category_id    uuid not null,
  store_id       uuid,
  quantity       double precision not null,
  unit           text not null,
  unit_price     bigint not null,
  total          bigint not null,
  date           date not null,
  synced_at      timestamptz not null default clock_timestamp(),
  deleted_at     timestamptz,
  primary key (user_id, id)
);

create table public.products (
  user_id     uuid not null default auth.uid(),
  id          uuid not null,
  name        text not null,
  key         text not null,
  unit        text not null,
  category_id uuid not null,
  created_at  bigint not null,
  synced_at   timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

create table public.stores (
  user_id    uuid not null default auth.uid(),
  id         uuid not null,
  name       text not null,
  key        text not null,
  synced_at  timestamptz not null default clock_timestamp(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table public.goals (
  user_id      uuid not null default auth.uid(),
  id           uuid not null,
  name         text not null,
  icon         text not null,
  color        text not null,
  target       bigint not null,
  deadline     date,
  auto_percent integer not null default 0 check (auto_percent between 0 and 100),
  archived     boolean not null default false,
  completed_at bigint,
  created_at   bigint not null,
  synced_at    timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.budgets (
  user_id      uuid not null default auth.uid(),
  id           uuid not null,
  category_id  uuid not null,
  limit_amount bigint not null,
  period       text not null check (period in ('month', 'week')),
  synced_at    timestamptz not null default clock_timestamp(),
  deleted_at   timestamptz,
  primary key (user_id, id)
);

create table public.recurring (
  user_id     uuid not null default auth.uid(),
  id          uuid not null,
  name        text not null,
  type        text not null check (type in ('expense', 'income')),
  amount      bigint not null,
  category_id uuid not null,
  frequency   text not null check (frequency in ('day', 'week', 'month', 'year')),
  every_n     integer not null default 1 check (every_n >= 1),
  next_date   date not null,
  mode        text not null check (mode in ('auto', 'remind')),
  active      boolean not null default true,
  created_at  bigint not null,
  synced_at   timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

create table public.templates (
  user_id     uuid not null default auth.uid(),
  id          uuid not null,
  name        text not null,
  type        text not null check (type in ('expense', 'income')),
  amount      bigint not null,
  category_id uuid not null,
  note        text not null default '',
  synced_at   timestamptz not null default clock_timestamp(),
  deleted_at  timestamptz,
  primary key (user_id, id)
);

-- Общее для всех таблиц: индекс курсора, триггер, RLS, права, realtime
do $$
declare t text;
begin
  foreach t in array array['categories','transactions','purchase_items','products','stores','goals','budgets','recurring','templates'] loop
    execute format('create index %I on public.%I (user_id, synced_at)', t || '_sync_idx', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.money_touch()', t || '_touch', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
