-- Bộ kiểm 0179 (cổng brand) — chạy trên bản REPLAY 0001 → 0179 (README.md, mục "Replay cả chuỗi"). In "OK ..." từng mục,
-- ERROR là hỏng. Đã thử 21/10: replay bỏ 0179 ⇒ 1a, 1c, 3 ĐỎ (brand đọc 4 dòng profiles, ghi được promo_schemes); mục 2 vẫn xanh
-- vì 0176 (chưa chạy trên production) cũng đã mang cùng định nghĩa talents_secure — chạy 0176 hay 0179 trước đều che cột.
\set ON_ERROR_STOP 1
set client_min_messages = notice;
-- Quyền bảng mặc định của Supabase (authenticated có quyền trên bảng public, RLS lọc dòng). Cấp từng bảng — KHÔNG `grant all on all
-- tables` (xoá quyền theo cột của 0047/0048, README).
grant select on profiles, talents_secure, brands to authenticated;
grant select, insert, update, delete on promo_schemes, recurring_shift_templates to authenticated;

-- Dữ liệu: 2 brand (A có kênh TikTok, B có kênh TikTok), 1 tài khoản brand A, 1 tài khoản ops, 1 tài khoản talent, 1 host.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'brand-a@x'),
  ('00000000-0000-0000-0000-0000000000a2', 'ops@x'),
  ('00000000-0000-0000-0000-0000000000a3', 'talent@x'),
  ('00000000-0000-0000-0000-0000000000a4', 'brand-b@x')
on conflict do nothing;
insert into brands (id, name) values
  ('00000000-0000-0000-0000-00000000b0a0', 'Brand A'),
  ('00000000-0000-0000-0000-00000000b0b0', 'Brand B')
on conflict do nothing;
insert into brand_channels (brand_id, platform) values
  ('00000000-0000-0000-0000-00000000b0a0', 'TikTok'),
  ('00000000-0000-0000-0000-00000000b0b0', 'TikTok')
on conflict do nothing;
insert into profiles (id, email, name, role, assigned_brand_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'brand-a@x', 'Brand A user', 'brand', '00000000-0000-0000-0000-00000000b0a0'),
  ('00000000-0000-0000-0000-0000000000a2', 'ops@x', 'Ops', 'operations', null),
  ('00000000-0000-0000-0000-0000000000a3', 'talent@x', 'Host 1', 'talent', null),
  ('00000000-0000-0000-0000-0000000000a4', 'brand-b@x', 'Brand B user', 'brand', '00000000-0000-0000-0000-00000000b0b0')
on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;
insert into talents (id, name, phone, date_of_birth, total_gmv, brands_worked_with, nickname)
values ('00000000-0000-0000-0000-00000000c001', 'Host 1', '0909000000', '2000-01-01', 123456789, '{Brand A}', 'H1')
on conflict do nothing;

create or replace function pg_temp.as_user(p_uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_uid, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;

-- 1) profiles: brand chỉ thấy dòng của mình; ops thấy hết; phiên đăng nhập không có profiles chỉ thấy (không có) dòng của mình.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select count(*) from profiles) <> 1 then raise exception '1 brand đọc % dòng profiles, phải là 1', (select count(*) from profiles); end if;
  raise notice 'OK 1a brand chỉ đọc dòng profiles của mình';
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ begin
  if (select count(*) from profiles) < 4 then raise exception '1 ops chỉ đọc % dòng profiles', (select count(*) from profiles); end if;
  raise notice 'OK 1b ops vẫn đọc mọi profiles';
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000ff');
do $$ begin
  if (select count(*) from profiles) <> 0 then raise exception '1 phiên không có profiles đọc % dòng', (select count(*) from profiles); end if;
  raise notice 'OK 1c phiên chưa có dòng profiles không đọc được ai';
end $$;
rollback;

-- 2) talents_secure: brand thấy tên/biệt danh, không thấy SĐT/ngày sinh/GMV/brand đã làm; talent + ops thấy.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ declare r record; begin
  select * into r from talents_secure where id = '00000000-0000-0000-0000-00000000c001';
  if r.name <> 'Host 1' or r.nickname <> 'H1' then raise exception '2 brand mất tên/biệt danh host'; end if;
  if r.phone is not null or r.date_of_birth is not null or r.total_gmv is not null or r.brands_worked_with is not null then
    raise exception '2 brand còn thấy SĐT/ngày sinh/GMV/brand đã làm';
  end if;
  raise notice 'OK 2a brand: tên còn, cột cá nhân bị che';
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
do $$ declare r record; begin
  select * into r from talents_secure where id = '00000000-0000-0000-0000-00000000c001';
  if r.phone is distinct from '0909000000' or r.total_gmv is distinct from 123456789 then raise exception '2 ops mất SĐT/GMV host'; end if;
  raise notice 'OK 2b ops vẫn thấy đủ';
end $$;
rollback;

-- 3) brand không còn ghi promo_schemes / recurring_shift_templates.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    insert into promo_schemes (brand_id, title, start_date, end_date) values ('00000000-0000-0000-0000-00000000b0a0', 'x', '2026-10-01', '2026-10-02');
    raise exception '3 brand vẫn ghi được promo_schemes';
  exception when insufficient_privilege then
    raise notice 'OK 3 brand không ghi được promo_schemes';
  end;
end $$;
rollback;

-- 4) bản tin: brand không tự gửi; ops gửi; brand A đọc bản tin của A, không đọc của B.
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  begin
    perform publish_brand_bulletin('00000000-0000-0000-0000-00000000b0a0', 'TikTok', '2026-10-01', '2026-10-18', '{"x":1}'::jsonb, '');
    raise exception '4 brand tự gửi được bản tin';
  exception when insufficient_privilege then
    raise notice 'OK 4a brand không tự gửi bản tin';
  end;
end $$;
rollback;
begin;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2');
select publish_brand_bulletin('00000000-0000-0000-0000-00000000b0a0', 'TikTok', '2026-10-15', '2026-10-18', '{"pace":{"actual":318}}'::jsonb, 'note A') is not null as ok_a;
select publish_brand_bulletin('00000000-0000-0000-0000-00000000b0b0', 'TikTok', '2026-10-01', '2026-10-18', '{"pace":{"actual":1}}'::jsonb, 'note B') is not null as ok_b;
do $$ begin
  if (select month from brand_bulletins where note = 'note A') <> '2026-10-01' then raise exception '4 tháng không về ngày 1'; end if;
  raise notice 'OK 4b ops gửi bản tin, tháng quy về ngày 1';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select count(*) from brand_bulletins) <> 1 or (select note from brand_bulletins) <> 'note A' then raise exception '4 brand A đọc sai bản tin'; end if;
  raise notice 'OK 4c brand A chỉ đọc bản tin của A';
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3');
do $$ begin
  if (select count(*) from brand_bulletins) <> 0 then raise exception '4 talent đọc được bản tin'; end if;
  raise notice 'OK 4d talent không đọc bản tin';
end $$;
rollback;
