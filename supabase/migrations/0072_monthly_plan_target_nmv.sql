-- Report Tháng Tab 05 "Kế hoạch tháng sau" — brief Module 5 yêu cầu 3 field target đầu form: Target
-- GMV Live, Target NMV, Tổng Giờ Live (0065 mới thêm plan_target_gmv/plan_target_hours, thiếu
-- plan_target_nmv). Cùng row/RLS/publish flow với các cột plan_* khác vì vẫn là 1 dòng/brand/tháng
-- nhập tay.
alter table brand_monthly_reports
  add column if not exists plan_target_nmv numeric;
