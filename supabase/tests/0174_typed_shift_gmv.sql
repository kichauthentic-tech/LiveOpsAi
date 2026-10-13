-- Kiểm migration 0174 (gõ GMV đúng của ca lúc up snapshot + ở Đối soát; chỉ số khác theo % GMV). Chạy trên bản REPLAY cả chuỗi
-- SAU khi nạp 0174. Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0174 thì đỏ ngay mục A.
--
-- Ví dụ của user (13/10): ca 09–12 đúng 10M nhưng file tải lúc 13:00 (ca sau đã live 1 giờ) ra 12M ⇒ trợ gõ 10M.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.near(a numeric, b numeric) returns boolean language sql as $$ select abs(coalesce(a, -1e18) - b) < 0.6 $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000c1', 'CROCS') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000c1', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Mỗi ngày một room, ba ca 09–12 / 12–15 / 15–18:
--   d-20 R1 : room 09:00 chạy cả ngày — ví dụ 10M/12M của user        d-19 R2 : không snapshot (đối soát gõ tay)
--   d-18 R3 : ca 1 có 2 room — Rx tắt 10:30 (5M), Ry 10:35 còn live lúc tải 13:00 (9M cộng dồn)
--   d-17 R4 : ca 1 chỉ có snapshot ƯỚC LƯỢNG (20M), ca 2 thật (25M)
create temp table sc(room text, d int);
insert into sc values ('R1', 20), ('R2', 19), ('R3', 18), ('R4', 17);
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status)
select gen_random_uuid(), sc.room || ' ' || h.s, 'b0000000-0000-0000-0000-0000000000c1', 'CROCS', current_date - sc.d, h.s::time, h.e::time, 'Completed'
  from sc cross join (values ('09:00', '12:00'), ('12:00', '15:00'), ('15:00', '18:00')) h(s, e);
create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000c1';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot = p_slot $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
create or replace function pg_temp.ls(p_room text, p_slot text) returns live_sessions language sql as $$ select * from live_sessions where id = pg_temp.sid(p_room, p_slot) $$;

-- Một dòng room như file TikTok: room còn live lúc tải ⇒ giờ kết thúc = giờ tải, thời lượng = tới giờ tải.
create or replace function pg_temp.room(p_room text, p_d int, p_start text, p_end text, p_gmv numeric) returns jsonb language sql as $$
  select jsonb_build_object('roomId', p_room, 'startedAt', pg_temp.ts(p_d, p_start), 'endedAt', pg_temp.ts(p_d, p_end),
    'gmv', p_gmv, 'orders', (p_gmv / 100000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (pg_temp.ts(p_d, p_end) - pg_temp.ts(p_d, p_start))) / 60, 'raw', jsonb_build_object('picked', true))
$$;

-- ---------------------------------------------------------------- 1) Snapshot
select apply_session_live_snapshot(pg_temp.sid('R1', '09:00'), 'ca1.xlsx', null, jsonb_build_array(pg_temp.room('R1', 20, '09:00', '13:00', 12000000)));
select pg_temp.chk('A0 chưa gõ: app gợi ý 12M (file tải 13:00)', pg_temp.near((pg_temp.ls('R1', '09:00')).actual_gmv, 12000000));

select set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), 10000000);
select pg_temp.chk('A1 gõ 10M: GMV ca = 10M', pg_temp.near((pg_temp.ls('R1', '09:00')).actual_gmv, 10000000));
select pg_temp.chk('A2 đơn + lượt xem theo % GMV (120 → 100, 12.000 → 10.000)',
  (pg_temp.ls('R1', '09:00')).total_orders = 100 and (pg_temp.ls('R1', '09:00')).total_views = 10000);
select pg_temp.chk('A3 thời lượng = tới giờ hết ca (240 → 180 phút)', pg_temp.near((pg_temp.ls('R1', '09:00')).live_duration_minutes, 180));
select pg_temp.chk('A4 số gốc của file còn giữ, có dấu gõ tay',
  (select (r.raw->'orig'->>'gmv')::numeric = 12000000 and s.typed_gmv = 10000000 and s.typed_by is not null
     from session_live_snapshot_rows r join session_live_snapshots s on s.id = r.snapshot_id where s.session_id = pg_temp.sid('R1', '09:00')));

select apply_session_live_snapshot(pg_temp.sid('R1', '12:00'), 'ca2.xlsx', null, jsonb_build_array(pg_temp.room('R1', 20, '09:00', '15:00', 25000000)));
select pg_temp.chk('B1 ca sau trừ đúng mốc đã sửa: 25 − 10 = 15M, 150 đơn',
  pg_temp.near((pg_temp.ls('R1', '12:00')).actual_gmv, 15000000) and (pg_temp.ls('R1', '12:00')).total_orders = 150);

select set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), 11000000);
select pg_temp.chk('B2 gõ lại 11M (tính từ số gốc, không cộng dồn sai): ca 1 = 11M, ca sau tự thành 14M',
  pg_temp.near((pg_temp.ls('R1', '09:00')).actual_gmv, 11000000) and pg_temp.near((pg_temp.ls('R1', '12:00')).actual_gmv, 14000000));
select set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), null);
select pg_temp.chk('B3 bỏ số gõ: về số file 12M, ca sau 13M, dòng hết raw.orig',
  pg_temp.near((pg_temp.ls('R1', '09:00')).actual_gmv, 12000000) and pg_temp.near((pg_temp.ls('R1', '12:00')).actual_gmv, 13000000)
  and not exists (select 1 from session_live_snapshot_rows r join session_live_snapshots s on s.id = r.snapshot_id
                   where s.session_id = pg_temp.sid('R1', '09:00') and r.raw ? 'orig'));
select set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), 10000000);

do $$ begin
  perform set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), 30000000);
  raise exception 'FAIL C1 gõ vượt số ca sau đã up mà vẫn nhận';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  C1 gõ 30M bị chặn (%)', left(sqlerrm, 60);
end $$;
select pg_temp.chk('C2 lần gõ hỏng không đổi số đang có (vẫn 10M / 15M)',
  pg_temp.near((pg_temp.ls('R1', '09:00')).actual_gmv, 10000000) and pg_temp.near((pg_temp.ls('R1', '12:00')).actual_gmv, 15000000));

-- Ca có room đã tắt trước giờ hết ca: chỉ room còn live mới bị cắt phần của ca sau.
select apply_session_live_snapshot(pg_temp.sid('R3', '09:00'), 'ca1.xlsx', null, jsonb_build_array(
  pg_temp.room('Rx', 18, '09:00', '10:30', 5000000), pg_temp.room('Ry', 18, '10:35', '13:00', 9000000)));
select set_session_snapshot_gmv(pg_temp.sid('R3', '09:00'), 12000000);
select pg_temp.chk('D1 hai room: GMV ca 12M, room đã tắt giữ nguyên 5M, room còn live 7M',
  pg_temp.near((pg_temp.ls('R3', '09:00')).actual_gmv, 12000000)
  and (select bool_and(case r.room_id when 'Rx' then pg_temp.near(r.gmv, 5000000) else pg_temp.near(r.gmv, 7000000) end)
         from session_live_snapshot_rows r join session_live_snapshots s on s.id = r.snapshot_id where s.session_id = pg_temp.sid('R3', '09:00')));
do $$ begin
  perform set_session_snapshot_gmv(pg_temp.sid('R3', '09:00'), 4000000);
  raise exception 'FAIL D2 gõ nhỏ hơn phần room đã tắt mà vẫn nhận';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  D2 gõ 4M < 5M của room đã tắt bị chặn (%)', left(sqlerrm, 50);
end $$;

-- Thêm lượt restart ⇒ số gõ bị bỏ, về số file.
insert into session_snapshot_parts (session_id, part_no, reason) values (pg_temp.sid('R3', '09:00'), 2, 'network');
select pg_temp.chk('D3 thêm lượt restart: số gõ bị bỏ, dòng về số file',
  (select s.typed_gmv is null from session_live_snapshots s where s.session_id = pg_temp.sid('R3', '09:00'))
  and (select sum(r.gmv) = 14000000 from session_live_snapshot_rows r join session_live_snapshots s on s.id = r.snapshot_id
        where s.session_id = pg_temp.sid('R3', '09:00')));

-- Snapshot ước lượng (OPS) + snapshot thật ca 2.
insert into session_live_snapshots (session_id, file_name, boundary_at, row_count, previous_values, is_estimated)
values (pg_temp.sid('R4', '09:00'), 'uoc-luong', pg_temp.ts(17, '12:00'), 1, '{}'::jsonb, true);
insert into session_live_snapshot_rows (snapshot_id, room_id, started_at, ended_at, gmv, orders, views, duration_minutes)
select id, 'R4', pg_temp.ts(17, '09:00'), pg_temp.ts(17, '12:00'), 20000000, 200, 20000, 180 from session_live_snapshots where session_id = pg_temp.sid('R4', '09:00');
select apply_session_live_snapshot(pg_temp.sid('R4', '12:00'), 'ca2.xlsx', null, jsonb_build_array(pg_temp.room('R4', 17, '09:00', '15:00', 25000000)));
select set_session_snapshot_gmv(pg_temp.sid('R4', '09:00'), 8000000);
select pg_temp.chk('E1 OPS gõ 8M vào snapshot ước lượng: ca 1 = 8M, ca 2 = 17M',
  pg_temp.near((pg_temp.ls('R4', '09:00')).actual_gmv, 8000000) and pg_temp.near((pg_temp.ls('R4', '12:00')).actual_gmv, 17000000));

-- ---------------------------------------------------------------- 2) Đối soát
create temp table b as
select import_live_reconciliation('recon.xlsx', 'p0174', null, null, (
  select jsonb_agg(jsonb_build_object('roomId', sc.room, 'startedAt', pg_temp.ts(sc.d, '09:00'), 'endedAt', pg_temp.ts(sc.d, '18:00'),
    'gmv', 75000000, 'orders', 750, 'views', 75000, 'durationMinutes', 540))
  from sc where sc.room in ('R1', 'R2', 'R4')), 'b0000000-0000-0000-0000-0000000000c1') as id;
create or replace function pg_temp.pv(p_room text, p_slot text) returns record language sql as $$
  select (gmv, orders, method)::record from preview_live_reconciliation((select id from b)) where session_id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.pvg(p_room text, p_slot text) returns numeric language sql as $$
  select gmv from preview_live_reconciliation((select id from b)) where session_id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.pvm(p_room text, p_slot text) returns text language sql as $$
  select method from preview_live_reconciliation((select id from b)) where session_id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.pvo(p_room text, p_slot text) returns numeric language sql as $$
  select orders from preview_live_reconciliation((select id from b)) where session_id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.row_of(p_room text) returns uuid language sql as $$
  select id from live_reconciliation_rows where batch_id = (select id from b) and room_id = p_room $$;
update live_reconciliation_rows set bucket = 'agency' where batch_id = (select id from b);

select pg_temp.chk('F1 mốc gõ tay ở snapshot = số lúc HẾT CA: đối soát chia 10 / 15 / 50M theo mốc',
  pg_temp.near(pg_temp.pvg('R1', '09:00'), 10000000) and pg_temp.near(pg_temp.pvg('R1', '12:00'), 15000000)
  and pg_temp.near(pg_temp.pvg('R1', '15:00'), 50000000) and pg_temp.pvm('R1', '09:00') = 'snapshot');
select pg_temp.chk('F2 snapshot ước lượng đã gõ tay thành mốc thật: ca 1 = 8M', pg_temp.near(pg_temp.pvg('R4', '09:00'), 8000000));
select pg_temp.chk('G0 không snapshot, chưa gõ: chia theo giờ 25 / 25 / 25M', pg_temp.near(pg_temp.pvg('R2', '09:00'), 25000000));

select set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '09:00'), 10000000);
select pg_temp.chk('G1 gõ ca 1 = 10M: ca 1 10M nhãn manual, 100 đơn (theo % GMV)',
  pg_temp.near(pg_temp.pvg('R2', '09:00'), 10000000) and pg_temp.pvm('R2', '09:00') = 'manual' and pg_temp.near(pg_temp.pvo('R2', '09:00'), 100));
select pg_temp.chk('G2 hai ca kia chia phần còn lại 65M theo tỷ lệ cũ: 32,5M mỗi ca, tổng = file',
  pg_temp.near(pg_temp.pvg('R2', '12:00'), 32500000) and pg_temp.near(pg_temp.pvg('R2', '15:00'), 32500000)
  and (select pg_temp.near(sum(gmv), 75000000) and pg_temp.near(sum(orders), 750) from preview_live_reconciliation((select id from b))
        where session_id in (select id from ses where room = 'R2')));

do $$ begin
  perform set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '12:00'), 70000000);
  raise exception 'FAIL H1 tổng gõ vượt file mà vẫn nhận';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  H1 tổng gõ 80M > file 75M bị chặn (%)', left(sqlerrm, 50);
end $$;
select set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '12:00'), 20000000);
do $$ begin
  perform set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '15:00'), 40000000);
  raise exception 'FAIL H2 gõ đủ mọi ca mà tổng lệch file vẫn nhận';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  H2 gõ cả 3 ca tổng 70M ≠ 75M bị chặn (%)', left(sqlerrm, 50);
end $$;
select pg_temp.chk('H3 gõ 2 ca (10 + 20M): ca còn lại nhận 45M',
  pg_temp.near(pg_temp.pvg('R2', '15:00'), 45000000) and pg_temp.pvm('R2', '15:00') <> 'manual');

-- Lô file mới hơn kéo dài kỳ (01–10 → 01–13): số gõ đi theo (ca, room).
create temp table b2 as
select import_live_reconciliation('recon2.xlsx', 'p0174b', current_date - 25, current_date, jsonb_build_array(jsonb_build_object('roomId', 'R2',
  'startedAt', pg_temp.ts(19, '09:00'), 'endedAt', pg_temp.ts(19, '18:00'), 'gmv', 80000000, 'orders', 800, 'views', 80000, 'durationMinutes', 540)),
  'b0000000-0000-0000-0000-0000000000c1') as id;
update live_reconciliation_rows set bucket = 'agency' where batch_id = (select id from b2);
select pg_temp.chk('I1 lô mới giữ số gõ: ca 1 10M, ca 2 20M, ca 3 = 80 − 30 = 50M',
  (select bool_and(case when session_id = pg_temp.sid('R2', '09:00') then pg_temp.near(gmv, 10000000)
                        when session_id = pg_temp.sid('R2', '12:00') then pg_temp.near(gmv, 20000000)
                        else pg_temp.near(gmv, 50000000) end)
     from preview_live_reconciliation((select id from b2))));

select apply_live_reconciliation((select id from b));
select pg_temp.chk('J1 Áp dụng ghi đúng số gõ + đơn theo % GMV',
  pg_temp.near((pg_temp.ls('R2', '09:00')).actual_gmv, 10000000) and (pg_temp.ls('R2', '09:00')).total_orders = 100
  and (pg_temp.ls('R2', '09:00')).data_source::text = 'tiktok_reconciled');

select set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '09:00'), null);
select set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '12:00'), null);
select pg_temp.chk('J2 bỏ số gõ: về chia tự động 25M', pg_temp.near(pg_temp.pvg('R2', '09:00'), 25000000) and pg_temp.pvm('R2', '09:00') <> 'manual');

-- K: quyền.
update profiles set role = 'brand' where id = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  perform set_recon_gmv_override(pg_temp.row_of('R2'), pg_temp.sid('R2', '09:00'), 1);
  raise exception 'FAIL K1 brand sửa được số đối soát';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  K1 brand bị chặn sửa đối soát (%)', left(sqlerrm, 40);
end $$;
do $$ begin
  perform set_session_snapshot_gmv(pg_temp.sid('R1', '09:00'), 1);
  raise exception 'FAIL K2 brand sửa được GMV ca';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  K2 brand bị chặn sửa GMV ca (%)', left(sqlerrm, 40);
end $$;
update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';

select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
