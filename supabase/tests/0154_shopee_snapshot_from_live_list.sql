-- Kiểm 0154 (ca Shopee giao ca / đổi host bằng file Live List, ATC theo phiên). Chạy trên bản REPLAY SAU 0153 + 0154; thiếu 0154 đỏ ngay mục 0.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.must_fail(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'FAIL % : lỗi khác mong đợi: %', label, sqlerrm; end if;
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 90);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;
create or replace function pg_temp.ts(d int, t time) returns text language sql as $$
  select to_char(((current_date + d) + t) at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SSOF')
$$;

select pg_temp.chk('0 có submit_file_handover và cột atc trong view', to_regprocedure('public.submit_file_handover(uuid,integer,integer,integer,boolean,text)') is not null
  and exists (select 1 from information_schema.columns where table_name = 'session_room_deltas' and column_name = 'atc'));

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
-- Chạy lại được: dọn dữ liệu thử của lần trước.
delete from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000a4';
delete from brands where id = 'b0000000-0000-0000-0000-0000000000a4';
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000a4', 'SHP54');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into talents (id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'Host S1'), ('c0000000-0000-0000-0000-0000000000a2', 'Host S2') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, host_id, host_name, status) values
 ('d4000000-0000-0000-0000-000000000001', 'shp ca 1', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'Shopee', current_date + 5, '13:00', '15:00', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming'),
 ('d4000000-0000-0000-0000-000000000002', 'shp ca 2 đổi host', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'Shopee', current_date + 5, '15:00', '17:30', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming'),
 ('d4000000-0000-0000-0000-000000000003', 'shp ca 3', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'Shopee', current_date + 6, '19:00', '21:00', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming'),
 ('d4000000-0000-0000-0000-000000000004', 'shp ca 4', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'Shopee', current_date + 6, '21:00', '23:00', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming'),
 ('d4000000-0000-0000-0000-000000000005', 'tiktok ca', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'TikTok', current_date + 7, '13:00', '15:00', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming');

-- 1) Giao ca Shopee phải có file trước
select pg_temp.must_fail('1a giao ca Shopee khi chưa up file',
  $q$select submit_file_handover('d4000000-0000-0000-0000-000000000001')$q$, 'Live List');

-- 2) Ca 1 up file: phiên SHP-A cộng dồn 1tr, 10 đơn, 500 viewers, 40 ATC
select apply_session_live_snapshot('d4000000-0000-0000-0000-000000000001', 'live-list.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'SHP-A', 'gmv', 1000000, 'orders', 10, 'views', 500, 'durationMinutes', 110,
    'startedAt', pg_temp.ts(5, time '12:50'), 'endedAt', pg_temp.ts(5, time '14:40'), 'raw', jsonb_build_object('atc', 40))));
select pg_temp.chk('2a số ca 1 từ file Shopee', actual_gmv = 1000000 and total_orders = 10 and total_views = 500 and data_source = 'live_snapshot')
  from live_sessions where id = 'd4000000-0000-0000-0000-000000000001';
select pg_temp.chk('2b ATC ca 1 vào report = 40', (select atc_count from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000001') = 40);

-- 3) Ca 2 cùng phiên (cộng dồn 6tr, 100 ATC): trừ lần up trước ⇒ 5tr, 60 ATC
select apply_session_live_snapshot('d4000000-0000-0000-0000-000000000002', 'live-list2.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'SHP-A', 'gmv', 6000000, 'orders', 60, 'views', 2500, 'durationMinutes', 280,
    'startedAt', pg_temp.ts(5, time '12:50'), 'endedAt', pg_temp.ts(5, time '17:30'), 'raw', jsonb_build_object('atc', 100))));
select pg_temp.chk('3a ca 2 = số cộng dồn − ca 1', actual_gmv = 5000000 and total_orders = 50 and total_views = 2000)
  from live_sessions where id = 'd4000000-0000-0000-0000-000000000002';
select pg_temp.chk('3b ATC ca 2 = 100 − 40', (select atc_count from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000002') = 60);

-- 4) Giao ca bằng file ok sau khi có file; ghi handover_at
select submit_file_handover('d4000000-0000-0000-0000-000000000001', 10, 0, 0, false, 'ok');
select pg_temp.chk('4a đã giao ca', handover_at is not null and ot_minutes = 10) from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000001';
select pg_temp.chk('4b giao ca không xoá ATC', atc_count = 40) from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000001';

-- 5) Số lúc đổi host từ file Shopee (ca 2: host A 0-60, host B 60-150), kèm ATC
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, host_id, host_name, status) values
 ('d4000000-0000-0000-0000-000000000006', 'shp đổi host', 'b0000000-0000-0000-0000-0000000000a4', 'SHP54', 'Shopee', current_date + 8, '15:00', '17:30', 'c0000000-0000-0000-0000-0000000000a1', 'Host S1', 'Upcoming');
select set_session_staff_segments('d4000000-0000-0000-0000-000000000006', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-0000000000a1', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-0000000000a2', 'role', 'host', 'from_min', 60, 'to_min', 150)));
select apply_segment_checkpoint_file('d4000000-0000-0000-0000-000000000006', 60, 'cp.xlsx',
  jsonb_build_array(jsonb_build_object('roomId', 'SHP-B', 'gmv', 3000000, 'orders', 30, 'views', 900,
    'startedAt', pg_temp.ts(8, time '15:00'), 'endedAt', pg_temp.ts(8, time '16:00'), 'raw', jsonb_build_object('atc', 70))));
select pg_temp.chk('5a checkpoint Shopee từ file có ATC', cum_gmv = 3000000 and cum_orders = 30 and cum_views = 900 and cum_atc = 70 and source = 'file')
  from session_segment_checkpoints where session_id = 'd4000000-0000-0000-0000-000000000006';
select pg_temp.must_fail('5b gõ tay cho ca Shopee bị chặn',
  $q$select submit_segment_checkpoint('d4000000-0000-0000-0000-000000000006', 60, 'https://banhang.shopee.vn/creator-center/dashboard/live/41439111', 1000, 1, null, 1)$q$, 'Live List');

-- 6) File TikTok (không có raw.atc) không ghi ATC
select apply_session_live_snapshot('d4000000-0000-0000-0000-000000000005', 'clp.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'R9', 'gmv', 100, 'orders', 1, 'views', 10, 'durationMinutes', 60,
    'startedAt', pg_temp.ts(7, time '13:05'), 'endedAt', pg_temp.ts(7, time '14:05'))));
select pg_temp.chk('6 ca TikTok không có ATC', not exists (select 1 from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000005' and atc_count is not null));

-- 7) Xoá snapshot ca 2 ⇒ gỡ ATC
select delete_session_live_snapshot('d4000000-0000-0000-0000-000000000002');
select pg_temp.chk('7 xoá file ⇒ ATC về null', (select atc_count from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000002') is null);

-- 8) Chia ước lượng theo thời gian chia luôn ATC: ca 3 (19-21) quên up, ca 4 (21-23) up, phiên 19:00-23:00 cộng dồn 8tr/80 ATC ⇒ ca 3 nhận 1/2
select apply_session_live_snapshot('d4000000-0000-0000-0000-000000000004', 'late.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'SHP-C', 'gmv', 8000000, 'orders', 80, 'views', 4000, 'durationMinutes', 240,
    'startedAt', pg_temp.ts(6, time '19:00'), 'endedAt', pg_temp.ts(6, time '23:00'), 'raw', jsonb_build_object('atc', 80))));
select link_session_room('d4000000-0000-0000-0000-000000000003', 'd4000000-0000-0000-0000-000000000004');
select estimate_handover_split('d4000000-0000-0000-0000-000000000003');
select pg_temp.chk('8a ca 3 nhận nửa số', actual_gmv = 4000000 and total_orders = 40) from live_sessions where id = 'd4000000-0000-0000-0000-000000000003';
select pg_temp.chk('8b ATC ca 3 = 40', (select atc_count from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000003') = 40);
select pg_temp.chk('8c ATC ca 4 = 80 − 40', (select atc_count from live_session_reports where session_id = 'd4000000-0000-0000-0000-000000000004') = 40);

-- 9) Nhắc giao ca Shopee nói "up file Live List"
select pg_temp.chk('9 lời nhắc Shopee', pg_get_functiondef('private.sync_handover_reminder(uuid)'::regprocedure) ~ 'up file Live List');
