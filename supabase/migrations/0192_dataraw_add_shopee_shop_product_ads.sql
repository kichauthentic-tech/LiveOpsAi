-- 0192 — Kho Dữ Liệu Gốc nhận thêm 2 file Ads Shopee (31/10, Franklin vận hành whole shop nên có đủ 3 loại Ads):
--   shopee_shop_ads    "Báo cáo chiến dịch Tìm kiếm Từ khóa ngành hàng" (Shop+ Ads, tự động / thủ công)
--   shopee_product_ads "Báo cáo Dịch vụ Hiển thị trả theo CPC" (Product Ads / GMV Max, một dòng / sản phẩm)
-- Livestream Ads vẫn là shopee_ads (0142) — file tiếng Việt vào cùng loại. Chỉ mở ràng buộc report_type; dùng lại bảng
-- brand_dataraw_imports/_rows, RLS (0052) và unique index 1 batch / brand / loại / tháng (0077). Danh sách giữ đủ giá trị của 0183.
-- Client mới + DB cũ: lưu 2 file mới báo check_violation (brandDataRaw.ts dịch thành câu "chưa chạy migration"). Chạy lại nhiều lần không sao.

do $$
begin
  alter table brand_dataraw_imports drop constraint if exists brand_dataraw_imports_report_type_check;
  alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check check (report_type = any (array[
    'shop_promotion', 'product_list', 'live_analysis', 'shop_analytics', 'live_performance_core_stats',
    'product_card_traffic_stats', 'creator_live_performance', 'transaction_analysis_creator_list', 'ads_campaign_overview',
    'shopee_live_list', 'shopee_product_list', 'shopee_daily', 'shopee_overview',
    'shopee_ads', 'affiliate_live_analysis',
    'shopee_shop_ads', 'shopee_product_ads'
  ]));
end $$;

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'brand_dataraw_imports_report_type_check')) !~ 'shopee_product_ads' then
    raise exception '0192: danh sách loại file chưa có shopee_product_ads';
  end if;
end $$;
