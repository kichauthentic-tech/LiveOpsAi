-- Report Tháng Tab 02 "Livestream" (Deep Dive Module 2, brief Crocs x YFB) — cho phép cấu hình
-- khoảng ngày D-Day/Mid-Month/Pay-Day + Target GMV mỗi khung THEO TỪNG BRAND/THÁNG (loại B).
-- Cố tình KHÔNG đụng lib/campaignDays.ts (lịch camp cố định dùng chung cho Calendar/Ribbon/
-- ShiftScheduling toàn hệ thống) — 3 cặp cột dưới đây chỉ ảnh hưởng cách bucket GMV trong Report
-- Tháng của brand đang xem; nếu để trống, UI tự fallback về khung cố định mặc định (13-15/23-25/
-- D-Day tính theo getCampaignDayInfo) cho tháng đang xem, không bắt buộc phải điền mỗi tháng.
-- Cùng row/RLS/publish flow như kpi_target_*/plan_* (migration 0070/0065) vì vẫn là 1 dòng/brand/
-- tháng nhập tay.
alter table brand_monthly_reports
  add column if not exists camp_dday_start date,
  add column if not exists camp_dday_end date,
  add column if not exists camp_dday_target_gmv numeric,
  add column if not exists camp_midmonth_start date,
  add column if not exists camp_midmonth_end date,
  add column if not exists camp_midmonth_target_gmv numeric,
  add column if not exists camp_payday_start date,
  add column if not exists camp_payday_end date,
  add column if not exists camp_payday_target_gmv numeric;
