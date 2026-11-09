-- Kiểm migration 0205 (phút nghỉ giữa room tính vào mốc giao ca + giờ giao ca thực do ops nhập).
-- Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0205. Mỗi mục in "OK ..."; ERROR là hỏng. Thiếu 0205 thì đỏ ở mục A.
--
-- Ví dụ user chốt: ca 18–21 + 21–00, host 1 vào trễ 10' (18:10 → 21:10), host 2 21:10 → 00:10, mỗi ca đủ 3h.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.near(a numeric, b numeric, tol numeric default 0.6) returns boolean language sql as $$
  select abs(coalesce(a, -1e18) - b) < tol $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000e1', 'VERA') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000e1', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);


-- Mỗi ngày một case (d = số ngày trước hôm nay):
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform)
select gen_random_uuid(), sc.room || ' ' || x, 'b0000000-0000-0000-0000-0000000000e1', 'VERA', current_date - sc.d,
       split_part(x, '-', 1)::time, split_part(x, '-', 2)::time, 'Completed', 'TikTok'
  from (values ('G1', 20), ('G2', 19), ('G3', 18)) as sc(room, d)
  cross join unnest(array['18:00-21:00', '21:00-00:00']) x
;
create temp table ses as
select ls.id, split_part(ls.title, ' ', 1) as room, split_part(ls.title, ' ', 2) as slot
  from live_sessions ls where ls.brand_id = 'b0000000-0000-0000-0000-0000000000e1';
create or replace function pg_temp.sid(p_room text, p_slot text) returns uuid language sql as $$ select id from ses where room = p_room and slot like p_slot || '%' $$;
create or replace function pg_temp.ts(p_d int, p_t text) returns timestamptz language sql as $$ select ((current_date - p_d) + p_t::time) at time zone 'Asia/Ho_Chi_Minh' $$;
create or replace function pg_temp.ls(p_room text, p_slot text) returns live_sessions language sql as $$ select * from live_sessions where id = pg_temp.sid(p_room, p_slot) $$;
create or replace function pg_temp.snap(p_room text, p_slot text) returns session_live_snapshots language sql as $$
  select * from session_live_snapshots where session_id = pg_temp.sid(p_room, p_slot) $$;
-- Dòng room như file TikTok (giờ bắt đầu / kết thúc tường minh).
create or replace function pg_temp.room(p_room text, p_s timestamptz, p_e timestamptz, p_gmv numeric) returns jsonb language sql as $$
  select jsonb_build_object('roomId', p_room, 'startedAt', p_s, 'endedAt', p_e,
    'gmv', p_gmv, 'orders', (p_gmv / 10000)::int, 'views', (p_gmv / 1000)::int,
    'durationMinutes', extract(epoch from (p_e - p_s)) / 60, 'raw', jsonb_build_object('picked', true))
$$;


-- G1 d-20: 18–21 + 21–24, host vào trễ 9' (18:09), giữa ca tắt bật lại nghỉ 6' (20:10 → 20:16) ⇒ mốc giao ca 21:15, ca đủ 180'
-- G2 d-19: room chạy liên tục 18:00 → 21:40, ops nhập giờ giao ca thực 21:12
-- G3 d-18: nghỉ giữa room 45' (không phải restart) không tính vào mốc

-- ---------------------------------------------------------------- A) Vào trễ 9' + nghỉ 6' ⇒ mốc 21:15
select apply_session_live_snapshot(pg_temp.sid('G1', '18:00'), 'g1a.xlsx', null,
  jsonb_build_array(pg_temp.room('GA', pg_temp.ts(20, '18:09'), pg_temp.ts(20, '20:10'), 5000000),
                    pg_temp.room('GB', pg_temp.ts(20, '20:16'), pg_temp.ts(20, '21:15'), 4000000)));
select pg_temp.chk('A1 mốc giao ca = 21:00 + 9'' trễ + 6'' nghỉ = 21:15',
  (pg_temp.snap('G1', '18:00')).boundary_at = pg_temp.ts(20, '21:15'));
select pg_temp.chk('A2 ca 1 live đủ 180'' (121 + 59), 9M, không bị chia tạm',
  pg_temp.near((pg_temp.ls('G1', '18:00')).live_duration_minutes, 180) and pg_temp.near((pg_temp.ls('G1', '18:00')).actual_gmv, 9000000)
  and not (pg_temp.snap('G1', '18:00')).auto_split);
select pg_temp.chk('A3 không còn nhãn lệch giờ: thời lượng đúng kế hoạch (180 phút)',
  round((pg_temp.ls('G1', '18:00')).live_duration_minutes) = 180);

-- ---------------------------------------------------------------- B) Giờ giao ca thực do ops nhập
select apply_session_live_snapshot(pg_temp.sid('G2', '18:00'), 'g2a.xlsx', null,
  jsonb_build_array(pg_temp.room('GC', pg_temp.ts(19, '18:00'), pg_temp.ts(19, '21:40'), 11000000)));
select pg_temp.chk('B1 chưa nhập: mốc theo kế hoạch 21:00, ca 180''',
  (pg_temp.snap('G2', '18:00')).boundary_at = pg_temp.ts(19, '21:00') and not (pg_temp.snap('G2', '18:00')).boundary_manual
  and pg_temp.near((pg_temp.ls('G2', '18:00')).live_duration_minutes, 180));
select set_session_handover_time(pg_temp.sid('G2', '18:00'), pg_temp.ts(19, '21:12'));
select pg_temp.chk('B2 ops nhập 21:12: mốc 21:12, cờ nhập tay, ca 192''',
  (pg_temp.snap('G2', '18:00')).boundary_at = pg_temp.ts(19, '21:12') and (pg_temp.snap('G2', '18:00')).boundary_manual
  and pg_temp.near((pg_temp.ls('G2', '18:00')).live_duration_minutes, 192));
select pg_temp.chk('B3 recompute không ghi đè mốc nhập tay',
  (select private.snapshot_refresh_boundary(pg_temp.sid('G2', '18:00'))) is false
  and (pg_temp.snap('G2', '18:00')).boundary_at = pg_temp.ts(19, '21:12'));
do $$
begin
  begin
    perform set_session_handover_time(pg_temp.sid('G2', '18:00'), (current_date - 19 + time '23:00') at time zone 'Asia/Ho_Chi_Minh');
    raise exception 'FAIL B4 phải bị từ chối';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    if sqlerrm not like '%quá 90 phút%' then raise exception 'FAIL B4 sai lý do: %', sqlerrm; end if;
    raise notice 'OK  B4 lệch > 90 phút bị từ chối';
  end;
end $$;
select set_session_handover_time(pg_temp.sid('G2', '18:00'), null);
select pg_temp.chk('B5 xoá mốc nhập tay: về 21:00 tự tính',
  (pg_temp.snap('G2', '18:00')).boundary_at = pg_temp.ts(19, '21:00') and not (pg_temp.snap('G2', '18:00')).boundary_manual);

-- ---------------------------------------------------------------- C) Nghỉ 45' không phải restart ⇒ không cộng
select apply_session_live_snapshot(pg_temp.sid('G3', '18:00'), 'g3a.xlsx', null,
  jsonb_build_array(pg_temp.room('GD', pg_temp.ts(18, '18:00'), pg_temp.ts(18, '19:00'), 3000000),
                    pg_temp.room('GE', pg_temp.ts(18, '19:45'), pg_temp.ts(18, '21:00'), 4000000)));
select pg_temp.chk('C1 nghỉ 45'' > 30'' không tính vào mốc (21:00)',
  (pg_temp.snap('G3', '18:00')).boundary_at = pg_temp.ts(18, '21:00'));

-- ---------------------------------------------------------------- D) Chạy lại migration không lỗi, không đổi số
\ir ../migrations/0205_handover_pauses_and_manual_time.sql
select pg_temp.chk('D1 chạy lại 0205: A vẫn nguyên',
  (pg_temp.snap('G1', '18:00')).boundary_at = pg_temp.ts(20, '21:15') and pg_temp.near((pg_temp.ls('G1', '18:00')).actual_gmv, 9000000));
