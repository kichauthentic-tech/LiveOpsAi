-- Kiểm migration 0160 (cờ allow_person_clash). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0160.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0160 thì phải đỏ ngay (cột chưa có).
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
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 110);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS'), ('b0000000-0000-0000-0000-00000000000b', 'JOCKEY');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'M.Phú'),
  ('c0000000-0000-0000-0000-000000000002', 'Thái Toàn');

insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
values ('d0000000-0000-0000-0000-000000000001', 'CROCS', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date + 5,
        '12:00', '15:00', 'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'TikTok');

-- 1) Không cờ ⇒ vẫn chặn như 0143
select pg_temp.must_fail('1a thêm ca trùng người, không cờ ⇒ chặn',
  $q$insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
     values ('JOCKEY', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date + 5, '11:00', '13:00',
             'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'TikTok')$q$, 'Trùng người: M.Phú');

-- 2) Có cờ ⇒ thêm được
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform, allow_person_clash)
values ('d0000000-0000-0000-0000-000000000002', 'JOCKEY', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date + 5, '11:00', '13:00',
        'c0000000-0000-0000-0000-000000000001', 'Upcoming', 'TikTok', true);
select pg_temp.chk('2a có cờ ⇒ thêm ca trùng người được', (select count(*) = 1 from live_sessions where id = 'd0000000-0000-0000-0000-000000000002'));

-- 3) Ca không cờ vẫn không đưa được người vào chỗ đang bận
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
values ('d0000000-0000-0000-0000-000000000003', 'JOCKEY2', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date + 6, '11:00', '13:00',
        'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'TikTok');
select pg_temp.must_fail('3a ca khác không cờ đổi host sang người đang bận ⇒ chặn',
  $q$update live_sessions set host_id = 'c0000000-0000-0000-0000-000000000001', date = current_date + 5 where id = 'd0000000-0000-0000-0000-000000000003'$q$,
  'Trùng người: M.Phú');

-- 4) Bật cờ trên ca sẵn có rồi đổi người trùng
select pg_temp.must_fail('4a chưa bật cờ, đổi host trùng ⇒ chặn',
  $q$update live_sessions set host_id = 'c0000000-0000-0000-0000-000000000001', date = current_date + 5 where id = 'd0000000-0000-0000-0000-000000000003'$q$,
  'Trùng người');
update live_sessions set allow_person_clash = true, host_id = 'c0000000-0000-0000-0000-000000000001', date = current_date + 5
 where id = 'd0000000-0000-0000-0000-000000000003';
select pg_temp.chk('4b bật cờ cùng lúc đổi host trùng ⇒ qua', (select host_id = 'c0000000-0000-0000-0000-000000000001' from live_sessions where id = 'd0000000-0000-0000-0000-000000000003'));

-- 5) Đoạn đổi người giữa ca: có cờ ⇒ qua; ca không cờ ⇒ chặn
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, status, platform)
values ('d0000000-0000-0000-0000-000000000004', 'JOCKEY3', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date + 5, '12:00', '14:00',
        'c0000000-0000-0000-0000-000000000002', 'Upcoming', 'Shopee');
do $$ begin
  if to_regclass('public.session_staff_segments') is not null then
    insert into session_staff_segments (session_id, talent_id, role, from_min, to_min)
    values ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'host', 0, 60);
    raise notice 'OK  5a đoạn của ca có cờ trùng người ⇒ qua';
    begin
      insert into session_staff_segments (session_id, talent_id, role, from_min, to_min)
      values ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'co_host', 0, 60);
      -- Toàn đang host ca d..04 (12–14) nên đoạn trợ 12–13 của ca d..01 (12–15, không cờ) trùng ⇒ phải bị chặn
      raise exception 'FAIL 5b không bị chặn';
    exception when others then
      if position('Trùng người' in sqlerrm) = 0 then raise; end if;
      raise notice 'OK  5b đoạn của ca không cờ trùng người ⇒ chặn';
    end;
  end if;
end $$;

-- 6) Mặc định cờ = false
select pg_temp.chk('6a mặc định false', (select not allow_person_clash from live_sessions where id = 'd0000000-0000-0000-0000-000000000001'));
