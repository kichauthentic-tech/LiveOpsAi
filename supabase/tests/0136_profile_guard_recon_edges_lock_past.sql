-- Kiểm migration 0136. Chạy trên bản REPLAY cả chuỗi (README.md, mục "Replay cả chuỗi") SAU khi nạp 0136,
-- trên DB trắng (không chạy chung với bộ kiểm 0133 — trùng id). Mỗi mục in "OK ..."; ERROR là hỏng. Chạy
-- trên bản replay CHƯA có 0136 thì phải đỏ ngay mục 1 (talent tự phong admin không bị chặn).
\set ON_ERROR_STOP on
set client_min_messages = notice;

-- Bản replay không có quyền bảng mặc định của Supabase — cấp như Supabase cấp, chỉ cho bảng cần đo.
grant select, insert, update, delete on profiles, brands, live_sessions, live_reconciliation_rows,
  live_reconciliation_batches, brand_month_plans, brand_month_plan_slots, shift_slots to authenticated;
grant select, update on profiles to service_role;
alter role service_role bypassrls;

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
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 70);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

create or replace function pg_temp.as_user(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('request.jwt.claim.role', 'authenticated', false);
$$;

-- ---------- dựng dữ liệu ----------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'ceo@t'),
  ('a0000000-0000-0000-0000-000000000003', 'talent@t'),
  ('a0000000-0000-0000-0000-000000000004', 'brand@t')
on conflict do nothing;
insert into brands (id, name) values
  ('b0000000-0000-0000-0000-00000000000a', 'CROCS'),
  ('b0000000-0000-0000-0000-00000000000b', 'JOCKEY');
update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000001';
update profiles set role = 'ceo' where id = 'a0000000-0000-0000-0000-000000000002';
update profiles set role = 'brand', assigned_brand_id = 'b0000000-0000-0000-0000-00000000000a'
 where id = 'a0000000-0000-0000-0000-000000000004';

-- ---------- 1) profiles ----------
select pg_temp.as_user('a0000000-0000-0000-0000-000000000003');
set role authenticated;
select pg_temp.must_fail('1a talent tự phong admin',
  $$update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003'$$, 'Bạn chỉ sửa được');
select pg_temp.must_fail('1b talent tự bật quyền',
  $$update profiles set custom_permission_overrides = '{"manage_sessions": true}' where id = 'a0000000-0000-0000-0000-000000000003'$$, 'Bạn chỉ sửa được');
update profiles set name = 'Tên mới', must_change_password = false where id = 'a0000000-0000-0000-0000-000000000003';
-- Form Tài Khoản gửi lại đủ cột với giá trị y như cũ — phải qua.
update profiles set name = 'Tên 2', role = role, status = status, assigned_brand_id = assigned_brand_id,
  assigned_talent_id = assigned_talent_id, custom_role_title = custom_role_title
 where id = 'a0000000-0000-0000-0000-000000000003';
reset role;
select pg_temp.chk('1c talent đổi tên được', (select name from profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'Tên 2');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000004');
set role authenticated;
select pg_temp.must_fail('1d brand đổi sang brand khác',
  $$update profiles set assigned_brand_id = 'b0000000-0000-0000-0000-00000000000b' where id = 'a0000000-0000-0000-0000-000000000004'$$, 'Bạn chỉ sửa được');
select pg_temp.must_fail('1e tài khoản tự đổi trạng thái',
  $$update profiles set status = 'Inactive' where id = 'a0000000-0000-0000-0000-000000000004'$$, 'Bạn chỉ sửa được');
reset role;

select pg_temp.as_user('a0000000-0000-0000-0000-000000000002');
set role authenticated;
update profiles set role = 'operations' where id = 'a0000000-0000-0000-0000-000000000003';
select pg_temp.must_fail('1f CEO phong admin',
  $$update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003'$$, 'Chỉ Admin');
select pg_temp.must_fail('1g CEO sửa tài khoản admin',
  $$update profiles set name = 'x' where id = 'a0000000-0000-0000-0000-000000000001'$$, 'Chỉ Admin');
reset role;
select pg_temp.chk('1h CEO đổi role người khác được', (select role::text from profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'operations');

select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
update profiles set role = 'admin' where id = 'a0000000-0000-0000-0000-000000000003';
reset role;
select pg_temp.chk('1i admin phong admin được', (select role::text from profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'admin');

set role service_role;
update profiles set role = 'talent' where id = 'a0000000-0000-0000-0000-000000000003';
reset role;
select pg_temp.chk('1j server (service_role) cấp role được', (select role::text from profiles where id = 'a0000000-0000-0000-0000-000000000003') = 'talent');

-- ---------- 2) đối soát: chạm mép không tính là giao nhau ----------
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-000000000001', 'S1', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', '2026-09-14', '15:07', '19:17', 'Completed'),
  ('d0000000-0000-0000-0000-000000000002', 'S2', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', '2026-09-14', '19:17', '23:28', 'Completed');
select pg_temp.as_user('a0000000-0000-0000-0000-000000000001');
set role authenticated;
select import_live_reconciliation('f.xlsx', 'x', '2026-09-01', '2026-09-30',
  '[{"roomId":"A","startedAt":"2026-09-14T15:07:00+07:00","endedAt":"2026-09-14T19:17:00+07:00","gmv":1000},
    {"roomId":"B","startedAt":"2026-09-14T19:17:00+07:00","endedAt":"2026-09-14T23:28:00+07:00","gmv":500},
    {"roomId":"C","startedAt":"2026-09-14T18:00:00+07:00","endedAt":"2026-09-14T20:00:00+07:00","gmv":300}]'::jsonb,
  'b0000000-0000-0000-0000-00000000000a') as batch \gset
reset role;
select pg_temp.chk('2a phòng kết thúc đúng lúc ca sau bắt đầu chỉ khớp ca của nó',
  (select bucket = 'agency' and matched_session_ids = array['d0000000-0000-0000-0000-000000000001'::uuid]
     from live_reconciliation_rows where batch_id = :'batch' and room_id = 'A'));
select pg_temp.chk('2b phòng bắt đầu đúng lúc ca trước kết thúc chỉ khớp ca của nó',
  (select bucket = 'agency' and matched_session_ids = array['d0000000-0000-0000-0000-000000000002'::uuid]
     from live_reconciliation_rows where batch_id = :'batch' and room_id = 'B'));
select pg_temp.chk('2c phòng vắt qua 2 ca vẫn vào rổ cần xem lại',
  (select bucket = 'review' and array_length(matched_session_ids, 1) = 2
     from live_reconciliation_rows where batch_id = :'batch' and room_id = 'C'));

-- ---------- 3) chốt kế hoạch: ca ngày đã qua gắn với ca ops đã mở sẵn ----------
-- Ngày tương đối với hôm nay để bộ kiểm chạy được mọi ngày.
select (now() at time zone 'Asia/Ho_Chi_Minh')::date - 3 as past1, (now() at time zone 'Asia/Ho_Chi_Minh')::date - 2 as past2,
       (now() at time zone 'Asia/Ho_Chi_Minh')::date + 10 as fut \gset
insert into brand_month_plans (id, brand_id, month) values
  ('e0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', date_trunc('month', :'past1'::date)::date);
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e0000000-0000-0000-0000-000000000001', :'past1', '10:00', '13:00', 100),
  ('e0000000-0000-0000-0000-000000000001', :'past2', '10:00', '13:00', 200),
  ('e0000000-0000-0000-0000-000000000001', :'fut', '10:00', '13:00', 300);
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('f0000000-0000-0000-0000-000000000001', :'past1', '10:00', '13:00', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', 'open');
set role authenticated;
select lock_month_plan('e0000000-0000-0000-0000-000000000001') as r \gset
reset role;
select pg_temp.chk('3a ca kế hoạch ngày đã qua gắn vào ca đã mở sẵn cùng giờ',
  (select slot_id = 'f0000000-0000-0000-0000-000000000001' from brand_month_plan_slots
    where plan_id = 'e0000000-0000-0000-0000-000000000001' and date = :'past1'));
select pg_temp.chk('3b ngày đã qua không có ca sẵn thì vẫn bỏ qua, không sinh ca',
  (select slot_id is null from brand_month_plan_slots where plan_id = 'e0000000-0000-0000-0000-000000000001' and date = :'past2'));
select pg_temp.chk('3c kết quả chốt: gắn 1, bỏ qua 1, mở mới 1',
  (:'r'::jsonb ->> 'linked') = '1' and (:'r'::jsonb ->> 'skipped_past') = '1' and (:'r'::jsonb ->> 'created') = '1');
