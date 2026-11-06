-- Kiểm migration 0200 (lịch tháng sau 2 đợt + ca bổ sung). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0200.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0199 thì đỏ ngay mục 1 (chưa có set_roster_month_milestones).
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

-- Tháng thử: tháng sau nữa (mọi ngày ở tương lai).
select set_config('t.m', (date_trunc('month', current_date) + interval '2 month')::date::text, false);

insert into auth.users (id, email) values
  ('a2000000-0000-0000-0000-000000000001', 'trainer@t'),
  ('a2000000-0000-0000-0000-000000000003', 'host@t'),
  ('a2000000-0000-0000-0000-000000000004', 'host2@t')
on conflict do nothing;
insert into brands (id, name) values ('b2000000-0000-0000-0000-00000000000a', 'CROCS');
insert into brand_channels (brand_id, platform) values ('b2000000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
insert into talents (id, name, nickname) values
  ('c2000000-0000-0000-0000-000000000001', 'Host Quen', 'Quen'),
  ('c2000000-0000-0000-0000-000000000002', 'Host Lạ', 'Lạ');
insert into profiles (id, name, email, role) values
  ('a2000000-0000-0000-0000-000000000001', 'Trainer', 'trainer@t', 'trainer')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id, status) values
  ('a2000000-0000-0000-0000-000000000003', 'Host Quen', 'host@t', 'talent', 'c2000000-0000-0000-0000-000000000001', 'Active'),
  ('a2000000-0000-0000-0000-000000000004', 'Host Lạ', 'host2@t', 'talent', 'c2000000-0000-0000-0000-000000000002', 'Active')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id, status = 'Active';
-- Host Quen từng live CROCS TikTok 10 ngày trước ⇒ chỉ người này nhận tin ca bổ sung.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status, data_source) values
  ('d2000000-0000-0000-0000-000000000001', 't', 'b2000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '19:00', '22:00',
   'c2000000-0000-0000-0000-000000000001', 'Host Quen', 'Completed', 'live_snapshot');

grant select, insert, update, delete on brand_month_plans, brand_month_plan_slots, shift_slots, session_availability,
  plan_target_audit, notifications to authenticated;

-- Kế hoạch đã chốt: 1 ca đợt 1 (ngày 3), 1 ca đợt 2 (ngày 20).
set role authenticated;
select pg_temp.as_user('a2000000-0000-0000-0000-000000000001');
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('e2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 'draft', 'TikTok', 0);
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e2000000-0000-0000-0000-000000000001', current_setting('t.m')::date + 2, '19:00', '22:00', 0),
  ('e2000000-0000-0000-0000-000000000001', current_setting('t.m')::date + 19, '19:00', '22:00', 0);
select lock_month_plan('e2000000-0000-0000-0000-000000000001');

-- ============ 1) Mốc 2 đợt ============
select pg_temp.must_fail('1a đợt 2 trước đợt 1 bị chặn',
  $q$select set_roster_month_milestones(current_setting('t.m')::date, now() + interval '2 day', now() + interval '1 day', null, null)$q$, 'đợt 2 phải sau');
select pg_temp.chk('1b đặt 4 mốc ⇒ MỘT tin mỗi talent (2 người), 2 ca mở',
  (select set_roster_month_milestones(current_setting('t.m')::date, now() - interval '1 minute', now() + interval '1 day',
     current_setting('t.m')::date - 15, current_setting('t.m')::date - 5)) = '{"notified": 2, "open_slots": 2}'::jsonb);
reset role;
select pg_temp.chk('1c tin nói rõ hai hạn', (select bool_and(body like '%ca ngày 1–15%' and body like '%ca ngày 16–%') from notifications where kind = 'signup_open'));
set role authenticated;

-- Đợt 1 đã qua hạn, đợt 2 còn hạn.
select pg_temp.as_user('a2000000-0000-0000-0000-000000000003');
select pg_temp.must_fail('1d ca ngày 3 (đợt 1, quá hạn): talent không đăng ký',
  $q$insert into session_availability (slot_id, talent_id) select id, 'c2000000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and extract(day from date) = 3$q$,
  'row-level security');
insert into session_availability (slot_id, talent_id)
  select id, 'c2000000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and extract(day from date) = 20;
select pg_temp.chk('1e ca ngày 20 (đợt 2, còn hạn): talent đăng ký được', (select count(*) from session_availability) = 1);

-- Đợt 2 trống ⇒ hạn đợt 1 áp cả tháng (đúng như 0180).
reset role;
update roster_months set signup_deadline_2 = null where month = current_setting('t.m')::date;
delete from session_availability;
set role authenticated;
select pg_temp.must_fail('1f không có hạn đợt 2 ⇒ ca ngày 20 theo hạn đợt 1 (đã qua)',
  $q$insert into session_availability (slot_id, talent_id) select id, 'c2000000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and extract(day from date) = 20$q$,
  'row-level security');
select pg_temp.must_fail('1g talent không tự đặt mốc',
  $q$select set_roster_month_milestones(current_setting('t.m')::date, null, null, null, null)$q$, 'Chỉ người xếp lịch');

-- ============ 2) Ca bổ sung ============
select pg_temp.as_user('a2000000-0000-0000-0000-000000000001');
reset role;
delete from notifications;
set role authenticated;
select pg_temp.must_fail('2a hạn đã qua bị chặn',
  $q$select open_extra_plan_slots('e2000000-0000-0000-0000-000000000001', jsonb_build_array(jsonb_build_object('date', current_setting('t.m')::date + 5, 'start_time', '10:00', 'end_time', '13:00')), now() - interval '1 hour')$q$,
  'tương lai');
select pg_temp.chk('2b thêm 2 ca mới + 1 ca trùng giờ ⇒ thêm 2, bỏ 1, mở 2, báo 1 người từng live kênh',
  (select open_extra_plan_slots('e2000000-0000-0000-0000-000000000001', jsonb_build_array(
     jsonb_build_object('date', current_setting('t.m')::date + 5, 'start_time', '10:00', 'end_time', '13:00', 'expected_gmv', 50),
     jsonb_build_object('date', current_setting('t.m')::date + 21, 'start_time', '14:00', 'end_time', '17:00'),
     jsonb_build_object('date', current_setting('t.m')::date + 19, 'start_time', '19:00', 'end_time', '22:00')),
     now() + interval '48 hour')) = '{"added": 2, "opened": 2, "skipped": 1, "notified": 1}'::jsonb);
select pg_temp.chk('2c ca bổ sung là ca KẾ HOẠCH (4 dòng, target 0, ghi chú) — không thành ca tăng cường',
  (select count(*) from brand_month_plan_slots where plan_id = 'e2000000-0000-0000-0000-000000000001') = 4
  and (select count(*) from brand_month_plan_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and note = 'Ca bổ sung' and target_gmv = 0) = 2
  and (select count(*) from plan_boost_slots) = 0);
select pg_temp.chk('2d ca mở của ca bổ sung mang hạn riêng',
  (select count(*) from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and status = 'open' and signup_deadline is not null) = 2);
reset role;
select pg_temp.chk('2e tin chỉ tới người từng live kênh', (select count(*) from notifications where user_id = 'a2000000-0000-0000-0000-000000000003') = 1
  and (select count(*) from notifications where user_id = 'a2000000-0000-0000-0000-000000000004') = 0);

-- Hạn tháng đã đóng nhưng ca bổ sung (hạn riêng còn) vẫn đăng ký được.
set role authenticated;
select pg_temp.as_user('a2000000-0000-0000-0000-000000000004');
insert into session_availability (slot_id, talent_id)
  select id, 'c2000000-0000-0000-0000-000000000002' from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and signup_deadline is not null and extract(day from date) = 6;
select pg_temp.chk('2f ca bổ sung: talent đăng ký được dù tháng đã đóng', (select count(*) from session_availability) = 1);
reset role;
update shift_slots set signup_deadline = now() - interval '1 minute' where signup_deadline is not null;
set role authenticated;
select pg_temp.must_fail('2g qua hạn riêng: không đăng ký thêm',
  $q$insert into session_availability (slot_id, talent_id) select id, 'c2000000-0000-0000-0000-000000000002' from shift_slots where plan_id = 'e2000000-0000-0000-0000-000000000001' and signup_deadline is not null and extract(day from date) = 22$q$,
  'row-level security');

select pg_temp.as_user('a2000000-0000-0000-0000-000000000003');
select pg_temp.must_fail('2h talent không mở ca bổ sung',
  $q$select open_extra_plan_slots('e2000000-0000-0000-0000-000000000001', '[{"date":"2099-01-01","start_time":"10:00","end_time":"12:00"}]'::jsonb, now() + interval '1 day')$q$, 'Chỉ người xếp lịch');
reset role;
update brand_month_plans set status = 'draft' where id = 'e2000000-0000-0000-0000-000000000001';
set role authenticated;
select pg_temp.as_user('a2000000-0000-0000-0000-000000000001');
select pg_temp.must_fail('2i kế hoạch nháp: không dùng ca bổ sung',
  $q$select open_extra_plan_slots('e2000000-0000-0000-0000-000000000001', '[{"date":"2099-01-01","start_time":"10:00","end_time":"12:00"}]'::jsonb, now() + interval '1 day')$q$, 'đã chốt');
reset role;
