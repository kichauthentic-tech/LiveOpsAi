-- Kiểm migration 0150 (bậc nguồn số 'handover_typed' cho giao ca gõ số — Shopee). Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0150
-- VÀ sau supabase/tests/0144_0145_handover.sql trên cùng DB (dùng lại ca VERA Shopee của bộ đó). Mỗi mục in "OK ...".
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

select pg_temp.chk('1 ràng buộc nhận handover_typed',
  pg_get_constraintdef((select oid from pg_constraint where conname = 'live_sessions_data_source_check')) ~ 'handover_typed');
select pg_temp.must_fail('1b giá trị lạ vẫn bị chặn',
  $q$update live_sessions set data_source = 'gi_cung_duoc' where id = 'd0000000-0000-0000-0000-000000000001'$q$, 'check');
select pg_temp.chk('2 ca Shopee đã giao ca mang bậc handover_typed',
  (select data_source from live_sessions where id = 'd0000000-0000-0000-0000-000000000001') = 'handover_typed');
select pg_temp.chk('3 phát hành coi handover_typed là chưa đối soát',
  pg_get_functiondef('public.publish_brand_monthly_report(uuid, boolean)'::regprocedure) ~ 'data_source in \(''manual'', ''handover_typed''\)');
select pg_temp.chk('4 thông báo đối soát lệch nhận bậc handover_typed',
  pg_get_functiondef('public.notify_session_changes()'::regprocedure) ~ '''handover_typed'', ''live_snapshot''');
-- 5) Ca đã đối soát không bị giao ca gõ số kéo xuống
select pg_temp.chk('5 ca đã đối soát giữ bậc đối soát',
  (select data_source from live_sessions where id = 'd0000000-0000-0000-0000-000000000004') = 'tiktok_reconciled');
-- 6) Đối soát Shopee ghi ATC của phiên vào báo cáo ca (chia theo lượt xem)
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('d1500000-0000-0000-0000-000000000001', 'ATC', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date - 2, '09:00', '12:00', 'Completed', 'Shopee')
on conflict (id) do nothing;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select import_live_reconciliation('LiveList.xlsx', 'test', current_date - 2, current_date - 2,
  jsonb_build_array(jsonb_build_object(
    'roomId', 'SHP-ATC-1', 'roomTitle', 'Phiên test',
    'startedAt', to_char((current_date - 2) + time '09:05', 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00',
    'endedAt', to_char((current_date - 2) + time '11:55', 'YYYY-MM-DD"T"HH24:MI:SS') || '+07:00',
    'durationMinutes', 170, 'gmv', 5000000, 'orders', 20, 'itemsSold', 25, 'skuOrders', 20, 'views', 1000, 'comments', 3, 'watchSeconds', 30000,
    'raw', jsonb_build_object('source', 'shopee_live_list', 'atc', 140))),
  'b0000000-0000-0000-0000-00000000000a', 'Shopee') as batch_id \gset
select apply_live_reconciliation(:'batch_id');
select pg_temp.chk('6a ca Shopee nhận GMV đối soát', (select actual_gmv = 5000000 and data_source = 'tiktok_reconciled' from live_sessions where id = 'd1500000-0000-0000-0000-000000000001'));
select pg_temp.chk('6b ATC của phiên ghi vào báo cáo ca', (select atc_count = 140 from live_session_reports where session_id = 'd1500000-0000-0000-0000-000000000001'));
select pg_temp.chk('xong', true);
