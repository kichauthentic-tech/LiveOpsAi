-- Kiểm migration 0210 (mốc giao ca tự làm mới khi ca kề bên được tạo / huỷ / đổi giờ / xoá).
-- Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0210. Mỗi mục in "OK ..."; ERROR là hỏng.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000e8', 'FRANKLIN2') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000e8', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

create or replace function pg_temp.ts(p_t text) returns timestamptz language sql as $$ select ((current_date - 20) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('c0000000-0000-0000-0000-000000000001', 'M1', 'b0000000-0000-0000-0000-0000000000e8', 'FRANKLIN2', current_date - 20, '20:00', '22:00', 'Completed', 'TikTok');
select apply_session_live_snapshot('c0000000-0000-0000-0000-000000000001', 'm1.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'MA', 'startedAt', pg_temp.ts('20:03'), 'endedAt', pg_temp.ts('22:33'),
    'gmv', 9000000, 'orders', 900, 'views', 9000, 'durationMinutes', 150, 'raw', jsonb_build_object('picked', true))));
select pg_temp.chk('A1 chưa có ca sau ⇒ mốc 22:33, giờ live 150''',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:33')
  and (select round(live_duration_minutes) from live_sessions where id = 'c0000000-0000-0000-0000-000000000001') = 150);

-- B) Ca sau 22:00–24:00 được tạo SAU khi up file ⇒ mốc về 22:00
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('c0000000-0000-0000-0000-000000000002', 'M2', 'b0000000-0000-0000-0000-0000000000e8', 'FRANKLIN2', current_date - 20, '22:00', '00:00', 'Upcoming', 'TikTok');
select pg_temp.chk('B1 tạo ca sau ⇒ mốc về 22:00',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:00'));

-- C) Huỷ ca sau ⇒ kéo lại 22:33, giờ live đủ
update live_sessions set status = 'Cancelled' where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.chk('C1 huỷ ca sau ⇒ mốc 22:33 và giờ live 150''',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:33')
  and (select round(live_duration_minutes) from live_sessions where id = 'c0000000-0000-0000-0000-000000000001') = 150);

-- D) Mở lại ca sau, đổi giờ sang 23:00 (không còn liền kề) ⇒ kéo lại 22:33; xoá ca sau ⇒ vẫn 22:33
update live_sessions set status = 'Upcoming' where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.chk('D1 mở lại ca sau ⇒ mốc 22:00',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:00'));
update live_sessions set start_time = '23:00', end_time = '01:00' where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.chk('D2 ca sau dời 23:00 (không liền kề) ⇒ mốc 22:33',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:33'));
update live_sessions set start_time = '22:00', end_time = '00:00' where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.chk('D3 ca sau dời lại 22:00 ⇒ mốc 22:00',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:00'));
delete from live_sessions where id = 'c0000000-0000-0000-0000-000000000002';
select pg_temp.chk('D4 xoá ca sau ⇒ mốc 22:33',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:33'));

-- E) Mốc ops nhập tay không bị trigger đổi
select set_session_handover_time('c0000000-0000-0000-0000-000000000001', pg_temp.ts('22:20'));
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
values ('c0000000-0000-0000-0000-000000000003', 'M3', 'b0000000-0000-0000-0000-0000000000e8', 'FRANKLIN2', current_date - 20, '22:00', '00:00', 'Upcoming', 'TikTok');
select pg_temp.chk('E1 mốc nhập tay 22:20 giữ nguyên khi có ca sau mới',
  (select boundary_at from session_live_snapshots where session_id = 'c0000000-0000-0000-0000-000000000001') = pg_temp.ts('22:20'));
