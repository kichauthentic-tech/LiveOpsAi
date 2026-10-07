-- Kiểm migration 0151 (chốt kế hoạch gắn vào ca đã nhập sẵn). Chạy trên bản REPLAY cả chuỗi SAU khi nạp 0151.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Trên bản replay chưa có 0151 mục 1a phải đỏ (sinh ca chờ đăng ký trùng).
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
insert into studios (id, name) values ('c0000000-0000-0000-0000-0000000000a1', 'Phòng ca nhập sẵn');

-- Ca nạp sẵn (không có shift_slot): quá khứ, tương lai, tương lai nhưng đã huỷ, trùng hệt nhau, khác sàn.
insert into live_sessions (id, title, brand_id, brand_name, platform, studio_id, date, start_time, end_time, status) values
  ('d0000000-0000-0000-0000-000000000001', 'past',   'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'c0000000-0000-0000-0000-0000000000a1', date '2030-01-02', '10:00', '13:00', 'Completed'),
  ('d0000000-0000-0000-0000-000000000002', 'future', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'c0000000-0000-0000-0000-0000000000a1', date '2099-01-10', '10:00', '13:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-000000000003', 'cancel', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', null, date '2099-01-11', '10:00', '13:00', 'Cancelled'),
  ('d0000000-0000-0000-0000-000000000004', 'dup1',   'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', null, date '2099-01-12', '10:00', '13:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-000000000005', 'dup2',   'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', null, date '2099-01-12', '10:00', '13:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-000000000006', 'spe',    'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'Shopee', null, date '2099-01-13', '10:00', '13:00', 'Upcoming'),
  ('d0000000-0000-0000-0000-000000000007', 'night',  'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', null, date '2099-01-14', '21:00', '00:30', 'Upcoming');

insert into brand_month_plans (id, brand_id, month, platform) values
  ('e0000000-0000-0000-0000-0000000000a1', 'b0000000-0000-0000-0000-00000000000a', date '2030-01-01', 'TikTok');
-- Tháng kế hoạch chỉ là nhãn: plan_slots mang ngày thật của ca (2030-01-02 là ngày đã qua, 2099 là tương lai).
insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv) values
  ('e0000000-0000-0000-0000-0000000000a1', date '2030-01-02', '10:00', '13:00', 10),  -- ca đã qua, có ca thật
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-10', '10:00', '13:00', 20),  -- tương lai, có ca thật
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-11', '10:00', '13:00', 30),  -- ca thật đã huỷ ⇒ mở ca chờ
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-12', '10:00', '13:00', 40),  -- 2 ca thật trùng hệt ⇒ chỉ gắn một
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-13', '10:00', '13:00', 50),  -- ca thật chỉ có ở sàn Shopee ⇒ mở ca chờ
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-14', '21:00', '00:30', 60),  -- ca qua nửa đêm có ca thật
  ('e0000000-0000-0000-0000-0000000000a1', date '2099-01-15', '10:00', '13:00', 70);  -- không có ca thật ⇒ mở ca chờ

create temp table lock_result as select lock_month_plan('e0000000-0000-0000-0000-0000000000a1') as r;

select pg_temp.chk('1a chỉ 3 ca chờ đăng ký (huỷ, khác sàn, không có ca thật) — KHÔNG mở ca trùng ca đã nhập',
  (select count(*) from shift_slots where plan_id = 'e0000000-0000-0000-0000-0000000000a1' and status = 'open') = 3);
select pg_temp.chk('1b số liệu trả về: created 3, linked_sessions 4',
  (select (r->>'created')::int = 3 and (r->>'linked_sessions')::int = 4 from lock_result));
select pg_temp.chk('2a ca quá khứ có ca thật: gắn ca finalized, không bị bỏ qua',
  (select s.status = 'finalized' and s.session_id = 'd0000000-0000-0000-0000-000000000001'
     from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id where ps.date = date '2030-01-02')
  and (select (r->>'skipped_past')::int = 0 from lock_result));
select pg_temp.chk('2b ca tương lai có ca thật: gắn đúng ca, mang phòng của ca thật',
  (select s.status = 'finalized' and s.session_id = 'd0000000-0000-0000-0000-000000000002' and s.studio_id = 'c0000000-0000-0000-0000-0000000000a1'
     from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id where ps.date = date '2099-01-10'));
select pg_temp.chk('2c ca thật đã huỷ không được gắn (mở ca chờ thay)',
  (select s.status = 'open' and s.session_id is null from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id where ps.date = date '2099-01-11'));
select pg_temp.chk('2d hai ca thật trùng hệt: gắn đúng MỘT ca, ca còn lại không có shift_slot',
  (select count(*) from shift_slots where session_id in ('d0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005')) = 1);
select pg_temp.chk('2e ca thật khác sàn không bị gắn vào kế hoạch TikTok',
  not exists (select 1 from shift_slots where session_id = 'd0000000-0000-0000-0000-000000000006')
  and (select s.status = 'open' from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id where ps.date = date '2099-01-13'));
select pg_temp.chk('2f ca qua nửa đêm gắn đúng ca thật',
  (select s.session_id = 'd0000000-0000-0000-0000-000000000007' from brand_month_plan_slots ps join shift_slots s on s.id = ps.slot_id where ps.date = date '2099-01-14'));
select pg_temp.chk('2g mọi ca kế hoạch đều có slot_id (target đổ được xuống ca thật)',
  not exists (select 1 from brand_month_plan_slots where plan_id = 'e0000000-0000-0000-0000-0000000000a1' and slot_id is null));

-- Chốt lại: không sinh thêm ca nào, không gắn lại ca đã gắn.
select lock_month_plan('e0000000-0000-0000-0000-0000000000a1');
select pg_temp.chk('3a chốt lại không nhân đôi ca (tổng shift_slots vẫn 7)', (select count(*) from shift_slots) = 7);
select pg_temp.chk('3b kế hoạch ở trạng thái locked', (select status = 'locked' from brand_month_plans where id = 'e0000000-0000-0000-0000-0000000000a1'));
