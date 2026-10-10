-- Kiểm migration 0166 (chọn phiên nào đối soát). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0166.
-- Bỏ 0166 thì bộ kiểm phải ĐỎ (cột `excluded` không tồn tại).
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

-- 3 ca ngày current_date-10; mỗi ca một phiên (R1, R2, R3), R2 sẽ bị loại.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, actual_gmv, data_source) values
  ('d0000000-0000-0000-0000-0000000000a1', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '09:00', '11:00', 'Completed', 7, 'manual'),
  ('d0000000-0000-0000-0000-0000000000a2', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '13:00', '15:00', 'Completed', 7, 'manual'),
  ('d0000000-0000-0000-0000-0000000000a3', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '19:00', '21:00', 'Completed', 7, 'manual');
create temp table b as
select import_live_reconciliation('f.xlsx', 'p', null, null, jsonb_build_array(
  jsonb_build_object('roomId', 'R1', 'startedAt', ((current_date - 10) + time '09:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 10) + time '11:00') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 100, 'views', 1000, 'durationMinutes', 120),
  jsonb_build_object('roomId', 'R2', 'startedAt', ((current_date - 10) + time '13:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 10) + time '15:00') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 200, 'views', 2000, 'durationMinutes', 120),
  jsonb_build_object('roomId', 'R3', 'startedAt', ((current_date - 10) + time '19:00') at time zone 'Asia/Ho_Chi_Minh', 'endedAt', ((current_date - 10) + time '21:00') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 300, 'views', 3000, 'durationMinutes', 120)
), 'b0000000-0000-0000-0000-00000000000a') as id;

select pg_temp.chk('A mặc định không phiên nào bị loại', count(*) = 3 and bool_and(not excluded)) from live_reconciliation_rows where batch_id = (select id from b);

update live_reconciliation_rows set excluded = true where batch_id = (select id from b) and room_id = 'R2';
select apply_live_reconciliation((select id from b));
select pg_temp.chk('B phiên được chọn ghi đè (R1 → 100)', actual_gmv = 100 and data_source = 'tiktok_reconciled') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a1';
select pg_temp.chk('C phiên bị loại giữ nguyên số cũ (7, manual)', actual_gmv = 7 and data_source = 'manual') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a2';
select pg_temp.chk('D phiên được chọn khác ghi đè (R3 → 300)', actual_gmv = 300) from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a3';

-- Chọn lại R2 rồi áp dụng lại ⇒ ca 2 nhận số.
update live_reconciliation_rows set excluded = false where batch_id = (select id from b) and room_id = 'R2';
select apply_live_reconciliation((select id from b));
select pg_temp.chk('E chọn lại + áp dụng lại ⇒ ca 2 nhận 200', actual_gmv = 200) from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a2';

-- Loại hết ⇒ không ca nào bị ghi (trả 0).
update live_reconciliation_rows set excluded = true where batch_id = (select id from b);
update live_sessions set actual_gmv = 7, data_source = 'manual' where id in ('d0000000-0000-0000-0000-0000000000a1','d0000000-0000-0000-0000-0000000000a2','d0000000-0000-0000-0000-0000000000a3');
select pg_temp.chk('F loại hết ⇒ áp dụng trả 0 ca', apply_live_reconciliation((select id from b)) = 0);
select pg_temp.chk('G loại hết ⇒ số các ca không đổi', count(*) = 3 and bool_and(actual_gmv = 7 and data_source = 'manual')) from live_sessions where brand_id = 'b0000000-0000-0000-0000-00000000000a';
select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
