-- 0122 — KPI GMV cả shop trong Kế Hoạch Tháng (2026-09-26).
--
-- Deck report tháng của Crocs mở đầu bằng "GMV cả shop 9,1 tỷ, vượt KPI 8,4 tỷ". KPI đó brand giao cho
-- CẢ SHOP (LIVE shop + LIVE affiliate + video + thẻ sản phẩm) — khác target_gmv (0094) là target phần
-- live agency dùng để xếp ca. Không suy ra được từ lịch ca, nên cần 1 ô nhập riêng. (0073 từng bỏ ô KPI
-- GMV nhập tay ở Report Tháng vì trùng target live — ô này KHÔNG trùng: phạm vi cả shop.) User chọn nhập
-- ở Kế Hoạch Tháng; Report Tháng đọc từ đây (% đạt, dự kiến cuối tháng theo nhịp hiện tại).
-- Không dùng để xếp ca / chia target ca.
--
-- NULL/0 = brand chưa giao KPI cả shop.

alter table brand_month_plans
  add column if not exists shop_target_gmv numeric;

-- Trigger 0110 rớt xác nhận của brand khi ops sửa tham số kế hoạch — KPI cả shop cũng là tham số brand
-- đã xem khi xác nhận, nên thêm vào danh sách cột. Thân hàm giữ nguyên (0110).
drop trigger if exists trg_brand_month_plans_reset_confirm on brand_month_plans;
create trigger trg_brand_month_plans_reset_confirm
  before update of default_slot_hours, live_window_start, live_window_end, max_slots_per_day,
    notes, blackout_dates, target_gmv, camp_ranges, shop_target_gmv
  on brand_month_plans
  for each row execute function reset_month_plan_confirmation();
