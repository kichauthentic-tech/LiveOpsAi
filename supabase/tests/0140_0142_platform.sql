-- Kiểm migration 0140 (kế hoạch theo sàn), 0141 (hợp đồng/cam kết theo sàn), 0142 (file Ads Shopee). Chạy trên bản
-- REPLAY cả chuỗi SAU khi nạp 0142. Mỗi mục in "OK ..."; ERROR là hỏng. Trên bản replay chưa có 0140 phải đỏ ngay.
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

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
-- 0149: dòng của kênh chưa tồn tại bị từ chối — tạo đủ kênh cho brand thử (bỏ qua khi replay chưa tới 0149).
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;

insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

insert into studios (id, name) values
  ('c0000000-0000-0000-0000-0000000000a1', 'VERA TTS'),
  ('c0000000-0000-0000-0000-0000000000a2', 'VERA SPE');
insert into brand_studios (brand_id, platform, studio_id) values
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok', 'c0000000-0000-0000-0000-0000000000a1'),
  ('b0000000-0000-0000-0000-00000000000a', 'Shopee', 'c0000000-0000-0000-0000-0000000000a2')
on conflict (brand_id, platform) do update set studio_id = excluded.studio_id;

-- ============ 0140: mỗi brand × tháng × sàn một kế hoạch ============
insert into brand_month_plans (id, brand_id, month, platform) values
  ('e0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', date '2030-01-01', 'TikTok'),
  ('e0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', date '2030-01-01', 'Shopee');
select pg_temp.chk('1a hai kế hoạch cùng tháng khác sàn', count(*) = 2) from brand_month_plans where month = date '2030-01-01';
select pg_temp.must_fail('1b trùng (brand, tháng, sàn)',
  $q$insert into brand_month_plans (brand_id, month, platform) values ('b0000000-0000-0000-0000-00000000000a', date '2030-01-01', 'Shopee')$q$, 'duplicate key');
select pg_temp.must_fail('1c sàn lạ',
  $q$insert into brand_month_plans (brand_id, month, platform) values ('b0000000-0000-0000-0000-00000000000a', date '2030-02-01', 'Lazada')$q$,
  -- Sau 0149, trigger kênh chặn trước check constraint: sàn lạ không bao giờ có kênh.
  (select case when to_regclass('public.brand_channels') is null then 'platform_check' else 'chưa có kênh Lazada' end));
select pg_temp.chk('1d kế hoạch cũ (không ghi sàn) = TikTok',
  (select platform from brand_month_plans where id = 'e0000000-0000-0000-0000-0000000000a1') = 'TikTok');

-- Ca TikTok ops mở sẵn ĐÚNG GIỜ của ca kế hoạch Shopee: chốt Shopee không được gắn vào nó (VERA live 2 sàn cùng giờ).
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('f0000000-0000-0000-0000-0000000000a1', date '2030-01-10', '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open');
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e0000000-0000-0000-0000-0000000000a2', date '2030-01-10', '10:00', '12:00', 50000000),
  ('e0000000-0000-0000-0000-0000000000a1', date '2030-01-10', '10:00', '12:00', 30000000);

select lock_month_plan('e0000000-0000-0000-0000-0000000000a2');
select pg_temp.chk('2a chốt Shopee: sinh ca MỚI sàn Shopee, phòng Shopee',
  (select count(*) from shift_slots s join brand_month_plan_slots ps on ps.slot_id = s.id
    where ps.plan_id = 'e0000000-0000-0000-0000-0000000000a2' and s.platform = 'Shopee' and s.studio_name = 'VERA SPE'
      and s.id <> 'f0000000-0000-0000-0000-0000000000a1') = 1);
select pg_temp.chk('2b ca TikTok mở sẵn không bị gắn vào kế hoạch Shopee',
  not exists (select 1 from brand_month_plan_slots where plan_id = 'e0000000-0000-0000-0000-0000000000a2' and slot_id = 'f0000000-0000-0000-0000-0000000000a1'));

select lock_month_plan('e0000000-0000-0000-0000-0000000000a1');
select pg_temp.chk('2c chốt TikTok: GẮN ca TikTok đã mở sẵn, không sinh thêm',
  (select slot_id from brand_month_plan_slots where plan_id = 'e0000000-0000-0000-0000-0000000000a1') = 'f0000000-0000-0000-0000-0000000000a1'
  and (select count(*) from shift_slots where platform = 'TikTok' and date = date '2030-01-10') = 1);

-- ============ 0141: hợp đồng + cam kết theo sàn ============
insert into brand_contracts (id, brand_id, start_month, end_month, monthly_hours, status, platform) values
  ('d0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', date '2030-01-01', date '2030-02-01', 100, 'active', 'TikTok'),
  ('d0000000-0000-0000-0000-0000000000a2', 'b0000000-0000-0000-0000-00000000000a', date '2030-01-01', date '2030-02-01', 60, 'active', 'Shopee');
select generate_contract_commitments('d0000000-0000-0000-0000-0000000000a1');
select generate_contract_commitments('d0000000-0000-0000-0000-0000000000a2');
select pg_temp.chk('3a mỗi sàn một dòng cam kết mỗi tháng (2 sàn × 2 tháng)', count(*) = 4) from brand_monthly_commitments;
select pg_temp.chk('3b dòng Shopee mang giờ của hợp đồng Shopee',
  (select sum(committed_hours) from brand_monthly_commitments where platform = 'Shopee') = 120
  and (select sum(committed_hours) from brand_monthly_commitments where platform = 'TikTok') = 200);
select pg_temp.must_fail('3c trùng (brand, tháng, sàn)',
  $q$insert into brand_monthly_commitments (brand_id, period_month, platform, committed_hours) values ('b0000000-0000-0000-0000-00000000000a', date '2030-01-01', 'Shopee', 1)$q$, 'duplicate key');
-- Đổi sàn của hợp đồng rồi sinh lại: dòng ở sàn cũ (chưa sửa tay) được dọn, không để mồ côi.
update brand_contracts set platform = 'TikTok', monthly_hours = 10 where id = 'd0000000-0000-0000-0000-0000000000a2';
select generate_contract_commitments('d0000000-0000-0000-0000-0000000000a2');
select pg_temp.chk('3d đổi sàn hợp đồng: dọn dòng Shopee cũ',
  not exists (select 1 from brand_monthly_commitments where contract_id = 'd0000000-0000-0000-0000-0000000000a2' and platform = 'Shopee'));
select pg_temp.chk('3e view của brand có cột platform', exists (
  select 1 from information_schema.columns where table_name = 'brand_commitment_progress' and column_name = 'platform'));

-- ============ 0142: loại file Ads Shopee ============
insert into brand_dataraw_imports (brand_id, report_type, period_start, period_end, file_name, columns, row_count)
  values ('b0000000-0000-0000-0000-00000000000a', 'shopee_ads', date '2026-09-01', date '2026-09-30', 'Shopee-Live-Ads.csv', '[]', 1);
select pg_temp.chk('4a nhận loại shopee_ads', count(*) = 1) from brand_dataraw_imports where report_type = 'shopee_ads';
select pg_temp.must_fail('4b loại lạ vẫn bị chặn',
  $q$insert into brand_dataraw_imports (brand_id, report_type, columns, row_count) values ('b0000000-0000-0000-0000-00000000000a', 'lazada_ads', '[]', 0)$q$, 'report_type_check');
