-- Kiểm migration 0152 (ops gõ tay "Thực tế" của ca). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0152.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chưa nạp 0152 thì đỏ ngay mục 1.
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

create or replace function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false);
$$;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-0000000005a1', 'ops52@t'),
  ('a0000000-0000-0000-0000-0000000005a2', 'talent52@t'),
  ('a0000000-0000-0000-0000-0000000005a3', 'brand52@t')
on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000005b1', 'B52');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) where b.id = 'b0000000-0000-0000-0000-0000000005b1' on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role, status) values
  ('a0000000-0000-0000-0000-0000000005a1', 'Ops', 'ops52@t', 'operations', 'Active'),
  ('a0000000-0000-0000-0000-0000000005a2', 'Talent', 'talent52@t', 'talent', 'Active')
  on conflict (id) do update set role = excluded.role;
select pg_temp.as_user('a0000000-0000-0000-0000-0000000005a1');

insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, platform) values
  ('e5200000-0000-0000-0000-000000000001', 'past', 'b0000000-0000-0000-0000-0000000005b1', 'B52', current_date - 2, '19:00', '22:00', 'Completed', 'TikTok'),
  ('e5200000-0000-0000-0000-000000000002', 'future', 'b0000000-0000-0000-0000-0000000005b1', 'B52', current_date + 3, '19:00', '22:00', 'Upcoming', 'TikTok'),
  ('e5200000-0000-0000-0000-000000000003', 'overnight', 'b0000000-0000-0000-0000-0000000005b1', 'B52', current_date - 2, '22:00', '01:00', 'Completed', 'TikTok'),
  ('e5200000-0000-0000-0000-000000000004', 'filed', 'b0000000-0000-0000-0000-0000000005b1', 'B52', current_date - 2, '10:00', '12:00', 'Completed', 'TikTok'),
  ('e5200000-0000-0000-0000-000000000005', 'cancelled', 'b0000000-0000-0000-0000-0000000005b1', 'B52', current_date - 2, '13:00', '15:00', 'Cancelled', 'TikTok');
update live_sessions set data_source = 'live_snapshot', actual_gmv = 777 where id = 'e5200000-0000-0000-0000-000000000004';

select pg_temp.chk('1 hàm tồn tại + chỉ authenticated gọi được',
  has_function_privilege('authenticated', 'set_session_actuals(uuid, numeric, time, time)', 'execute')
  and not has_function_privilege('anon', 'set_session_actuals(uuid, numeric, time, time)', 'execute'));

-- 2) Ghi GMV + giờ live
select set_session_actuals('e5200000-0000-0000-0000-000000000001', 12345000, '19:10', '21:40');
select pg_temp.chk('2 GMV, giờ live và thời lượng được ghi, nguồn vẫn manual',
  (select actual_gmv = 12345000 and live_duration_minutes = 150 and data_source = 'manual'
          and (actual_start_at at time zone 'Asia/Ho_Chi_Minh')::time = '19:10'
          and (actual_end_at at time zone 'Asia/Ho_Chi_Minh')::time = '21:40'
     from live_sessions where id = 'e5200000-0000-0000-0000-000000000001'));

-- 3) Chỉ GMV, không giờ ⇒ xoá giờ cũ
select set_session_actuals('e5200000-0000-0000-0000-000000000001', 500000);
select pg_temp.chk('3 để trống giờ live ⇒ giờ cũ bị xoá',
  (select actual_gmv = 500000 and actual_start_at is null and live_duration_minutes is null
     from live_sessions where id = 'e5200000-0000-0000-0000-000000000001'));

-- 4) Ca qua nửa đêm
select set_session_actuals('e5200000-0000-0000-0000-000000000003', 1, '22:30', '00:45');
select pg_temp.chk('4 ca qua nửa đêm: live 22:30–00:45 = 135 phút, kết thúc sang ngày sau',
  (select live_duration_minutes = 135
          and (actual_end_at at time zone 'Asia/Ho_Chi_Minh')::date = date + 1
     from live_sessions where id = 'e5200000-0000-0000-0000-000000000003'));
select set_session_actuals('e5200000-0000-0000-0000-000000000003', 1, '00:10', '00:50');
select pg_temp.chk('4b ca qua nửa đêm: live bắt đầu sau 00:00 thuộc ngày hôm sau',
  (select live_duration_minutes = 40 and (actual_start_at at time zone 'Asia/Ho_Chi_Minh')::date = date + 1
     from live_sessions where id = 'e5200000-0000-0000-0000-000000000003'));

-- 5) Các chặn
select pg_temp.must_fail('5a ca đã có số từ file', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000004', 5)$q$, 'up file mới');
select pg_temp.chk('5a số file còn nguyên', (select actual_gmv = 777 from live_sessions where id = 'e5200000-0000-0000-0000-000000000004'));
select pg_temp.must_fail('5b ca chưa bắt đầu', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000002', 5)$q$, 'chưa bắt đầu');
select pg_temp.must_fail('5c ca đã huỷ', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000005', 5)$q$, 'đã huỷ');
select pg_temp.must_fail('5d GMV âm', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000001', -1)$q$, 'GMV');
select pg_temp.must_fail('5e chỉ một đầu giờ', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000001', 5, '19:00', null)$q$, 'cả giờ bắt đầu');
select pg_temp.must_fail('5f giờ trùng nhau', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000001', 5, '19:00', '19:00')$q$, 'không được trùng');

-- 6) Không phải ops
select pg_temp.as_user('a0000000-0000-0000-0000-0000000005a2');
select pg_temp.must_fail('6 talent không gõ được', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000001', 5)$q$, 'Chỉ OPS');
select pg_temp.as_user('a0000000-0000-0000-0000-0000000005a1');

-- 7) Sau khi file về (nguồn không còn manual) thì gõ tay bị chặn
update live_sessions set data_source = 'live_snapshot', actual_gmv = 999 where id = 'e5200000-0000-0000-0000-000000000001';
select pg_temp.must_fail('7 sau khi file về, gõ tay bị chặn', $q$select set_session_actuals('e5200000-0000-0000-0000-000000000001', 5)$q$, 'up file mới');
