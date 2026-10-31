-- 0193 — Kho Dữ Liệu Gốc nhận thêm 5 file cả shop của Shopee (31/10/2026, brand dùng dịch vụ whole shop như Franklin):
--   shopee_shop_stats     "…shopee-shop-stats…xlsx" — doanh số đặt / xác nhận theo ngày, theo kênh, đơn hủy-hoàn, người mua mới-cũ
--   shopee_voucher        "voucher_…xlsx"            — tổng, theo ngày, từng mã giảm giá
--   shopee_discount       "discount_…xlsx"           — theo loại khuyến mãi, theo ngày, từng chương trình
--   shopee_composition    "sales_composition_…xlsx"  — ngành hàng, khung giá, người mua mới / cũ
--   shopee_shop_products  "producttraffic_Product_Card…xlsx" — tất cả sản phẩm của shop
-- Chỉ mở ràng buộc report_type; dùng lại brand_dataraw_imports/_rows, RLS (0052) và unique index 1 batch / brand / loại / tháng (0077).
-- Danh sách giữ đủ giá trị của 0192. Client mới + DB cũ: lưu file mới báo check_violation (brandDataRaw.ts dịch thành câu "chưa chạy migration").
-- Chạy lại nhiều lần không sao.

do $$
begin
  alter table brand_dataraw_imports drop constraint if exists brand_dataraw_imports_report_type_check;
  alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check check (report_type = any (array[
    'shop_promotion', 'product_list', 'live_analysis', 'shop_analytics', 'live_performance_core_stats',
    'product_card_traffic_stats', 'creator_live_performance', 'transaction_analysis_creator_list', 'ads_campaign_overview',
    'shopee_live_list', 'shopee_product_list', 'shopee_daily', 'shopee_overview',
    'shopee_ads', 'affiliate_live_analysis',
    'shopee_shop_ads', 'shopee_product_ads',
    'shopee_shop_stats', 'shopee_voucher', 'shopee_discount', 'shopee_composition', 'shopee_shop_products'
  ]));
end $$;

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'brand_dataraw_imports_report_type_check')) !~ 'shopee_shop_products' then
    raise exception '0193: danh sách loại file chưa có shopee_shop_products';
  end if;
end $$;
