-- Kiểm migration 0171 (đối soát chia theo mốc snapshot + snapshot không đè số đã đối soát). Chạy trên bản REPLAY cả chuỗi
-- SAU khi nạp 0171 (README.md, "Replay cả chuỗi"). Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0171 thì đỏ ngay mục A.
--
-- Một room, ba ca nối 09–12 / 12–15 / 15–18. Snapshot = số CỘNG DỒN của room lúc UP (10M lúc 12:00, 25M lúc 15:00, 75M lúc 18:00);
-- Như file thật: room còn live lúc tải ⇒ thời lượng = tới giờ tải; giờ up (captured_at) đặt tay. Mốc = giờ TẢI file.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.near(a numeric, b numeric) returns boolean language sql as $$ select abs(coalesce(a, -1e18) - b) < 0.01 $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000c1', 'CROCS') on conflict (id) do nothing;
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000c1', 'TikTok') on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Kịch bản theo ngày (mỗi ngày một room, ba ca):
--   d-20 R_ALL : cả 3 ca có snapshot          d-19 R_LAST : ca 3 thiếu        d-18 R_MID : ca 2 thiếu
--   d-17 R_NONE: không ca nào có snapshot     d-16 R_EST : ca 1 chỉ có snapshot ƯỚC LƯỢNG, ca 2 thật
--   d-15 R_ONE : phiên chỉ khớp 1 ca (ca 09–12), không snapshot
--   d-14 R_LATE: ca 1 tải + up TRỄ lúc 16:00 (40M cộng dồn tới 16:00), ca 2, 3 không up — kiểu CROCS 11/10 ca 18–21 trên DB thật
--   d-13 R_HELD: ca 1 tải file lúc 12:00 (10M) nhưng 13:30 mới up; ca 2 tải + up 15:00 (25M); ca 3 không up
--   d-12 R_SHP : như Live List Shopee tải giữa phiên — thời lượng 0 ⇒ mốc = giờ up (ca 1 up 12:00 với 10M)
create temp table sc(room text, d int);
insert into sc values ('R_ALL', 20), ('R_LAST', 19), ('R_MID', 18), ('R_NONE', 17), ('R_EST', 16), ('R_ONE', 15), ('R_LATE', 14), ('R_HELD', 13), ('R_SHP', 12);

insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status)
select gen_random_uuid(), sc.room || ' ' || h.s, 'b0000000-0000-0000-0000-0000000000c1', 'CROCS', current_date - sc.d, h.s::time, h.e::time, 'Completed'
  from sc cross join (values ('09:00', '12:00'), ('12:00', '15:00'), ('15:00', '18:00')) h(s, e)
 where sc.room <> 'R_ONE' or h.s = '09:00';

create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000c1';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot = p_slot $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;

-- Up snapshot lúc p_at (giờ VN) với số cộng dồn p_gmv của room; file tải lúc p_export (mặc định = lúc up). Room bắt đầu 09:00 nên
-- thời lượng trong file = p_export − 09:00 (p_export = '09:00' ⇒ thời lượng 0, như Live List Shopee tải giữa phiên).
create or replace function pg_temp.snap(p_room text, p_slot text, p_gmv numeric, p_at text, p_export text default null) returns void language plpgsql as $$
declare
  v_d int := (select d from sc where room = p_room);
  v_exp timestamptz := pg_temp.ts(v_d, coalesce(p_export, p_at));
begin
  perform apply_session_live_snapshot(pg_temp.sid(p_room, p_slot), 'snap.xlsx', null, jsonb_build_array(jsonb_build_object(
    'roomId', p_room, 'startedAt', pg_temp.ts(v_d, '09:00'), 'endedAt', v_exp,
    'gmv', p_gmv, 'orders', (p_gmv / 100000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (v_exp - pg_temp.ts(v_d, '09:00'))) / 60, 'raw', jsonb_build_object('picked', true))));
  update session_live_snapshots set captured_at = pg_temp.ts(v_d, p_at) where session_id = pg_temp.sid(p_room, p_slot);
end $$;

select pg_temp.snap('R_ALL', '09:00', 10000000, '12:00');
select pg_temp.snap('R_ALL', '12:00', 25000000, '15:00');
select pg_temp.snap('R_ALL', '15:00', 75000000, '18:00');
select pg_temp.snap('R_LAST', '09:00', 10000000, '12:00');
select pg_temp.snap('R_LAST', '12:00', 25000000, '15:00');
select pg_temp.snap('R_MID', '09:00', 10000000, '12:00');
select pg_temp.snap('R_MID', '15:00', 75000000, '18:00');
select pg_temp.snap('R_EST', '12:00', 25000000, '15:00');
select pg_temp.snap('R_LATE', '09:00', 40000000, '16:00');
select pg_temp.snap('R_HELD', '09:00', 10000000, '13:30', '12:00');
select pg_temp.snap('R_HELD', '12:00', 25000000, '15:00');
select pg_temp.snap('R_SHP', '09:00', 10000000, '12:00', '09:00');
insert into session_live_snapshots (session_id, file_name, boundary_at, row_count, previous_values, is_estimated)
values (pg_temp.sid('R_EST', '09:00'), 'uoc-luong', pg_temp.ts(16, '12:00'), 1, '{}'::jsonb, true);
insert into session_live_snapshot_rows (snapshot_id, room_id, gmv)
select id, 'R_EST', 20000000 from session_live_snapshots where session_id = pg_temp.sid('R_EST', '09:00');

-- File sàn cuối kỳ: mỗi room một phiên 09:00 -> 18:00 (R_ONE 09:00 -> 11:30), GMV 75M.
create temp table b as
select import_live_reconciliation('recon.xlsx', 'p0171', null, null, (
  select jsonb_agg(jsonb_build_object(
    'roomId', sc.room, 'startedAt', pg_temp.ts(sc.d, '09:00'), 'endedAt', pg_temp.ts(sc.d, case when sc.room = 'R_ONE' then '11:30' else '18:00' end),
    'gmv', 75000000, 'orders', 750, 'views', 75000, 'durationMinutes', 540))
  from sc), 'b0000000-0000-0000-0000-0000000000c1') as id;

create temp table pv as select * from preview_live_reconciliation((select id from b));
create or replace function pg_temp.pv(p_room text, p_slot text) returns pv language sql as $$ select * from pv where session_id = pg_temp.sid(p_room, p_slot) $$;

-- A: đủ 3 mốc, file = mốc cuối ⇒ đúng 10 / 15 / 50, cách chia "snapshot".
select pg_temp.chk('A1 đủ mốc: ca 1 = 10M', pg_temp.near((pg_temp.pv('R_ALL', '09:00')).gmv, 10000000) and (pg_temp.pv('R_ALL', '09:00')).method = 'snapshot');
select pg_temp.chk('A2 đủ mốc: ca 2 = 15M', pg_temp.near((pg_temp.pv('R_ALL', '12:00')).gmv, 15000000));
select pg_temp.chk('A3 đủ mốc: ca 3 = 50M', pg_temp.near((pg_temp.pv('R_ALL', '15:00')).gmv, 50000000) and (pg_temp.pv('R_ALL', '15:00')).method = 'snapshot');

-- B: ca 3 thiếu ⇒ ca 1, 2 đúng theo mốc; ca 3 = 75 − 25 = 50M (phần sau mốc cuối — vẫn đúng, không phải ước lượng).
select pg_temp.chk('B1 ca 3 thiếu: ca 1 = 10M theo mốc', pg_temp.near((pg_temp.pv('R_LAST', '09:00')).gmv, 10000000) and (pg_temp.pv('R_LAST', '09:00')).method = 'snapshot');
select pg_temp.chk('B2 ca 3 thiếu: ca 2 = 15M theo mốc', pg_temp.near((pg_temp.pv('R_LAST', '12:00')).gmv, 15000000));
select pg_temp.chk('B3 ca 3 thiếu: ca 3 = phần còn lại 50M', pg_temp.near((pg_temp.pv('R_LAST', '15:00')).gmv, 50000000) and (pg_temp.pv('R_LAST', '15:00')).method = 'snapshot');

-- C: ca 2 thiếu ⇒ ca 1 = 10M; đoạn 12:00 -> 18:00 (65M) chia theo giờ cho ca 2 + ca 3 (3h/3h) = 32,5M mỗi ca.
select pg_temp.chk('C1 ca giữa thiếu: ca 1 = 10M theo mốc', pg_temp.near((pg_temp.pv('R_MID', '09:00')).gmv, 10000000) and (pg_temp.pv('R_MID', '09:00')).method = 'snapshot');
select pg_temp.chk('C2 ca giữa thiếu: ca 2 = 32,5M ước lượng', pg_temp.near((pg_temp.pv('R_MID', '12:00')).gmv, 32500000) and (pg_temp.pv('R_MID', '12:00')).method = 'time');
select pg_temp.chk('C3 ca giữa thiếu: ca 3 = 32,5M ước lượng', pg_temp.near((pg_temp.pv('R_MID', '15:00')).gmv, 32500000) and (pg_temp.pv('R_MID', '15:00')).method = 'time');

-- D: không có mốc ⇒ như cũ, chia theo giờ 25 / 25 / 25.
select pg_temp.chk('D không mốc: 25M mỗi ca, ước lượng', (select bool_and(pg_temp.near(gmv, 25000000) and method = 'time') from pv where session_id in (select id from ses where room = 'R_NONE')));

-- E: snapshot ước lượng của ca 1 KHÔNG là mốc ⇒ đoạn đến 15:00 (25M) chia theo giờ ca 1 + ca 2; ca 3 = 50M sau mốc cuối.
select pg_temp.chk('E1 mốc ước lượng bị bỏ: ca 1 = 12,5M', pg_temp.near((pg_temp.pv('R_EST', '09:00')).gmv, 12500000) and (pg_temp.pv('R_EST', '09:00')).method = 'time');
select pg_temp.chk('E2 ca 3 = 50M phần còn lại', pg_temp.near((pg_temp.pv('R_EST', '15:00')).gmv, 50000000) and (pg_temp.pv('R_EST', '15:00')).method = 'snapshot');

-- F: phiên chỉ khớp 1 ca ⇒ trọn phiên.
select pg_temp.chk('F phiên một ca: trọn 75M', pg_temp.near((pg_temp.pv('R_ONE', '09:00')).gmv, 75000000) and (pg_temp.pv('R_ONE', '09:00')).method = 'whole');

-- N: ca 1 up trễ 4 giờ (40M cộng dồn tới 16:00) ⇒ đoạn 09:00 -> 16:00 (40M, 7 giờ) rải theo giờ: ca 1 = ca 2 = 40×3/7,
--    ca 3 = 40×1/7 + đoạn 16:00 -> 18:00 (35M). KHÔNG được dồn 40M cho ca 1 như khi coi số up lúc 16:00 là số lúc 12:00.
select pg_temp.chk('N1 up trễ: ca 1 = 17,14M (không phải 40M)', pg_temp.near((pg_temp.pv('R_LATE', '09:00')).gmv, 40000000::numeric * 3 / 7) and (pg_temp.pv('R_LATE', '09:00')).method = 'time');
select pg_temp.chk('N2 up trễ: ca 2 = 17,14M', pg_temp.near((pg_temp.pv('R_LATE', '12:00')).gmv, 40000000::numeric * 3 / 7));
select pg_temp.chk('N3 up trễ: ca 3 = 5,71M + 35M', pg_temp.near((pg_temp.pv('R_LATE', '15:00')).gmv, 40000000::numeric / 7 + 35000000));

-- O: tải 12:00, up 13:30 ⇒ mốc vẫn là 12:00 (giờ tải) ⇒ ca 1 = 10M, ca 2 = 15M, ca 3 = 50M.
select pg_temp.chk('O1 tải đúng giờ, up muộn: ca 1 = 10M theo snapshot', pg_temp.near((pg_temp.pv('R_HELD', '09:00')).gmv, 10000000) and (pg_temp.pv('R_HELD', '09:00')).method = 'snapshot');
select pg_temp.chk('O2 tải đúng giờ, up muộn: ca 2 = 15M', pg_temp.near((pg_temp.pv('R_HELD', '12:00')).gmv, 15000000));
-- P: Shopee thời lượng 0 ⇒ mốc = giờ up 12:00 ⇒ ca 1 = 10M; 65M còn lại rải theo giờ cho ca 2 + ca 3.
select pg_temp.chk('P Shopee thời lượng 0: ca 1 = 10M, ca 2 = 32,5M', pg_temp.near((pg_temp.pv('R_SHP', '09:00')).gmv, 10000000)
  and pg_temp.near((pg_temp.pv('R_SHP', '12:00')).gmv, 32500000));

-- G: tổng mỗi phiên = số file, cả GMV lẫn đơn.
select pg_temp.chk('G tổng từng phiên = file (GMV + đơn)', not exists (
  select 1 from pv join live_reconciliation_rows rr on rr.id = pv.row_id
  group by rr.id, rr.gmv, rr.orders having abs(sum(pv.gmv) - rr.gmv) > 0.01 or abs(sum(pv.orders) - rr.orders) > 0.01));

-- H: Áp dụng ghi đúng bản xem trước; bỏ tick R_NONE thì ca của nó không đổi.
update live_reconciliation_rows set excluded = true where batch_id = (select id from b) and room_id = 'R_NONE';
select apply_live_reconciliation((select id from b));
select pg_temp.chk('H1 Áp dụng = xem trước (R_LAST ca 3 = 50M, đã đối soát)',
  (select pg_temp.near(actual_gmv, 50000000) and data_source::text = 'tiktok_reconciled' from live_sessions where id = pg_temp.sid('R_LAST', '15:00')));
select pg_temp.chk('H2 Áp dụng R_MID ca 2 = 32,5M', (select pg_temp.near(actual_gmv, 32500000) from live_sessions where id = pg_temp.sid('R_MID', '12:00')));
select pg_temp.chk('H3 phiên bỏ tick không ghi', (select bool_and(data_source::text <> 'tiktok_reconciled') from live_sessions where id in (select id from ses where room = 'R_NONE')));

-- I: file lệch mốc cuối (80M, đơn trễ) khi đủ mốc ⇒ chia theo tỷ lệ 10/15/50.
update live_reconciliation_rows set gmv = 80000000 where batch_id = (select id from b) and room_id = 'R_ALL';
select apply_live_reconciliation((select id from b));
select pg_temp.chk('I đủ mốc, file 80M: 10,67 / 16 / 53,33', (select
  pg_temp.near((select actual_gmv from live_sessions where id = pg_temp.sid('R_ALL', '09:00')), 80000000::numeric * 10 / 75)
  and pg_temp.near((select actual_gmv from live_sessions where id = pg_temp.sid('R_ALL', '12:00')), 16000000)
  and pg_temp.near((select actual_gmv from live_sessions where id = pg_temp.sid('R_ALL', '15:00')), 80000000::numeric * 50 / 75)));

-- J: ca 2 R_MID (đã đối soát 32,5M) up bù snapshot lúc 15:05 với 30M cộng dồn ⇒ KHÔNG đè số file sàn; snapshot vẫn lưu và thành mốc
--    cho lần Áp dụng lại: đoạn 12:00 -> 15:05 (20M) rải theo giờ ⇒ ca 2 = 20M × 180/185, 5 phút còn lại sang ca 3.
select pg_temp.snap('R_MID', '12:00', 30000000, '15:05');
select pg_temp.chk('J1 up bù sau đối soát không đè số',
  (select pg_temp.near(actual_gmv, 32500000) and data_source::text = 'tiktok_reconciled' from live_sessions where id = pg_temp.sid('R_MID', '12:00')));
select pg_temp.chk('J2 snapshot up bù vẫn được lưu', exists (select 1 from session_live_snapshots where session_id = pg_temp.sid('R_MID', '12:00')));
select pg_temp.chk('J3 xem trước dùng mốc mới (ca 2 = 19,46M theo snapshot), khác số đang ghi',
  (select pg_temp.near(gmv, 20000000::numeric * 180 / 185) and method = 'snapshot' and not pg_temp.near(current_gmv, gmv)
     from preview_live_reconciliation((select id from b)) where session_id = pg_temp.sid('R_MID', '12:00')));

-- K: xoá snapshot của ca đã đối soát ⇒ không trả về số trước snapshot.
select delete_session_live_snapshot(pg_temp.sid('R_MID', '12:00'));
select pg_temp.chk('K xoá snapshot không đụng số đã đối soát',
  (select pg_temp.near(actual_gmv, 32500000) and data_source::text = 'tiktok_reconciled' from live_sessions where id = pg_temp.sid('R_MID', '12:00')));

-- L: ca CHƯA đối soát vẫn nhận số từ snapshot như cũ (R_NONE bị bỏ tick ở H).
select pg_temp.snap('R_NONE', '09:00', 9000000, '12:00');
select pg_temp.chk('L ca chưa đối soát: snapshot vẫn ghi số',
  (select pg_temp.near(actual_gmv, 9000000) and data_source::text = 'live_snapshot' from live_sessions where id = pg_temp.sid('R_NONE', '09:00')));

-- M: role không phải ceo/admin/ops không xem trước được.
update profiles set role = 'brand' where id = 'a0000000-0000-0000-0000-000000000001';
do $$ begin
  perform preview_live_reconciliation((select id from b));
  raise exception 'FAIL M brand xem được bản chia';
exception when others then
  if sqlerrm like 'FAIL%' then raise; end if;
  raise notice 'OK  M brand bị chặn xem trước (%)', left(sqlerrm, 40);
end $$;
update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';

select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
