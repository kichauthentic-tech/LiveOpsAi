-- 0146 — Ngân sách Ads của tháng trong Kế Hoạch Tháng (2026-10-06).
--
-- Deck Franklin có "% ngân sách Ads đã dùng". Ngân sách không suy ra được từ file Ads, nên cần MỘT ô nhập;
-- user chốt đặt ở Kế Hoạch Tháng (cạnh target). Report Tháng đọc từ đây. NULL/0 = chưa đặt.
-- Không thêm vào trigger rớt xác nhận 0110: brand không xác nhận ngân sách Ads.

alter table brand_month_plans
  add column if not exists ads_budget numeric;
