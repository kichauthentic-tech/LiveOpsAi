-- Thêm loại file "Live Analysis — Affiliate" (2026-10-27, user: view "linked accounts" không có dữ liệu của tài khoản
-- affiliate nên cần chỗ up riêng; file mẫu cùng 28 cột với live_analysis, toàn phiên của creator affiliate).
-- Chỉ mở ràng buộc report_type; dùng lại bảng brand_dataraw_imports/_rows, RLS (0052) và unique index 1 batch / brand /
-- loại / tháng (0077). Danh sách giữ đủ giá trị của 0142.
do $$
begin
  alter table brand_dataraw_imports drop constraint if exists brand_dataraw_imports_report_type_check;
  alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check check (report_type = any (array[
    'shop_promotion', 'product_list', 'live_analysis', 'shop_analytics', 'live_performance_core_stats',
    'product_card_traffic_stats', 'creator_live_performance', 'transaction_analysis_creator_list', 'ads_campaign_overview',
    'shopee_live_list', 'shopee_product_list', 'shopee_daily', 'shopee_overview',
    'shopee_ads', 'affiliate_live_analysis'
  ]));
end $$;

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'brand_dataraw_imports_report_type_check')) !~ 'affiliate_live_analysis' then
    raise exception '0183: danh sách loại file chưa có affiliate_live_analysis';
  end if;
end $$;
