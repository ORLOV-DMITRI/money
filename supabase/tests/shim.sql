-- Минимальная имитация окружения Supabase для локальных тестов:
-- роли anon/authenticated, auth.uid() из настройки сессии, публикация supabase_realtime.
-- роли общие для всего кластера: создаём, только если их ещё нет (повторный прогон)
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create publication supabase_realtime;
