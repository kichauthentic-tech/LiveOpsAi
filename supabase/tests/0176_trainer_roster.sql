-- Kiểm migration 0175 + 0176 (role trainer, Bàn Trainer). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0175 rồi 0176.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Replay chỉ tới 0174 thì đỏ ngay ở phần dựng dữ liệu (role 'trainer' không tồn tại).
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

-- Tuần thử: thứ Hai của 2 tuần sau (luôn ở tương lai).
select set_config('t.wk', (date_trunc('week', current_date + 14))::date::text, false);

insert into auth.users (id, email) values
  ('a1740000-0000-0000-0000-000000000001', 'trainer@t'),
  ('a1740000-0000-0000-0000-000000000002', 'ops@t'),
  ('a1740000-0000-0000-0000-000000000003', 'host@t'),
  ('a1740000-0000-0000-0000-000000000004', 'tro@t'),
  ('a1740000-0000-0000-0000-000000000005', 'brand@t')
on conflict do nothing;
insert into brands (id, name) values ('b1740000-0000-0000-0000-00000000000a', 'VERA');
insert into brand_channels (brand_id, platform) values ('b1740000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
insert into talents (id, name, nickname, rate_per_hour) values
  ('c1740000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'S.Hùng', 200000),
  ('c1740000-0000-0000-0000-000000000002', 'Trà Giang', 'Giang', 60000),
  ('c1740000-0000-0000-0000-000000000003', 'Thái Toàn', 'T.Toàn', 150000);
insert into profiles (id, name, email, role) values
  ('a1740000-0000-0000-0000-000000000001', 'Trainer', 'trainer@t', 'trainer'),
  ('a1740000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('a1740000-0000-0000-0000-000000000003', 'Host', 'host@t', 'talent', 'c1740000-0000-0000-0000-000000000001'),
  ('a1740000-0000-0000-0000-000000000004', 'Tro', 'tro@t', 'talent', 'c1740000-0000-0000-0000-000000000002')
  on conflict (id) do update set role = 'talent', assigned_talent_id = excluded.assigned_talent_id;
insert into profiles (id, name, email, role, assigned_brand_id) values
  ('a1740000-0000-0000-0000-000000000005', 'Brand', 'brand@t', 'brand', 'b1740000-0000-0000-0000-00000000000a')
  on conflict (id) do update set role = 'brand';

-- 3 ca mở thứ Hai/thứ Ba của tuần thử + 1 ca đã lên lịch ngày mai (cho đổi người / dời giờ).
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e1740000-0000-0000-0000-000000000001', current_setting('t.wk')::date,     '10:00', '13:00', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open'),
  ('e1740000-0000-0000-0000-000000000002', current_setting('t.wk')::date,     '19:00', '22:00', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open'),
  ('e1740000-0000-0000-0000-000000000003', current_setting('t.wk')::date + 1, '10:00', '13:00', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open');
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, co_host_id, co_host_name, status) values
  ('d1740000-0000-0000-0000-000000000001', 't', 'b1740000-0000-0000-0000-00000000000a', 'VERA', current_date + 1, '10:00', '13:00',
   'c1740000-0000-0000-0000-000000000001', 'Sỹ Hùng', 'c1740000-0000-0000-0000-000000000002', 'Trà Giang', 'Upcoming');
insert into session_finance (session_id) values ('d1740000-0000-0000-0000-000000000001');

-- Bản replay không có grant mặc định của Supabase cho bảng — cấp đúng các bảng mục 1–2 đọc/ghi (không cấp cả schema:
-- sẽ xoá grant theo cột của 0047/0048).
grant select, insert, update, delete on shift_slots, session_finance, session_availability to authenticated;

-- ============ 1) Quyền đọc của trainer (RLS thật: role authenticated) ============
set role authenticated;
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
select pg_temp.chk('1a trainer ghi + đọc ca mở', (select count(*) from shift_slots) = 3);
select pg_temp.chk('1b trainer thấy rate host qua talents_secure',
  (select rate_per_hour from talents_secure where id = 'c1740000-0000-0000-0000-000000000001') = 200000);
select pg_temp.chk('1c trainer đọc Finance (session_finance)', (select count(*) from session_finance) = 1);
select pg_temp.chk('1d trainer đọc ngưỡng luật', (select max_week_hours from roster_rules) = 48);
insert into roster_drafts (slot_id, host_id) values ('e1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000001');
select pg_temp.chk('1e trainer ghi nháp', (select count(*) from roster_drafts) = 1);
select pg_temp.as_user('a1740000-0000-0000-0000-000000000002');
select pg_temp.chk('1f vận hành KHÔNG đọc Finance (giữ như cũ)', (select count(*) from session_finance) = 0);
select pg_temp.chk('1g vận hành KHÔNG thấy rate (giữ như cũ)',
  (select rate_per_hour from talents_secure where id = 'c1740000-0000-0000-0000-000000000001') is null);
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
select pg_temp.chk('1h talent không thấy nháp', (select count(*) from roster_drafts) = 0);
select pg_temp.as_user('a1740000-0000-0000-0000-000000000005');
select pg_temp.chk('1i brand không thấy nháp', (select count(*) from roster_drafts) = 0);
select pg_temp.chk('1j brand không đọc tuần xếp lịch', (select count(*) from roster_weeks) = 0);
reset role;

-- ============ 2) Hạn đăng ký ============
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
select pg_temp.must_fail('2a talent không đặt hạn',
  format($q$select set_roster_deadline(%L::date, now() + interval '1 day')$q$, current_setting('t.wk')), 'Chỉ người xếp lịch');
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
select pg_temp.must_fail('2b tuần phải bắt đầu thứ Hai',
  format($q$select set_roster_deadline(%L::date + 1, now() + interval '1 day')$q$, current_setting('t.wk')), 'thứ Hai');
select pg_temp.chk('2c trainer đặt hạn ⇒ báo 2 talent',
  (set_roster_deadline(current_setting('t.wk')::date, now() + interval '1 day') ->> 'notified')::int = 2);
select pg_temp.chk('2c2 đúng 2 tin "Mở đăng ký"', (select count(*) from notifications where kind = 'signup_open') = 2);
select pg_temp.chk('2d đặt lại đúng hạn cũ không báo lại',
  (set_roster_deadline(current_setting('t.wk')::date, (select signup_deadline from roster_weeks where week_start = current_setting('t.wk')::date)) ->> 'notified')::int = 0);
set role authenticated;
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
insert into session_availability (slot_id, talent_id) values ('e1740000-0000-0000-0000-000000000002', 'c1740000-0000-0000-0000-000000000001');
select pg_temp.chk('2e trước hạn: talent báo rảnh được', (select count(*) from session_availability) = 1);
select pg_temp.chk('2f talent đọc được hạn', (select signup_deadline from roster_weeks where week_start = current_setting('t.wk')::date) is not null);
reset role;
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
select set_roster_deadline(current_setting('t.wk')::date, now() - interval '1 minute');
set role authenticated;
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
select pg_temp.must_fail('2g qua hạn: talent không báo rảnh được',
  $q$insert into session_availability (slot_id, talent_id) values ('e1740000-0000-0000-0000-000000000003', 'c1740000-0000-0000-0000-000000000001')$q$, 'row-level security');
delete from session_availability where slot_id = 'e1740000-0000-0000-0000-000000000002';
select pg_temp.chk('2h qua hạn: talent không rút đăng ký được (0 dòng xoá)', (select count(*) from session_availability) = 1);
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
insert into session_availability (slot_id, talent_id) values ('e1740000-0000-0000-0000-000000000003', 'c1740000-0000-0000-0000-000000000003');
select pg_temp.chk('2i qua hạn: trainer vẫn ghi hộ được', (select count(*) from session_availability) = 2);
reset role;

-- ============ 3) Công bố tuần ============
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
insert into roster_drafts (slot_id, host_id, co_host_id) values
  ('e1740000-0000-0000-0000-000000000002', null, 'c1740000-0000-0000-0000-000000000002');
select pg_temp.must_fail('3a nháp thiếu host ⇒ không công bố',
  format($q$select publish_roster_week(%L::date)$q$, current_setting('t.wk')), 'chưa có host');
update roster_drafts set host_id = 'c1740000-0000-0000-0000-000000000003' where slot_id = 'e1740000-0000-0000-0000-000000000002';
-- Ca 3 trùng giờ ca 1 của S.Hùng? Không — khác ngày. Thêm nháp trùng giờ để thử huỷ cả lần công bố.
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e1740000-0000-0000-0000-000000000004', current_setting('t.wk')::date, '11:00', '12:00', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open')
  on conflict do nothing;
insert into roster_drafts (slot_id, host_id) values ('e1740000-0000-0000-0000-000000000004', 'c1740000-0000-0000-0000-000000000001');
select pg_temp.must_fail('3b nháp trùng người ⇒ cả lần công bố bị huỷ',
  format($q$select publish_roster_week(%L::date)$q$, current_setting('t.wk')), '');
select pg_temp.chk('3c sau lỗi: chưa ca nào thành phiên', (select count(*) from shift_slots where session_id is not null) = 0);
delete from roster_drafts where slot_id = 'e1740000-0000-0000-0000-000000000004';
update shift_slots set status = 'cancelled' where id = 'e1740000-0000-0000-0000-000000000004';
insert into roster_drafts (slot_id, host_id) values ('e1740000-0000-0000-0000-000000000003', 'c1740000-0000-0000-0000-000000000001');
delete from notifications;
select pg_temp.chk('3d công bố 3 ca',
  (publish_roster_week(current_setting('t.wk')::date) ->> 'published')::int = 3);
select pg_temp.chk('3e ca mở thành ca thật', (select count(*) from shift_slots where status = 'finalized' and session_id is not null) = 3);
select pg_temp.chk('3f không bắn "được xếp ca" từng ca', (select count(*) from notifications where kind = 'shift_assigned') = 0);
select pg_temp.chk('3g mỗi người MỘT tin tóm tắt (S.Hùng 2 ca, Giang 1 ca; T.Toàn chưa có tài khoản)',
  (select count(*) from notifications where kind = 'roster_published') = 2
  and (select body from notifications n join profiles p on p.id = n.user_id
        where n.kind = 'roster_published' and p.assigned_talent_id = 'c1740000-0000-0000-0000-000000000001') like 'Bạn có 2 ca:%');
select pg_temp.chk('3h nháp đã xoá, tuần đã công bố',
  (select count(*) from roster_drafts) = 0 and (select published_at is not null from roster_weeks where week_start = current_setting('t.wk')::date));
select pg_temp.must_fail('3i tuần đã công bố không đổi hạn',
  format($q$select set_roster_deadline(%L::date, now() + interval '2 days')$q$, current_setting('t.wk')), 'đã công bố');
select pg_temp.chk('3j sau công bố, đổi người vẫn báo như thường (trigger không còn im)',
  (select current_setting('app.roster_publish', true)) is distinct from '1');

-- ============ 4) Luật 48 giờ/tuần ============
-- Dồn 45 giờ cho T.Toàn trong tuần thử (15 ca 3 giờ) rồi nháp thêm 1 ca 3 giờ ⇒ 48 + ... > 48.
insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status)
select 't', 'b1740000-0000-0000-0000-00000000000a', 'VERA', current_setting('t.wk')::date + (g % 7), (time '06:00' + (g / 7) * interval '3 hours')::time,
       (time '09:00' + (g / 7) * interval '3 hours')::time, 'c1740000-0000-0000-0000-000000000003', 'Thái Toàn', 'Upcoming'
  from generate_series(1, 14) g;
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e1740000-0000-0000-0000-000000000005', current_setting('t.wk')::date + 6, '20:00', '23:30', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open');
insert into roster_drafts (slot_id, host_id) values ('e1740000-0000-0000-0000-000000000005', 'c1740000-0000-0000-0000-000000000003');
select pg_temp.must_fail('4a quá 48 giờ ⇒ không công bố',
  format($q$select publish_roster_week(%L::date)$q$, current_setting('t.wk')), 'Quá 48');
update roster_rules set max_week_hours = 60 where id = 1;
select pg_temp.chk('4b nâng ngưỡng ⇒ công bố được', (publish_roster_week(current_setting('t.wk')::date) ->> 'published')::int = 1);
update roster_rules set max_week_hours = 48 where id = 1;

-- ============ 5) Đổi người / dời giờ sau công bố ============
select pg_temp.must_fail('5a đổi người không lý do',
  $q$select roster_reassign('d1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000003', null, ' ')$q$, 'lý do');
delete from notifications;
select pg_temp.chk('5b đổi host có lý do',
  (roster_reassign('d1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000003', 'c1740000-0000-0000-0000-000000000002', 'S.Hùng ốm')).host_id
    = 'c1740000-0000-0000-0000-000000000003');
select pg_temp.chk('5c ghi nhật ký + báo người bị rút', (select count(*) from roster_changes where kind = 'reassign') = 1
  and (select count(*) from notifications where kind = 'shift_unassigned') = 1);
update live_sessions set date = current_setting('t.wk')::date + 2, start_time = '15:00', end_time = '18:00' where id = 'd1740000-0000-0000-0000-000000000001';
select roster_reassign('d1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000002', null, 'đổi lại');
select pg_temp.must_fail('5d thêm người đã 48,5 giờ tuần đó (T.Toàn) ⇒ chặn',
  $q$select roster_reassign('d1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000002', 'c1740000-0000-0000-0000-000000000003', 'thử')$q$, 'tối đa');
select pg_temp.chk('5e dời giờ có lý do',
  (roster_move_session('d1740000-0000-0000-0000-000000000001', current_setting('t.wk')::date + 2, '14:00', '16:00', 'Brand đổi khung')).start_time = '14:00');
select pg_temp.chk('5e2 nhật ký dời giờ', (select count(*) from roster_changes where kind = 'move') = 1);
update live_sessions set actual_gmv = 1000 where id = 'd1740000-0000-0000-0000-000000000001';
select pg_temp.must_fail('5f ca có số không dời',
  format($q$select roster_move_session('d1740000-0000-0000-0000-000000000001', %L::date + 3, '14:00', '16:00', 'x')$q$, current_setting('t.wk')), 'có số');
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
select pg_temp.must_fail('5g talent không đổi người',
  $q$select roster_reassign('d1740000-0000-0000-0000-000000000001', 'c1740000-0000-0000-0000-000000000001', null, 'x')$q$, 'Chỉ người xếp lịch');

-- ============ 6) RPC cũ nhận trainer; báo không đi được tới trainer ============
select pg_temp.as_user('a1740000-0000-0000-0000-000000000001');
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e1740000-0000-0000-0000-000000000006', current_date + 30, '10:00', '12:00', 'b1740000-0000-0000-0000-00000000000a', 'VERA', 'open');
select pg_temp.chk('6a trainer chốt người bằng finalize_shift_slot',
  (finalize_shift_slot('e1740000-0000-0000-0000-000000000006', 'c1740000-0000-0000-0000-000000000002', null)).host_id = 'c1740000-0000-0000-0000-000000000002');
select pg_temp.as_user('a1740000-0000-0000-0000-000000000003');
select notify_ops('shift_dropout_request', 'x', 'y', null, null);
select pg_temp.chk('6b báo không đi được tới cả trainer',
  exists (select 1 from notifications where kind = 'shift_dropout_request' and user_id = 'a1740000-0000-0000-0000-000000000001'));
