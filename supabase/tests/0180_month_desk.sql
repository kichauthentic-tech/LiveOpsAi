-- Kiểm migration 0180 (Điều Phối Lịch Live đợt 2). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0180.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0179 thì đỏ ở mục 1 (trainer chưa ghi được kế hoạch).
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

-- Tháng thử: tháng sau nữa (luôn ở tương lai, mọi ngày chưa qua).
select set_config('t.m', (date_trunc('month', current_date) + interval '2 month')::date::text, false);

insert into auth.users (id, email) values
  ('a1800000-0000-0000-0000-000000000001', 'trainer@t'),
  ('a1800000-0000-0000-0000-000000000002', 'ops@t'),
  ('a1800000-0000-0000-0000-000000000003', 'host@t'),
  ('a1800000-0000-0000-0000-000000000005', 'brand@t')
on conflict do nothing;
insert into brands (id, name) values ('b1800000-0000-0000-0000-00000000000a', 'VERA');
insert into brand_channels (brand_id, platform) values ('b1800000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
insert into talents (id, name, nickname) values ('c1800000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'S.Hùng');
insert into profiles (id, name, email, role) values
  ('a1800000-0000-0000-0000-000000000001', 'Trainer', 'trainer@t', 'trainer'),
  ('a1800000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id, status) values
  ('a1800000-0000-0000-0000-000000000003', 'Host', 'host@t', 'talent', 'c1800000-0000-0000-0000-000000000001', 'Active')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a1800000-0000-0000-0000-000000000005', 'Brand', 'brand@t', 'brand', 'b1800000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = 'brand';
insert into brand_contracts (id, brand_id, start_month, monthly_hours, platform, status) values
  ('f1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 200, 'TikTok', 'active');

-- Bản replay không có grant mặc định của Supabase cho bảng — cấp đúng các bảng mục dưới đọc/ghi.
grant select, insert, update, delete on brand_month_plans, brand_month_plan_slots, brand_monthly_commitments, brand_contracts,
  shift_slots, session_availability, recurring_shift_templates, plan_target_audit, forecast_snapshots, live_session_reports to authenticated;

-- ============ 1) Trainer lập + chốt Kế Hoạch Tháng ============
set role authenticated;
select pg_temp.as_user('a1800000-0000-0000-0000-000000000001');
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('e1800000-0000-0000-0000-000000000001', 'b1800000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 'draft', 'TikTok', 300);
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e1800000-0000-0000-0000-000000000001', current_setting('t.m')::date + 2, '10:00', '13:00', 100),
  ('e1800000-0000-0000-0000-000000000001', current_setting('t.m')::date + 2, '19:00', '22:00', 100),
  ('e1800000-0000-0000-0000-000000000001', current_setting('t.m')::date + 9, '19:00', '22:00', 100);
select pg_temp.chk('1a trainer ghi kế hoạch + 3 ca kế hoạch', (select count(*) from brand_month_plan_slots where plan_id = 'e1800000-0000-0000-0000-000000000001') = 3);
select lock_month_plan('e1800000-0000-0000-0000-000000000001');
select pg_temp.chk('1b trainer chốt kế hoạch ⇒ 3 ca mở', (select status from brand_month_plans where id = 'e1800000-0000-0000-0000-000000000001') = 'locked'
  and (select count(*) from shift_slots where plan_id = 'e1800000-0000-0000-0000-000000000001' and status = 'open') = 3);
select pg_temp.must_fail('1c trainer KHÔNG chia lại target kế hoạch đã chốt (vẫn ceo/admin)',
  $q$select rebase_month_plan('e1800000-0000-0000-0000-000000000001', '[]'::jsonb, '')$q$, 'ceo/admin');

-- ============ 2) Cam kết + hợp đồng ============
insert into brand_monthly_commitments (brand_id, period_month, committed_hours, platform, is_override)
  values ('b1800000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 220, 'TikTok', true);
select pg_temp.chk('2a trainer ghi + đọc cam kết tháng', (select committed_hours from brand_monthly_commitments where brand_id = 'b1800000-0000-0000-0000-00000000000a') = 220);
select pg_temp.chk('2b trainer đọc hợp đồng', (select monthly_hours from brand_contracts where id = 'f1800000-0000-0000-0000-000000000001') = 200);
update brand_contracts set monthly_hours = 1 where id = 'f1800000-0000-0000-0000-000000000001';
select pg_temp.chk('2c trainer KHÔNG sửa được hợp đồng (RLS lọc mất dòng)', (select monthly_hours from brand_contracts where id = 'f1800000-0000-0000-0000-000000000001') = 200);
select record_forecast_snapshots(jsonb_build_array(jsonb_build_object('brand_id', 'b1800000-0000-0000-0000-00000000000a', 'platform', 'TikTok',
  'month', current_setting('t.m'), 'as_of', current_date, 'kind', 'plan', 'p50', 300, 'lo', 250, 'hi', 350)));
select pg_temp.chk('2d trainer ghi + đọc sổ dự báo', (select count(*) from forecast_snapshots where brand_id = 'b1800000-0000-0000-0000-00000000000a') = 1);

-- Brand vẫn không đọc hợp đồng / cam kết thô, không ghi kế hoạch.
select pg_temp.as_user('a1800000-0000-0000-0000-000000000005');
select pg_temp.chk('2e brand không đọc hợp đồng', (select count(*) from brand_contracts) = 0);
select pg_temp.must_fail('2f brand không ghi kế hoạch', $q$insert into brand_month_plan_slots (plan_id, date, start_time, end_time) values ('e1800000-0000-0000-0000-000000000001', current_date + 70, '10:00', '11:00')$q$, 'row-level security');

-- ============ 3) Hạn đăng ký theo THÁNG ============
select pg_temp.as_user('a1800000-0000-0000-0000-000000000003');
select pg_temp.must_fail('3a talent không tự đặt hạn', $q$select set_roster_month_deadline(current_setting('t.m')::date, now() + interval '1 day')$q$, 'Chỉ người xếp lịch');
select pg_temp.as_user('a1800000-0000-0000-0000-000000000001');
select pg_temp.must_fail('3b tháng phải là ngày 1', $q$select set_roster_month_deadline(current_setting('t.m')::date + 1, now())$q$, 'ngày 1');
select pg_temp.chk('3c đặt hạn tương lai ⇒ báo 1 talent, 3 ca mở',
  (select set_roster_month_deadline(current_setting('t.m')::date, now() + interval '1 day')) = '{"notified": 1, "open_slots": 3}'::jsonb);
select pg_temp.as_user('a1800000-0000-0000-0000-000000000003');
select pg_temp.chk('3d talent đọc được hạn tháng', (select count(*) from roster_months) = 1);
insert into session_availability (slot_id, talent_id)
  select id, 'c1800000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e1800000-0000-0000-0000-000000000001' order by date, start_time limit 1;
select pg_temp.chk('3e trước hạn: talent đăng ký được', (select count(*) from session_availability where talent_id = 'c1800000-0000-0000-0000-000000000001') = 1);
reset role;
update roster_months set signup_deadline = now() - interval '1 minute' where month = current_setting('t.m')::date;
set role authenticated;
select pg_temp.must_fail('3f qua hạn tháng: talent không đăng ký thêm',
  $q$insert into session_availability (slot_id, talent_id) select id, 'c1800000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e1800000-0000-0000-0000-000000000001' order by date desc limit 1$q$,
  'row-level security');
select pg_temp.as_user('a1800000-0000-0000-0000-000000000001');
insert into session_availability (slot_id, talent_id)
  select id, 'c1800000-0000-0000-0000-000000000001' from shift_slots where plan_id = 'e1800000-0000-0000-0000-000000000001' order by date desc limit 1;
select pg_temp.chk('3g qua hạn: trainer vẫn đăng ký hộ', (select count(*) from session_availability where talent_id = 'c1800000-0000-0000-0000-000000000001') = 2);

-- ============ 4) Lý do tắt sớm ============
reset role;
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status, data_source) values
  ('d1800000-0000-0000-0000-000000000001', 't', 'b1800000-0000-0000-0000-00000000000a', 'VERA', current_date - 1, '19:00', '22:00',
   'c1800000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'Completed', 'live_snapshot');
set role authenticated;
select pg_temp.as_user('a1800000-0000-0000-0000-000000000002');
select submit_file_handover('d1800000-0000-0000-0000-000000000001', 0, 45, 0, false, '', 'low_sales');
select pg_temp.chk('4a ghi off sớm 45p + lý do bán kém', (select early_leave_minutes = 45 and early_leave_reason = 'low_sales' from live_session_reports where session_id = 'd1800000-0000-0000-0000-000000000001'));
select submit_file_handover('d1800000-0000-0000-0000-000000000001', 0, 0, 0, false, '', 'low_sales');
select pg_temp.chk('4b không off sớm ⇒ lý do về NULL', (select early_leave_reason is null from live_session_reports where session_id = 'd1800000-0000-0000-0000-000000000001'));
select pg_temp.must_fail('4c lý do lạ bị chặn', $q$select submit_file_handover('d1800000-0000-0000-0000-000000000001', 0, 30, 0, false, '', 'met')$q$, 'không hợp lệ');
select submit_file_handover('d1800000-0000-0000-0000-000000000001', 10, 0, 0, false, 'ok');
select pg_temp.chk('4d gọi kiểu cũ (6 tham số) vẫn chạy', (select ot_minutes = 10 from live_session_reports where session_id = 'd1800000-0000-0000-0000-000000000001'));
reset role;

select pg_temp.chk('5 role_permissions: manage_month_plan ceo/admin/operations/trainer bật, brand/talent tắt',
  (select bool_and((permissions->>'manage_month_plan')::boolean = (role::text in ('ceo', 'admin', 'operations', 'trainer'))) from role_permissions));
