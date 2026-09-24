-- Dọn kế hoạch test còn lại sau khi verify Đ5 (2026-09-24). KHÔNG phải migration, chạy 1 lần.
--
-- Vòng verify Đ5 cần một Kế Hoạch Tháng ĐÃ CHỐT (mẫu số target chỉ sai khi có kế hoạch mà chưa
-- xếp đủ người). Ca + ca chờ đăng ký sinh ra đã xoá sạch bằng UI rồi; riêng `brand_month_plans`
-- thì APP KHÔNG CÓ ĐƯỜNG XOÁ NÀO (grep `src/lib/db/monthPlans.ts`: chỉ upsert/lock, không delete)
-- nên phải dọn ở đây.
--
-- Chỉ chạm đúng plan VERA 2026-09 do phiên test tạo. Plan CROCS 2026-10 (draft, 75 ca) KHÔNG đụng.

begin;

delete from brand_month_plan_slots
 where plan_id = '6261fab7-3b41-4da6-b640-8fe586a828ee';

delete from brand_month_plans
 where id = '6261fab7-3b41-4da6-b640-8fe586a828ee';

commit;

-- Kiểm chứng:
-- select count(*) as plans_vera from brand_month_plans
--  where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';            -- phải = 0
-- select count(*) as plans_all, count(*) filter (where status='draft') as drafts
--   from brand_month_plans;                                            -- phải = 1 / 1 (CROCS T10)
-- select count(*) as plan_slots_all from brand_month_plan_slots;       -- phải = 75 (của CROCS T10)
