-- 0191 — điều khoản hợp tác YFB × brand. Mô phỏng ĐÚNG các lệnh client gửi (TermsPanel: insert/update brand_service_terms;
-- MonthSettlementPanel: upsert brand_month_fee_inputs; TalentRulesPanel: upsert brand_talent_rules) dưới role `authenticated`.
-- Chạy trên bản REPLAY cả chuỗi (README). Mỗi mục in "OK ..."; ERROR là hỏng.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'brandA@t'),
  ('a0000000-0000-0000-0000-000000000003', 'talent@t') on conflict do nothing;
delete from brand_service_terms; delete from brand_month_fee_inputs; delete from brand_talent_rules; -- chạy lại được nhiều lần
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'A'), ('b0000000-0000-0000-0000-00000000000b', 'B') on conflict do nothing;
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_brand_id) values ('a0000000-0000-0000-0000-000000000002', 'BrandA', 'brandA@t', 'brand', 'b0000000-0000-0000-0000-00000000000a') on conflict (id) do update set role = 'brand', assigned_brand_id = 'b0000000-0000-0000-0000-00000000000a';
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000003', 'Talent', 'talent@t', 'talent') on conflict (id) do update set role = 'talent';
insert into talents (id, name) values ('c0000000-0000-0000-0000-000000000001', 'Host 1') on conflict do nothing;

grant select, insert, update, delete on brand_service_terms, brand_month_fee_inputs, brand_talent_rules to authenticated;

-- ===== admin =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
set role authenticated;

insert into brand_service_terms (brand_id, platform, kind, label, start_date, terms) values
  ('b0000000-0000-0000-0000-00000000000a', 'TikTok', 'standard', 'HĐ 2026', '2026-10-01', '{"v":1,"services":["live"],"fees":[{"kind":"per_hour","rate":300000}]}'),
  ('b0000000-0000-0000-0000-00000000000b', 'TikTok', 'standard', 'HĐ B', '2026-10-01', '{"v":1,"services":["live"],"fees":[]}');
select pg_temp.chk('1) admin tạo được điều khoản chính', (select count(*) from brand_service_terms) = 2);

-- chiến dịch đè lên điều khoản chính được (cùng brand × sàn, khoảng ngày riêng)
insert into brand_service_terms (brand_id, platform, kind, label, start_date, end_date, terms)
  values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', 'campaign', '11.11', '2026-11-11', '2026-11-11', '{"v":1,"fees":[]}');
select pg_temp.chk('2) tạo được chiến dịch chồng lên điều khoản chính', (select count(*) from brand_service_terms where kind = 'campaign') = 1);

do $$ begin
  begin
    insert into brand_service_terms (brand_id, platform, kind, start_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', 'standard', '2026-10-01', '{"v":1,"fees":[]}');
    raise exception 'FAIL 3) hai điều khoản chính cùng ngày bắt đầu phải bị chặn';
  exception when unique_violation then raise notice 'OK  3) hai điều khoản chính cùng ngày bắt đầu bị chặn'; end;
  begin
    insert into brand_service_terms (brand_id, platform, kind, start_date, end_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'Shopee', 'trial', '2026-10-10', '2026-10-01', '{"v":1,"fees":[]}');
    raise exception 'FAIL 4) ngày kết thúc trước ngày bắt đầu phải bị chặn';
  exception when check_violation then raise notice 'OK  4) ngày kết thúc trước ngày bắt đầu bị chặn'; end;
  begin
    insert into brand_service_terms (brand_id, platform, kind, start_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'Shopee', 'standard', '2026-10-01', '{"fees":[]}');
    raise exception 'FAIL 5) JSON thiếu phiên bản phải bị chặn';
  exception when check_violation then raise notice 'OK  5) JSON thiếu phiên bản bị chặn'; end;
  begin
    insert into brand_service_terms (brand_id, platform, kind, start_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'Lazada', 'standard', '2026-10-01', '{"v":1,"fees":[]}');
    raise exception 'FAIL 6) sàn lạ phải bị chặn';
  exception when check_violation then raise notice 'OK  6) sàn ngoài TikTok/Shopee bị chặn'; end;
end $$;

-- sửa tại chỗ + khép bản cũ (đúng 2 lệnh client gửi khi tạo bản mới từ ngày sau)
update brand_service_terms set end_date = '2026-10-31' where label = 'HĐ 2026';
insert into brand_service_terms (brand_id, platform, kind, label, start_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', 'standard', 'HĐ 2026 v2', '2026-11-01', '{"v":1,"fees":[{"kind":"pct_nmv","pct":8}]}');
select pg_temp.chk('7) bản mới từ ngày sau + khép bản cũ', (select count(*) from brand_service_terms where brand_id = 'b0000000-0000-0000-0000-00000000000a' and kind = 'standard') = 2);
update brand_service_terms set updated_at = '2000-01-01' where label = 'HĐ B';
select pg_temp.chk('8) trigger updated_at chạy khi sửa', (select updated_at > '2000-01-01' from brand_service_terms where label = 'HĐ B'));

insert into brand_month_fee_inputs (brand_id, platform, period_month, ads_spend, creators_booked) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-01', 50000000, 12);
insert into brand_month_fee_inputs (brand_id, platform, period_month, ads_spend) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-01', 60000000)
  on conflict (brand_id, platform, period_month) do update set ads_spend = excluded.ads_spend;
select pg_temp.chk('9) số nhập tháng upsert theo (brand, sàn, tháng)', (select count(*) from brand_month_fee_inputs) = 1 and (select ads_spend from brand_month_fee_inputs) = 60000000);
do $$ begin
  begin
    insert into brand_month_fee_inputs (brand_id, platform, period_month) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok', '2026-10-15');
    raise exception 'FAIL 10) period_month không phải ngày 01 phải bị chặn';
  exception when check_violation then raise notice 'OK  10) period_month phải là ngày 01'; end;
end $$;

insert into brand_talent_rules (brand_id, talent_id, rule) values ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'blocked');
insert into brand_talent_rules (brand_id, talent_id, rule) values ('b0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', 'exclusive')
  on conflict (brand_id, talent_id) do update set rule = excluded.rule;
select pg_temp.chk('11) luật về host upsert theo (brand, host)', (select count(*) from brand_talent_rules) = 1 and (select rule from brand_talent_rules) = 'exclusive');

-- ===== brand A =====
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
set role authenticated;
select pg_temp.chk('12) brand chỉ đọc điều khoản của chính mình (không thấy brand B)', (select count(*) from brand_service_terms where brand_id = 'b0000000-0000-0000-0000-00000000000b') = 0 and (select count(*) from brand_service_terms) = 3);
select pg_temp.chk('13) brand không thấy số nhập tháng và luật về host', (select count(*) from brand_month_fee_inputs) = 0 and (select count(*) from brand_talent_rules) = 0);
do $$ begin
  begin
    insert into brand_service_terms (brand_id, platform, kind, start_date, terms) values ('b0000000-0000-0000-0000-00000000000a', 'Shopee', 'standard', '2026-10-01', '{"v":1,"fees":[]}');
    raise exception 'FAIL 14) brand ghi được điều khoản';
  exception when insufficient_privilege then raise notice 'OK  14) brand không ghi được điều khoản (RLS)'; end;
end $$;
update brand_service_terms set label = 'sửa lén' where brand_id = 'b0000000-0000-0000-0000-00000000000a';
select pg_temp.chk('15) brand sửa điều khoản: 0 dòng bị đổi', (select count(*) from brand_service_terms where label = 'sửa lén') = 0);

-- ===== talent =====
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
set role authenticated;
select pg_temp.chk('16) talent không đọc được gì ở 3 bảng', (select count(*) from brand_service_terms) = 0 and (select count(*) from brand_month_fee_inputs) = 0 and (select count(*) from brand_talent_rules) = 0);
