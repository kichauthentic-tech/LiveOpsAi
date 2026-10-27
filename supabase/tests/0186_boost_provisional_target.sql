-- Kiểm migration 0186 (ca tăng cường có target tạm ngay lúc tạo). Chạy trên bản REPLAY cả chuỗi (README.md) SAU khi nạp 0186.
-- Mỗi mục in "OK ..."; ERROR là hỏng. Chạy khi CHƯA có 0186 thì phải đỏ (mục 1: target 0).
\set ON_ERROR_STOP on
set client_min_messages = notice;
begin;

create or replace function pg_temp.chk(label text, ok boolean) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL %', label; end if;
  raise notice 'OK  %', label;
end $$;

insert into auth.users (id, email) values ('a0000000-0000-0000-0000-000000000002', 'ops@t') on conflict do nothing;
insert into brands (id, name) values ('b0000000-0000-0000-0000-00000000000a', 'CROCS') on conflict do nothing;
insert into profiles (id, name, email, role) values ('a0000000-0000-0000-0000-000000000002', 'Ops', 'ops@t', 'operations')
  on conflict (id) do update set role = excluded.role;
insert into brand_channels (brand_id, platform) values ('b0000000-0000-0000-0000-00000000000a', 'TikTok') on conflict do nothing;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', false);

-- Kế hoạch đã chốt: 2 ca kế hoạch = 3h × 300 + 3,5h qua đêm (21:00–00:30) × 400 ⇒ Σ 2.300 / 6,5h ≈ 353,85/giờ.
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000000a', '2031-03-01', 'draft', 'TikTok', 2300);
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv) values
  ('f0000000-0000-0000-0000-00000000000a', 'c0000000-0000-0000-0000-000000000001', '2031-03-10', '09:00', '12:00', 900),
  ('f0000000-0000-0000-0000-00000000000b', 'c0000000-0000-0000-0000-000000000001', '2031-03-10', '21:00', '00:30', 1400);
update brand_month_plans set status = 'locked' where id = 'c0000000-0000-0000-0000-000000000001';

-- 1) OP mở ca 15:00–18:00 sau chốt ⇒ dòng tăng cường có target tạm 3h × 353,85 = 1.062, vẫn chờ engine.
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-0000000000b1', '2031-03-10', '15:00', '18:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'open');
select pg_temp.chk('ca tăng cường có target tạm 1.062 (3h × target/giờ của kế hoạch)',
  (select target_gmv from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b1') = 1062);
select pg_temp.chk('target tạm vẫn chờ engine (target_pending)',
  (select target_pending from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b1'));

-- 2) Ca qua đêm 22:00–01:00 = 3h, không âm.
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-0000000000b2', '2031-03-11', '22:00', '01:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'open');
select pg_temp.chk('ca qua đêm 3h ⇒ 1.062',
  (select target_gmv from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b2') = 1062);

-- 3) Dời giờ ca tăng cường ⇒ dòng mới ở giờ mới, target tạm tính lại (2h ⇒ 708).
update shift_slots set end_time = '17:00' where id = 'e0000000-0000-0000-0000-0000000000b1';
select pg_temp.chk('dời còn 2h ⇒ target tạm 708',
  (select target_gmv from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b1') = 708);

-- 4) Target tháng KHÔNG đổi: Σ ca kế hoạch gốc vẫn 2.300.
select pg_temp.chk('Σ target kế hoạch gốc vẫn 2.300',
  (select sum(target_gmv) from brand_month_plan_slots where plan_id = 'c0000000-0000-0000-0000-000000000001') = 2300);

-- 5) Engine điền sau (set_boost_targets) vẫn đè được target tạm và tắt cờ chờ.
select set_boost_targets('c0000000-0000-0000-0000-000000000001',
  jsonb_build_array(jsonb_build_object('id', (select id from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b1'), 'target', 999, 'expected', 999)));
select pg_temp.chk('engine đè target tạm = 999, hết chờ',
  (select target_gmv = 999 and not target_pending from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b1'));

-- 6) Kế hoạch Σ target = 0 (lịch tháng sau vừa mở) ⇒ target tạm 0, vẫn chờ.
insert into brand_month_plans (id, brand_id, month, status, platform, target_gmv)
  values ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000000a', '2031-04-01', 'draft', 'TikTok', 0);
insert into brand_month_plan_slots (id, plan_id, date, start_time, end_time, target_gmv) values
  ('f0000000-0000-0000-0000-00000000000c', 'c0000000-0000-0000-0000-000000000002', '2031-04-10', '09:00', '12:00', 0);
update brand_month_plans set status = 'locked' where id = 'c0000000-0000-0000-0000-000000000002';
insert into shift_slots (id, date, start_time, end_time, brand_id, brand_name, platform, status) values
  ('e0000000-0000-0000-0000-0000000000b3', '2031-04-10', '15:00', '18:00', 'b0000000-0000-0000-0000-00000000000a', 'CROCS', 'TikTok', 'open');
select pg_temp.chk('kế hoạch chưa có target ⇒ target tạm 0, vẫn chờ',
  (select target_gmv = 0 and target_pending from plan_boost_slots where shift_slot_id = 'e0000000-0000-0000-0000-0000000000b3'));

rollback;
