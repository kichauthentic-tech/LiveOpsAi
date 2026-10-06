-- Gộp cấu hình 06/10 (không migration mới): hợp đồng nhập ở CRM, cam kết của MỘT tháng sửa ở Kế Hoạch Tháng. Bộ kiểm
-- mô phỏng ĐÚNG các lệnh client gửi (BrandConfigPanel: tạo hợp đồng → generate_contract_commitments; MonthPlan:
-- upsert brand_monthly_commitments với contract_id + is_override do client tính) dưới role `authenticated` của admin,
-- để chứng minh RLS cho ghi và luật "sửa riêng tháng không bị hợp đồng ghi đè, tháng bằng hợp đồng thì đổi theo".
-- Chạy trên bản REPLAY cả chuỗi (README). Mỗi mục in "OK ..."; ERROR là hỏng.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
-- Bản replay không có default privileges của Supabase: cấp quyền BẢNG cho đúng 2 bảng đang kiểm (không grant all — sẽ
-- xoá grant theo cột của 0047/0048). Dòng nào được ghi vẫn do RLS quyết.
grant select, insert, update, delete on brand_contracts, brand_monthly_commitments to authenticated;
set role authenticated;

-- 1) CRM: tạo hợp đồng đang hiệu lực 01→03/2030, 100h + 2 tỷ/tháng ⇒ client gọi generate ngay.
insert into brand_contracts (id, brand_id, platform, contract_code, start_month, end_month, monthly_hours, monthly_gmv, status)
values ('d0000000-0000-0000-0000-0000000000c1', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', 'ZZZ', '2030-01-01', '2030-03-01', 100, 2000000000, 'active');
select generate_contract_commitments('d0000000-0000-0000-0000-0000000000c1', null);
select pg_temp.chk('1 lưu hợp đồng ⇒ 3 tháng theo hợp đồng, không phải sửa riêng',
  (select count(*) = 3 and bool_and(not is_override) and bool_and(committed_hours = 100) from brand_monthly_commitments
    where brand_id = 'b0000000-0000-0000-0000-00000000000a'));

-- 2) Kế Hoạch Tháng 02/2030: brand mua thêm ⇒ 120h (khác hợp đồng) ⇒ client gửi is_override = true.
insert into brand_monthly_commitments (brand_id, period_month, platform, committed_hours, committed_gmv, contract_id, note, is_override)
values ('b0000000-0000-0000-0000-00000000000a', '2030-02-01', 'TikTok', 120, 2000000000, 'd0000000-0000-0000-0000-0000000000c1', null, true)
on conflict (brand_id, period_month, platform) do update
  set committed_hours = excluded.committed_hours, committed_gmv = excluded.committed_gmv, contract_id = excluded.contract_id,
      note = excluded.note, is_override = excluded.is_override;
-- 3) Kế Hoạch Tháng 01/2030: gõ lại đúng số hợp đồng ⇒ is_override = false (vẫn "theo hợp đồng").
insert into brand_monthly_commitments (brand_id, period_month, platform, committed_hours, committed_gmv, contract_id, note, is_override)
values ('b0000000-0000-0000-0000-00000000000a', '2030-01-01', 'TikTok', 100, 2000000000, 'd0000000-0000-0000-0000-0000000000c1', null, false)
on conflict (brand_id, period_month, platform) do update
  set committed_hours = excluded.committed_hours, committed_gmv = excluded.committed_gmv, contract_id = excluded.contract_id,
      note = excluded.note, is_override = excluded.is_override;
select pg_temp.chk('2-3 admin ghi được cam kết tháng (RLS) — 02 sửa riêng, 01 vẫn theo hợp đồng',
  (select bool_and(case period_month when '2030-02-01' then is_override and committed_hours = 120 else not is_override end)
     from brand_monthly_commitments where brand_id = 'b0000000-0000-0000-0000-00000000000a'));

-- 4) CRM: sửa hợp đồng còn 90h ⇒ client generate lại: tháng theo hợp đồng đổi theo, tháng sửa riêng giữ nguyên.
update brand_contracts set monthly_hours = 90 where id = 'd0000000-0000-0000-0000-0000000000c1';
select pg_temp.chk('4 generate lại: giữ 1 tháng sửa riêng',
  (generate_contract_commitments('d0000000-0000-0000-0000-0000000000c1', null) ->> 'skipped_override')::int = 1);
select pg_temp.chk('4 tháng 01, 03 = 90h; tháng 02 vẫn 120h',
  (select string_agg(to_char(period_month, 'MM') || '=' || committed_hours::int, ',' order by period_month)
     from brand_monthly_commitments where brand_id = 'b0000000-0000-0000-0000-00000000000a') = '01=90,02=120,03=90');

-- 5) Hợp đồng chưa có tháng kết thúc: client truyền mốc (generateThroughMonth) ⇒ sinh tới đúng mốc, đúng sàn.
insert into brand_contracts (id, brand_id, platform, start_month, end_month, monthly_hours, status)
values ('d0000000-0000-0000-0000-0000000000c2', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', '2030-05-01', null, 40, 'active');
select generate_contract_commitments('d0000000-0000-0000-0000-0000000000c2', '2030-07-01');
select pg_temp.chk('5 hợp đồng mở Shopee: 3 tháng 05→07, chỉ ở sàn Shopee',
  (select count(*) = 3 and bool_and(platform = 'Shopee') from brand_monthly_commitments
    where contract_id = 'd0000000-0000-0000-0000-0000000000c2'));

-- 6) Không có hợp đồng phủ tháng: client gửi contract_id null ⇒ luôn là số sửa riêng (upsertMonthlyCommitment ép true).
insert into brand_monthly_commitments (brand_id, period_month, platform, committed_hours, committed_gmv, contract_id, note, is_override)
values ('b0000000-0000-0000-0000-00000000000a', '2031-01-01', 'TikTok', 50, null, null, null, true)
on conflict (brand_id, period_month, platform) do update set committed_hours = excluded.committed_hours, is_override = excluded.is_override;
select pg_temp.chk('6 tháng không có hợp đồng ghi được, đánh dấu sửa riêng',
  (select is_override and contract_id is null from brand_monthly_commitments
    where brand_id = 'b0000000-0000-0000-0000-00000000000a' and period_month = '2031-01-01'));

reset role;
