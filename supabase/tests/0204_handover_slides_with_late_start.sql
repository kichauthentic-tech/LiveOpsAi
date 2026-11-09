-- Kiểm migration 0204 (mốc giao ca trượt theo giờ vào trễ của chuỗi ca nối).
-- Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0204. Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0204 thì đỏ ngay mục A.
--
-- Ví dụ user chốt: ca 18–21 + 21–00, host 1 vào trễ 10' (18:10 → 21:10), host 2 21:10 → 00:10, mỗi ca đủ 3h.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.near(a numeric, b numeric, tol numeric default 0.6) returns boolean language sql as $$
  select abs(coalesce(a, -1e18) - b) < tol $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000e1', 'VERA') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000e1', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);


-- Mỗi ngày một room (d = số ngày trước hôm nay):
--   L1 d-10 : 18–21 + 21–24, host vào 18:10, file giao ca đúng lúc 21:10, ca sau file 00:10
--   L2 d-9  : như L1 nhưng trợ tải file ca 1 trễ lúc 21:28 (room còn live)
--   L3 d-8  : 18–21 + 21–24 đúng giờ, file 21:03 (trong dung sai)
--   L4 d-7  : vào trễ 10' nhưng tắt đúng 21:00 (không bù) — ca 21–24 mở room mới 21:00
--   L5 d-6  : 18–21 vào trễ 2h (kẹp 90')
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
select gen_random_uuid(), sc.room || ' ' || x, 'b0000000-0000-0000-0000-0000000000e1', 'VERA', current_date - sc.d,
       split_part(x, '-', 1)::time, split_part(x, '-', 2)::time, 'Completed', 'TikTok'
  from (values ('L1', 10), ('L2', 9), ('L3', 8), ('L4', 7), ('L5', 6)) as sc(room, d)
  cross join unnest(array['18:00-21:00', '21:00-00:00']) x
 where not (sc.room = 'L5' and x = '21:00-00:00');
create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000e1';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot like p_slot || '%' $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
create or replace function pg_temp.ls(p_room text, p_slot text) returns live_sessions language sql as $$ select * from live_sessions where id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.snap(p_room text, p_slot text) returns session_live_snapshots language sql as $$
  select * from session_live_snapshots where session_id = pg_temp.sid(p_room, p_slot) $$;
-- Dòng room như file TikTok (giờ bắt đầu / kết thúc tường minh).
create or replace function pg_temp.room(p_room text, p_s timestamptz, p_e timestamptz, p_gmv numeric) returns jsonb language sql as $$
  select jsonb_build_object('roomId', p_room, 'startedAt', p_s, 'endedAt', p_e,
    'gmv', p_gmv, 'orders', (p_gmv / 10000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (p_e - p_s)) / 60, 'raw', jsonb_build_object('picked', true))
$$;

-- ---------------------------------------------------------------- A) Ví dụ user: 18:10 → 21:10, 21:10 → 00:10
select apply_session_live_snapshot(pg_temp.sid('L1', '18:00'), 'l1a.xlsx', null,
  jsonb_build_array(pg_temp.room('L1', pg_temp.ts(10, '18:10'), pg_temp.ts(10, '21:10'), 9000000)));
select pg_temp.chk('A1 file giao ca 21:10 không bị cắt: ca 1 giữ trọn 9M, 180 phút',
  pg_temp.near((pg_temp.ls('L1', '18:00')).actual_gmv, 9000000) and pg_temp.near((pg_temp.ls('L1', '18:00')).live_duration_minutes, 180)
  and not (pg_temp.snap('L1', '18:00')).auto_split);
select pg_temp.chk('A2 mốc giao ca lưu = 21:10, giờ thực 18:10 → 21:10',
  (pg_temp.snap('L1', '18:00')).boundary_at = pg_temp.ts(10, '21:10')
  and (pg_temp.ls('L1', '18:00')).actual_start_at = pg_temp.ts(10, '18:10') and (pg_temp.ls('L1', '18:00')).actual_end_at = pg_temp.ts(10, '21:10'));
select apply_session_live_snapshot(pg_temp.sid('L1', '21:00'), 'l1b.xlsx', null,
  jsonb_build_array(pg_temp.room('L1', pg_temp.ts(10, '18:10'), pg_temp.ts(9, '00:10'), 18000000)));
select pg_temp.chk('A3 ca 2 nhận phần 21:10 → 00:10 = 9M, đủ 180 phút',
  pg_temp.near((pg_temp.ls('L1', '21:00')).actual_gmv, 9000000) and pg_temp.near((pg_temp.ls('L1', '21:00')).live_duration_minutes, 180));
select pg_temp.chk('A4 ca 2 trượt cùng ca 1: mốc 00:10, giờ thực kết thúc 00:10',
  (pg_temp.snap('L1', '21:00')).boundary_at = pg_temp.ts(9, '00:10') and (pg_temp.ls('L1', '21:00')).actual_end_at = pg_temp.ts(9, '00:10'));
select pg_temp.chk('A5 tổng hai ca = file cuối 18M', pg_temp.near((pg_temp.ls('L1', '18:00')).actual_gmv + (pg_temp.ls('L1', '21:00')).actual_gmv, 18000000));

-- ---------------------------------------------------------------- B) Tải trễ 21:28 (room còn live), vào trễ 10'
select apply_session_live_snapshot(pg_temp.sid('L2', '18:00'), 'l2a.xlsx', null,
  jsonb_build_array(pg_temp.room('L2', pg_temp.ts(9, '18:10'), pg_temp.ts(9, '21:28'), 9840000)));
select pg_temp.chk('B1 chia tạm tới 21:10: 9,84M × 180/198 ≈ 8,945M, 180 phút, tới 21:10',
  pg_temp.near((pg_temp.ls('L2', '18:00')).actual_gmv, 9840000 * 180 / 198.0, 2)
  and pg_temp.near((pg_temp.ls('L2', '18:00')).live_duration_minutes, 180)
  and (pg_temp.ls('L2', '18:00')).actual_end_at = pg_temp.ts(9, '21:10') and (pg_temp.snap('L2', '18:00')).auto_split);

-- ---------------------------------------------------------------- C) Đúng giờ: không đổi gì
select apply_session_live_snapshot(pg_temp.sid('L3', '18:00'), 'l3a.xlsx', null,
  jsonb_build_array(pg_temp.room('L3', pg_temp.ts(8, '18:00'), pg_temp.ts(8, '21:03'), 7000000)));
select pg_temp.chk('C1 vào đúng giờ, file 21:03: mốc 21:00, không chia, 7M',
  (pg_temp.snap('L3', '18:00')).boundary_at = pg_temp.ts(8, '21:00') and pg_temp.near((pg_temp.ls('L3', '18:00')).actual_gmv, 7000000)
  and not (pg_temp.snap('L3', '18:00')).auto_split);

-- ---------------------------------------------------------------- D) Vào trễ 10' không bù: tắt 21:00, ca sau mở room mới
select apply_session_live_snapshot(pg_temp.sid('L4', '18:00'), 'l4a.xlsx', null,
  jsonb_build_array(pg_temp.room('L4', pg_temp.ts(7, '18:10'), pg_temp.ts(7, '21:00'), 6000000)));
select pg_temp.chk('D1 không bù: ca 1 = 6M, 170 phút (thiếu giờ, không bị cắt thêm)',
  pg_temp.near((pg_temp.ls('L4', '18:00')).actual_gmv, 6000000) and pg_temp.near((pg_temp.ls('L4', '18:00')).live_duration_minutes, 170));
select apply_session_live_snapshot(pg_temp.sid('L4', '21:00'), 'l4b.xlsx', null,
  jsonb_build_array(pg_temp.room('L4', pg_temp.ts(7, '18:10'), pg_temp.ts(7, '21:00'), 6000000),
                    pg_temp.room('L4b', pg_temp.ts(7, '21:00'), pg_temp.ts(6, '00:00'), 8000000)));
select pg_temp.chk('D2 ca 2 chỉ nhận room mới 8M, 180 phút',
  pg_temp.near((pg_temp.ls('L4', '21:00')).actual_gmv, 8000000) and pg_temp.near((pg_temp.ls('L4', '21:00')).live_duration_minutes, 180));

-- ---------------------------------------------------------------- E) Trễ 2h ⇒ kẹp 90'
select apply_session_live_snapshot(pg_temp.sid('L5', '18:00'), 'l5a.xlsx', null,
  jsonb_build_array(pg_temp.room('L5', pg_temp.ts(6, '20:00'), pg_temp.ts(6, '21:30'), 3000000)));
select pg_temp.chk('E1 trễ 120 phút kẹp 90 phút: mốc = 21:00 + 90 phút = 22:30',
  (pg_temp.snap('L5', '18:00')).boundary_at = pg_temp.ts(6, '22:30'));

-- ---------------------------------------------------------------- F) Chạy lại migration không lỗi, không đổi số
\ir ../migrations/0204_handover_slides_with_late_start.sql
select pg_temp.chk('F1 chạy lại 0204: A vẫn nguyên',
  pg_temp.near((pg_temp.ls('L1', '18:00')).actual_gmv, 9000000) and pg_temp.near((pg_temp.ls('L1', '21:00')).actual_gmv, 9000000)
  and (pg_temp.snap('L1', '18:00')).boundary_at = pg_temp.ts(10, '21:10'));
