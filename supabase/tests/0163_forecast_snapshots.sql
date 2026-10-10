-- Kiểm migration 0163 (sổ độ chính xác dự báo). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0163.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0163 thì phải đỏ ngay (bảng/hàm chưa có).
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

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'), ('a0000000-0000-0000-0000-000000000002', 'ops@t'),
  ('a0000000-0000-0000-0000-000000000003', 'talent@t'), ('a0000000-0000-0000-0000-000000000004', 'brand@t')
  on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS') on conflict do nothing;
insert into profiles (id, name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations'),
  ('a0000000-0000-0000-0000-000000000003', 'Talent', 'talent@t', 'talent')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a0000000-0000-0000-0000-000000000004', 'Brand', 'brand@t', 'brand', 'b0000000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = excluded.role;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;

-- 1) ops ghi 2 dòng (daily + plan)
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.chk('ops ghi 2 dòng', record_forecast_snapshots('[
  {"brand_id":"b0000000-0000-0000-0000-00000000000a","platform":"TikTok","month":"2026-10-01","as_of":"2026-10-09","kind":"daily","p50":5400000000.4,"lo":5100000000,"hi":5700000000,"actual":1109000000,"target":5154124000,"seen_share":0.21,"ratio":0.98},
  {"brand_id":"b0000000-0000-0000-0000-00000000000a","platform":"TikTok","month":"2026-10-01","as_of":"2026-10-07","kind":"plan","p50":5495000000,"lo":4286000000,"hi":6704000000,"target":5154124000}
]'::jsonb) = 2);
select pg_temp.chk('làm tròn đồng', (select p50 from forecast_snapshots where kind = 'daily') = 5400000000);

-- 2) ghi lại cùng ngày ⇒ cập nhật, không thêm dòng
select record_forecast_snapshots('[{"brand_id":"b0000000-0000-0000-0000-00000000000a","platform":"TikTok","month":"2026-10-01","as_of":"2026-10-09","kind":"daily","p50":5300000000,"actual":1200000000}]'::jsonb);
select pg_temp.chk('cùng ngày = ghi đè', (select count(*) from forecast_snapshots) = 2 and (select p50 from forecast_snapshots where kind = 'daily') = 5300000000);

-- 3) luật dữ liệu
select pg_temp.must_fail('kind lạ', $q$select record_forecast_snapshots('[{"brand_id":"b0000000-0000-0000-0000-00000000000a","month":"2026-10-01","kind":"weekly","p50":1}]'::jsonb)$q$, 'forecast_snapshots_kind_check');
select pg_temp.must_fail('tháng không phải ngày 1', $q$select record_forecast_snapshots('[{"brand_id":"b0000000-0000-0000-0000-00000000000a","month":"2026-10-05","kind":"daily","p50":1}]'::jsonb)$q$, 'forecast_snapshots_month_check');
select pg_temp.must_fail('số âm', $q$select record_forecast_snapshots('[{"brand_id":"b0000000-0000-0000-0000-00000000000a","month":"2026-10-01","kind":"daily","p50":-1}]'::jsonb)$q$, 'forecast_snapshots_numbers_check');
select pg_temp.must_fail('kênh chưa có (Shopee)', $q$select record_forecast_snapshots('[{"brand_id":"b0000000-0000-0000-0000-00000000000a","platform":"Shopee","month":"2026-10-01","kind":"daily","p50":1}]'::jsonb)$q$, 'chưa có kênh');
select pg_temp.must_fail('không phải mảng', $q$select record_forecast_snapshots('{"a":1}'::jsonb)$q$, 'phải là mảng');

-- 4) quyền
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.must_fail('talent không ghi', $q$select record_forecast_snapshots('[]'::jsonb)$q$, 'Chỉ ceo/operations/admin');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
select pg_temp.must_fail('brand không ghi', $q$select record_forecast_snapshots('[]'::jsonb)$q$, 'Chỉ ceo/operations/admin');

-- RLS đọc: chạy với role authenticated
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', false);
select pg_temp.chk('brand không đọc', (select count(*) from forecast_snapshots) = 0);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.chk('talent không đọc', (select count(*) from forecast_snapshots) = 0);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
select pg_temp.chk('admin đọc', (select count(*) from forecast_snapshots) = 2);
select pg_temp.must_fail('ghi thẳng bảng bị chặn', $q$insert into forecast_snapshots (brand_id, month, as_of, kind, p50) values ('b0000000-0000-0000-0000-00000000000a', '2026-11-01', '2026-11-01', 'daily', 1)$q$, 'permission denied');
reset role;
select pg_temp.chk('vô danh không gọi được RPC', not has_function_privilege('anon', 'record_forecast_snapshots(jsonb)', 'execute'));
