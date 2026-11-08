-- Kiểm migration 0201 (kịch bản brand, sổ dự báo nhiều mô hình, xác nhận ca bán 0). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi
-- nạp 0201. Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0200 thì đỏ ngay mục 1 (chưa có cột brand_scenario).
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

create or replace function pg_temp.as_user(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, false), set_config('request.jwt.claim.role', 'authenticated', false)
$$;

insert into auth.users (id, email) values
  ('a2010000-0000-0000-0000-000000000001', 'ops@t'),
  ('a2010000-0000-0000-0000-000000000002', 'talent@t')
on conflict do nothing;
insert into brands (id, name) values ('b2010000-0000-0000-0000-00000000000a', 'JOCKEY');
insert into brand_channels (brand_id, platform) values ('b2010000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values
  ('a2010000-0000-0000-0000-000000000001', 'Ops', 'ops@t', 'operations'),
  ('a2010000-0000-0000-0000-000000000002', 'Talent', 'talent@t', 'talent')
  on conflict (id) do update set role = excluded.role;
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, data_source) values
  ('d2010000-0000-0000-0000-000000000001', 't', 'b2010000-0000-0000-0000-00000000000a', 'JOCKEY', current_date - 5, '21:00', '00:30', 'Completed', 'manual'),
  ('d2010000-0000-0000-0000-000000000002', 't', 'b2010000-0000-0000-0000-00000000000a', 'JOCKEY', current_date - 5, '11:00', '14:00', 'Completed', 'live_snapshot'),
  ('d2010000-0000-0000-0000-000000000003', 't', 'b2010000-0000-0000-0000-00000000000a', 'JOCKEY', current_date + 5, '11:00', '14:00', 'Upcoming', 'manual');
grant select, insert, update on brand_month_plans to authenticated;

-- ============ 1) Kịch bản brand ============
select pg_temp.chk('1a cột brand_scenario mặc định mảng rỗng',
  (select column_default like '%[]%' from information_schema.columns where table_name = 'brand_month_plans' and column_name = 'brand_scenario'));
set role authenticated;
select pg_temp.as_user('a2010000-0000-0000-0000-000000000001');
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv, brand_scenario)
  values ('e2010000-0000-0000-0000-000000000001', 'b2010000-0000-0000-0000-00000000000a', date_trunc('month', current_date)::date, 'draft', 'TikTok', 0,
          '[{"id":"x","label":"11.11 hạng cao","pct":0.06,"reason":"email TikTok"}]');
select pg_temp.chk('1b ops ghi được kịch bản', (select jsonb_array_length(brand_scenario) = 1 from brand_month_plans where id = 'e2010000-0000-0000-0000-000000000001'));
select pg_temp.must_fail('1c kịch bản phải là mảng',
  $q$update brand_month_plans set brand_scenario = '{"a":1}' where id = 'e2010000-0000-0000-0000-000000000001'$q$, 'brand_month_plans_scenario_check');
reset role;

-- ============ 2) Sổ dự báo nhiều mô hình ============
set role authenticated;
select pg_temp.as_user('a2010000-0000-0000-0000-000000000001');
select pg_temp.chk('2a ghi 3 mô hình cùng ngày cùng loại = 3 dòng',
  (select record_forecast_snapshots(jsonb_build_array(
     jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'as_of', current_date, 'kind', 'plan', 'p50', 100, 'model', 'v3'),
     jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'as_of', current_date, 'kind', 'plan', 'p50', 90, 'model', 'sched'),
     jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'as_of', current_date, 'kind', 'plan', 'p50', 106, 'model', 'v3_kb')))) = 3);
select pg_temp.chk('2b ghi lại cùng mô hình = cập nhật, không thêm dòng',
  (select record_forecast_snapshots(jsonb_build_array(
     jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'as_of', current_date, 'kind', 'plan', 'p50', 95, 'model', 'sched')))) = 1);
select pg_temp.chk('2c còn 3 dòng, sched = 95',
  (select count(*) = 3 and max(p50) filter (where model = 'sched') = 95 from forecast_snapshots where brand_id = 'b2010000-0000-0000-0000-00000000000a'));
select pg_temp.chk('2d thiếu model ⇒ v3 (client cũ)',
  (select record_forecast_snapshots(jsonb_build_array(
     jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'as_of', current_date, 'kind', 'daily', 'p50', 80)))) = 1);
-- Câu kiểm riêng: subquery cùng câu lệnh với lời gọi ghi không thấy dòng vừa ghi (cùng snapshot).
select pg_temp.chk('2d′ dòng đó mang model v3', (select model = 'v3' from forecast_snapshots where kind = 'daily' and brand_id = 'b2010000-0000-0000-0000-00000000000a'));
select pg_temp.must_fail('2e mô hình lạ bị chặn',
  $q$select record_forecast_snapshots(jsonb_build_array(jsonb_build_object('brand_id', 'b2010000-0000-0000-0000-00000000000a', 'platform', 'TikTok', 'month', date_trunc('month', current_date)::date, 'kind', 'plan', 'p50', 1, 'model', 'xx')))$q$,
  'forecast_snapshots_model_check');
select pg_temp.as_user('a2010000-0000-0000-0000-000000000002');
select pg_temp.must_fail('2f talent không ghi được sổ',
  $q$select record_forecast_snapshots('[]'::jsonb)$q$, 'Chỉ ceo/operations/admin/trainer');
reset role;

-- ============ 3) Xác nhận ca bán 0 ============
set role authenticated;
select pg_temp.as_user('a2010000-0000-0000-0000-000000000002');
select pg_temp.must_fail('3a talent không xác nhận được', $q$select confirm_zero_sales('d2010000-0000-0000-0000-000000000001')$q$, 'Chỉ ceo/operations/admin/trainer');
select pg_temp.as_user('a2010000-0000-0000-0000-000000000001');
select confirm_zero_sales('d2010000-0000-0000-0000-000000000001');
reset role;
select pg_temp.chk('3b ca qua nửa đêm 21:00–00:30 ⇒ 210 phút, GMV 0, đơn 0, nguồn handover_typed',
  (select live_duration_minutes = 210 and actual_gmv = 0 and total_orders = 0 and data_source::text = 'handover_typed' from live_sessions where id = 'd2010000-0000-0000-0000-000000000001'));
set role authenticated;
select pg_temp.as_user('a2010000-0000-0000-0000-000000000001');
select pg_temp.must_fail('3c ca đã xác nhận (đã có giờ live) không xác nhận lại', $q$select confirm_zero_sales('d2010000-0000-0000-0000-000000000001')$q$, 'đã có số liệu');
select pg_temp.must_fail('3d ca có số từ file không xác nhận bán 0', $q$select confirm_zero_sales('d2010000-0000-0000-0000-000000000002')$q$, 'đã có số liệu');
select pg_temp.must_fail('3e ca chưa tới giờ không xác nhận', $q$select confirm_zero_sales('d2010000-0000-0000-0000-000000000003')$q$, 'Completed');
reset role;
