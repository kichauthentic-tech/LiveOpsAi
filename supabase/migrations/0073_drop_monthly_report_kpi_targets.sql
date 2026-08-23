-- Report Tháng Tab 01 Tổng Quan — bỏ ô KPI GMV/NMV nhập tay (thêm ở migration 0070), theo yêu cầu
-- user: số này trùng ý nghĩa với target đã lên lịch ở Lịch Vận Hành, không cần nhập lại thủ công.
-- Tab 01 giờ tự tính "Target GMV/NMV" trực tiếp từ SUM(live_sessions.target_gmv) trong kỳ (giống
-- cách GmvCalendar.tsx tính) + ước tính NMV qua Rate Card, không đọc bảng này nữa.
alter table brand_monthly_reports
  drop column if exists kpi_target_gmv,
  drop column if exists kpi_target_nmv;
