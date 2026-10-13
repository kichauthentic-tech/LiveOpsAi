-- Kiểm 0173 (dòng đối soát thiếu ca nạp bù tách ra sau Áp dụng). Chạy trên bản REPLAY tới 0172 (CHƯA nạp 0173): bộ này tự
-- dựng dữ liệu lỗi rồi mới nạp 0173 bằng \ir. Mỗi mục in "OK ..."; ERROR là hỏng.
\set ON_ERROR_STOP on
set client_min_messages = notice;
create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000001', 'admin@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-0000000000c1', 'CROCS') on conflict (id) do nothing;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-0000000000c1', 'TikTok') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin') on conflict (id) do update set role = 'admin';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- Ca nạp bù trọn phiên 11:00 -> 23:00, phiên 120M, Áp dụng.
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, is_backfill, live_room_ids)
values ('d1730000-0000-0000-0000-000000000001', 'bf', 'b0000000-0000-0000-0000-0000000000c1', 'CROCS', current_date - 20, '11:00', '23:00', 'Completed', true, array['R173']);
create temp table b as
select import_live_reconciliation('f.xlsx', 'p0173', null, null, jsonb_build_array(jsonb_build_object(
  'roomId', 'R173', 'startedAt', ((current_date - 20) + time '11:00') at time zone 'Asia/Ho_Chi_Minh',
  'endedAt', ((current_date - 20) + time '23:00') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 120000000, 'orders', 120, 'durationMinutes', 720)),
  'b0000000-0000-0000-0000-0000000000c1') as id;
select apply_live_reconciliation((select id from b));

-- Tách thành 4 ca 3 giờ (30M mỗi ca) như ngày 05/10 — TRƯỚC 0159 nên trigger chưa gắn ca mới vào dòng đối soát.
alter table live_sessions disable trigger trg_sync_recon_rows_backfill;
update live_sessions set end_time = '14:00', actual_gmv = 30000000 where id = 'd1730000-0000-0000-0000-000000000001';
insert into live_sessions (title, brand_id, brand_name, date, start_time, end_time, status, is_backfill, live_room_ids, actual_gmv, data_source)
select 'bf', 'b0000000-0000-0000-0000-0000000000c1', 'CROCS', current_date - 20, h.s::time, h.e::time, 'Completed', true, array['R173'], 30000000, 'tiktok_reconciled'
  from (values ('14:00', '17:00'), ('17:00', '20:00'), ('20:00', '23:00')) h(s, e);
alter table live_sessions enable trigger trg_sync_recon_rows_backfill;

select pg_temp.chk('A trước 0173: dòng chỉ khớp 1 ca', (select cardinality(matched_session_ids) = 1 from live_reconciliation_rows where batch_id = (select id from b)));
select pg_temp.chk('B trước 0173: xem trước dồn 120M vào 1 ca (lỗi đếm trùng)',
  (select count(*) = 1 and max(gmv) = 120000000 from preview_live_reconciliation((select id from b))));

\ir ../migrations/0173_recon_rows_backfill_split_repair.sql
\ir ../migrations/0173_recon_rows_backfill_split_repair.sql

select pg_temp.chk('C sau 0173 (chạy 2 lần): dòng khớp đủ 4 ca, không trùng',
  (select cardinality(matched_session_ids) = 4 and cardinality(matched_session_ids) = (select count(distinct x) from unnest(matched_session_ids) x)
     from live_reconciliation_rows where batch_id = (select id from b)));
select pg_temp.chk('D xem trước = số đang ghi (30M mỗi ca), không còn ca lệch',
  (select count(*) = 4 and bool_and(abs(gmv - 30000000) < 1 and abs(gmv - current_gmv) < 1) from preview_live_reconciliation((select id from b))));
select apply_live_reconciliation((select id from b));
select pg_temp.chk('E Áp dụng lại: tổng 4 ca = 120M, không đếm trùng',
  (select abs(sum(actual_gmv) - 120000000) < 1 from live_sessions where brand_id = 'b0000000-0000-0000-0000-0000000000c1'));

select 'TẤT CẢ ĐỀU ĐÚNG' as ket_qua;
