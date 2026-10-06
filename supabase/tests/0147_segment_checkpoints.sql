-- Kiểm migration 0147 (số lúc đổi host giữa ca). Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0147; thiếu 0147 thì đỏ ngay mục 0.
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

select pg_temp.chk('0 có hàm submit_segment_checkpoint', to_regprocedure('public.submit_segment_checkpoint(uuid,integer,text,numeric,integer,integer,integer)') is not null);

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'tro@t'),
  ('a0000000-0000-0000-0000-000000000003', 'khac@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Host A'),
  ('c0000000-0000-0000-0000-000000000002', 'Trợ'),
  ('c0000000-0000-0000-0000-000000000003', 'Host B'),
  ('c0000000-0000-0000-0000-000000000004', 'Người ngoài');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('a0000000-0000-0000-0000-000000000002', 'Tro', 'tro@t', 'talent', 'c0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000003', 'Khac', 'khac@t', 'talent', 'c0000000-0000-0000-0000-000000000004')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- ca Shopee 15:00-17:30: Host A 0-60, Host B 60-150, trợ cả ca
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, host_id, host_name, co_host_id, co_host_name, status)
values ('d0000000-0000-0000-0000-000000000001', 'VERA Shopee', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee',
        current_date + 5, '15:00', '17:30', 'c0000000-0000-0000-0000-000000000001', 'Host A', 'c0000000-0000-0000-0000-000000000002', 'Trợ', 'Upcoming');
select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000001', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'host', 'from_min', 60, 'to_min', 150)));

-- ============ 1) Trợ live (talent) nhập số lúc đổi host ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 8000000, 1000, null, 30);
select pg_temp.chk('1a có 1 số lúc đổi, phòng đọc đúng', count(*) = 1 and bool_and(live_ref = '41439111' and cum_gmv = 8000000 and base_gmv = 0))
  from session_segment_checkpoints where session_id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1b trợ thấy đủ đoạn host (không chỉ đoạn của mình)', count(*) = 2)
  from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001' and role = 'host';
select pg_temp.chk('1c trợ đọc được số lúc đổi', count(*) = 1) from session_segment_checkpoints;
select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 8500000, 1100, null, 35);
select pg_temp.chk('1d nhập lại = sửa, không thêm dòng', count(*) = 1 and bool_and(cum_gmv = 8500000)) from session_segment_checkpoints;

-- ============ 2) Từ chối ============
select pg_temp.must_fail('2a phút không phải chỗ đổi host',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 45, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 1, 1)$q$, 'không phải chỗ đổi host');
select pg_temp.must_fail('2b phút kết thúc ca (không còn host sau)',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 150, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 1, 1)$q$, 'không phải chỗ đổi host');
select pg_temp.must_fail('2c link sai sàn (TikTok cho ca Shopee)',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366', 1, 1)$q$, 'ca Shopee');
select pg_temp.must_fail('2d link không đọc được',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'abc', 1, 1)$q$, 'Link dashboard chưa đúng');
select pg_temp.must_fail('2e GMV âm',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', -1, 1)$q$, 'không được âm');

-- người ngoài ca không được nhập, không thấy
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.must_fail('2f người ngoài ca không nhập được',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 1, 1)$q$, 'Chỉ trợ live');
set role authenticated;
select pg_temp.chk('2g người ngoài ca không đọc được số lúc đổi', count(*) = 0) from session_segment_checkpoints;
select pg_temp.chk('2h người ngoài ca không đọc được đoạn của ca', count(*) = 0) from session_staff_segments where session_id = 'd0000000-0000-0000-0000-000000000001';
reset role;

-- ============ 3) Số tăng dần: số giao ca cuối chặn số lúc đổi vượt ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select submit_session_handover('d0000000-0000-0000-0000-000000000001', 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 10000000, 1300, null, 50);
select pg_temp.must_fail('3a số lúc đổi vượt số giao ca cuối',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 10000001, 1)$q$, 'lớn hơn số giao ca cuối');
select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000001', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 9000000, 1200, null, 40);
select pg_temp.chk('3b ghi lại ≤ số cuối được', cum_gmv = 9000000) from session_segment_checkpoints;

-- ============ 4) Sửa tên host ở "Đổi người giữa ca" không làm mất số (khoá theo phút) ============
select set_session_staff_segments('d0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000004', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'host', 'from_min', 60, 'to_min', 150)));
select pg_temp.chk('4a đổi người ở đoạn host vẫn giữ số lúc đổi', count(*) = 1 and bool_and(cum_gmv = 9000000)) from session_segment_checkpoints;

-- ============ 5) Ca nối: số nền = số ca trước cùng phòng ============
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, host_id, host_name, status)
values ('d0000000-0000-0000-0000-000000000002', 'VERA Shopee ca sau', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee',
        current_date + 5, '17:30', '19:30', 'c0000000-0000-0000-0000-000000000001', 'Host A', 'Upcoming');
select set_session_staff_segments('d0000000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000001', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'host', 'from_min', 60, 'to_min', 120)));
select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000002', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 12000000, 1500, null, 50);
select pg_temp.chk('5a số nền = số TỔNG ca trước đã giao (10tr)', base_gmv = 10000000 and base_views = 1300)
  from session_segment_checkpoints where session_id = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.must_fail('5b GMV nhỏ hơn số ca trước',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000002', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 9000000, 1)$q$, 'nhỏ hơn số ca trước');

-- ============ 6) Ca đã huỷ ============
update live_sessions set status = 'Cancelled' where id = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.must_fail('6a ca huỷ không nhập số',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000002', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 13000000, 1)$q$, 'đã huỷ');

-- ============ 7) Xoá ca kéo theo xoá số ============
delete from live_sessions where id = 'd0000000-0000-0000-0000-000000000002';
select pg_temp.chk('7a xoá ca xoá luôn số lúc đổi', count(*) = 0) from session_segment_checkpoints where session_id = 'd0000000-0000-0000-0000-000000000002';
