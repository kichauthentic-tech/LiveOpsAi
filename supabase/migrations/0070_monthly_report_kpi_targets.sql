-- Report Tháng Tab 01 "Tổng Quan" (Deep Dive Module 1, brief Crocs x YFB) — thêm 2 field Target/KPI
-- loại B do brand giao CHO THÁNG ĐANG XEM: KPI GMV, KPI NMV. Khác hẳn plan_target_gmv (migration
-- 0065) vốn là kế hoạch cho THÁNG SAU (Tab 05) — 2 khái niệm lệch nhau 1 tháng, không dùng chung cột.
-- Cùng row/RLS/publish flow như plan_target_* vì vẫn là 1 dòng/brand/tháng nhập tay.
alter table brand_monthly_reports
  add column if not exists kpi_target_gmv numeric,
  add column if not exists kpi_target_nmv numeric;
