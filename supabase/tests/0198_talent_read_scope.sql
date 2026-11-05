-- 0198 — phạm vi đọc/ghi của role talent + view chỉ đọc + hàm thông báo. Chạy trên bản REPLAY cả chuỗi (README) có quyền
-- mặc định Supabase (_shim_supabase.sql từ 05/11). Mỗi mục in "OK ..."; ERROR là hỏng. Bỏ 0198 thì mục 1–4, 6, 8, 10 đỏ.
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

-- dọn lần chạy trước
delete from live_sessions where id::text like 'f9000000%';
delete from profiles where id::text like 'f1000000%';
delete from talents where id::text like 'f2000000%';
delete from brands where id::text like 'f3000000%';
delete from auth.users where id::text like 'f1000000%';

insert into auth.users (id, email) values
  ('f1000000-0000-0000-0000-000000000001', 'ops@s'), ('f1000000-0000-0000-0000-000000000002', 'talent@s'),
  ('f1000000-0000-0000-0000-000000000003', 'brand@s'), ('f1000000-0000-0000-0000-000000000004', 'noprofile@s');
insert into brands (id, name, contact_name, phone, email, total_gmv) values
  ('f3000000-0000-0000-0000-00000000000a', 'S-A', 'Chị A', '0281', 'a@brand', 100),
  ('f3000000-0000-0000-0000-00000000000b', 'S-B', 'Anh B', '0282', 'b@brand', 200);
insert into talents (id, name, phone, date_of_birth, total_gmv) values
  ('f2000000-0000-0000-0000-000000000001', 'S Me', '0901', '1999-01-01', 10),
  ('f2000000-0000-0000-0000-000000000002', 'S Other', '0902', '1998-01-01', 20);
insert into profiles (id, name, email, role) values ('f1000000-0000-0000-0000-000000000001', 'OPS', 'ops@s', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('f1000000-0000-0000-0000-000000000002', 'TL', 'talent@s', 'talent', 'f2000000-0000-0000-0000-000000000001')
  on conflict (id) do update set role = excluded.role, assigned_talent_id = excluded.assigned_talent_id;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('f1000000-0000-0000-0000-000000000003', 'BR', 'brand@s', 'brand', 'f3000000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = excluded.role, assigned_brand_id = excluded.assigned_brand_id;
delete from profiles where id = 'f1000000-0000-0000-0000-000000000004'; -- đăng nhập nhưng không có dòng profiles
-- 0149: ca của kênh chưa tồn tại bị từ chối.
insert into brand_channels (brand_id, platform) select id, 'TikTok' from brands where id::text like 'f3000000%' on conflict do nothing;
insert into live_sessions (id, title, brand_id, host_id, date, start_time, end_time) values
  ('f9000000-0000-0000-0000-000000000001', 'của tôi', 'f3000000-0000-0000-0000-00000000000a', 'f2000000-0000-0000-0000-000000000001', '2026-10-01', '09:00', '12:00'),
  ('f9000000-0000-0000-0000-000000000002', 'của người khác', 'f3000000-0000-0000-0000-00000000000b', 'f2000000-0000-0000-0000-000000000002', '2026-10-01', '09:00', '12:00');

-- ===== talent =====
select pg_temp.as_user('f1000000-0000-0000-0000-000000000002');
set role authenticated;
do $$ begin
  begin update talents_secure set nickname = 'x' where id = 'f2000000-0000-0000-0000-000000000002';
    raise exception 'FAIL 1) talent sửa hồ sơ host khác qua view phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  1) talent không sửa được hồ sơ qua view'; end;
  begin delete from talents_secure where id = 'f2000000-0000-0000-0000-000000000002';
    raise exception 'FAIL 2) talent xoá host qua view phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  2) talent không xoá được host qua view'; end;
  begin perform notify_ops('x', 'Lương tháng', 'bấm link', null, null);
    raise exception 'FAIL 3) talent gọi notify_ops phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  3) talent không tự bắn thông báo tới ops'; end;
end $$;
select pg_temp.chk('4) talent thấy SĐT/ngày sinh/GMV của mình, không thấy của host khác',
  (select phone from talents_secure where id = 'f2000000-0000-0000-0000-000000000001') = '0901'
  and (select date_of_birth from talents_secure where id = 'f2000000-0000-0000-0000-000000000001') = '1999-01-01'
  and (select phone is null and date_of_birth is null and total_gmv is null and profile_id is null
       from talents_secure where id = 'f2000000-0000-0000-0000-000000000002'));
select pg_temp.chk('5) talent vẫn thấy tên host khác (lịch agency)', (select name from talents_secure where id = 'f2000000-0000-0000-0000-000000000002') = 'S Other');
select pg_temp.chk('6) talent chỉ đọc profile của mình', (select count(*) from profiles) = 1);
select pg_temp.chk('7) talent đọc đủ brand qua view (tên)', (select count(*) from brands_secure where id::text like 'f3000000%') = 2);
select pg_temp.chk('8) talent không thấy liên hệ/GMV brand, bảng gốc đóng',
  (select count(*) from brands_secure where id::text like 'f3000000%' and (phone is not null or email is not null or contact_name is not null or total_gmv is not null)) = 0
  and (select count(*) from brands) = 0);
update live_sessions set title = 'sửa lậu' where id = 'f9000000-0000-0000-0000-000000000002';
select pg_temp.chk('9) talent không sửa được ca của người khác (bảng + cổng RPC snapshot)',
  not can_edit_session_snapshot('f9000000-0000-0000-0000-000000000002') and can_edit_session_snapshot('f9000000-0000-0000-0000-000000000001'));
reset role;
select pg_temp.chk('9b) ca người khác giữ nguyên', (select title from live_sessions where id = 'f9000000-0000-0000-0000-000000000002') = 'của người khác');

-- ===== brand =====
select pg_temp.as_user('f1000000-0000-0000-0000-000000000003');
set role authenticated;
do $$ begin
  begin delete from talents_secure;
    raise exception 'FAIL 10) brand xoá host qua view phải bị chặn';
  exception when insufficient_privilege then raise notice 'OK  10) brand không xoá được host qua view'; end;
end $$;
select pg_temp.chk('11) brand chỉ thấy brand mình qua view, có liên hệ',
  (select count(*) from brands_secure) = 1 and (select phone from brands_secure) = '0281');
reset role;

-- ===== đăng nhập không có profile =====
select pg_temp.as_user('f1000000-0000-0000-0000-000000000004');
set role authenticated;
select pg_temp.chk('12) không có profile ⇒ 0 brand, 0 profile', (select count(*) from brands_secure) = 0 and (select count(*) from profiles) = 0);
reset role;

-- ===== ops =====
select pg_temp.as_user('f1000000-0000-0000-0000-000000000001');
set role authenticated;
select pg_temp.chk('13) ops thấy SĐT host + liên hệ brand + mọi profile',
  (select phone from talents_secure where id = 'f2000000-0000-0000-0000-000000000002') = '0902'
  and (select count(phone) from brands_secure where id::text like 'f3000000%') = 2
  and (select count(*) from profiles where id::text like 'f1000000%') = 3);
update brands set phone = '0999' where id = 'f3000000-0000-0000-0000-00000000000b';
select pg_temp.chk('14) ops sửa brand ở bảng gốc và đọc lại được', (select phone from brands where id = 'f3000000-0000-0000-0000-00000000000b') = '0999');
update talents set nickname = 'ops sửa' where id = 'f2000000-0000-0000-0000-000000000002';
select pg_temp.chk('15) ops vẫn sửa hồ sơ host ở bảng gốc', (select nickname from talents_secure where id = 'f2000000-0000-0000-0000-000000000002') = 'ops sửa');
reset role;

delete from live_sessions where id::text like 'f9000000%';
delete from profiles where id::text like 'f1000000%';
delete from talents where id::text like 'f2000000%';
delete from brands where id::text like 'f3000000%';
delete from auth.users where id::text like 'f1000000%';
