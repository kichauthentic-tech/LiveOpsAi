-- Kiểm migration 0234. Chạy trên bản REPLAY cả chuỗi (README.md). Mỗi mục in "OK ..."; ERROR là hỏng.
-- Chưa nạp 0234 thì mục 1 phải đỏ ("Trùng người").
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

select set_config('t.wk', (date_trunc('week', current_date + 14))::date::text, false);

insert into auth.users (id, email) values ('a2340000-0000-0000-0000-000000000001', 'trainer234@t') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a2340000-0000-0000-0000-000000000001', 'Trainer', 'trainer234@t', 'trainer')
  on conflict (id) do update set role = excluded.role;
insert into brands (id, name) values ('b2340000-0000-0000-0000-00000000000a', 'VERA234');
insert into brand_channels (brand_id, platform) values ('b2340000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
insert into talents (id, name) values
  ('c2340000-0000-0000-0000-000000000001', 'Hùng'),
  ('c2340000-0000-0000-0000-000000000002', 'Giang'),
  ('c2340000-0000-0000-0000-000000000003', 'Toàn');

-- Ca đã chốt từ trước: Hùng 10–13. Ba ca mở cùng tuần: (1) trùng Hùng, (2) sạch, (3) trùng một nháp khác (Giang).
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status) values
  ('d2340000-0000-0000-0000-000000000001', 't', 'b2340000-0000-0000-0000-00000000000a', 'VERA234', current_setting('t.wk')::date, '10:00', '13:00',
   'c2340000-0000-0000-0000-000000000001', 'Hùng', 'Upcoming');
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e2340000-0000-0000-0000-000000000001', current_setting('t.wk')::date,     '12:00', '15:00', 'b2340000-0000-0000-0000-00000000000a', 'VERA234', 'open'),
  ('e2340000-0000-0000-0000-000000000002', current_setting('t.wk')::date + 1, '10:00', '13:00', 'b2340000-0000-0000-0000-00000000000a', 'VERA234', 'open'),
  ('e2340000-0000-0000-0000-000000000003', current_setting('t.wk')::date + 1, '11:00', '14:00', 'b2340000-0000-0000-0000-00000000000a', 'VERA234', 'open');
select set_config('request.jwt.claim.sub', 'a2340000-0000-0000-0000-000000000001', false), set_config('request.jwt.claim.role', 'authenticated', false);
insert into roster_drafts (slot_id, host_id, co_host_id) values
  ('e2340000-0000-0000-0000-000000000001', 'c2340000-0000-0000-0000-000000000001', null),
  ('e2340000-0000-0000-0000-000000000002', 'c2340000-0000-0000-0000-000000000002', null),
  ('e2340000-0000-0000-0000-000000000003', 'c2340000-0000-0000-0000-000000000003', 'c2340000-0000-0000-0000-000000000002');

select pg_temp.chk('1 công bố cả tuần dù có trùng người', (publish_roster_week(current_setting('t.wk')::date) ->> 'published')::int = 3);
select pg_temp.chk('2 ba ca mở đã thành ca thật', (select count(*) from shift_slots where id::text like 'e2340000%' and session_id is not null) = 3);
select pg_temp.chk('3 chỉ ca trùng bị gắn cờ',
  (select array_agg(s.allow_person_clash order by sl.id) from shift_slots sl join live_sessions s on s.id = sl.session_id
    where sl.id::text like 'e2340000%') = array[true, false, true]);
select pg_temp.chk('4 biến công bố đã trả lại', coalesce(current_setting('app.roster_publish', true), '') <> '1');
-- Ngoài lúc công bố vẫn chặn: thêm ca mới trùng Hùng.
select pg_temp.must_fail('5 ghi ca ngoài lúc công bố vẫn chặn trùng người',
  format($q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, host_name, status)
           values ('x', 'b2340000-0000-0000-0000-00000000000a', 'VERA234', %L, '10:30', '11:30', 'c2340000-0000-0000-0000-000000000001', 'Hùng', 'Upcoming')$q$,
         current_setting('t.wk')), 'Trùng người');
-- Ca chốt từ trước (không cờ) vẫn đổi trạng thái được dù đang bị trùng.
update live_sessions set status = 'Completed' where id = 'd2340000-0000-0000-0000-000000000001';
select pg_temp.chk('6 ca cũ vẫn chuyển Completed được', (select status from live_sessions where id = 'd2340000-0000-0000-0000-000000000001') = 'Completed');
