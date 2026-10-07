-- Kiểm 0156 (nạp bù ca cho Shopee: create_backfill_sessions có p_platform). Chạy trên bản REPLAY SAU 0156; thiếu 0156 đỏ ở mục 0.
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

select pg_temp.chk('0 create_backfill_sessions có đối số p_platform và chỉ còn một bản',
  to_regprocedure('public.create_backfill_sessions(uuid,jsonb,text)') is not null
  and to_regprocedure('public.create_backfill_sessions(uuid,jsonb)') is null);

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
delete from live_session_reports where session_id in (select id from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000b6');
delete from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000b6';
delete from brands where id = 'b0000000-0000-0000-0000-0000000000b6';
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000b6', 'BF56');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- 1) Shopee: 2 phiên, một có ATC
select pg_temp.chk('1a Shopee sinh 2 ca',
  (create_backfill_sessions('b0000000-0000-0000-0000-0000000000b6', jsonb_build_array(
    jsonb_build_object('room_id', 'SHP-2026-06-06-0800', 'room_title', 'HÈ THÁNG 6', 'started_at', '2026-06-06T01:00:00Z', 'ended_at', '2026-06-06T05:00:00Z',
      'duration_minutes', 240, 'gmv', 5000000, 'orders', 20, 'items_sold', 25, 'sku_orders', 20, 'views', 800, 'atc', 60, 'avg_view_duration_sec', 30),
    jsonb_build_object('room_id', 'SHP-2026-06-07-0800', 'room_title', '', 'started_at', '2026-06-07T01:00:00Z', 'ended_at', '2026-06-07T03:00:00Z',
      'duration_minutes', 120, 'gmv', 1000000, 'orders', 5, 'views', 100)), 'Shopee')->>'inserted')::int = 2);
select pg_temp.chk('1b ca mang sàn Shopee, đã đối soát, là ca nạp bù, host trống',
  count(*) = 2 and bool_and(platform::text = 'Shopee' and is_backfill and data_source::text = 'tiktok_reconciled' and status::text = 'Completed' and host_id is null)
  ) from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000b6';
select pg_temp.chk('1c số liệu + giờ VN đúng', actual_gmv = 5000000 and total_orders = 20 and total_views = 800 and date = '2026-06-06' and start_time = '08:00' and end_time = '12:00' and live_duration_minutes = 240)
  from live_sessions where tiktok_room_id = 'SHP-2026-06-06-0800';
select pg_temp.chk('1d ATC 60 vào report; phiên không ATC không có dòng report',
  (select atc_count from live_session_reports r join live_sessions s on s.id = r.session_id where s.tiktok_room_id = 'SHP-2026-06-06-0800') = 60
  and not exists (select 1 from live_session_reports r join live_sessions s on s.id = r.session_id where s.tiktok_room_id = 'SHP-2026-06-07-0800' and r.atc_count > 0));

-- 2) Chạy lại không tạo trùng
select pg_temp.chk('2 chạy lại bỏ qua 2 phiên đã có ca',
  (create_backfill_sessions('b0000000-0000-0000-0000-0000000000b6', jsonb_build_array(
    jsonb_build_object('room_id', 'SHP-2026-06-06-0800', 'started_at', '2026-06-06T01:00:00Z', 'ended_at', '2026-06-06T05:00:00Z'),
    jsonb_build_object('room_id', 'SHP-2026-06-07-0800', 'started_at', '2026-06-07T01:00:00Z', 'ended_at', '2026-06-07T03:00:00Z')), 'Shopee')->>'skipped_existing')::int = 2);

-- 3) Gọi 2 đối số (client cũ / TikTok) vẫn ra TikTok
select pg_temp.chk('3a không truyền sàn: sinh 1 ca',
  (create_backfill_sessions('b0000000-0000-0000-0000-0000000000b6', jsonb_build_array(
    jsonb_build_object('room_id', 'tt-room-1', 'started_at', '2026-06-08T01:00:00Z', 'ended_at', '2026-06-08T03:00:00Z', 'gmv', 100)))->>'inserted')::int = 1);
select pg_temp.chk('3b ... và là TikTok, không có dòng ATC',
  (select platform::text from live_sessions where tiktok_room_id = 'tt-room-1') = 'TikTok'
  and not exists (select 1 from live_session_reports r join live_sessions s on s.id = r.session_id where s.tiktok_room_id = 'tt-room-1'));

-- 4) Sàn lạ / quyền
select pg_temp.must_fail('4a sàn không hợp lệ',
  $q$select create_backfill_sessions('b0000000-0000-0000-0000-0000000000b6', '[]'::jsonb, 'Lazada')$q$, 'Sàn không hợp lệ');
select split_backfill_session((select id from live_sessions where tiktok_room_id = 'SHP-2026-06-06-0800'), '2026-06-06T03:00:00Z');
select pg_temp.chk('4b ca Shopee nạp bù tách được: cả hai phần vẫn là Shopee, tổng GMV giữ nguyên',
  count(*) = 2 and bool_and(platform::text = 'Shopee') and sum(actual_gmv) = 5000000)
  from live_sessions where tiktok_room_id = 'SHP-2026-06-06-0800';

delete from live_session_reports where session_id in (select id from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000b6');
delete from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000b6';
delete from brands where id = 'b0000000-0000-0000-0000-0000000000b6';
