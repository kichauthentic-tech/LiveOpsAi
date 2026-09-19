-- Dọn dữ liệu TEST của Kế Hoạch Tháng trên DB thật (verify 0090–0093, 2026-09-19): plan CROCS
-- 10/2026 + mọi shift_slots CROCS tháng 10/2026 chưa ai đăng ký (gồm ca tay "test 0093 ca tay" và
-- ca huỷ còn sót) + quy tắc lặp "test ke hoach". Chỉ chạy nếu không muốn giữ.
-- An toàn: chỉ xoá ca open/cancelled chưa ai đăng ký, chưa gắn phiên; plan cascade xoá plan_slots.
delete from shift_slots s
where s.brand_id = (select id from brands where name = 'CROCS')
  and s.date >= '2026-10-01' and s.date < '2026-11-01'
  and s.status in ('open', 'cancelled')
  and s.session_id is null
  and not exists (select 1 from session_availability a where a.slot_id = s.id);
delete from brand_month_plans where month = '2026-10-01' and brand_id = (select id from brands where name = 'CROCS');
delete from recurring_shift_templates where notes = 'test ke hoach';
select (select count(*) from brand_month_plans) as plans, (select count(*) from shift_slots) as slots, (select count(*) from recurring_shift_templates) as rules;
