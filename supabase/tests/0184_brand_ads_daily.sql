-- Kiểm migration 0184 (Ads theo ngày dán từ file tracking). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0184.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0183 thì đỏ ở mục 1 (chưa có bảng brand_ads_daily).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

create or replace function pg_temp.must_fail(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'FAIL % : lỗi khác mong đợi: %', label, sqlerrm; end if;
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 90);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('request.jwt.claim.role', 'authenticated', false)
$$;

insert into auth.users (id, email) values
  ('a1840000-0000-0000-0000-000000000001', 'ops@t'),
  ('a1840000-0000-0000-0000-000000000002', 'crocs@t'),
  ('a1840000-0000-0000-0000-000000000003', 'norole@t')
on conflict do nothing;
insert into brands (id, name) values ('b1840000-0000-0000-0000-00000000000a', 'CROCS'), ('b1840000-0000-0000-0000-00000000000b', 'VERA');
insert into brand_channels (brand_id, platform) values ('b1840000-0000-0000-0000-00000000000a', 'TikTok'), ('b1840000-0000-0000-0000-00000000000b', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a1840000-0000-0000-0000-000000000001', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_brand_id) values ('a1840000-0000-0000-0000-000000000002', 'Crocs', 'crocs@t', 'brand', 'b1840000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;
-- T9 TikTok đã phát hành, T10 chưa.
insert into brand_monthly_reports (brand_id, period_month, status, platform) values
  ('b1840000-0000-0000-0000-00000000000a', '2026-09-01', 'published', 'TikTok'),
  ('b1840000-0000-0000-0000-00000000000a', '2026-10-01', 'draft', 'TikTok');

-- ============ 1) Ops ghi + upsert ghi đè ============
set role authenticated;
select pg_temp.as_user('a1840000-0000-0000-0000-000000000001');
insert into brand_ads_daily (brand_id, platform, date, target_total, target_live, actual_total, actual_live, note) values
  ('b1840000-0000-0000-0000-00000000000a', 'TikTok', '2026-09-30', 2300000, 2000000, 2620000, 2450000, null),
  ('b1840000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-25', 31000000, 25000000, 32748957, 26918576, null),
  ('b1840000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-26', 1950000, 1500000, null, null, null),
  ('b1840000-0000-0000-0000-00000000000b', 'TikTok', '2026-09-30', 1000000, 1000000, 900000, 900000, null);
insert into brand_ads_daily (brand_id, platform, date, target_total, actual_total, note) values
  ('b1840000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-26', 1950000, 1800000, 'dán lại')
  on conflict (brand_id, platform, date) do update set actual_total = excluded.actual_total, note = excluded.note;
select pg_temp.chk('1a ops ghi 4 dòng, dán lại cùng ngày = ghi đè', (select count(*) from brand_ads_daily where brand_id::text like 'b184%') = 4
  and (select actual_total from brand_ads_daily where date = '2026-10-26' and brand_id = 'b1840000-0000-0000-0000-00000000000a') = 1800000);
select pg_temp.chk('1b updated_by = người ghi', (select bool_and(updated_by = 'a1840000-0000-0000-0000-000000000001') from brand_ads_daily where brand_id::text like 'b184%'));
select pg_temp.must_fail('1c số âm bị chặn',
  $$insert into brand_ads_daily (brand_id, date, target_total) values ('b1840000-0000-0000-0000-00000000000a', '2026-10-01', -1)$$, 'check');
select pg_temp.must_fail('1d sàn lạ bị chặn',
  $$insert into brand_ads_daily (brand_id, platform, date) values ('b1840000-0000-0000-0000-00000000000a', 'Lazada', '2026-10-01')$$, 'check');

-- ============ 2) Brand: chỉ đọc tháng đã phát hành của chính mình, không ghi ============
select pg_temp.as_user('a1840000-0000-0000-0000-000000000002');
select pg_temp.chk('2a brand thấy đúng 1 dòng: T9 của mình (T10 chưa phát hành, VERA không phải của mình)',
  (select count(*) from brand_ads_daily) = 1 and (select date from brand_ads_daily) = '2026-09-30');
update brand_ads_daily set actual_total = 1 where brand_id = 'b1840000-0000-0000-0000-00000000000a';
select pg_temp.chk('2b brand sửa không được dòng nào', (select count(*) from brand_ads_daily where actual_total = 1) = 0);
select pg_temp.must_fail('2c brand thêm dòng bị chặn',
  $$insert into brand_ads_daily (brand_id, date, target_total) values ('b1840000-0000-0000-0000-00000000000a', '2026-09-29', 1)$$, 'row-level security');

-- ============ 3) Đăng nhập mà không có dòng profiles (role NULL) ⇒ không thấy gì ============
select pg_temp.as_user('a1840000-0000-0000-0000-000000000003');
select pg_temp.chk('3a role NULL đọc 0 dòng', (select count(*) from brand_ads_daily) = 0);

-- ============ 4) Thu hồi report ⇒ brand hết thấy ============
reset role;
update brand_monthly_reports set status = 'draft' where brand_id = 'b1840000-0000-0000-0000-00000000000a' and period_month = '2026-09-01';
set role authenticated;
select pg_temp.as_user('a1840000-0000-0000-0000-000000000002');
select pg_temp.chk('4a thu hồi T9 ⇒ brand đọc 0 dòng', (select count(*) from brand_ads_daily) = 0);

-- ============ 5) anon không có quyền ============
reset role;
set role anon;
select pg_temp.must_fail('5a anon đọc bị chặn', $$select count(*) from brand_ads_daily$$, 'permission denied');
reset role;
