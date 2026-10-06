-- Kiểm migration 0149 (kênh brand × sàn là thực thể; dòng của kênh chưa tồn tại bị từ chối). Chạy trên bản REPLAY cả chuỗi
-- (README.md) SAU khi nạp 0149. Mỗi mục in "OK ..."; ERROR là hỏng. Trên replay chưa có 0149 thì đỏ ngay mục 1.
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
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 110);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000149', 'admin149@t') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000149', 'Admin', 'admin149@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000149', false);
-- dọn lần chạy hỏng trước (chạy lại được)
delete from live_sessions where brand_id::text like 'b149%';
delete from shift_slots where brand_id::text like 'b149%';
delete from brand_channels where brand_id::text like 'b149%';
delete from brands where id::text like 'b149%';
insert into brands (id, name) values ('b1490000-0000-0000-0000-00000000000a', 'ZZZ Kênh A'), ('b1490000-0000-0000-0000-00000000000b', 'ZZZ Kênh B');

-- 1) Chưa có kênh ⇒ không tạo được ca / ca mở / kế hoạch / hợp đồng / giá
select pg_temp.chk('1 có bảng brand_channels', to_regclass('public.brand_channels') is not null);
select pg_temp.must_fail('1a ca của kênh chưa có',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, status, platform)
     values ('x', 'b1490000-0000-0000-0000-00000000000a', 'ZZZ Kênh A', current_date + 3, '09:00', '12:00', 'Upcoming', 'TikTok')$q$,
  'chưa có kênh TikTok');
select pg_temp.must_fail('1b ca mở của kênh chưa có',
  $q$insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform)
     values (current_date + 3, '09:00', '12:00', 'b1490000-0000-0000-0000-00000000000a', 'ZZZ Kênh A', 'Shopee')$q$,
  'chưa có kênh Shopee');
select pg_temp.must_fail('1c kế hoạch tháng của kênh chưa có',
  $q$insert into brand_month_plans (brand_id, month, platform) values ('b1490000-0000-0000-0000-00000000000a', '2026-11-01', 'Shopee')$q$,
  'chưa có kênh Shopee');
select pg_temp.must_fail('1d giá của kênh chưa có',
  $q$insert into brand_platform_rates (brand_id, platform, rate_per_hour) values ('b1490000-0000-0000-0000-00000000000a', 'Shopee', 1)$q$,
  'chưa có kênh Shopee');

-- 2) Có kênh ⇒ ghi được; kênh khác sàn vẫn chặn
insert into brand_channels (brand_id, platform, shop_name) values ('b1490000-0000-0000-0000-00000000000a', 'TikTok', 'A Official');
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('d1490000-0000-0000-0000-000000000001', 'x', 'b1490000-0000-0000-0000-00000000000a', 'ZZZ Kênh A', current_date + 3, '09:00', '12:00', 'Upcoming', 'TikTok');
select pg_temp.chk('2a ca của kênh đã có ghi được', exists (select 1 from live_sessions where id = 'd1490000-0000-0000-0000-000000000001'));
select pg_temp.must_fail('2b đổi ca sang sàn chưa có kênh',
  $q$update live_sessions set platform = 'Shopee' where id = 'd1490000-0000-0000-0000-000000000001'$q$, 'chưa có kênh Shopee');
select pg_temp.must_fail('2c dời ca sang brand chưa có kênh',
  $q$update live_sessions set brand_id = 'b1490000-0000-0000-0000-00000000000b' where id = 'd1490000-0000-0000-0000-000000000001'$q$, 'ZZZ Kênh B chưa có kênh');
update live_sessions set title = 'y' where id = 'd1490000-0000-0000-0000-000000000001';
select pg_temp.chk('2d sửa cột khác của ca không bị trigger hỏi', (select title from live_sessions where id = 'd1490000-0000-0000-0000-000000000001') = 'y');

-- 3) Kênh không đổi danh tính, không xoá được (chỉ tạm dừng)
select pg_temp.must_fail('3a đổi sàn của kênh',
  $q$update brand_channels set platform = 'Shopee' where brand_id = 'b1490000-0000-0000-0000-00000000000a'$q$, 'Không đổi được brand hoặc sàn');
update brand_channels set status = 'paused', shop_ref = '7494' where brand_id = 'b1490000-0000-0000-0000-00000000000a';
select pg_temp.chk('3b tạm dừng + sửa mã shop được, updated_at đổi',
  (select status = 'paused' and shop_ref = '7494' and updated_at >= created_at from brand_channels where brand_id = 'b1490000-0000-0000-0000-00000000000a'));
select pg_temp.must_fail('3c sai giá trị sàn',
  $q$insert into brand_channels (brand_id, platform) values ('b1490000-0000-0000-0000-00000000000b', 'Lazada')$q$, 'check');

-- 4) Quyền: authenticated không xoá; brand chỉ thấy kênh của mình; talent không thấy
insert into brand_channels (brand_id, platform) values ('b1490000-0000-0000-0000-00000000000b', 'Shopee');
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-00000000014b', 'brand149@t') on conflict do nothing;
insert into profiles (id, name, email, role, assigned_brand_id) values ('a0000000-0000-0000-0000-00000000014b', 'Brand A', 'brand149@t', 'brand', 'b1490000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = 'brand', assigned_brand_id = excluded.assigned_brand_id;
set role authenticated;
select pg_temp.must_fail('4a authenticated không xoá kênh',
  $q$delete from brand_channels where brand_id = 'b1490000-0000-0000-0000-00000000000b'$q$, 'permission denied');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000014b', false);
select pg_temp.chk('4b brand chỉ thấy kênh của mình', (select count(*) from brand_channels where brand_id::text like 'b149%') = 1);
select pg_temp.must_fail('4c brand không tạo kênh',
  $q$insert into brand_channels (brand_id, platform) values ('b1490000-0000-0000-0000-00000000000a', 'Shopee')$q$, 'row-level security');
select set_config('request.jwt.claim.sub', '', false);
select pg_temp.chk('4d phiên không có profile thấy 0 kênh', (select count(*) from brand_channels) = 0);
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000149', false);

-- 5) Chạy lại migration: nạp kênh cho cặp (brand, sàn) đang có dòng mà chưa có kênh, không nhân đôi kênh cũ
alter table live_sessions disable trigger trg_guard_channel_exists;
insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('z', 'b1490000-0000-0000-0000-00000000000b', 'ZZZ Kênh B', current_date - 3, '09:00', '12:00', 'Completed', 'TikTok');
alter table live_sessions enable trigger trg_guard_channel_exists;
\ir ../migrations/0149_brand_channels.sql
select pg_temp.chk('5a chạy lại tạo kênh ZZZ Kênh B TikTok, started_on = ngày ca đầu',
  (select started_on = current_date - 3 from brand_channels where brand_id = 'b1490000-0000-0000-0000-00000000000b' and platform = 'TikTok'));
select pg_temp.chk('5b không nhân đôi kênh', (select count(*) from brand_channels where brand_id::text like 'b149%') = 3);

-- dọn
delete from live_sessions where brand_id::text like 'b149%';
delete from brand_channels where brand_id::text like 'b149%';
delete from brands where id::text like 'b149%';
select pg_temp.chk('xong', true);
