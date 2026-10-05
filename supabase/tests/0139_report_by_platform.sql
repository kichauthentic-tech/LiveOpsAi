-- Kiểm migration 0139 (report tách theo sàn). Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0139. Mỗi mục in "OK ...";
-- ERROR là hỏng. Trên bản replay CHƯA có 0139 phải đỏ ngay (cột platform chưa có).
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

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000009', 'brand@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a0000000-0000-0000-0000-000000000009', 'Brand', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = 'brand', assigned_brand_id = excluded.assigned_brand_id;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Tháng 6/2026: 2 ca TikTok + 1 ca Shopee CÙNG GIỜ (VERA chạy hai sàn song song), tất cả còn "manual".
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, status, actual_gmv, data_source) values
  ('d0000000-0000-0000-0000-000000000001', 'tt1', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', date '2026-06-10', '10:00', '12:00', 'Completed', 5000000, 'manual'),
  ('d0000000-0000-0000-0000-000000000002', 'tt2', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', date '2026-06-11', '10:00', '12:00', 'Completed', 3000000, 'manual'),
  ('d0000000-0000-0000-0000-000000000003', 'sp1', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee', date '2026-06-10', '10:00', '12:00', 'Completed', 7000000, 'manual');

-- ============ 1) Khoá (brand, tháng, sàn) ============
insert into brand_monthly_reports (id, brand_id, period_month, platform, status) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'TikTok', 'draft'),
  ('e0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'Shopee', 'draft');
select pg_temp.chk('1a hai report cùng tháng khác sàn', count(*) = 2) from brand_monthly_reports;
select pg_temp.must_fail('1b trùng (brand, tháng, sàn)',
  $q$insert into brand_monthly_reports (brand_id, period_month, platform) values ('b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'Shopee')$q$, 'duplicate key');
select pg_temp.must_fail('1c sàn lạ',
  $q$insert into brand_monthly_reports (brand_id, period_month, platform) values ('b0000000-0000-0000-0000-00000000000a', date '2026-05-01', 'Lazada')$q$, 'platform_check');
insert into brand_monthly_report_snapshots (brand_id, period_month, platform, snapshot) values
  ('b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'TikTok', '{}'), ('b0000000-0000-0000-0000-00000000000a', date '2026-06-01', 'Shopee', '{}');
select pg_temp.chk('1d bản chụp theo sàn', count(*) = 2) from brand_monthly_report_snapshots;

-- ============ 2) Phát hành Shopee chỉ đếm ca Shopee ============
select pg_temp.must_fail('2a Shopee còn 1 ca chưa đối soát (không tính 2 ca TikTok)',
  $q$select publish_brand_monthly_report('e0000000-0000-0000-0000-000000000002', false)$q$, 'unreconciled_sessions:1');
select publish_brand_monthly_report('e0000000-0000-0000-0000-000000000002', true);
select pg_temp.chk('2b Shopee published, TikTok vẫn draft',
  (select status from brand_monthly_reports where id = 'e0000000-0000-0000-0000-000000000002') = 'published'
  and (select status from brand_monthly_reports where id = 'e0000000-0000-0000-0000-000000000001') = 'draft');
select pg_temp.chk('2c helper: TikTok chưa, Shopee rồi',
  private.brand_month_published('b0000000-0000-0000-0000-00000000000a', date '2026-06-10') = false
  and private.brand_month_published('b0000000-0000-0000-0000-00000000000a', date '2026-06-10', 'Shopee') = true
  and private.brand_month_published('b0000000-0000-0000-0000-00000000000a', date '2026-06-10', 'TikTok') = false);
select pg_temp.must_fail('2d TikTok cũng còn 2 ca chưa đối soát',
  $q$select publish_brand_monthly_report('e0000000-0000-0000-0000-000000000001', false)$q$, 'unreconciled_sessions:2');

-- ============ 3) Brand chỉ thấy số của sàn đã phát hành ============
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000009', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
select pg_temp.chk('3a brand thấy số ca Shopee đã phát hành', coalesce(actual_gmv, 0) = 7000000)
  from live_sessions_secure where id = 'd0000000-0000-0000-0000-000000000003';
select pg_temp.chk('3b brand KHÔNG thấy số ca TikTok chưa phát hành (nhưng vẫn thấy lịch)', coalesce(actual_gmv, 0) = 0 and date is not null)
  from live_sessions_secure where id = 'd0000000-0000-0000-0000-000000000001';
reset role;
select pg_temp.chk('3c policy bản chụp của brand xét sàn', count(*) = 1) from pg_policies where tablename = 'brand_monthly_report_snapshots' and policyname = 'brand_monthly_report_snapshots_brand_read_published' and qual like '%brand_month_published(brand_id, period_month, platform)%';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- ============ 4) Đóng sổ theo sàn ============
select pg_temp.must_fail('4a sửa ca Shopee tháng đã phát hành',
  $q$update live_sessions set actual_gmv = 1 where id = 'd0000000-0000-0000-0000-000000000003'$q$, 'đã phát hành');
update live_sessions set actual_gmv = 5500000 where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('4b ca TikTok cùng tháng vẫn sửa được', actual_gmv = 5500000) from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.must_fail('4c đổi sàn của ca vào tháng đã phát hành',
  $q$update live_sessions set platform = 'Shopee' where id = 'd0000000-0000-0000-0000-000000000001'$q$, 'đã phát hành');

-- ============ 5) Đối soát theo sàn ============
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, status, actual_gmv, data_source) values
  ('d0000000-0000-0000-0000-000000000011', 'tt jul', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', date '2026-07-10', '10:00', '12:00', 'Completed', 1000000, 'manual'),
  ('d0000000-0000-0000-0000-000000000012', 'sp jul', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee', date '2026-07-10', '10:00', '12:00', 'Completed', 1000000, 'manual');
select pg_temp.must_fail('5a sàn lạ khi import',
  $q$select import_live_reconciliation('f.xlsx', 'p', null, null, '[]'::jsonb, 'b0000000-0000-0000-0000-00000000000a', 'Lazada')$q$, 'TikTok hoặc Shopee');
create temp table _b as select import_live_reconciliation('shopee.xlsx', 'T7', date '2026-07-01', date '2026-07-31',
  jsonb_build_array(jsonb_build_object('roomId', 'SHP-2026-07-10-1000', 'roomTitle', 'live', 'startedAt', '2026-07-10T10:00:00+07:00',
    'endedAt', '2026-07-10T12:00:00+07:00', 'gmv', 9000000, 'orders', 30, 'views', 1500, 'durationMinutes', 120)),
  'b0000000-0000-0000-0000-00000000000a', 'Shopee') as id;
select pg_temp.chk('5b lô gắn sàn Shopee', (select platform from live_reconciliation_batches where id = (select id from _b)) = 'Shopee');
select pg_temp.chk('5c dòng chỉ khớp ca SHOPEE (không khớp ca TikTok cùng giờ)',
  matched_session_ids = array['d0000000-0000-0000-0000-000000000012'::uuid]) from live_reconciliation_rows where batch_id = (select id from _b);
select apply_live_reconciliation((select id from _b));
select pg_temp.chk('5d ca Shopee được ghi số, ca TikTok cùng giờ KHÔNG đổi',
  (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000012') = 9000000
  and (select data_source from live_sessions where id = 'd0000000-0000-0000-0000-000000000012') = 'tiktok_reconciled'
  and (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000011') = 1000000
  and (select data_source from live_sessions where id = 'd0000000-0000-0000-0000-000000000011') = 'manual');
create temp table _b2 as select import_live_reconciliation('tt.xlsx', 'T7', date '2026-07-01', date '2026-07-31',
  jsonb_build_array(jsonb_build_object('roomId', '7000000000001', 'roomTitle', 'live', 'startedAt', '2026-07-10T10:00:00+07:00',
    'endedAt', '2026-07-10T12:00:00+07:00', 'gmv', 4000000, 'orders', 10, 'views', 900, 'durationMinutes', 120)),
  'b0000000-0000-0000-0000-00000000000a') as id;
select pg_temp.chk('5e mặc định TikTok: chỉ khớp ca TikTok', matched_session_ids = array['d0000000-0000-0000-0000-000000000011'::uuid])
  from live_reconciliation_rows where batch_id = (select id from _b2);
select apply_live_reconciliation((select id from _b2));
select pg_temp.chk('5f áp lô TikTok không đụng ca Shopee đã chốt',
  (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000012') = 9000000
  and (select actual_gmv from live_sessions where id = 'd0000000-0000-0000-0000-000000000011') = 4000000);

-- ============ 6) Loại file Shopee trong kho dữ liệu gốc ============
insert into brand_dataraw_imports (brand_id, report_type, period_label, period_start, period_end, file_name, columns, summary, row_count)
values ('b0000000-0000-0000-0000-00000000000a', 'shopee_live_list', 'T9', date '2026-09-01', date '2026-09-30', 'f.xlsx', '[]'::jsonb, '{}'::jsonb, 50);
select pg_temp.chk('6a nhận shopee_live_list', count(*) = 1) from brand_dataraw_imports where report_type = 'shopee_live_list';
select pg_temp.must_fail('6b loại lạ vẫn bị chặn',
  $q$insert into brand_dataraw_imports (brand_id, report_type, period_label, period_start, period_end, file_name, columns, summary, row_count) values ('b0000000-0000-0000-0000-00000000000a', 'lazada_x', 'T9', date '2026-09-01', date '2026-09-30', 'f', '[]'::jsonb, '{}'::jsonb, 1)$q$, 'report_type_check');
