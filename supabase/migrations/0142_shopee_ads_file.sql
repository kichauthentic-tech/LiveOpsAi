-- 0142 — Kho Dữ Liệu Gốc nhận file Ads Shopee ("Shopee Live Ads Report", loại shopee_ads).
--
-- User chốt 06/10: chi phí Shopee có file riêng. File là một dòng / chiến dịch cho CẢ THÁNG (không theo ngày như file
-- TikTok Ads của 0137), tải ở Nhập Ads khi chọn sàn Shopee; Report Shopee đọc lại qua bản chụp. Xu (Coins Claimed) KHÔNG
-- cần loại file mới — đã có trong file tổng quan/theo ngày của Shopee (0139).
--
-- Thứ tự: chạy sau 0139 (danh sách dưới đây đã gồm 4 loại Shopee của 0139). Client mới + DB cũ: lưu file Ads Shopee báo lỗi
-- check_violation (lib/db/brandDataRaw.ts dịch thành câu "chưa chạy migration") — các loại khác không ảnh hưởng.
-- Chạy lại nhiều lần không sao.

do $$
begin
  alter table brand_dataraw_imports drop constraint if exists brand_dataraw_imports_report_type_check;
  alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check check (report_type = any (array[
    'shop_promotion', 'product_list', 'live_analysis', 'shop_analytics', 'live_performance_core_stats',
    'product_card_traffic_stats', 'creator_live_performance', 'transaction_analysis_creator_list', 'ads_campaign_overview',
    'shopee_live_list', 'shopee_product_list', 'shopee_daily', 'shopee_overview',
    'shopee_ads'
  ]));
end $$;

do $$
begin
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'brand_dataraw_imports_report_type_check')) !~ 'shopee_ads' then
    raise exception '0142: danh sách loại file chưa có shopee_ads';
  end if;
end $$;
