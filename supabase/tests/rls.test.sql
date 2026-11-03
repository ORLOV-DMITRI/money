-- Проверки схемы и RLS. Любая ошибка = провал (psql -v ON_ERROR_STOP=1).
\set A '''aaaaaaaa-0000-4000-8000-000000000001'''
\set B '''bbbbbbbb-0000-4000-8000-000000000002'''
\set X '''11111111-1111-4111-8111-111111111111'''

-- Пользователь A пишет операцию; user_id подставляется сам
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false) as sub \gset
insert into transactions (id, type, amount, date, created_at, updated_at) values (:X, 'expense', 120000, '2026-11-03', 1, 1);
do $$ begin
  if (select user_id from transactions) <> auth.uid() then raise exception 'user_id не подставился'; end if;
end $$;

-- B не видит строк A, не может их обновить и не может писать от имени A
select set_config('request.jwt.claim.sub', :B, false) as sub \gset
do $$ begin
  if exists (select 1 from transactions) then raise exception 'B видит чужие данные'; end if;
end $$;
update transactions set amount = 1 where id = '11111111-1111-4111-8111-111111111111';
do $$ declare ok boolean := false; begin
  begin
    insert into transactions (user_id, id, type, amount, date, created_at, updated_at)
    values ('aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 'expense', 1, '2026-11-03', 1, 1);
  exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'B смог записать строку от имени A'; end if;
end $$;

-- Тот же id у другого пользователя — не конфликт (PK = user_id + id)
insert into transactions (id, type, amount, date, created_at, updated_at) values (:X, 'income', 5, '2026-11-03', 1, 1);

-- Удалять физически нельзя (только мягко)
do $$ declare ok boolean := false; begin
  begin delete from transactions; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'DELETE должен быть запрещён'; end if;
end $$;

-- Ограничения данных
do $$ declare ok boolean := false; begin
  begin insert into transactions (id, type, amount, date, created_at, updated_at) values (gen_random_uuid(), 'transfer', 1, '2026-11-03', 1, 1);
  exception when check_violation then ok := true; end;
  if not ok then raise exception 'тип transfer должен быть запрещён'; end if;
end $$;

-- Upsert и курсор synced_at растёт при изменении; мягкое удаление
select set_config('request.jwt.claim.sub', :A, false) as sub \gset
create temp table before_sync as select synced_at from transactions;
insert into transactions (id, type, amount, date, created_at, updated_at) values (:X, 'expense', 150000, '2026-11-03', 1, 2)
  on conflict (user_id, id) do update set amount = excluded.amount, updated_at = excluded.updated_at;
update transactions set deleted_at = now() where id = :X;
do $$ begin
  if (select amount from transactions) <> 150000 then raise exception 'upsert не обновил строку'; end if;
  if (select synced_at from transactions) <= (select synced_at from before_sync) then raise exception 'synced_at не вырос'; end if;
  if (select deleted_at from transactions) is null then raise exception 'мягкое удаление не сработало'; end if;
end $$;

-- Аноним не видит ничего
reset role;
set role anon;
do $$ declare ok boolean := false; begin
  begin perform 1 from transactions; exception when insufficient_privilege then ok := true; end;
  if not ok then raise exception 'anon имеет доступ к таблице'; end if;
end $$;
reset role;

-- У всех таблиц включён RLS и они в публикации realtime
do $$ declare n int; begin
  select count(*) into n from pg_tables where schemaname = 'public' and not rowsecurity;
  if n > 0 then raise exception 'есть таблицы без RLS: %', n; end if;
  select count(*) into n from pg_publication_tables where pubname = 'supabase_realtime';
  if n <> 9 then raise exception 'в realtime % таблиц вместо 9', n; end if;
end $$;

\echo 'RLS: все проверки пройдены'
