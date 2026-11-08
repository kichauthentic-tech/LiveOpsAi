-- Kiểm migration 0203 (file giao ca tải trễ, room còn live sang ca nối ⇒ cắt giờ về mốc giao ca + chia tạm số theo giờ).
-- Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0203. Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0203 thì đỏ ngay mục A.
--
-- Ca thật (VERA TikTok 08/11): ca 18–20, room bật 18:00, trợ tải file lúc 21:27 (6,73M, 207') — ca 20–23 nối tiếp.
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

-- Mỗi ngày một room:
--   d-10 V1 : 18–20 + 20–23 liền nhau (ca thật)          d-9 V2 : chỉ ca 18–20, không ca sau
--   d-8  V3 : 18–20 + 20–23, file tải đúng giờ (20:02)   d-7 V4 : 18–20 + 20:30–23 (cách 30') ⇒ chỉ chia khi nối room tay
create temp table sc(room text, d int, slots text[]);
insert into sc values
  ('V1', 10, array['18:00-20:00', '20:00-23:00']), ('V2', 9, array['18:00-20:00']),
  ('V3', 8, array['18:00-20:00', '20:00-23:00']), ('V4', 7, array['18:00-20:00', '20:30-23:00']);
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
select gen_random_uuid(), sc.room || ' ' || split_part(x, '-', 1), 'b0000000-0000-0000-0000-0000000000e1', 'VERA', current_date - sc.d,
       split_part(x, '-', 1)::time, split_part(x, '-', 2)::time, 'Completed', 'TikTok'
  from sc cross join unnest(sc.slots) x;
create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000e1';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot = p_slot $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
create or replace function pg_temp.ls(p_room text, p_slot text) returns live_sessions language sql as $$ select * from live_sessions where id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.snap(p_room text, p_slot text) returns session_live_snapshots language sql as $$
  select * from session_live_snapshots where session_id = pg_temp.sid(p_room, p_slot) $$;
-- Dòng room như file TikTok: room còn live lúc tải ⇒ giờ kết thúc = giờ tải, thời lượng = tới giờ tải.
create or replace function pg_temp.room(p_room text, p_d int, p_start text, p_end text, p_gmv numeric) returns jsonb language sql as $$
  select jsonb_build_object('roomId', p_room, 'startedAt', pg_temp.ts(p_d, p_start), 'endedAt', pg_temp.ts(p_d, p_end),
    'gmv', p_gmv, 'orders', (p_gmv / 10000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (pg_temp.ts(p_d, p_end) - pg_temp.ts(p_d, p_start))) / 60, 'raw', jsonb_build_object('picked', true))
$$;

-- ---------------------------------------------------------------- A) Ca thật: tải 21:27, có ca nối 20:00
select apply_session_live_snapshot(pg_temp.sid('V1', '18:00'), 'ca1.xlsx', null,
  jsonb_build_array(pg_temp.room('V1', 10, '18:00', '21:27', 6732651)));
select pg_temp.chk('A1 chia tạm: GMV = 6.732.651 × 120/207 ≈ 3.902.986',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv, 6732651 * 120 / 207.0, 2));
select pg_temp.chk('A2 thời lượng 120 phút, giờ thực 18:00 → 20:00',
  pg_temp.near((pg_temp.ls('V1', '18:00')).live_duration_minutes, 120)
  and (pg_temp.ls('V1', '18:00')).actual_end_at = pg_temp.ts(10, '20:00')
  and (pg_temp.ls('V1', '18:00')).actual_start_at = pg_temp.ts(10, '18:00'));
select pg_temp.chk('A3 đơn + lượt xem cùng tỷ lệ (673 → 390, 6.733 → 3.903)',
  (pg_temp.ls('V1', '18:00')).total_orders = 390 and (pg_temp.ls('V1', '18:00')).total_views = 3903);
select pg_temp.chk('A4 cờ auto_split, không phải số gõ, số gốc giữ ở raw.orig',
  (pg_temp.snap('V1', '18:00')).auto_split and (pg_temp.snap('V1', '18:00')).typed_gmv is null
  and (select (r.raw->'orig'->>'gmv')::numeric = 6732651 from session_live_snapshot_rows r where r.snapshot_id = (pg_temp.snap('V1', '18:00')).id));

-- ---------------------------------------------------------------- B) Ca sau up file: nhận phần 20:00 → 21:27
select apply_session_live_snapshot(pg_temp.sid('V1', '20:00'), 'ca2.xlsx', null,
  jsonb_build_array(pg_temp.room('V1', 10, '18:00', '23:05', 15000000)));
select pg_temp.chk('B1 ca sau = 15M − 3,90M ≈ 11,10M; thời lượng 305 − 120 = 185',
  pg_temp.near((pg_temp.ls('V1', '20:00')).actual_gmv, 15000000 - 6732651 * 120 / 207.0, 2)
  and pg_temp.near((pg_temp.ls('V1', '20:00')).live_duration_minutes, 185));
select pg_temp.chk('B2 ca cuối ngày không có ca sau ⇒ không chia (giữ tới 23:05)',
  not (pg_temp.snap('V1', '20:00')).auto_split and (pg_temp.ls('V1', '20:00')).actual_end_at = pg_temp.ts(10, '23:05'));
select pg_temp.chk('B3 tổng hai ca = số file cuối (15M)',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv + (pg_temp.ls('V1', '20:00')).actual_gmv, 15000000));

-- ---------------------------------------------------------------- C) Gõ GMV đúng rồi bỏ số gõ
select set_session_snapshot_gmv(pg_temp.sid('V1', '18:00'), 4500000);
select pg_temp.chk('C1 gõ 4,5M: ca 1 = 4,5M, ca sau = 10,5M, cờ chia tạm tắt',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv, 4500000) and pg_temp.near((pg_temp.ls('V1', '20:00')).actual_gmv, 10500000)
  and not (pg_temp.snap('V1', '18:00')).auto_split and (pg_temp.snap('V1', '18:00')).typed_gmv = 4500000);
select pg_temp.chk('C2 gõ xong giờ thực vẫn kẹp 20:00 (trước 0203: 21:27)',
  (pg_temp.ls('V1', '18:00')).actual_end_at = pg_temp.ts(10, '20:00'));
select pg_temp.chk('C3 raw.orig vẫn là số FILE (không phải số chia tạm)',
  (select (r.raw->'orig'->>'gmv')::numeric = 6732651 from session_live_snapshot_rows r where r.snapshot_id = (pg_temp.snap('V1', '18:00')).id));
select set_session_snapshot_gmv(pg_temp.sid('V1', '18:00'), null);
select pg_temp.chk('C4 bỏ số gõ ⇒ về số chia tạm (≈3,90M), ca sau ≈11,10M',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv, 6732651 * 120 / 207.0, 2)
  and pg_temp.near((pg_temp.ls('V1', '20:00')).actual_gmv, 15000000 - 6732651 * 120 / 207.0, 2)
  and (pg_temp.snap('V1', '18:00')).auto_split);

-- ---------------------------------------------------------------- D) Up lại file ca 1 (tải lại lúc 21:40)
select apply_session_live_snapshot(pg_temp.sid('V1', '18:00'), 'ca1b.xlsx', null,
  jsonb_build_array(pg_temp.room('V1', 10, '18:00', '21:40', 7000000)));
select pg_temp.chk('D1 up lại: chia lại từ file mới 7M × 120/220; ca sau tự tính lại',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv, 7000000 * 120 / 220.0, 2)
  and pg_temp.near((pg_temp.ls('V1', '20:00')).actual_gmv, 15000000 - 7000000 * 120 / 220.0, 2));

-- ---------------------------------------------------------------- E) Không có ca sau / tải đúng giờ
select apply_session_live_snapshot(pg_temp.sid('V2', '18:00'), 'v2.xlsx', null,
  jsonb_build_array(pg_temp.room('V2', 9, '18:00', '21:00', 9000000)));
select pg_temp.chk('E1 không có ca sau (có thể tăng ca) ⇒ giữ số file 9M, 180 phút, tới 21:00',
  pg_temp.near((pg_temp.ls('V2', '18:00')).actual_gmv, 9000000) and pg_temp.near((pg_temp.ls('V2', '18:00')).live_duration_minutes, 180)
  and (pg_temp.ls('V2', '18:00')).actual_end_at = pg_temp.ts(9, '21:00') and not (pg_temp.snap('V2', '18:00')).auto_split);

select apply_session_live_snapshot(pg_temp.sid('V3', '18:00'), 'v3.xlsx', null,
  jsonb_build_array(pg_temp.room('V3', 8, '18:00', '20:02', 5000000)));
select pg_temp.chk('E2 tải 20:02 (trong dung sai 5'') ⇒ không chia, 5M',
  pg_temp.near((pg_temp.ls('V3', '18:00')).actual_gmv, 5000000) and not (pg_temp.snap('V3', '18:00')).auto_split);

-- ---------------------------------------------------------------- F) Ca sau cách 30': chỉ chia khi nối room tay
select apply_session_live_snapshot(pg_temp.sid('V4', '18:00'), 'v4.xlsx', null,
  jsonb_build_array(pg_temp.room('V4', 7, '18:00', '21:00', 6000000)));
select pg_temp.chk('F1 chưa nối: giữ 6M',
  pg_temp.near((pg_temp.ls('V4', '18:00')).actual_gmv, 6000000) and not (pg_temp.snap('V4', '18:00')).auto_split);
select link_session_room(pg_temp.sid('V4', '18:00'), pg_temp.sid('V4', '20:30'));
select pg_temp.chk('F2 nối room ⇒ chia tạm 6M × 120/180 = 4M, giờ thực tới 20:00',
  pg_temp.near((pg_temp.ls('V4', '18:00')).actual_gmv, 4000000) and (pg_temp.ls('V4', '18:00')).actual_end_at = pg_temp.ts(7, '20:00'));
select unlink_session_room(pg_temp.sid('V4', '18:00'));
select pg_temp.chk('F3 gỡ nối ⇒ về số file 6M, tới 21:00',
  pg_temp.near((pg_temp.ls('V4', '18:00')).actual_gmv, 6000000) and (pg_temp.ls('V4', '18:00')).actual_end_at = pg_temp.ts(7, '21:00')
  and not (pg_temp.snap('V4', '18:00')).auto_split);

-- ---------------------------------------------------------------- G) Ca đã đối soát: snapshot không đè số
update live_sessions set data_source = 'tiktok_reconciled', actual_gmv = 1234 where id = pg_temp.sid('V2', '18:00');
update live_sessions set status = 'Completed' where id = pg_temp.sid('V2', '18:00');
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values (gen_random_uuid(), 'V2 20:00', 'b0000000-0000-0000-0000-0000000000e1', 'VERA', current_date - 9, '20:00', '23:00', 'Upcoming', 'TikTok');
select set_session_snapshot_gmv(pg_temp.sid('V2', '18:00'), null);
select pg_temp.chk('G1 ca đã đối soát giữ số đối soát dù snapshot được chia lại',
  pg_temp.near((pg_temp.ls('V2', '18:00')).actual_gmv, 1234));

-- ---------------------------------------------------------------- H) Chạy lại migration không lỗi, không đổi số
\ir ../migrations/0203_snapshot_late_upload_split.sql
select pg_temp.chk('H1 chạy lại 0203: ca V1 vẫn ≈ 7M × 120/220',
  pg_temp.near((pg_temp.ls('V1', '18:00')).actual_gmv, 7000000 * 120 / 220.0, 2));
