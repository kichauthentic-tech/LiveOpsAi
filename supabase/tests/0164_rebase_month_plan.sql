-- Kiểm migration 0164 (rebase_month_plan). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0164.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0164 thì phải đỏ ngay (hàm chưa có).
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
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'), ('a0000000-0000-0000-0000-000000000002', 'ops@t')
  on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA'), ('b0000000-0000-0000-0000-00000000000b', 'KHAC') on conflict do nothing;
insert into profiles (id, name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-00000000000a', 'Shopee'), ('b0000000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;

-- Tháng hiện tại theo giờ VN; "đã qua" = ngày 1, "tương lai" = ngày 28 (an toàn với mọi ngày chạy test từ 2 → 27).
create temp table t_ctx as select date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date as m,
  (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date) as d_past,
  (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date + 27) as d_fut;
select pg_temp.chk('ngày chạy test nằm giữa tháng', (now() at time zone 'Asia/Ho_Chi_Minh')::date between (select m from t_ctx) + 1 and (select m from t_ctx) + 26);

-- Dựng: kế hoạch Shopee ĐÃ CHỐT 3 ca: (a) đã qua có phiên, (b) tương lai ca mở, (c) đã qua nhưng phiên huỷ.
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', (select m from t_ctx), 'draft', 'Shopee', 600);
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-00000000000a', 'a', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', (select d_past from t_ctx), '10:00', '12:00', 'Completed'),
  ('d0000000-0000-0000-0000-00000000000c', 'c', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', (select d_past from t_ctx), '14:00', '16:00', 'Cancelled'),
  -- ca OP thêm, ngoài kế hoạch: đã qua (e) + tương lai (f); và một ca TikTok cùng giờ (không được lẫn sàn)
  ('d0000000-0000-0000-0000-00000000000e', 'e', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', (select d_past from t_ctx), '19:00', '21:00', 'Completed'),
  ('d0000000-0000-0000-0000-00000000000f', 'f', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', (select d_fut from t_ctx), '19:00', '21:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-0000000000a1', 'tt', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select d_past from t_ctx), '10:00', '12:00', 'Completed');
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status, session_id) values
  ('e0000000-0000-0000-0000-00000000000a', (select d_past from t_ctx), '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee', 'finalized', 'd0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-00000000000b', (select d_fut from t_ctx), '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'VERA', 'Shopee', 'open', null);
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv, slot_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', (select d_past from t_ctx), '10:00', '12:00', 200, 'e0000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', (select d_fut from t_ctx), '10:00', '12:00', 200, 'e0000000-0000-0000-0000-00000000000b'),
  ('f0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', (select d_past from t_ctx), '14:00', '16:00', 200, null);
update brand_month_plans set status = 'locked' where id = 'c0000000-0000-0000-0000-000000000001';

-- 1) quyền: ops bị chặn, ceo/admin chạy được
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select pg_temp.must_fail('ops không chia lại', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"id":"f0000000-0000-0000-0000-00000000000a","target":1}]'::jsonb)$q$, 'Chỉ ceo/admin');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- 2) luật chặn thêm ca ngày đã qua vẫn còn khi KHÔNG qua RPC
select pg_temp.must_fail('thêm trực tiếp ca đã qua bị chặn', format($q$insert into brand_month_plan_slots (plan_id, date, start_time, end_time) values ('c0000000-0000-0000-0000-000000000001', %L, '19:00', '21:00')$q$, (select d_past from t_ctx)), 'không thêm ca vào ngày đã qua');

-- 3) rebase: đổi 2 ca, huỷ ca (c) về 0, thêm ca OP đã qua (e) + tương lai (f), kể cả sàn khác phải bị từ chối
select pg_temp.must_fail('ca TikTok không vào kế hoạch Shopee', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"session_id":"d0000000-0000-0000-0000-0000000000a1","target":10}]'::jsonb)$q$, 'không thuộc kênh');
select pg_temp.must_fail('ca huỷ không vào kế hoạch', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"session_id":"d0000000-0000-0000-0000-00000000000c","target":10}]'::jsonb)$q$, 'đã huỷ');
select pg_temp.chk('lỗi thì rollback cả batch (Σ vẫn 600)', (select sum(target_gmv) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001') = 600);

create temp table t_res as select rebase_month_plan('c0000000-0000-0000-0000-000000000001', jsonb_build_array(
  jsonb_build_object('id', 'f0000000-0000-0000-0000-00000000000a', 'target', 300),
  jsonb_build_object('id', 'f0000000-0000-0000-0000-00000000000b', 'target', 250),
  jsonb_build_object('id', 'f0000000-0000-0000-0000-00000000000c', 'target', 0),
  jsonb_build_object('session_id', 'd0000000-0000-0000-0000-00000000000e', 'target', 150, 'expected', 120),
  jsonb_build_object('session_id', 'd0000000-0000-0000-0000-00000000000f', 'target', 100)
), 'vòng test') as r;
select pg_temp.chk('đổi 3 ca, thêm 2 ca, huỷ 1 ca về 0', (r->>'changed')::int = 3 and (r->>'added')::int = 2 and (r->>'zeroed')::int = 1) from t_res;
select pg_temp.chk('Σ target ca = 800 và kế hoạch cập nhật theo', (select sum(target_gmv) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001') = 800
  and (select target_gmv from brand_month_plans where id = 'c0000000-0000-0000-0000-000000000001') = 800);
select pg_temp.chk('ca OP đã qua nằm trong kế hoạch, gắn ca thật finalized, không mở đăng ký',
  exists (select 1 from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id
           where ps.plan_id = 'c0000000-0000-0000-0000-000000000001' and ps.date = (select d_past from t_ctx) and ps.start_time = '19:00'
             and s.session_id = 'd0000000-0000-0000-0000-00000000000e' and s.status = 'finalized' and ps.target_gmv = 150 and ps.expected_gmv = 120));
select pg_temp.chk('ca OP tương lai cũng vào kế hoạch', exists (select 1 from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001' and date = (select d_fut from t_ctx) and start_time = '19:00' and target_gmv = 100));
select pg_temp.chk('không mở ca chờ đăng ký nào', (select count(*) from shift_slots where status = 'open') = 1);
select pg_temp.chk('nhật ký: 3 đổi + 2 thêm (target cũ 0)', (select count(*) from plan_target_audit where batch_id = (select (r->>'batch_id')::uuid from t_res)) = 5
  and (select count(*) from plan_target_audit where batch_id = (select (r->>'batch_id')::uuid from t_res) and old_target = 0) = 2);

-- 4) chạy lại cùng ca thêm ⇒ từ chối (đã có trong kế hoạch)
select pg_temp.must_fail('thêm lại ca đã có', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"session_id":"d0000000-0000-0000-0000-00000000000e","target":1}]'::jsonb)$q$, 'đã có trong kế hoạch');

-- 5) sau rebase, đổi target ca ĐÃ QUA bằng UPDATE thẳng vẫn bị chặn (cờ chỉ sống trong transaction của RPC)
select pg_temp.must_fail('update thẳng ca đã qua vẫn bị chặn', $q$update brand_month_plan_slots set target_gmv = 1 where id = 'f0000000-0000-0000-0000-00000000000a'$q$, 'mẫu số run-rate');

-- 6) ca ngoài tháng, kế hoạch chưa chốt, id lạ
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-0000000000b1', 'next', 'b0000000-0000-0000-0000-00000000000a', 'Shopee', (select m from t_ctx) + 40, '10:00', '12:00', 'Upcoming');
select pg_temp.must_fail('ca ngoài tháng', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"session_id":"d0000000-0000-0000-0000-0000000000b1","target":1}]'::jsonb)$q$, 'ngoài tháng');
select pg_temp.must_fail('id lạ', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"id":"f0000000-0000-0000-0000-0000000000ff","target":1}]'::jsonb)$q$, 'không thuộc kế hoạch');
select pg_temp.must_fail('target âm', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"id":"f0000000-0000-0000-0000-00000000000a","target":-1}]'::jsonb)$q$, 'không âm');
select pg_temp.must_fail('trùng id trong batch', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"id":"f0000000-0000-0000-0000-00000000000a","target":1},{"id":"f0000000-0000-0000-0000-00000000000a","target":2}]'::jsonb)$q$, 'hai lần');
update brand_month_plans set status = 'draft' where id = 'c0000000-0000-0000-0000-000000000001';
select pg_temp.must_fail('kế hoạch nháp', $q$select rebase_month_plan('c0000000-0000-0000-0000-000000000001', '[{"id":"f0000000-0000-0000-0000-00000000000a","target":1}]'::jsonb)$q$, 'chưa chốt');
select pg_temp.chk('vô danh không gọi được RPC', not has_function_privilege('anon', 'rebase_month_plan(uuid,jsonb,text)', 'execute'));
rollback;
