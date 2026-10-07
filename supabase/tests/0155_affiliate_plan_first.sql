-- Kiểm 0155 (Affiliate kế hoạch trước). Chạy trên bản REPLAY SAU 0155; thiếu 0155 đỏ ngay mục 0.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

select pg_temp.chk('0 có bảng trạng thái tháng', to_regclass('public.brand_affiliate_plan_months') is not null);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'brand@t'),
  ('a0000000-0000-0000-0000-000000000003', 'brand2@t') on conflict do nothing;
insert into brands (id, name) values
  ('b0000000-0000-0000-0000-00000000000a', 'CRC'),
  ('b0000000-0000-0000-0000-00000000000b', 'OTHER');
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin', null),
  ('a0000000-0000-0000-0000-000000000002', 'Brand A', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a'),
  ('a0000000-0000-0000-0000-000000000003', 'Brand B', 'brand2@t', 'brand', 'b0000000-0000-0000-0000-00000000000b')
  on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;

-- 1) cột mới + mặc định: dòng không nói gì về status là 'done' (dòng cũ / client cũ)
insert into brand_affiliate_actuals (id, brand_id, period_month, creator_name, direct_gmv)
  values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', '2026-09-01', 'Kiot Khói', 225248394);
select pg_temp.chk('1a dòng cũ mặc định done', status = 'done') from brand_affiliate_actuals where id = 'c0000000-0000-0000-0000-000000000001';

-- 2) kế hoạch T10 (planned) cho brand A + một dòng brand B
insert into brand_affiliate_actuals (brand_id, period_month, creator_name, live_date_label, target_gmv, camp_name, campaign_type,
  plan_timeline_label, plan_duration_hours, plan_budget_ads, status) values
  ('b0000000-0000-0000-0000-00000000000a', '2026-10-01', 'Khói', '9/10/2026', 700000000, 'D-Day', 'Big', '10h - 18h', 8, 24500000, 'planned'),
  ('b0000000-0000-0000-0000-00000000000b', '2026-10-01', 'Ai đó', '9/10/2026', 1000000, 'Daily', null, '19h - 23h', 4, 30000, 'planned');

-- 3) status ngoài tập cho phép bị chặn
do $$ begin
  begin
    insert into brand_affiliate_actuals (brand_id, period_month, creator_name, status)
      values ('b0000000-0000-0000-0000-00000000000a', '2026-10-01', 'x', 'bậy');
    raise exception 'FAIL 3 status bậy lọt';
  exception when check_violation then raise notice 'OK  3 status bậy bị chặn'; end;
end $$;

-- 4) ops đọc/ghi được cả hai bảng. Postgres trắng không có quyền mặc định của Supabase ⇒ cấp cho 2 bảng đang kiểm (đúng như
--    Supabase tự cấp; 0155 chỉ revoke anon + grant lại cho bảng mới).
grant select, insert, update, delete on brand_affiliate_actuals to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.chk('4a admin thấy mọi dòng (3)', (select count(*) from brand_affiliate_actuals) = 3);
insert into brand_affiliate_plan_months (brand_id, period_month) values ('b0000000-0000-0000-0000-00000000000a', '2026-10-01');
select pg_temp.chk('4b tỷ giá mặc định 26.300, chưa chốt', fx_rate = 26300 and published_at is null)
  from brand_affiliate_plan_months where brand_id = 'b0000000-0000-0000-0000-00000000000a' and period_month = '2026-10-01';

-- 5) brand: chưa chốt T10 ⇒ không thấy kế hoạch T10; T9 (đã nạp sẵn "chốt" ở migration? — dòng này chèn SAU migration nên chưa chốt)
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('5a brand A chưa chốt gì ⇒ 0 dòng', (select count(*) from brand_affiliate_actuals) = 0);
select pg_temp.chk('5b brand A không đọc được tháng chưa chốt', (select count(*) from brand_affiliate_plan_months) = 0);

-- 6) ops chốt T10 ⇒ brand A thấy đúng 1 dòng T10 của mình, KHÔNG thấy T9 (chưa chốt) và KHÔNG thấy dòng brand B
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
update brand_affiliate_plan_months set published_at = now(), published_by = 'a0000000-0000-0000-0000-000000000001'
  where brand_id = 'b0000000-0000-0000-0000-00000000000a' and period_month = '2026-10-01';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('6a brand A thấy 1 dòng T10', (select count(*) from brand_affiliate_actuals) = 1
  and (select creator_name from brand_affiliate_actuals) = 'Khói');
select pg_temp.chk('6b brand A thấy tháng đã chốt', (select count(*) from brand_affiliate_plan_months) = 1);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.chk('6c brand B không thấy gì của brand A', (select count(*) from brand_affiliate_actuals where brand_id = 'b0000000-0000-0000-0000-00000000000a') = 0);

-- 7) SAU chốt ops vẫn sửa được, brand thấy ngay số mới (không có bước chốt lại)
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
update brand_affiliate_actuals set target_gmv = 800000000
  where brand_id = 'b0000000-0000-0000-0000-00000000000a' and creator_name = 'Khói' and period_month = '2026-10-01';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('7a sửa sau chốt: brand thấy 800tr', (select target_gmv from brand_affiliate_actuals) = 800000000);

-- 8) brand không ghi được gì
do $$ declare n int; begin
  update brand_affiliate_actuals set target_gmv = 1 where brand_id = 'b0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 8a brand sửa được dòng (% dòng)', n; end if;
  raise notice 'OK  8a brand không sửa được dòng';
  update brand_affiliate_plan_months set fx_rate = 1 where brand_id = 'b0000000-0000-0000-0000-00000000000a';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL 8b brand sửa được tháng (% dòng)', n; end if;
  raise notice 'OK  8b brand không sửa được trạng thái tháng';
end $$;

-- 9) Thu hồi ⇒ brand mất quyền xem
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
update brand_affiliate_plan_months set published_at = null where brand_id = 'b0000000-0000-0000-0000-00000000000a';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('9 thu hồi chốt ⇒ brand 0 dòng', (select count(*) from brand_affiliate_actuals) = 0);

-- 10) anon không đọc được
reset role;
set role anon;
do $$ begin
  begin perform 1 from brand_affiliate_plan_months limit 1; raise exception 'FAIL 10 anon đọc được';
  exception when insufficient_privilege then raise notice 'OK  10 anon bị chặn'; end;
end $$;
reset role;
