-- 0228 — Sàn thứ 3 "Website" (CROCS Website), CHỈ để sắp lịch + tính lương (20/11).
--
-- Quyết định (user 20/11): Website không có report, target, file số liệu, tracking. Chỉ cần ca → lịch → đăng ký → giờ công/lương.
-- Nên migration này chỉ làm 2 việc:
--   1) Thêm giá trị 'Website' vào enum session_platform (ca, ca mở, mẫu lặp, giá theo sàn, phòng mặc định dùng enum này).
--   2) Nới check platform ở brand_channels (kênh = brand × sàn) và brand_month_plans (kế hoạch tháng giữ lưới giờ của kênh).
-- KHÔNG nới các bảng số liệu (report, đối soát, hợp đồng, cam kết, kịch bản, SKU, Ads…) và KHÔNG nới các hàm nạp file
-- (nạp đối soát / sinh ca từ file / inhouse) — Website không có file nên các đường đó vẫn phải từ chối.
-- Ca Website tự thành 'Completed' khi qua giờ kết thúc nhờ complete_past_sessions (0096, không phân biệt sàn) — không cần
-- ai nhập số; giờ công tính theo giờ kế hoạch.
--
-- Thứ tự deploy: chạy migration TRƯỚC khi deploy client. Chạy lại nhiều lần không sao.

alter type session_platform add value if not exists 'Website';

do $$
begin
  alter table brand_channels drop constraint if exists brand_channels_platform_check;
  alter table brand_channels add constraint brand_channels_platform_check check (platform in ('TikTok', 'Shopee', 'Website'));

  alter table brand_month_plans drop constraint if exists brand_month_plans_platform_check;
  alter table brand_month_plans add constraint brand_month_plans_platform_check check (platform in ('TikTok', 'Shopee', 'Website'));
end $$;
