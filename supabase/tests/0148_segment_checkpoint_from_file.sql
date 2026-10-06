-- Kiểm 0148 (số lúc đổi host ca TikTok từ FILE). Chạy trên bản REPLAY SAU 0147 + 0148; thiếu 0148 đỏ ngay mục 0.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;
create or replace function pg_temp.must_fail(label text, stmt text, want text) returns void language plpgsql as $$
begin
  begin execute stmt;
  exception when others then
    if position(want in sqlerrm) = 0 then raise exception 'FAIL % : lỗi khác mong đợi: %', label, sqlerrm; end if;
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 90);
    return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

select pg_temp.chk('0 có hàm apply_segment_checkpoint_file', to_regprocedure('public.apply_segment_checkpoint_file(uuid,integer,text,jsonb)') is not null);

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'FRK');
insert into talents (id, name) values ('c0000000-0000-0000-0000-000000000001', 'Host A'), ('c0000000-0000-0000-0000-000000000003', 'Host B');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ca trước (13:00-15:00) đã up file: phòng R có 1.000.000 cộng dồn. Ca này 15:00-17:30, host A 0-60, host B 60-150.
insert into live_sessions (id, title, brand_id, brand_name, platform, date, start_time, end_time, host_id, host_name, status) values
 ('d0000000-0000-0000-0000-000000000001', 'ca trước', 'b0000000-0000-0000-0000-00000000000a', 'FRK', 'TikTok', current_date + 5, '13:00', '15:00', 'c0000000-0000-0000-0000-000000000001', 'Host A', 'Upcoming'),
 ('d0000000-0000-0000-0000-000000000002', 'ca đổi host', 'b0000000-0000-0000-0000-00000000000a', 'FRK', 'TikTok', current_date + 5, '15:00', '17:30', 'c0000000-0000-0000-0000-000000000001', 'Host A', 'Upcoming');
select apply_session_live_snapshot('d0000000-0000-0000-0000-000000000001', 'prev.xlsx', null,
  jsonb_build_array(jsonb_build_object('roomId', 'R1', 'gmv', 1000000, 'orders', 10, 'views', 500,
    'startedAt', to_char(((current_date + 5) + time '12:50') at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SSOF'))));
select set_session_staff_segments('d0000000-0000-0000-0000-000000000002', jsonb_build_array(
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000001', 'role', 'host', 'from_min', 0, 'to_min', 60),
  jsonb_build_object('talent_id', 'c0000000-0000-0000-0000-000000000003', 'role', 'host', 'from_min', 60, 'to_min', 150)));

-- 1) up file lúc đổi host: phần của ca = số phòng − số ca trước
select apply_segment_checkpoint_file('d0000000-0000-0000-0000-000000000002', 60, 'cp.xlsx',
  jsonb_build_array(jsonb_build_object('roomId', 'R1', 'gmv', 6000000, 'orders', 60, 'views', 2500,
    'startedAt', to_char(((current_date + 5) + time '12:50') at time zone 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD"T"HH24:MI:SSOF'))));
select pg_temp.chk('1a phần ca tới lúc đổi = 6tr − 1tr', cum_gmv = 5000000 and cum_orders = 50 and cum_views = 2000 and base_gmv = 0 and source = 'file' and file_name = 'cp.xlsx')
  from session_segment_checkpoints where session_id = 'd0000000-0000-0000-0000-000000000002';

-- 2) từ chối
select pg_temp.must_fail('2a gõ tay cho ca TikTok bị chặn',
  $q$select submit_segment_checkpoint('d0000000-0000-0000-0000-000000000002', 60, 'https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366', 1000, 1, 1)$q$, 'up file Creator-Live-Performance');
select pg_temp.must_fail('2b phút không phải chỗ đổi host',
  $q$select apply_segment_checkpoint_file('d0000000-0000-0000-0000-000000000002', 45, 'x', '[{"roomId":"R1","gmv":9000000,"orders":1,"views":1}]'::jsonb)$q$, 'không phải chỗ đổi host');
select pg_temp.must_fail('2c file không có phòng nào của ca',
  $q$select apply_segment_checkpoint_file('d0000000-0000-0000-0000-000000000002', 60, 'x', '[]'::jsonb)$q$, 'không có phiên live nào');
select pg_temp.must_fail('2d vượt số cả ca khi file giao ca đã up',
  $q$select apply_session_live_snapshot('d0000000-0000-0000-0000-000000000002', 'final.xlsx', null, jsonb_build_array(jsonb_build_object('roomId','R1','gmv',3000000,'orders',30,'views',1000)));
     select apply_segment_checkpoint_file('d0000000-0000-0000-0000-000000000002', 60, 'cp.xlsx', jsonb_build_array(jsonb_build_object('roomId','R1','gmv',6000000,'orders',60,'views',2500)))$q$, 'TRƯỚC file giao ca');
