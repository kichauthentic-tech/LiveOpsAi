-- Thêm loại file "Campaign overview data" (TikTok Ads Manager / GMV Max, theo ngày, toàn cửa hàng — gồm LIVE GMV Max
-- và Product GMV Max) vào Dữ Liệu Gốc (2026-10-05, user yêu cầu: report Ads lấy từ file tải lên thay vì gõ tay ô
-- "Ads cost bổ sung"/"ROAS ghi đè" ở Nhập Ads & Ghi Chú).
--
-- Chỉ mở ràng buộc report_type; dùng lại nguyên bảng brand_dataraw_imports/_rows (0052), RLS của 0052 và unique
-- index 1 batch / brand / loại / tháng của 0077. File không ghi tên shop ⇒ brand là brand của màn đang tải lên.
-- Danh sách giữ đủ các giá trị của 0074 (kể cả loại đã gỡ khỏi app) để không chặn dòng cũ còn trên production.
alter table brand_dataraw_imports drop constraint brand_dataraw_imports_report_type_check;
alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check
  check (report_type in (
    'shop_promotion','product_list','live_analysis','shop_analytics',
    'live_performance_core_stats','product_card_traffic_stats','creator_live_performance',
    'transaction_analysis_creator_list','ads_campaign_overview'
  ));
