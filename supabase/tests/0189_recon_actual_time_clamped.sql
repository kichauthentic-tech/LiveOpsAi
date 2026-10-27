-- Kiểm migration 0189 (giờ thực của ca đối soát kẹp vào khung ca). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0189.
-- Bỏ 0189 thì bộ kiểm phải ĐỎ (ca 18:00 hiện giờ thực 17:30).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS');
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ngày current_date-10: ca A 18:00–20:00 + ca B 20:00–22:00 cùng một phiên R1 (17:30–22:30); ca C 06:00–08:00 một phiên R2 (05:55–08:10).
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, actual_gmv, data_source) values
  ('d0000000-0000-0000-0000-0000000000a1', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '18:00', '20:00', 'Completed', 7, 'manual'),
  ('d0000000-0000-0000-0000-0000000000a2', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '20:00', '22:00', 'Completed', 7, 'manual'),
  ('d0000000-0000-0000-0000-0000000000a3', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '06:00', '08:00', 'Completed', 7, 'manual');
create temp table b as
select import_live_reconciliation('f.xlsx', 'p', null, null, jsonb_build_array(
  jsonb_build_object('roomId', 'R1', 'startedAt', ((current_date - 10) + time '17:30') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 10) + time '22:30') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 1000, 'views', 1000, 'durationMinutes', 300),
  jsonb_build_object('roomId', 'R2', 'startedAt', ((current_date - 10) + time '05:55') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 10) + time '08:10') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 300, 'views', 300, 'durationMinutes', 135)
), 'b0000000-0000-0000-0000-00000000000a') as id;
select apply_live_reconciliation((select id from b));

select pg_temp.chk('A ca A giờ thực kẹp vào 18:00–20:00', actual_start_at = ((current_date - 10) + time '18:00') at time zone 'Asia/Ho_Chi_Minh' and actual_end_at = ((current_date - 10) + time '20:00') at time zone 'Asia/Ho_Chi_Minh') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a1';
select pg_temp.chk('B ca B giờ thực kẹp vào 20:00–22:00', actual_start_at = ((current_date - 10) + time '20:00') at time zone 'Asia/Ho_Chi_Minh' and actual_end_at = ((current_date - 10) + time '22:00') at time zone 'Asia/Ho_Chi_Minh') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a2';
select pg_temp.chk('C ca nhận trọn phiên giữ giờ phiên 05:55–08:10', actual_start_at = ((current_date - 10) + time '05:55') at time zone 'Asia/Ho_Chi_Minh' and actual_end_at = ((current_date - 10) + time '08:10') at time zone 'Asia/Ho_Chi_Minh') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a3';
select pg_temp.chk('D GMV chia không đổi (tổng 1000)', (select sum(actual_gmv) from live_sessions where id in ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000a2')) = 1000);

-- Sửa ca cũ: đặt lại giờ rộng như bản cũ rồi chạy lại phần UPDATE của 0189 (qua psql \i).
update live_sessions set actual_start_at = ((current_date - 10) + time '17:30') at time zone 'Asia/Ho_Chi_Minh',
  actual_end_at = ((current_date - 10) + time '22:30') at time zone 'Asia/Ho_Chi_Minh' where id in ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000a2');
\i supabase/migrations/0189_recon_actual_time_clamped_to_shift.sql
select pg_temp.chk('E ca cũ được kẹp lại', actual_start_at = ((current_date - 10) + time '18:00') at time zone 'Asia/Ho_Chi_Minh' and actual_end_at = ((current_date - 10) + time '20:00') at time zone 'Asia/Ho_Chi_Minh') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a1';
select pg_temp.chk('F ca nhận trọn phiên không bị sửa giờ', actual_start_at = ((current_date - 10) + time '05:55') at time zone 'Asia/Ho_Chi_Minh') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a3';
