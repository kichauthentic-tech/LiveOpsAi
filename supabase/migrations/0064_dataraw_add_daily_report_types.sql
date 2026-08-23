-- Deep Dive Report Tháng (giai đoạn mở rộng, 2026-08-22) — thêm 2 loại report Dataraw mới cần cho
-- biểu đồ GMV/GPM theo ngày và traffic thẻ sản phẩm trong Report Tháng redesign:
--   - live_performance_core_stats: export "Live Performance Core Stats" (GMV LIVE theo ngày, GPM)
--   - product_card_traffic_stats: export "Product Card Traffic Stats" (traffic thẻ sản phẩm theo ngày)
-- Cùng brand_dataraw_imports/brand_dataraw_rows đã có (migration 0052), chỉ nới CHECK constraint.

alter table brand_dataraw_imports drop constraint brand_dataraw_imports_report_type_check;

alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check
  check (report_type in (
    'shop_promotion',
    'product_list',
    'live_analysis',
    'shop_analytics',
    'live_performance_core_stats',
    'product_card_traffic_stats'
  ));
