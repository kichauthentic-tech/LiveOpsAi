-- Kiểm migration 0181 (mở ca hàng loạt không dội thông báo). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0181.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0180 thì đỏ ở mục 1 (chưa có create_open_slots).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

create or replace function pg_temp.chk_eq(label text, got jsonb, want jsonb) returns void language plpgsql as $$
begin
  if got is distinct from want then raise exception 'FAIL % : got %, want %', label, got, want; end if;
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

select set_config('t.m', (date_trunc('month', current_date) + interval '2 month')::date::text, false);

insert into auth.users (id, email) values
  ('a1810000-0000-0000-0000-000000000001', 'trainer@t'),
  ('a1810000-0000-0000-0000-000000000003', 'host1@t'),
  ('a1810000-0000-0000-0000-000000000004', 'host2@t')
on conflict do nothing;
insert into brands (id, name) values ('b1810000-0000-0000-0000-00000000000a', 'VERA'), ('b1810000-0000-0000-0000-00000000000b', 'CROCS');
insert into brand_channels (brand_id, platform) values ('b1810000-0000-0000-0000-00000000000a', 'TikTok'), ('b1810000-0000-0000-0000-00000000000a', 'Shopee'),
  ('b1810000-0000-0000-0000-00000000000b', 'TikTok') on conflict do nothing;
insert into talents (id, name) values ('c1810000-0000-0000-0000-000000000001', 'Host 1'), ('c1810000-0000-0000-0000-000000000002', 'Host 2');
insert into profiles (id, name, email, role) values ('a1810000-0000-0000-0000-000000000001', 'Trainer', 'trainer@t', 'trainer')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id, status) values
  ('a1810000-0000-0000-0000-000000000003', 'Host 1', 'host1@t', 'talent', 'c1810000-0000-0000-0000-000000000001', 'Active'),
  ('a1810000-0000-0000-0000-000000000004', 'Host 2', 'host2@t', 'talent', 'c1810000-0000-0000-0000-000000000002', 'Active')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id, status = 'Active';
grant select, insert, update, delete on brand_month_plans, brand_month_plan_slots, shift_slots, notifications to authenticated;
-- Số talent đang hoạt động có hồ sơ (bản replay có sẵn talent khác ngoài 2 người tạo ở đây) = số tin của MỘT lần báo.
select set_config('t.n', (select count(*)::text from profiles where role = 'talent' and status = 'Active' and assigned_talent_id is not null), false);

-- ============ 1) Mở nhiều ca tay một lần: 1 tin/người, bỏ ca trùng ============
set role authenticated;
select pg_temp.as_user('a1810000-0000-0000-0000-000000000001');
select pg_temp.chk_eq('1a 3 ca gửi (1 trùng hệt) ⇒ mở 2, bỏ 1, mỗi talent 1 tin',
  (select create_open_slots(jsonb_build_array(
      jsonb_build_object('date', current_setting('t.m')::date + 1, 'start_time', '19:00', 'end_time', '22:00', 'brand_id', 'b1810000-0000-0000-0000-00000000000a', 'brand_name', 'VERA', 'platform', 'TikTok'),
      jsonb_build_object('date', current_setting('t.m')::date + 2, 'start_time', '21:00', 'end_time', '00:00', 'brand_id', 'b1810000-0000-0000-0000-00000000000a', 'brand_name', 'VERA', 'platform', 'Shopee'),
      jsonb_build_object('date', current_setting('t.m')::date + 1, 'start_time', '19:00', 'end_time', '22:00', 'brand_id', 'b1810000-0000-0000-0000-00000000000a', 'brand_name', 'VERA', 'platform', 'TikTok')
    ))), jsonb_build_object('created', 2, 'skipped', 1, 'notified', current_setting('t.n')::int));
reset role;
select pg_temp.chk('1b mỗi talent đúng 1 tin (không phải 1 tin/ca)',
  (select count(*) from notifications where user_id = 'a1810000-0000-0000-0000-000000000003') = 1
  and (select title from notifications where user_id = 'a1810000-0000-0000-0000-000000000003') = 'Có 2 ca mới đang mở đăng ký');
select pg_temp.chk('1c ca Shopee lưu đúng sàn, người tạo = trainer',
  (select platform::text = 'Shopee' and created_by = 'a1810000-0000-0000-0000-000000000001' from shift_slots where platform::text = 'Shopee' and brand_id = 'b1810000-0000-0000-0000-00000000000a'));
set role authenticated;
select pg_temp.chk_eq('1d p_notify = false ⇒ không tin nào',
  (select create_open_slots(jsonb_build_array(jsonb_build_object('date', current_setting('t.m')::date + 3, 'start_time', '10:00', 'end_time', '13:00',
      'brand_id', 'b1810000-0000-0000-0000-00000000000a', 'brand_name', 'VERA', 'platform', 'TikTok')), false)), '{"created": 1, "skipped": 0, "notified": 0}'::jsonb);
reset role;
select pg_temp.chk('1e vẫn 1 tin/người sau lần im lặng', (select count(*) from notifications where user_id = 'a1810000-0000-0000-0000-000000000003') = 1);

-- Ca tay lẻ (đường cũ, không qua RPC) vẫn báo như trước 0181.
set role authenticated;
insert into shift_slots (date, start_time, end_time, brand_id, brand_name, status) values (current_setting('t.m')::date + 4, '10:00', '13:00', 'b1810000-0000-0000-0000-00000000000b', 'CROCS', 'open');
reset role;
select pg_temp.chk('1f ca tay lẻ vẫn báo (trigger cũ còn chạy)', (select count(*) from notifications where user_id = 'a1810000-0000-0000-0000-000000000003') = 2);

-- ============ 2) Chốt nhiều kế hoạch một lần: im lặng hoặc 1 tin tóm tắt ============
insert into brand_month_plans (id, brand_id, month, status, platform) values
  ('e1810000-0000-0000-0000-000000000001', 'b1810000-0000-0000-0000-00000000000a', current_setting('t.m')::date, 'draft', 'TikTok'),
  ('e1810000-0000-0000-0000-000000000002', 'b1810000-0000-0000-0000-00000000000b', current_setting('t.m')::date, 'draft', 'TikTok');
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e1810000-0000-0000-0000-000000000001', current_setting('t.m')::date + 10, '10:00', '13:00', 0),
  ('e1810000-0000-0000-0000-000000000001', current_setting('t.m')::date + 11, '10:00', '13:00', 0),
  ('e1810000-0000-0000-0000-000000000002', current_setting('t.m')::date + 10, '19:00', '22:00', 0);
set role authenticated;
select pg_temp.chk('2a chốt 2 kế hoạch, p_notify = false ⇒ 3 ca mở, 0 tin',
  (select (r->>'open_slots')::int = 3 and (r->>'notified')::int = 0 from (select lock_month_plans(array['e1810000-0000-0000-0000-000000000001', 'e1810000-0000-0000-0000-000000000002']::uuid[], false) r) x));
reset role;
select pg_temp.chk('2b cả hai kế hoạch đã chốt, không thêm tin', (select count(*) from brand_month_plans where status = 'locked' and id::text like 'e181%') = 2
  and (select count(*) from notifications where user_id = 'a1810000-0000-0000-0000-000000000003') = 2);
set role authenticated;
select pg_temp.chk('2c chốt lại với p_notify ⇒ 1 tin/người', (select (lock_month_plans(array['e1810000-0000-0000-0000-000000000001']::uuid[], true)->>'notified')::int) = current_setting('t.n')::int);
reset role;
select pg_temp.chk('2d tin tóm tắt có tháng + số ca', (select body from notifications where user_id = 'a1810000-0000-0000-0000-000000000004' order by created_at desc limit 1) like '2 ca đang chờ đăng ký%');

-- ============ 3) Quyền ============
set role authenticated;
select pg_temp.as_user('a1810000-0000-0000-0000-000000000003');
select pg_temp.must_fail('3a talent không mở ca hàng loạt', $q$select create_open_slots('[]'::jsonb)$q$, 'Chỉ người xếp lịch');
select pg_temp.must_fail('3b talent không chốt kế hoạch hàng loạt', $q$select lock_month_plans(array[]::uuid[])$q$, 'Chỉ người xếp lịch');
reset role;
