-- 0196 — Danh mục SKU theo SÀN (TikTok / Shopee) để nhập sản phẩm từ file Sản Phẩm đã tải.
--
-- Trước đây brand_skus không có cột sàn (danh sách gõ tay, 0 dòng). Hiệu suất TikTok (GMV) và Shopee (Sales) không bao giờ
-- được cộng chung, nên mỗi sản phẩm thuộc đúng một sàn. Thêm `platform` + khoá duy nhất (brand, sàn, tên) để nút "Nhập từ dữ liệu đã tải" chạy lại nhiều lần không sinh dòng trùng (upsert on conflict do nothing).

alter table brand_skus
  add column platform text not null default 'TikTok' check (platform in ('TikTok', 'Shopee'));

alter table brand_skus add constraint brand_skus_brand_platform_name_key unique (brand_id, platform, name);
