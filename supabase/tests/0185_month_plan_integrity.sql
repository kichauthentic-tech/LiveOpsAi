-- Kiểm migration 0185 (Kế Hoạch Tháng — audit 27/10). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0185.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0185 thì phải đỏ (mục 1: Chốt lại mở lại ca đã huỷ).
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
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS') on conflict do nothing;
insert into profiles (id, name, email, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin'),
  ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;

-- Tháng hiện tại theo giờ VN; "đã qua" = ngày 1, "tương lai" = ngày 28 (chạy test từ ngày 2 → 27).
create temp table t_ctx as select date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date as m,
  (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date) as d_past,
  (date_trunc('month', (now() at time zone 'Asia/Ho_Chi_Minh'))::date + 27) as d_fut;
select pg_temp.chk('ngày chạy test nằm giữa tháng', (now() at time zone 'Asia/Ho_Chi_Minh')::date between (select m from t_ctx) + 1 and (select m from t_ctx) + 26);
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false); -- ops

-- Dựng: kế hoạch đã chốt, 3 ca: (a) đã qua có phiên, (b) tương lai có phiên, (c) tương lai có phiên ĐÃ HUỶ (ca chờ cancelled).
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', (select m from t_ctx), 'draft', 'TikTok', 600);
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-00000000000a', 'a', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select d_past from t_ctx), '10:00', '12:00', 'Completed'),
  ('d0000000-0000-0000-0000-00000000000b', 'b', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select d_fut from t_ctx), '20:00', '23:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-00000000000c', 'c', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select d_fut from t_ctx), '11:00', '14:00', 'Cancelled');
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status, session_id) values
  ('e0000000-0000-0000-0000-00000000000a', (select d_past from t_ctx), '10:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'finalized', 'd0000000-0000-0000-0000-00000000000a'),
  ('e0000000-0000-0000-0000-00000000000b', (select d_fut from t_ctx), '20:00', '23:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'finalized', 'd0000000-0000-0000-0000-00000000000b'),
  ('e0000000-0000-0000-0000-00000000000c', (select d_fut from t_ctx), '11:00', '14:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'cancelled', 'd0000000-0000-0000-0000-00000000000c');
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv, slot_id) values
  ('f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', (select d_past from t_ctx), '10:00', '12:00', 200, 'e0000000-0000-0000-0000-00000000000a'),
  ('f0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', (select d_fut from t_ctx), '20:00', '23:00', 200, 'e0000000-0000-0000-0000-00000000000b'),
  ('f0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000001', (select d_fut from t_ctx), '11:00', '14:00', 200, 'e0000000-0000-0000-0000-00000000000c');
update brand_month_plans set status = 'locked' where id = 'c0000000-0000-0000-0000-000000000001';

-- 1) Chốt lại không mở lại ca đã huỷ
create temp table t_lock as select lock_month_plan('c0000000-0000-0000-0000-000000000001') as r;
select pg_temp.chk('Chốt lại: 0 ca mới, giữ huỷ 1 ca, 0 "bỏ qua ngày đã qua"',
  (r->>'created')::int = 0 and (r->>'kept_cancelled')::int = 1 and (r->>'skipped_past')::int = 0) from t_lock;
select pg_temp.chk('không có ca chờ đăng ký nào được mở', not exists (select 1 from shift_slots where status = 'open'));
select pg_temp.chk('ca kế hoạch (c) vẫn trỏ ca đã huỷ', (select slot_id from brand_month_plan_slots where id = 'f0000000-0000-0000-0000-00000000000c') = 'e0000000-0000-0000-0000-00000000000c');

-- 1b) OP tạo lại ca thật đúng giờ ⇒ Chốt lại gắn ca thay thế (không mở đăng ký)
insert into live_sessions (id, title, brand_id, platform, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-0000000000c2', 'c2', 'b0000000-0000-0000-0000-00000000000a', 'TikTok', (select d_fut from t_ctx), '11:00', '14:00', 'Upcoming');
select pg_temp.chk('ca huỷ có ca thay thế ⇒ gắn ca thật', (lock_month_plan('c0000000-0000-0000-0000-000000000001')->>'linked_sessions')::int = 1);

-- 2) Sau chốt: ops không đổi target ca; admin đổi được và có nhật ký
select pg_temp.must_fail('ops đổi target ca sau chốt bị chặn', $q$update brand_month_plan_slots set target_gmv = 250 where id = 'f0000000-0000-0000-0000-00000000000b'$q$, 'chỉ ceo/admin');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false); -- admin
update brand_month_plan_slots set target_gmv = 250 where id = 'f0000000-0000-0000-0000-00000000000b';
select pg_temp.chk('admin đổi target ⇒ nhật ký "Sửa tay ở lưới" 200→250',
  exists (select 1 from plan_target_audit where plan_slot_id = 'f0000000-0000-0000-0000-00000000000b' and old_target = 200 and new_target = 250 and note = 'Sửa tay ở lưới'));
select pg_temp.must_fail('ca đã qua vẫn khoá target', $q$update brand_month_plan_slots set target_gmv = 1 where id = 'f0000000-0000-0000-0000-00000000000a'$q$, 'mẫu số run-rate');
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false); -- ops

-- 3) OP dời giờ ca thật ⇒ ca chờ + ca kế hoạch dời theo (kể cả ca đã chốt người); target giữ nguyên
update live_sessions set start_time = '21:00', end_time = '00:00' where id = 'd0000000-0000-0000-0000-00000000000b';
select pg_temp.chk('ca kế hoạch dời theo 21:00–00:00, target giữ 250',
  (select start_time = '21:00' and end_time = '00:00' and target_gmv = 250 from brand_month_plan_slots where id = 'f0000000-0000-0000-0000-00000000000b'));
select pg_temp.chk('ca chờ dời theo', (select start_time = '21:00' from shift_slots where id = 'e0000000-0000-0000-0000-00000000000b'));
-- ca đã qua cũng dời theo (giờ thật), target không đổi
update live_sessions set start_time = '10:30' where id = 'd0000000-0000-0000-0000-00000000000a';
select pg_temp.chk('ca đã qua dời giờ theo ca thật', (select start_time = '10:30' and target_gmv = 200 from brand_month_plan_slots where id = 'f0000000-0000-0000-0000-00000000000a'));
-- dời sang tháng khác: ca kế hoạch ở lại tháng của nó
update live_sessions set date = (select m from t_ctx) + 45 where id = 'd0000000-0000-0000-0000-0000000000c2';
select pg_temp.chk('dời sang tháng khác: ca kế hoạch giữ ngày', (select date = (select d_fut from t_ctx) from brand_month_plan_slots where id = 'f0000000-0000-0000-0000-00000000000c'));
select pg_temp.must_fail('dời tay ca đã chốt người trong lưới vẫn bị chặn', $q$update brand_month_plan_slots set start_time = '18:00' where id = 'f0000000-0000-0000-0000-00000000000b'$q$, 'đã chốt người');

-- 4) replace_plan_slots: giữ ca đã qua (không bị guard coi là "thêm ca ngày đã qua"), thêm ca mới, bỏ ca, nhật ký theo lượt
create temp table t_keep as select jsonb_build_array(
  jsonb_build_object('date', (select d_past from t_ctx), 'start_time', '10:30', 'end_time', '12:00', 'target_gmv', 200, 'expected_gmv', 0, 'note', ''),
  jsonb_build_object('date', (select d_fut from t_ctx), 'start_time', '21:00', 'end_time', '00:00', 'target_gmv', 250, 'expected_gmv', 0, 'note', ''),
  jsonb_build_object('date', (select d_fut from t_ctx), 'start_time', '11:00', 'end_time', '14:00', 'target_gmv', 200, 'expected_gmv', 0, 'note', '')
) as keep;
select pg_temp.chk('lưu lưới gồm ca đã qua + thêm 1 ca tương lai', replace_plan_slots('c0000000-0000-0000-0000-000000000001',
  (select keep from t_keep) || jsonb_build_array(jsonb_build_object('date', (select d_fut from t_ctx), 'start_time', '15:00', 'end_time', '18:00', 'target_gmv', 90, 'expected_gmv', 80, 'note', ''))) = 4);
select pg_temp.chk('thêm ca sau chốt ⇒ nhật ký 0→90', (select count(*) = 1 from plan_target_audit where note = 'Thêm ca sau chốt' and new_target = 90));
select pg_temp.chk('bỏ ca 15:00 ⇒ còn 3 ca', replace_plan_slots('c0000000-0000-0000-0000-000000000001', (select keep from t_keep)) = 3);
-- câu riêng: cùng một câu thì phép đếm đọc snapshot TRƯỚC khi hàm ghi
select pg_temp.chk('bỏ ca ⇒ nhật ký 90→0', (select count(*) = 1 from plan_target_audit where note = 'Bỏ ca khỏi kế hoạch' and old_target = 90));
-- thêm 1 ca mới (ghi được) + đổi target ca đã qua (bị chặn) trong cùng lượt ⇒ cả lượt rollback, ca mới không còn
select pg_temp.must_fail('lưu lưới đổi target ca đã qua ⇒ rollback cả lượt', format($q$select replace_plan_slots('c0000000-0000-0000-0000-000000000001', %L::jsonb)$q$,
  (select jsonb_set(keep, '{0,target_gmv}', '1') || jsonb_build_array(jsonb_build_object('date', (select d_fut from t_ctx), 'start_time', '07:00', 'end_time', '09:00', 'target_gmv', 5)) from t_keep)), 'mẫu số run-rate');
select pg_temp.chk('lỗi giữa chừng không mất ca nào', (select count(*) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001') = 3);
select pg_temp.chk('vô danh không gọi được replace_plan_slots', not has_function_privilege('anon', 'replace_plan_slots(uuid,jsonb)', 'execute'));
select pg_temp.chk('client không gọi thẳng sync_session_plan_time', not has_function_privilege('authenticated', 'sync_session_plan_time(uuid)', 'execute'));
rollback;
