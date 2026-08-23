-- Thay thế live_analysis làm nguồn cho Report Tháng Tab 02/04 (quyết định user 2026-08-22, xem
-- WORKSPACE_DESIGN.md) — file "Creator-Live-Performance" (TikTok Creator Center, theo Room ID) có
-- nhiều chỉ số deep-dive hơn (Impressions, Watch time, Follow/Comment/Share/Like rate) nhưng KHÔNG
-- có cột tên host — đánh đổi đã được user xác nhận chấp nhận.
alter table brand_dataraw_imports drop constraint brand_dataraw_imports_report_type_check;
alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check
  check (report_type in (
    'shop_promotion','product_list','live_analysis','shop_analytics',
    'live_performance_core_stats','product_card_traffic_stats','creator_live_performance'
  ));
