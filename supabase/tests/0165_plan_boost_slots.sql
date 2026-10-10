-- Kiểm migration 0165 (ca tăng cường). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0165.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0165 thì phải đỏ ngay (bảng/hàm chưa có).
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

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
  ('a0000000-0000-0000-0000-000000000003', 'brand@t')
  on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA'), ('b0000000-0000-0000-0000-00000000000b', 'KHAC') on conflict do nothing;
insert into profiles (id, name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations'),
  ('a0000000-0000-0000-0000-000000000003', 'Brand', 'brand@t', 'brand')
  on conflict (id) do update set role = excluded.role;
insert into brand_channels (brand_id, platform) values
  ('b0000000-0000-0000-0000-00000000000a', 'Shopee'), ('b0000000-0000-0000-0000-00000000000a', 'TikTok'),
  ('b0000000-0000-0000-0000-00000000000b', 'TikTok') on conflict do nothing;

-- Tháng hiện tại theo giờ VN; "đã qua" = ngày 1, tương lai = ngày 20–28 (an toàn với mọi ngày chạy test từ 2 → 19).
create temp table t_ctx as select date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date as m;
select pg_temp.chk('ngày chạy test nằm giữa tháng', (now() at time zone 'Asia/Ho_Chi_Minh')::date between (select m from t_ctx) + 1 and (select m from t_ctx) + 18);

-- Kế hoạch TikTok ĐÃ CHỐT của VERA: một ca kế hoạch ngày 28 10–12h gắn ca mở. KHAC chỉ có kế hoạch NHÁP.
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', (select m from t_ctx), 'draft', 'TikTok', 500),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000b', (select m from t_ctx), 'draft', 'TikTok', 500);
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-00000000000a', (select m from t_ctx) + 27, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open');
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv, slot_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', (select m from t_ctx) + 27, '10:00', '12:00', 500, 'e0000000-0000-0000-0000-00000000000a');
update brand_month_plans set status = 'locked' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.chk('dựng xong: chưa có ca tăng cường nào', (select count(*) from plan_boost_slots) = 0);

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);  -- ops mở ca

-- 1) OP mở ca tương lai ngoài kế hoạch ⇒ có dòng tăng cường, đang chờ target
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-000000000001', (select m from t_ctx) + 19, '19:00', '21:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open');
select pg_temp.chk('1. ca OP mở thêm ⇒ sinh dòng tăng cường chờ target',
  (select count(*) from plan_boost_slots where plan_id = 'c0000000-0000-0000-0000-000000000001' and shift_slot_id = 'e0000000-0000-0000-0000-000000000001' and target_pending and target_gmv = 0) = 1);

-- 2) Không sinh dòng tăng cường khi không đáng
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-000000000002', (select m from t_ctx) + 27, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee', 'open'),     -- sàn khác, VERA Shopee chưa có kế hoạch
  ('e0000000-0000-0000-0000-000000000003', (select m from t_ctx) + 22, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000b', 'KHAC', 'TikTok', 'open'),     -- kế hoạch còn nháp
  ('e0000000-0000-0000-0000-000000000004', (select m from t_ctx) + 40, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open'),     -- tháng sau, chưa có kế hoạch
  ('e0000000-0000-0000-0000-000000000005', (select m from t_ctx) + 23, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'cancelled'); -- ca đã huỷ
select pg_temp.chk('2. sàn khác / kế hoạch nháp / tháng chưa có kế hoạch / ca huỷ ⇒ không sinh', (select count(*) from plan_boost_slots) = 1);

-- 3) Ca cùng giờ với ca kế hoạch gốc (kể cả khác ca thật) không phải ca tăng cường
select pg_temp.must_fail('3a. không mở được hai ca cùng giờ (chỉ mục sẵn có)', format($q$insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, status) values (%L, '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open')$q$, (select m from t_ctx) + 27), 'duplicate');
select pg_temp.chk('3b. ca kế hoạch gốc không sinh dòng tăng cường', (select count(*) from plan_boost_slots where date = (select m from t_ctx) + 27) = 0);

-- 4) Ca đã qua do OP thêm (không bị trigger 0133 chặn vì nằm bảng riêng)
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-000000000006', (select m from t_ctx), '08:00', '10:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open');
select pg_temp.chk('4. ca đã qua OP thêm vẫn sinh dòng tăng cường', (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000006') = 1);

-- 5) Quyền ghi target: ops được, brand bị chặn, sai kế hoạch / số âm bị từ chối; không có đường ghi trực tiếp
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.must_fail('5a. brand không ghi được target', $q$select set_boost_targets('c0000000-0000-0000-0000-000000000001', '[]'::jsonb)$q$, 'Chỉ ceo/admin/operations');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.must_fail('5b. id không thuộc kế hoạch', format($q$select set_boost_targets('c0000000-0000-0000-0000-000000000002', jsonb_build_array(jsonb_build_object('id', %L, 'target', 5)))$q$, (select id from plan_boost_slots limit 1)), 'không thuộc kế hoạch');
select pg_temp.must_fail('5c. target âm', format($q$select set_boost_targets('c0000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('id', %L, 'target', -1)))$q$, (select id from plan_boost_slots limit 1)), 'không âm');

create temp table t_before as select
  (select target_gmv from brand_month_plans where id = 'c0000000-0000-0000-0000-000000000001') as plan_target,
  (select coalesce(sum(target_gmv), 0) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001') as slots_sum;
select set_boost_targets('c0000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('id', (select id from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000001'), 'target', 123456.4, 'expected', 120000)));
select pg_temp.chk('5d. ops ghi target đề xuất, hết chờ',
  (select target_gmv = 123456 and expected_gmv = 120000 and not target_pending from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000001'));
select pg_temp.chk('5e. target tháng và Σ ca kế hoạch KHÔNG đổi',
  (select plan_target from t_before) = (select target_gmv from brand_month_plans where id = 'c0000000-0000-0000-0000-000000000001')
  and (select slots_sum from t_before) = (select coalesce(sum(target_gmv), 0) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001'));

-- 6) Ghi trực tiếp vào bảng (không qua RPC) bị RLS chặn với phiên đã đăng nhập
grant select on t_ctx to authenticated;
-- Supabase cấp sẵn quyền bảng cho authenticated (shim thì không) — cấp lại để RLS là thứ duy nhất được kiểm.
grant select, insert, update, delete on plan_boost_slots to authenticated;
set role authenticated;
select pg_temp.must_fail('6a. client không insert trực tiếp', format($q$insert into plan_boost_slots (plan_id, date, start_time, end_time) values ('c0000000-0000-0000-0000-000000000001', %L, '01:00', '02:00')$q$, (select m from t_ctx) + 24), 'row-level security');
select pg_temp.chk('6b. ops đọc được dòng tăng cường', (select count(*) from plan_boost_slots) = 2);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
select pg_temp.chk('6c. brand không đọc được', (select count(*) from plan_boost_slots) = 0);
reset role;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);

-- 7) Ca bị dời giờ: dòng cũ bỏ, dòng mới chờ target lại; dời vào giờ của ca kế hoạch gốc thì hết là ca tăng cường
update shift_slots set start_time = '20:00', end_time = '22:00' where id = 'e0000000-0000-0000-0000-000000000001';
select pg_temp.chk('7a. dời giờ ⇒ dòng mới ở giờ mới, chờ target',
  (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000001' and start_time = '20:00' and target_pending and target_gmv = 0) = 1
  and (select count(*) from plan_boost_slots where start_time = '19:00') = 0);

-- 8) Ca huỷ: dòng tăng cường GIỮ (như luật ca kế hoạch huỷ giữ target)
update shift_slots set status = 'cancelled' where id = 'e0000000-0000-0000-0000-000000000006';
select pg_temp.chk('8. huỷ ca không xoá dòng tăng cường', (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000006') = 1);

-- 9) Đưa ca vào kế hoạch GỐC (Chốt lại thêm ca cùng giờ) ⇒ dòng tăng cường biến mất, không có hai chỗ
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv)
  values ('c0000000-0000-0000-0000-000000000001', (select m from t_ctx) + 19, '20:00', '22:00', 70);
select pg_temp.chk('9a. thêm ca kế hoạch gốc cùng giờ ⇒ xoá dòng tăng cường', (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000001') = 0);
-- Chốt lại: ca kế hoạch (không có slot) → lock sinh ca / gắn ca; không được sinh dòng tăng cường chen vào
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv)
  values ('c0000000-0000-0000-0000-000000000001', (select m from t_ctx) + 21, '14:00', '16:00', 90);
select lock_month_plan('c0000000-0000-0000-0000-000000000001');
select pg_temp.chk('9b. Chốt lại sinh ca cho dòng kế hoạch gốc, KHÔNG sinh dòng tăng cường',
  (select count(*) from shift_slots where date = (select m from t_ctx) + 21 and start_time = '14:00' and status = 'open') = 1
  and (select count(*) from plan_boost_slots where date = (select m from t_ctx) + 21) = 0);

-- 10) rebase_month_plan (0164) đưa ca OP thêm vào kế hoạch gốc: không xung đột với dòng tăng cường, dòng tăng cường mất
select set_boost_targets('c0000000-0000-0000-0000-000000000001', '[]'::jsonb);
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-000000000007', (select m from t_ctx) + 24, '09:00', '11:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'TikTok', 'open');
select pg_temp.chk('10a. ca OP mới ⇒ dòng tăng cường', (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000007') = 1);
select rebase_month_plan('c0000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('shift_slot_id', 'e0000000-0000-0000-0000-000000000007', 'target', 50)), 'test 0165');
select pg_temp.chk('10b. rebase thêm ca vào kế hoạch gốc, dòng tăng cường biến mất',
  (select count(*) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001' and slot_id = 'e0000000-0000-0000-0000-000000000007') = 1
  and (select count(*) from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-000000000007') = 0);

-- 11) rebase ca thật chưa có shift_slot: rebase tự tạo shift_slot finalized — không sinh dòng tăng cường dư
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-000000000001', 's', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select m from t_ctx) + 25, '09:00', '11:00', 'Upcoming');
select rebase_month_plan('c0000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('session_id', 'd0000000-0000-0000-0000-000000000001', 'target', 40)), 'test 0165');
select pg_temp.chk('11. rebase ca có phiên: vào kế hoạch gốc, không có dòng tăng cường',
  (select count(*) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001' and date = (select m from t_ctx) + 25) = 1
  and (select count(*) from plan_boost_slots where date = (select m from t_ctx) + 25) = 0);

-- 12) Ca nạp bù (phiên không có shift_slot) không sinh dòng tăng cường
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status, is_backfill) values
  ('d0000000-0000-0000-0000-000000000002', 'bf', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select m from t_ctx) + 3, '09:00', '11:00', 'Completed', true);
select pg_temp.chk('12. ca nạp bù không sinh dòng tăng cường', (select count(*) from plan_boost_slots where date = (select m from t_ctx) + 3) = 0);

-- 13) Không có policy ghi, anon không gọi được hàm ghi
select pg_temp.chk('13. anon không gọi được set_boost_targets', not has_function_privilege('anon', 'public.set_boost_targets(uuid,jsonb)', 'execute'));

rollback;
select 'ALL OK 0165' as result;
