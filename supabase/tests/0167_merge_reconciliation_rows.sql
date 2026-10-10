-- Kiểm migration 0167 (gộp dòng đối soát của ca restart/ngắt). Chạy trên bản REPLAY cả chuỗi sau khi nạp 0167.
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
    raise notice 'OK  % (chặn: %)', label, left(sqlerrm, 80); return;
  end;
  raise exception 'FAIL % : không bị chặn', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'VERA') on conflict (id) do nothing;
do $$ begin if to_regclass('public.brand_channels') is not null then
  execute $q$insert into brand_channels (brand_id, platform) select b.id, v.p from brands b cross join (values ('TikTok'), ('Shopee')) v(p) on conflict do nothing$q$;
end if; end $$;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ca 11:00–13:00 hôm nay-10; ca ẩn (loại khỏi report) là mảnh 2 phút.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status) values
  ('d1000000-0000-0000-0000-0000000000a1', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date - 10, '11:00', '13:00', 'Completed'),
  ('d1000000-0000-0000-0000-0000000000a2', 't', 'b0000000-0000-0000-0000-00000000000a', 'VERA', current_date - 10, '10:59', '11:01', 'Completed');
update live_sessions set excluded_from_reports = true where id = 'd1000000-0000-0000-0000-0000000000a2';

create temp table b as
select import_live_reconciliation('f.xlsx', 'p', null, null, jsonb_build_array(
  jsonb_build_object('roomId','R1','startedAt',((current_date-10)+time '10:59') at time zone 'Asia/Ho_Chi_Minh','endedAt',((current_date-10)+time '11:01') at time zone 'Asia/Ho_Chi_Minh','gmv',0,'orders',0,'views',10,'durationMinutes',2),
  jsonb_build_object('roomId','R2','startedAt',((current_date-10)+time '11:02') at time zone 'Asia/Ho_Chi_Minh','endedAt',((current_date-10)+time '13:02') at time zone 'Asia/Ho_Chi_Minh','gmv',2871000,'orders',9,'views',500,'durationMinutes',120),
  jsonb_build_object('roomId','R3','startedAt',((current_date-10)+time '20:00') at time zone 'Asia/Ho_Chi_Minh','endedAt',((current_date-10)+time '22:00') at time zone 'Asia/Ho_Chi_Minh','gmv',100,'durationMinutes',120)
), 'b0000000-0000-0000-0000-00000000000a') as id;
update live_reconciliation_rows set matched_session_ids = array['d1000000-0000-0000-0000-0000000000a2'::uuid, 'd1000000-0000-0000-0000-0000000000a1'::uuid] where batch_id = (select id from b) and room_id = 'R1';
update live_reconciliation_rows set matched_session_ids = array['d1000000-0000-0000-0000-0000000000a1'::uuid] where batch_id = (select id from b) and room_id = 'R2';
update live_reconciliation_rows set bucket = 'agency' where batch_id = (select id from b);
create temp table ids as select room_id, id from live_reconciliation_rows where batch_id = (select id from b);

select pg_temp.must_fail('A nhóm 1 dòng bị từ chối',
  format($q$select merge_reconciliation_rows(%L, %L::jsonb)$q$, (select id from b), json_build_array(json_build_array((select id from ids where room_id='R1')))::text), 'ít nhất 2 dòng');

select pg_temp.chk('B gộp trả 1 dòng bỏ', merge_reconciliation_rows((select id from b),
  jsonb_build_array(jsonb_build_array((select id from ids where room_id='R1'), (select id from ids where room_id='R2')))) = 1);
select pg_temp.chk('C còn 2 dòng, dòng giữ là R2 (GMV lớn nhất)', (select count(*) from live_reconciliation_rows where batch_id=(select id from b)) = 2
  and exists (select 1 from live_reconciliation_rows where id = (select id from ids where room_id='R2')) and not exists (select 1 from live_reconciliation_rows where id = (select id from ids where room_id='R1')));
select pg_temp.chk('D giờ 10:59→13:02, GMV/đơn/view/thời lượng cộng lại', started_at = ((current_date-10)+time '10:59') at time zone 'Asia/Ho_Chi_Minh'
  and ended_at = ((current_date-10)+time '13:02') at time zone 'Asia/Ho_Chi_Minh' and gmv = 2871000 and orders = 9 and views = 510 and duration_minutes = 122)
  from live_reconciliation_rows where id = (select id from ids where room_id='R2');
select pg_temp.chk('E ca khớp bỏ ca ẩn, còn đúng ca 11:00–13:00', matched_session_ids = array['d1000000-0000-0000-0000-0000000000a1'::uuid] and bucket = 'agency')
  from live_reconciliation_rows where id = (select id from ids where room_id='R2');
select pg_temp.chk('F raw.merged_from ghi lại dòng bị gộp', raw->'merged_from'->0->>'roomId' = 'R1') from live_reconciliation_rows where id = (select id from ids where room_id='R2');
select pg_temp.chk('G row_count của lô cập nhật = 2', row_count = 2) from live_reconciliation_batches where id = (select id from b);

-- Áp dụng sau gộp: ca 11:00–13:00 nhận đủ 2.871.000
select apply_live_reconciliation((select id from b));
select pg_temp.chk('H áp dụng sau gộp ghi đúng GMV', actual_gmv = 2871000) from live_sessions where id = 'd1000000-0000-0000-0000-0000000000a1';

select pg_temp.must_fail('I dòng đã bị xoá không gộp lại được',
  format($q$select merge_reconciliation_rows(%L, %L::jsonb)$q$, (select id from b), json_build_array(json_build_array((select id from ids where room_id='R1'),(select id from ids where room_id='R3')))::text), 'không thuộc lô');
select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
