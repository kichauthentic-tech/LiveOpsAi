-- Shim Supabase tối thiểu để REPLAY cả chuỗi migration trên một Postgres trắng.
-- Vì sao cần: chuỗi migration gọi `auth.uid()` / `auth.role()` và grant cho 3 role của Supabase —
-- Postgres trắng không có gì trong số đó. Dựng đúng phần tối thiểu để `0001 → 013x` chạy sạch.
-- Cách dùng: xem README.md cùng thư mục (mục "Replay cả chuỗi").
-- Đã dùng để tìm ra: 0114 xoá mất vế `is not null` của 0109 trên view live_sessions_secure (02/10).
create extension if not exists pgcrypto;
do $r$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $r$;
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text, raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
