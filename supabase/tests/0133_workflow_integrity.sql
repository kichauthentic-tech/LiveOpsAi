-- Kiểm migration 0133 (vá vòng đời vận hành). Chạy trên bản REPLAY cả chuỗi (README.md, mục "Replay cả
-- chuỗi") SAU khi nạp 0133. Mỗi mục in "OK ..."; ERROR là hỏng. Chạy trên bản replay CHƯA có 0133 thì phải
-- đỏ ngay mục 1 (cách xác nhận bộ kiểm thật sự kiểm).
\set ON_ERROR_STOP on
set client_min_messages = notice;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

-- Gọi một câu lệnh, BẮT BUỘC phải raise và thông điệp chứa `want`.
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

-- ---------- dựng dữ liệu ----------
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'admin@t'),
  ('a0000000-0000-0000-0000-000000000002', 'talent@t')
on conflict do nothing;
insert into brands (id, name) values
  ('b0000000-0000-0000-0000-00000000000a', 'CROCS'),
  ('b0000000-0000-0000-0000-00000000000b', 'JOCKEY');
insert into talents (id, name) values
  ('c0000000-0000-0000-0000-000000000001', 'Host Một'),
  ('c0000000-0000-0000-0000-000000000002', 'Host Hai');
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000001', 'Admin', 'admin@t', 'admin')
  on conflict (id) do update set role = 'admin';
insert into profiles (id, name, email, role, assigned_talent_id) values
  ('a0000000-0000-0000-0000-000000000002', 'Talent', 'talent@t', 'talent', 'c0000000-0000-0000-0000-000000000001')
  on conflict (id) do update set role = 'talent', assigned_talent_id = 'c0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', false);

-- ============ 1) Sửa ca không xoá số đã có ============
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, host_id, data_source, actual_gmv, total_orders, status)
values ('d0000000-0000-0000-0000-000000000001', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS',
        current_date + 3, '19:00', '21:00', 'c0000000-0000-0000-0000-000000000001', 'live_snapshot', 50000000, 40, 'Upcoming');
select update_session_with_children('d0000000-0000-0000-0000-000000000001', jsonb_build_object(
  'date', (current_date + 3)::text, 'start_time', '19:00', 'end_time', '21:00',
  'host_id', 'c0000000-0000-0000-0000-000000000002', 'host_name', 'Host Hai',
  'actual_gmv', 0, 'total_orders', 0, 'status', 'Completed'));
select pg_temp.chk('1a GMV giữ 50M khi client gửi 0', actual_gmv = 50000000 and total_orders = 40) from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1b đổi host vẫn ghi', host_id = 'c0000000-0000-0000-0000-000000000002') from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.chk('1c status không lấy từ client', status = 'Upcoming') from live_sessions where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.must_fail('1d ca có số không dời ngày được',
  $q$select update_session_with_children('d0000000-0000-0000-0000-000000000001', jsonb_build_object('date', (current_date + 4)::text, 'start_time', '19:00', 'end_time', '21:00'))$q$,
  'đã có số liệu');
-- ca quá khứ chưa có số, client đang hiện "Completed", kéo sang tương lai ⇒ phải về Upcoming
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status)
values ('d0000000-0000-0000-0000-000000000002', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 2, '10:00', '12:00', 'Completed');
select update_session_with_children('d0000000-0000-0000-0000-000000000002', jsonb_build_object(
  'date', (current_date + 5)::text, 'start_time', '10:00', 'end_time', '12:00', 'status', 'Completed'));
select pg_temp.chk('1e kéo ca chưa có số sang tương lai ⇒ Upcoming', status = 'Upcoming' and date = current_date + 5) from live_sessions where id = 'd0000000-0000-0000-0000-000000000002';

-- ============ 2) Chốt người nguyên khối ============
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status)
values ('e0000000-0000-0000-0000-000000000001', current_date + 6, '09:00', '12:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'open');
select finalize_shift_slot('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', null);
select pg_temp.chk('2a slot finalized + gắn ca', s.status = 'finalized' and ls.host_id = 'c0000000-0000-0000-0000-000000000001' and ls.status = 'Upcoming')
  from shift_slots s join live_sessions ls on ls.id = s.session_id where s.id = 'e0000000-0000-0000-0000-000000000001';
select pg_temp.must_fail('2b bấm chốt lần 2 không sinh ca thứ 2',
  $q$select finalize_shift_slot('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', null)$q$, 'không còn mở');
select pg_temp.chk('2c đúng 1 ca cho slot', count(*) = 1) from live_sessions where date = current_date + 6;

-- ============ 3) Đối soát gắn brand ============
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-0000000000a1', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', current_date - 10, '19:00', '21:00', 'Completed'),
  ('d0000000-0000-0000-0000-0000000000b1', 't', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', current_date - 10, '19:00', '21:00', 'Completed');
select pg_temp.must_fail('3a thiếu brand thì không nhận file',
  $q$select import_live_reconciliation('f.xlsx', 'p', null, null, '[]'::jsonb)$q$, 'Chọn brand');
create temp table recon_batch as
select import_live_reconciliation('f.xlsx', 'p', null, null, jsonb_build_array(
  jsonb_build_object('roomId', 'R1', 'startedAt', ((current_date - 10) + time '19:00') at time zone 'Asia/Ho_Chi_Minh',
                     'endedAt', ((current_date - 10) + time '21:00') at time zone 'Asia/Ho_Chi_Minh', 'gmv', 100, 'views', 1000, 'durationMinutes', 120),
  jsonb_build_object('roomId', 'R2', 'gmv', 999)
), 'b0000000-0000-0000-0000-00000000000a') as id;
select pg_temp.chk('3b room CROCS chỉ khớp ca CROCS', matched_session_ids = array['d0000000-0000-0000-0000-0000000000a1'::uuid] and bucket = 'agency')
  from live_reconciliation_rows where batch_id = (select id from recon_batch) and room_id = 'R1';
select pg_temp.chk('3c dòng thiếu giờ không khớp ca nào', matched_session_ids = '{}' and bucket = 'unassigned')
  from live_reconciliation_rows where batch_id = (select id from recon_batch) and room_id = 'R2';
select apply_live_reconciliation((select id from recon_batch));
select pg_temp.chk('3d CROCS nhận đủ 100', actual_gmv = 100) from live_sessions where id = 'd0000000-0000-0000-0000-0000000000a1';
select pg_temp.chk('3e JOCKEY không bị chia', coalesce(actual_gmv, 0) = 0 and data_source = 'manual') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000b1';
insert into live_reconciliation_batches (id, file_name) values ('f0000000-0000-0000-0000-000000000001', 'old.xlsx');
select pg_temp.must_fail('3f lô cũ không gắn brand không áp dụng được',
  $q$select apply_live_reconciliation('f0000000-0000-0000-0000-000000000001')$q$, 'gắn brand');

-- ============ 4) Ca kế hoạch của kế hoạch đã chốt ============
insert into brand_month_plans (id, brand_id, month, status) values
  ('aa000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000b', date_trunc('month', current_date)::date, 'draft');
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status, plan_id)
values ('e0000000-0000-0000-0000-000000000002', current_date + 7, '14:00', '16:00', 'b0000000-0000-0000-0000-00000000000b', 'JOCKEY', 'open', 'aa000000-0000-0000-0000-000000000001');
select finalize_shift_slot('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002', null);
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv, slot_id) values
  ('ab000000-0000-0000-0000-000000000001', 'aa000000-0000-0000-0000-000000000001', current_date - 1, '10:00', '12:00', 5000000, null),
  ('ab000000-0000-0000-0000-000000000002', 'aa000000-0000-0000-0000-000000000001', current_date + 7, '14:00', '16:00', 7000000, 'e0000000-0000-0000-0000-000000000002'),
  ('ab000000-0000-0000-0000-000000000003', 'aa000000-0000-0000-0000-000000000001', current_date + 8, '14:00', '16:00', 3000000, null);
update brand_month_plans set status = 'locked' where id = 'aa000000-0000-0000-0000-000000000001';
select pg_temp.must_fail('4a bỏ ca đã chốt người khỏi lưới',
  $q$delete from brand_month_plan_slots where id = 'ab000000-0000-0000-0000-000000000002'$q$, 'đã chốt người');
select pg_temp.must_fail('4b sửa target ca ngày đã qua',
  $q$update brand_month_plan_slots set target_gmv = 1 where id = 'ab000000-0000-0000-0000-000000000001'$q$, 'ngày đã qua');
select pg_temp.must_fail('4c xoá ca ngày đã qua',
  $q$delete from brand_month_plan_slots where id = 'ab000000-0000-0000-0000-000000000001'$q$, 'ngày đã qua');
select pg_temp.must_fail('4d thêm ca vào ngày đã qua',
  $q$insert into brand_month_plan_slots (plan_id, date, start_time, end_time) values ('aa000000-0000-0000-0000-000000000001', current_date - 2, '10:00', '12:00')$q$, 'ngày đã qua');
update brand_month_plan_slots set target_gmv = 6000000, note = 'x' where id = 'ab000000-0000-0000-0000-000000000002';
update brand_month_plan_slots set note = 'đã qua, chỉ đổi ghi chú' where id = 'ab000000-0000-0000-0000-000000000001';
delete from brand_month_plan_slots where id = 'ab000000-0000-0000-0000-000000000003';
select pg_temp.chk('4e ca tương lai chưa chốt người vẫn sửa/bỏ được; ghi chú ca đã qua sửa được', true);
-- huỷ ca rồi thì bỏ khỏi lưới được
select cancel_session((select session_id from shift_slots where id = 'e0000000-0000-0000-0000-000000000002'), 'test', false);
delete from brand_month_plan_slots where id = 'ab000000-0000-0000-0000-000000000002';
select pg_temp.chk('4f huỷ ca xong thì bỏ khỏi lưới được', not exists (select 1 from brand_month_plan_slots where id = 'ab000000-0000-0000-0000-000000000002'));
-- xoá cả kế hoạch: cascade phải đi qua dù còn ca ngày đã qua
delete from brand_month_plans where id = 'aa000000-0000-0000-0000-000000000001';
select pg_temp.chk('4g xoá cả kế hoạch cascade qua trigger', not exists (select 1 from brand_month_plan_slots where plan_id = 'aa000000-0000-0000-0000-000000000001'));

-- ============ 5) Hợp đồng ============
insert into brand_contracts (id, brand_id, start_month, end_month, monthly_hours, status) values
  ('ac000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', '2027-01-01', '2027-06-01', 100, 'draft');
select pg_temp.must_fail('5a hợp đồng nháp không sinh cam kết',
  $q$select generate_contract_commitments('ac000000-0000-0000-0000-000000000001')$q$, 'nháp');
update brand_contracts set status = 'active' where id = 'ac000000-0000-0000-0000-000000000001';
select pg_temp.chk('5b sinh 6 tháng', (generate_contract_commitments('ac000000-0000-0000-0000-000000000001')->>'inserted')::int = 6);
update brand_monthly_commitments set is_override = true, committed_hours = 80 where brand_id = 'b0000000-0000-0000-0000-00000000000a' and period_month = '2027-06-01';
update brand_contracts set end_month = '2027-03-01' where id = 'ac000000-0000-0000-0000-000000000001';
select pg_temp.chk('5c rút ngắn ⇒ dọn T4,T5 (T6 sửa tay thì giữ)', (generate_contract_commitments('ac000000-0000-0000-0000-000000000001')->>'removed')::int = 2);
select pg_temp.chk('5d còn T1-T3 + T6 sửa tay', count(*) = 4) from brand_monthly_commitments where brand_id = 'b0000000-0000-0000-0000-00000000000a' and period_month >= '2027-01-01';

-- ============ 6) + 7) Phát hành + đóng sổ ============
insert into brand_monthly_reports (id, brand_id, period_month) values
  ('ad000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', date_trunc('month', current_date)::date),
  ('ad000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', (date_trunc('month', current_date) - interval '1 month')::date);
select pg_temp.must_fail('6a tháng đang chạy không phát hành được',
  $q$select publish_brand_monthly_report('ad000000-0000-0000-0000-000000000001', true)$q$, 'chưa kết thúc');
-- tháng trước: 1 ca có số, 1 ca chưa đóng (Upcoming sót lại)
insert into live_sessions (id, title, brand_id, brand_name, date, start_time, end_time, status, data_source, actual_gmv) values
  ('d0000000-0000-0000-0000-0000000000c1', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', (date_trunc('month', current_date) - interval '1 month')::date + 4, '19:00', '21:00', 'Completed', 'tiktok_reconciled', 70),
  ('d0000000-0000-0000-0000-0000000000c2', 't', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', (date_trunc('month', current_date) - interval '1 month')::date + 5, '19:00', '21:00', 'Upcoming', 'manual', 0);
select publish_brand_monthly_report('ad000000-0000-0000-0000-000000000002', true);
select pg_temp.must_fail('7a sửa GMV ca của tháng đã phát hành',
  $q$update live_sessions set actual_gmv = 1 where id = 'd0000000-0000-0000-0000-0000000000c1'$q$, 'đóng sổ');
select pg_temp.must_fail('7b huỷ ca của tháng đã phát hành',
  $q$select cancel_session('d0000000-0000-0000-0000-0000000000c2', 'x', false)$q$, 'đóng sổ');
select pg_temp.must_fail('7c thêm ca vào tháng đã phát hành',
  $q$insert into live_sessions (title, brand_id, date, start_time, end_time) values ('t', 'b0000000-0000-0000-0000-00000000000a', (date_trunc('month', current_date) - interval '1 month')::date + 6, '09:00', '10:00')$q$, 'đóng sổ');
select pg_temp.must_fail('7d xoá ca của tháng đã phát hành',
  $q$delete from live_sessions where id = 'd0000000-0000-0000-0000-0000000000c1'$q$, 'đóng sổ');
select complete_past_sessions();
select pg_temp.chk('7e vòng đời Upcoming→Completed vẫn chạy trong tháng đã đóng sổ', status = 'Completed') from live_sessions where id = 'd0000000-0000-0000-0000-0000000000c2';
update live_sessions set title = 'đổi tiêu đề' where id = 'd0000000-0000-0000-0000-0000000000c1';
select pg_temp.chk('7f cột không thuộc sổ (tiêu đề) vẫn sửa được', true);
select unpublish_brand_monthly_report('ad000000-0000-0000-0000-000000000002');
update live_sessions set actual_gmv = 71 where id = 'd0000000-0000-0000-0000-0000000000c1';
select pg_temp.chk('7g thu hồi report thì sửa lại được', actual_gmv = 71) from live_sessions where id = 'd0000000-0000-0000-0000-0000000000c1';

-- ============ 8) Đăng ký rảnh chỉ ca còn mở (chạy dưới role authenticated + RLS) ============
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, status) values
  ('e0000000-0000-0000-0000-000000000010', current_date + 9, '09:00', '11:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'open'),
  ('e0000000-0000-0000-0000-000000000011', current_date + 9, '12:00', '14:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'cancelled'),
  ('e0000000-0000-0000-0000-000000000012', current_date - 1, '12:00', '14:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'open');
grant select, insert, delete on session_availability to authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set role authenticated;
insert into session_availability (slot_id, talent_id) values ('e0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001');
select pg_temp.must_fail('8a talent đăng ký ca đã huỷ',
  $q$insert into session_availability (slot_id, talent_id) values ('e0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001')$q$, 'row-level security');
select pg_temp.must_fail('8b talent đăng ký ca đã qua',
  $q$insert into session_availability (slot_id, talent_id) values ('e0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000001')$q$, 'row-level security');
reset role;
select pg_temp.chk('8c talent đăng ký ca mở tương lai được', count(*) = 1) from session_availability where slot_id = 'e0000000-0000-0000-0000-000000000010';

select 'TẤT CẢ OK' as ket_qua;
