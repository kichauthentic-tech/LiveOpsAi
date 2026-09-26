-- 0121 — Khung "Insight" từng phần của Report Tháng (2026-09-26).
--
-- Phần 3–7 (Toàn shop, Vì sao, Người, Hàng, Bối cảnh) mỗi phần có 1 khung Insight app tự sinh từ bản
-- chụp số liệu (0119): 1 câu kết luận + vài số chứng minh + 1 việc cần làm — học từ deck report tháng
-- của Crocs. Ops sửa/bổ sung bối cảnh mà số không nói được (scheme kết thúc sớm, creator không book
-- được...) trước khi phát hành. Cùng cách với summary_text của 0120: không có khoá = chưa sửa ⇒ brand
-- thấy bản tự sinh.
--
-- Dạng: { "<phần>": { "text": "<dòng 1 = kết luận; dòng '→ ...' = việc cần làm>", "savedAt": "<iso>" } }
-- với <phần> ∈ shop | why | people | products | context. savedAt để UI nhắc khi đoạn đã sửa CŨ HƠN lần
-- cập nhật số liệu gần nhất.
--
-- Chỉ thêm cột: RLS/RPC phát hành của 0051/0107/0114 áp nguyên cho dòng (brand chỉ đọc bản đã phát hành).
-- upsertMonthlyReport() phía client không gửi cột này nên lưu Ads/kế hoạch không xoá mất Insight; ghi đi
-- đường riêng saveMonthlyReportSectionNote().

alter table brand_monthly_reports
  add column if not exists section_notes jsonb;
