-- Dọn dữ liệu TEST của Kế Hoạch Tháng (verify 0090 trên DB thật, 2026-09-19): plan CROCS 10/2026
-- đã chốt + 5 shift_slots sinh từ đó + 1 quy tắc lặp "test ke hoach". Chỉ chạy nếu không muốn giữ.
-- An toàn: chỉ xoá ca open chưa ai đăng ký thuộc plan test; plan cascade xoá plan_slots.
delete from shift_slots s
where s.id in (select slot_id from brand_month_plan_slots ps join brand_month_plans p on p.id = ps.plan_id
               where p.month = '2026-10-01' and p.brand_id = (select id from brands where name = 'CROCS'))
  and s.status in ('open', 'cancelled')
  and not exists (select 1 from session_availability a where a.slot_id = s.id);
delete from brand_month_plans where month = '2026-10-01' and brand_id = (select id from brands where name = 'CROCS');
delete from recurring_shift_templates where notes = 'test ke hoach';
select (select count(*) from brand_month_plans) as plans, (select count(*) from shift_slots) as slots, (select count(*) from recurring_shift_templates) as rules;
