-- Kiểm migration 0144 (giao ca). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0144.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay CHƯA có 0144 thì phải đỏ ngay mục 1.
-- Tình huống thật: phiên VERA Shopee 26/09 mã 41439111 chạy 18:00–00:30 qua ba ca (18–20, 20–21, 21–00:30);
-- Sheet ghi ca đầu 4.267.859 (ATC 228, 5.883 lượt xem), file Shopee chốt cả phiên 12.322.359.
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

create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'giang@t'),
  ('a0000000-0000-0000-0000-000000000003', 'thao@t'),
  ('a0000000-0000-0000-0000-000000000004', 'ceo@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Trà Giang'),
  ('c0000000-0000-0000-0000-000000000002', 'Thảo'),
  ('c0000000-0000-0000-0000-000000000003', 'Diễm My');
insert into profiles (id, name, email, role, status) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin', 'Active'),
  ('a0000000-0000-0000-0000-000000000004', 'CEO', 'ceo@t', 'ceo', 'Active')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, status, assigned_talent_id) values
  ('a0000000-0000-0000-0000-000000000002', 'Giang', 'giang@t', 'talent', 'Active', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'Thảo', 'thao@t', 'talent', 'Active', 'c0000000-0000-0000-0000-000000000002')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');

-- Ba ca nối ngày +5 (sắp tới) + 1 ca TikTok ngày −3 (đã qua)
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, co_host_id, status, platform) values
  ('d0000000-0000-0000-0000-000000000001', 'VERA S 1', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 5, '18:00', '20:00', 'c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'Shopee'),
  ('d0000000-0000-0000-0000-000000000002', 'VERA S 2', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 5, '20:00', '21:00', null, 'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'Shopee'),
  ('d0000000-0000-0000-0000-000000000003', 'VERA S 3', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date + 5, '21:00', '00:30', 'c0000000-0000-0000-0000-000000000003', null, 'Upcoming', 'Shopee'),
  ('d0000000-0000-0000-0000-000000000004', 'VERA T', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date - 3, '10:00', '13:00', null, 'c0000000-0000-0000-0000-000000000001', 'Completed', 'TikTok');

-- ============ 1) Nhắc giao ca hẹn giờ ============
select pg_temp.chk('1a ca có trợ: nhắc đúng trợ, đúng lúc hết ca + 15 phút (giờ VN)',
  count(*) = 1 and min(created_at) = ((current_date + 5) + time '20:15') at time zone 'Asia/Ho_Chi_Minh')
  from notifications where session_id = 'd0000000-0000-0000-0000-000000000001' and kind = 'handover_due'
   and user_id = 'a0000000-0000-0000-0000-000000000002';
select pg_temp.chk('1b ca không trợ: nhắc OPS/admin, không nhắc CEO; ca qua đêm hẹn sang hôm sau 00:45',
  count(*) = 1 and bool_and(user_id = 'a0000000-0000-0000-0000-000000000001')
  and min(created_at) = ((current_date + 6) + time '00:45') at time zone 'Asia/Ho_Chi_Minh')
  from notifications where session_id = 'd0000000-0000-0000-0000-000000000003' and kind = 'handover_due';
select pg_temp.chk('1c ca đã qua không nhắc lùi', count(*) = 0)
  from notifications where session_id = 'd0000000-0000-0000-0000-000000000004' and kind = 'handover_due';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
select mark_notifications_read(null);
select pg_temp.chk('1d "đọc hết" không nuốt lời nhắc chưa đến hạn', read_at is null)
  from notifications where session_id = 'd0000000-0000-0000-0000-000000000001' and kind = 'handover_due';
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000004';
update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000002', start_time = '17:00' where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1e đổi trợ: lời nhắc chuyển sang người mới',
  count(*) = 1 and bool_and(user_id = 'a0000000-0000-0000-0000-000000000003'))
  from notifications where session_id = 'd0000000-0000-0000-0000-000000000001' and kind = 'handover_due';
update live_sessions set co_host_id = 'c0000000-0000-0000-0000-000000000001', start_time = '18:00' where id = 'd0000000-0000-0000-0000-000000000001';

-- ============ 2) Quyền + link ============
select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');  -- Trà Giang, trợ ca 1
select pg_temp.must_fail('2a trợ ca khác không giao hộ được',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000002', 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 5000000, 6000, null, 300)$q$, 'Chỉ trợ live');
select pg_temp.must_fail('2b link TikTok cho ca Shopee',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000001', 'https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366', 4267859, 5883, null, 228)$q$, 'ca Shopee');
select pg_temp.must_fail('2c link không đọc được',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000001', 'TikTok Ecommerce Live Data Screen', 4267859, 5883, null, 228)$q$, 'Link dashboard chưa đúng');

-- ============ 3) Giao ca + ca nối ============
select count(*) from submit_session_handover('d0000000-0000-0000-0000-000000000001',
  'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 4267859, 5883, null, 228, null, 15, 0, 0, false, 'ổn');
select pg_temp.chk('3a ca đầu: số của ca = số cộng dồn', actual_gmv = 4267859 and total_views = 5883 and data_source = 'manual')
  from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('3b report ghi người giao, OT, ATC, mã phiên; lời nhắc bị xoá',
  r.live_ref = '41439111' and r.atc_count = 228 and r.ot_minutes = 15 and r.submitted_by_talent_id = 'c0000000-0000-0000-0000-000000000001'
  and r.handover_at is not null
  and not exists (select 1 from notifications n where n.session_id = r.session_id and n.kind = 'handover_due'))
  from live_session_reports r where r.session_id = 'd0000000-0000-0000-0000-000000000001';

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');  -- OPS giao ca 3 (không có trợ), ca 2 chưa giao
select pg_temp.chk('3c màn giao ca thấy ca trước cùng phòng',
  session_id = 'd0000000-0000-0000-0000-000000000001' and cum_gmv = 4267859)
  from handover_previous('d0000000-0000-0000-0000-000000000003', 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111');
select count(*) from submit_session_handover('d0000000-0000-0000-0000-000000000003',
  'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 12322359, 15000, null, 600);
select pg_temp.chk('3d ca 3 = 12.322.359 − 4.267.859 (ca 2 chưa giao)', actual_gmv = 8054500 and total_views = 15000 - 5883)
  from live_sessions where id = 'd0000000-0000-0000-0000-000000000003';
select pg_temp.must_fail('3e số cộng dồn nhỏ hơn ca trước',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000002', 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 4000000, 7000, null, 300)$q$, 'nhỏ hơn số ca trước');
select pg_temp.must_fail('3f số cộng dồn lớn hơn ca sau',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000002', 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 13000000, 7000, null, 300)$q$, 'lớn hơn số ca sau');
select count(*) from submit_session_handover('d0000000-0000-0000-0000-000000000002',
  'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 6000000, 9000, null, 400);
select pg_temp.chk('3g giao ca giữa ⇒ ca 2 và ca 3 tính lại',
  (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000002') = 1732141
  and (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000003') = 6322359
  and (select atc_count from live_session_reports where session_id = 'd0000000-0000-0000-0000-000000000003') = 200
  and (select handover_prev_session_id from live_session_reports where session_id = 'd0000000-0000-0000-0000-000000000003') = 'd0000000-0000-0000-0000-000000000002');
select pg_temp.chk('3h tổng 3 ca = số cộng dồn cuối', sum(actual_gmv) = 12322359)
  from live_sessions where id in ('d0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000003');

-- Sửa ca 2 sang phòng khác ⇒ ca 3 lại nối thẳng ca 1.
select count(*) from submit_session_handover('d0000000-0000-0000-0000-000000000002',
  'https://banhang.shopee.vn/creator-center/dashboard/live/99999999', 1732141, 3000, null, 100);
select pg_temp.chk('3i đổi link ca giữa ⇒ chuỗi cũ tính lại (ca 3 = 12.322.359 − 4.267.859)',
  (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000003') = 8054500
  and (select handover_prev_session_id from live_session_reports where session_id = 'd0000000-0000-0000-0000-000000000003') = 'd0000000-0000-0000-0000-000000000001');

-- ============ 4) Không đè số đã đối soát; TikTok cần đơn ============
update live_sessions set actual_gmv = 30000000, data_source = 'tiktok_reconciled' where id = 'd0000000-0000-0000-0000-000000000004';
select pg_temp.must_fail('4a ca TikTok thiếu số đơn',
  $q$select submit_session_handover('d0000000-0000-0000-0000-000000000004', 'https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366', 25000000, 40000)$q$, 'cần số đơn');
select count(*) from submit_session_handover('d0000000-0000-0000-0000-000000000004',
  'https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366', 25000000, 40000, 120);
select pg_temp.chk('4b ca đã đối soát giữ số file, vẫn ghi nhận giao ca',
  s.actual_gmv = 30000000 and s.data_source = 'tiktok_reconciled' and r.handover_at is not null and r.cum_orders = 120)
  from live_sessions s join live_session_reports r on r.session_id = s.id where s.id = 'd0000000-0000-0000-0000-000000000004';

-- ============ 5) Phiên vô danh không gọi được ============
select pg_temp.chk('5a anon không có quyền EXECUTE',
  not has_function_privilege('anon', 'submit_session_handover(uuid, text, numeric, int, int, int, numeric, int, int, int, boolean, text)', 'execute')
  and not has_function_privilege('anon', 'handover_previous(uuid, text)', 'execute'));
