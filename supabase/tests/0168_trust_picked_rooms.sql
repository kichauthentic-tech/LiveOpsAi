-- Kiểm migration 0168 (phòng/phiên trợ đã tick — raw.picked — được tính cho ca dù ngoài cửa sổ giờ ca). Chạy trên bản REPLAY cả chuỗi.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA') on conflict (id) do nothing;
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ca 10:00–13:00 hôm nay-5.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status) values
  ('d1680000-0000-0000-0000-0000000000a1', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date - 5, '10:00', '13:00', 'Completed');

-- Dòng như client gửi: X = phiên hôm trước (ngoài ca) KHÔNG cờ ⇒ bị bỏ như cũ; Y = ngoài ca nhưng trợ tick (picked) ⇒ tính;
-- Z = phiên đang chạy (Live List Duration 0 ⇒ không endedAt), có cờ ⇒ tính.
select apply_session_live_snapshot('d1680000-0000-0000-0000-0000000000a1', 'f.xlsx', null, jsonb_build_array(
  jsonb_build_object('roomId', 'X', 'startedAt', ((current_date - 6) + time '20:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 6) + time '22:00') at time zone 'Asia/Ho_Chi_Minh',
    'durationMinutes', 120, 'gmv', 1000, 'orders', 1, 'views', 10, 'raw', '{}'::jsonb),
  jsonb_build_object('roomId', 'Y', 'startedAt', ((current_date - 5) + time '08:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 5) + time '09:00') at time zone 'Asia/Ho_Chi_Minh',
    'durationMinutes', 60, 'gmv', 200, 'orders', 2, 'views', 20, 'raw', '{"picked": true}'::jsonb),
  jsonb_build_object('roomId', 'Z', 'startedAt', ((current_date - 5) + time '09:59') at time zone 'Asia/Ho_Chi_Minh',
    'durationMinutes', 0, 'gmv', 30, 'orders', 3, 'views', 30, 'raw', '{"picked": true, "atc": 5}'::jsonb)
));

select pg_temp.chk('dòng ngoài ca không cờ bị bỏ, dòng có cờ + phiên đang chạy được tính',
  (select actual_gmv = 230 and total_orders = 5 and total_views = 50 from live_sessions where id = 'd1680000-0000-0000-0000-0000000000a1'));
select pg_temp.chk('view chỉ trả Y và Z',
  (select array_agg(room_id order by room_id) = array['Y', 'Z'] from session_room_deltas where session_id = 'd1680000-0000-0000-0000-0000000000a1'));

-- Cùng dòng Y nhưng KHÔNG cờ (client cũ) ⇒ luật cửa sổ cũ, bị bỏ.
select apply_session_live_snapshot('d1680000-0000-0000-0000-0000000000a1', 'f2.xlsx', null, jsonb_build_array(
  jsonb_build_object('roomId', 'Y', 'startedAt', ((current_date - 5) + time '08:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 5) + time '09:00') at time zone 'Asia/Ho_Chi_Minh',
    'durationMinutes', 60, 'gmv', 200, 'orders', 2, 'views', 20, 'raw', '{}'::jsonb),
  jsonb_build_object('roomId', 'Z', 'startedAt', ((current_date - 5) + time '09:59') at time zone 'Asia/Ho_Chi_Minh',
    'durationMinutes', 0, 'gmv', 30, 'orders', 3, 'views', 30, 'raw', '{}'::jsonb)
));
select pg_temp.chk('không cờ ⇒ giữ luật cửa sổ cũ (chỉ Z đang chạy được tính)',
  (select actual_gmv = 30 from live_sessions where id = 'd1680000-0000-0000-0000-0000000000a1'));
