-- 0197 — rate host/trợ theo role. Chạy trên bản REPLAY cả chuỗi (README) có quyền mặc định của Supabase
-- (alter default privileges … grant all on tables to anon, authenticated) — thiếu bước đó thì bảng không có GRANT
-- và mọi phép đọc đều 0 dòng, bộ kiểm xanh giả. Mỗi mục in "OK ..."; ERROR là hỏng. Bỏ 0197 thì mục 3, 6, 7 đỏ.
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false), set_config('request.jwt.claim.role', 'authenticated', false);
$$;

insert into auth.users (id, email) values
  ('d0000000-0000-0000-0000-000000000001', 'ceo@r'),
  ('d0000000-0000-0000-0000-000000000002', 'ops@r'),
  ('d0000000-0000-0000-0000-000000000003', 'trainer@r'),
  ('d0000000-0000-0000-0000-000000000004', 'talent@r') on conflict do nothing;
delete from talent_rate_history where talent_id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
delete from talents where id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
insert into talents (id, name, rate_per_hour, assistant_rate_per_hour) values
  ('e0000000-0000-0000-0000-000000000001', 'Host R1', 200000, 100000),
  ('e0000000-0000-0000-0000-000000000002', 'Host R2', 300000, 150000);
insert into profiles (id, name, email, role) values
  ('d0000000-0000-0000-0000-000000000001', 'CEO', 'ceo@r', 'ceo'),
  ('d0000000-0000-0000-0000-000000000002', 'OPS', 'ops@r', 'operations'),
  ('d0000000-0000-0000-0000-000000000003', 'TR', 'trainer@r', 'trainer')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('d0000000-0000-0000-0000-000000000004', 'TL', 'talent@r', 'talent', 'e0000000-0000-0000-0000-000000000001')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;

-- ===== ceo =====
select pg_temp.as_user('d0000000-0000-0000-0000-000000000001');
set role authenticated;
update talents set rate_per_hour = 210000 where id = 'e0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1) ceo đổi được rate', (select rate_per_hour from talents_secure where id = 'e0000000-0000-0000-0000-000000000001') = 210000);
select pg_temp.chk('2) ceo đọc lịch sử rate của mọi host',
  (select count(distinct talent_id) from talent_rate_history where talent_id::text like 'e0000000%') = 2);
reset role;

-- ===== operations =====
select pg_temp.as_user('d0000000-0000-0000-0000-000000000002');
set role authenticated;
select pg_temp.chk('3) ops KHÔNG đọc được lịch sử rate', (select count(*) from talent_rate_history where talent_id::text like 'e0000000%') = 0);
select pg_temp.chk('4) ops không thấy rate trong talents_secure', (select count(rate_per_hour) from talents_secure where id::text like 'e0000000%') = 0);
update talents set name = 'Host R2 (ops sửa tên)' where id = 'e0000000-0000-0000-0000-000000000002';
select pg_temp.chk('5) ops vẫn sửa được hồ sơ (không đụng rate)', (select name from talents_secure where id = 'e0000000-0000-0000-0000-000000000002') = 'Host R2 (ops sửa tên)');
do $$ begin
  begin
    update talents set rate_per_hour = 999 where id = 'e0000000-0000-0000-0000-000000000002';
    raise exception 'FAIL 6) ops đổi rate phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  6) ops đổi rate bị chặn'; end;
  begin
    insert into talent_rate_history (talent_id, rate_per_hour) values ('e0000000-0000-0000-0000-000000000002', 1);
    raise exception 'FAIL 7) ops ghi lịch sử rate phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  7) ops ghi lịch sử rate bị chặn'; end;
  begin
    insert into talents (name, rate_per_hour) values ('ZZZ ops', 5);
    raise exception 'FAIL 8) ops tạo hồ sơ kèm rate phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  8) ops tạo hồ sơ kèm rate bị chặn'; end;
end $$;
reset role;

-- ===== trainer (chỉ đọc) =====
select pg_temp.as_user('d0000000-0000-0000-0000-000000000003');
set role authenticated;
select pg_temp.chk('9) trainer đọc lịch sử rate', (select count(distinct talent_id) from talent_rate_history where talent_id::text like 'e0000000%') = 2);
do $$ begin
  -- RLS ghi talents không có trainer: lọc 0 dòng (không lỗi) hoặc trigger chặn — cả hai đều đúng, kiểm bằng hệ quả ở mục 10.
  begin
    update talents set rate_per_hour = 1 where id = 'e0000000-0000-0000-0000-000000000002';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.chk('10) trainer không đổi được rate', (select rate_per_hour from talents where id = 'e0000000-0000-0000-0000-000000000002') = 300000);

-- ===== talent chính chủ =====
select pg_temp.as_user('d0000000-0000-0000-0000-000000000004');
set role authenticated;
select pg_temp.chk('11) talent chỉ thấy lịch sử rate của mình',
  (select count(*) from talent_rate_history where talent_id::text like 'e0000000%')
  = (select count(*) from talent_rate_history where talent_id = 'e0000000-0000-0000-0000-000000000001') and
  (select count(*) from talent_rate_history where talent_id = 'e0000000-0000-0000-0000-000000000001') > 0);
select pg_temp.chk('12) talent thấy rate của mình, không thấy rate người khác',
  (select rate_per_hour from talents_secure where id = 'e0000000-0000-0000-0000-000000000001') = 210000 and
  (select rate_per_hour from talents_secure where id = 'e0000000-0000-0000-0000-000000000002') is null);
reset role;

delete from talent_rate_history where talent_id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
delete from profiles where id::text like 'd0000000%';
delete from talents where id in ('e0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000002');
delete from auth.users where id::text like 'd0000000%';
