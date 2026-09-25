-- 0120 — Đoạn tóm tắt + việc tháng sau của Report Tháng (2026-09-25).
--
-- Report Tháng làm lại thành 1 trang cuộn 8 phần (user chốt 2026-09-25). Phần 1 "Tóm tắt" và phần 8
-- "Tháng sau" là văn xuôi: app tự sinh bản nháp từ bản chụp số liệu (0119), ops sửa rồi mới phát
-- hành. NULL = chưa sửa ⇒ brand thấy đúng bản tự sinh từ bản chụp đang phát hành (tất định theo số).
--
-- summary_saved_at để UI cảnh báo khi đoạn đã sửa CŨ HƠN lần cập nhật số liệu gần nhất (ops viết
-- "GMV giảm 18%" rồi bấm cập nhật số, số mới giảm 15% — chữ không tự đổi theo).
--
-- Chỉ thêm cột: RLS/RPC phát hành của 0051/0107/0114 áp nguyên cho dòng. upsertMonthlyReport() phía
-- client KHÔNG gửi 2 cột này (upsert chỉ SET các cột có trong payload) nên lưu Ads/kế hoạch không
-- xoá mất đoạn tóm tắt; ghi 2 cột này đi đường riêng (saveMonthlyReportNarrative).

alter table brand_monthly_reports
  add column if not exists summary_text text,
  add column if not exists next_steps_text text,
  add column if not exists summary_saved_at timestamptz;
