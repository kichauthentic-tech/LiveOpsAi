-- Thêm report type "Transaction Analysis - Creator List" (TikTok Shop Partner Center) vào Dữ Liệu
-- Gốc — export GMV/đơn/hoa hồng ước tính THEO TỪNG CREATOR affiliate trong kỳ, nguồn dữ liệu thật
-- đầu tiên cho Report Tháng Tab 04 Affiliate (trước giờ nhập tay hoàn toàn, xem migration 0067).
-- Chỉ thêm vào Dataraw ở bước này — CHƯA nối vào Tab 04, để phiên sau quyết định map cột nào
-- (Affiliate video-attributed GMV + Affiliate product card-attributed GMV, hay Creator-attributed
-- GMV gộp cả LIVE) thành "Direct GMV" của Tab 04.
alter table brand_dataraw_imports drop constraint brand_dataraw_imports_report_type_check;
alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check
  check (report_type in (
    'shop_promotion','product_list','live_analysis','shop_analytics',
    'live_performance_core_stats','product_card_traffic_stats','creator_live_performance',
    'transaction_analysis_creator_list'
  ));
