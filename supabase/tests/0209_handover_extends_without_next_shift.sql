-- Kiểm migration 0209 (ca KHÔNG có ca nối sau: mốc giao ca kéo theo giờ room tắt, tối đa +90').
-- Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0209. Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0209 thì đỏ ở mục A.
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
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000e9', 'FRANKLIN') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000e9', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Mỗi case một ngày (d = số ngày trước hôm nay), ca 20:00–22:00; H2 có thêm ca nối 22:00–00:00.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
select gen_random_uuid(), x.room || ' ' || x.slot, 'b0000000-0000-0000-0000-0000000000e9', 'FRANKLIN', current_date - x.d,
       split_part(x.slot, '-', 1)::time, split_part(x.slot, '-', 2)::time, 'Completed', 'TikTok'
  from (values ('H1', 30, '20:00-22:00'), ('H2', 29, '20:00-22:00'), ('H2', 29, '22:00-00:00'), ('H3', 28, '20:00-22:00'),
               ('H4', 27, '20:00-22:00'), ('H5', 26, '20:00-22:00'), ('H6', 25, '20:00-22:00'), ('H7', 24, '20:00-22:00')) as x(room, d, slot);
create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000e9';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot like p_slot || '%' $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
create or replace function pg_temp.ls(p_room text, p_slot text) returns live_sessions language sql as $$ select * from live_sessions where id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.snap(p_room text, p_slot text) returns session_live_snapshots language sql as $$
  select * from session_live_snapshots where session_id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.room(p_room text, p_s timestamptz, p_e timestamptz, p_gmv numeric) returns jsonb language sql as $$
  select jsonb_build_object('roomId', p_room, 'startedAt', p_s, 'endedAt', p_e,
    'gmv', p_gmv, 'orders', (p_gmv / 10000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (p_e - p_s)) / 60, 'raw', jsonb_build_object('picked', true))
$$;

-- ---------------------------------------------------------------- A) Không ca sau, room 20:03 → 22:33:52
select apply_session_live_snapshot(pg_temp.sid('H1', '20:00'), 'h1.xlsx', null,
  jsonb_build_array(pg_temp.room('HA', pg_temp.ts(30, '20:03'), pg_temp.ts(30, '22:33') + interval '52 seconds', 13515000)));
select pg_temp.chk('A1 mốc giao ca = giờ room tắt 22:33:52 (không còn 22:00)',
  (pg_temp.snap('H1', '20:00')).boundary_at = pg_temp.ts(30, '22:33') + interval '52 seconds');
select pg_temp.chk('A2 giờ live ≈ 150,9 phút và GMV 13,5M trọn (không bị cắt)',
  pg_temp.near((pg_temp.ls('H1', '20:00')).live_duration_minutes, 150.87, 0.1) and pg_temp.near((pg_temp.ls('H1', '20:00')).actual_gmv, 13515000));
select pg_temp.chk('A3 không chia tạm', not (pg_temp.snap('H1', '20:00')).auto_split);

-- ---------------------------------------------------------------- B) Có ca nối 22:00 ⇒ giữ mốc 22:00 như cũ
select apply_session_live_snapshot(pg_temp.sid('H2', '20:00'), 'h2.xlsx', null,
  jsonb_build_array(pg_temp.room('HB', pg_temp.ts(29, '20:00'), pg_temp.ts(29, '22:33'), 12000000)));
select pg_temp.chk('B1 có ca nối sau ⇒ mốc vẫn 22:00', (pg_temp.snap('H2', '20:00')).boundary_at = pg_temp.ts(29, '22:00'));

-- ---------------------------------------------------------------- C) Lố ≤ 5' ⇒ giữ 22:00
select apply_session_live_snapshot(pg_temp.sid('H3', '20:00'), 'h3.xlsx', null,
  jsonb_build_array(pg_temp.room('HC', pg_temp.ts(28, '20:00'), pg_temp.ts(28, '22:04'), 8000000)));
select pg_temp.chk('C1 room lố 4'' ⇒ mốc vẫn 22:00', (pg_temp.snap('H3', '20:00')).boundary_at = pg_temp.ts(28, '22:00'));

-- ---------------------------------------------------------------- D) Lố 3 giờ ⇒ kẹp +90'
select apply_session_live_snapshot(pg_temp.sid('H4', '20:00'), 'h4.xlsx', null,
  jsonb_build_array(pg_temp.room('HD', pg_temp.ts(27, '20:00'), pg_temp.ts(27, '22:00') + interval '3 hours', 20000000)));
select pg_temp.chk('D1 kẹp tối đa 23:30', (pg_temp.snap('H4', '20:00')).boundary_at = pg_temp.ts(27, '23:30'));

-- ---------------------------------------------------------------- E) Còn room chưa tắt ⇒ không kéo
select apply_session_live_snapshot(pg_temp.sid('H5', '20:00'), 'h5.xlsx', null,
  jsonb_build_array(pg_temp.room('HE', pg_temp.ts(26, '20:00'), null, 5000000)));
select pg_temp.chk('E1 room chưa tắt ⇒ mốc vẫn 22:00', (pg_temp.snap('H5', '20:00')).boundary_at = pg_temp.ts(26, '22:00'));

-- ---------------------------------------------------------------- F) Đã gõ GMV KHÁC số file ⇒ giữ mốc kế hoạch
select apply_session_live_snapshot(pg_temp.sid('H6', '20:00'), 'h6.xlsx', null,
  jsonb_build_array(pg_temp.room('HF', pg_temp.ts(25, '20:00'), pg_temp.ts(25, '22:40'), 10000000)));
update session_live_snapshots set typed_gmv = 7000000 where session_id = pg_temp.sid('H6', '20:00');
select pg_temp.chk('F1 gõ GMV khác số file ⇒ hàm trả mốc kế hoạch 22:00', private.session_flex_boundary_at(pg_temp.sid('H6', '20:00')) = pg_temp.ts(25, '22:00'));
update session_live_snapshots set typed_gmv = 10000000 where session_id = pg_temp.sid('H6', '20:00');
select pg_temp.chk('F2 gõ GMV bằng số file ⇒ vẫn kéo tới 22:40', private.session_flex_boundary_at(pg_temp.sid('H6', '20:00')) = pg_temp.ts(25, '22:40'));

-- ---------------------------------------------------------------- G) Ca cũ bị cắt (đã gõ GMV = số file) ⇒ chạy lại 0209 sửa lại
select apply_session_live_snapshot(pg_temp.sid('H7', '20:00'), 'h7.xlsx', null,
  jsonb_build_array(pg_temp.room('HG', pg_temp.ts(24, '20:03'), pg_temp.ts(24, '22:33') + interval '52 seconds', 13515000)));
-- Dựng lại trạng thái trước 0209 (ca Franklin 09/11): mốc 22:00, số gõ = số file, thời lượng cắt về 117'.
update session_live_snapshot_rows r set
  raw = r.raw || jsonb_build_object('orig', jsonb_build_object('gmv', r.gmv, 'items_sold', r.items_sold, 'orders', r.orders, 'sku_orders', r.sku_orders,
    'views', r.views, 'impressions', r.impressions, 'product_impressions', r.product_impressions, 'product_clicks', r.product_clicks,
    'new_followers', r.new_followers, 'comments', r.comments, 'shares', r.shares, 'likes', r.likes,
    'duration_minutes', r.duration_minutes, 'watch_seconds', r.watch_seconds)),
  duration_minutes = 117
 where r.snapshot_id = (pg_temp.snap('H7', '20:00')).id;
update session_live_snapshots set boundary_at = pg_temp.ts(24, '22:00'), typed_gmv = 13515000, typed_by = null, typed_at = now()
 where session_id = pg_temp.sid('H7', '20:00');
update live_sessions set live_duration_minutes = 117 where id = pg_temp.sid('H7', '20:00');
select pg_temp.chk('G0 dựng trạng thái cũ: 117''', (pg_temp.ls('H7', '20:00')).live_duration_minutes = 117);
\ir ../migrations/0209_handover_extends_without_next_shift.sql
select pg_temp.chk('G1 sau 0209: mốc 22:33:52', (pg_temp.snap('H7', '20:00')).boundary_at = pg_temp.ts(24, '22:33') + interval '52 seconds');
select pg_temp.chk('G2 sau 0209: thời lượng 150,9 phút, GMV 13,5M, số gõ đã bỏ',
  pg_temp.near((pg_temp.ls('H7', '20:00')).live_duration_minutes, 150.87, 0.1) and pg_temp.near((pg_temp.ls('H7', '20:00')).actual_gmv, 13515000)
  and (pg_temp.snap('H7', '20:00')).typed_gmv is null);
select pg_temp.chk('G3 chạy lại không đổi', (select count(*) from session_live_snapshots s join live_sessions l on l.id = s.session_id
  where l.brand_id = 'b0000000-0000-0000-0000-0000000000e9' and s.boundary_at is distinct from private.session_flex_boundary_at(s.session_id)) = 0);
