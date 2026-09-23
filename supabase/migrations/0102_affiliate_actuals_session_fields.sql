-- Bảng Affiliate dựng thành TRANG RIÊNG (Brand Workspace), không nằm trong form Report Tháng nữa
-- (quyết định của user 2026-09-22). Trang mới là nơi nhập/nạp số; Tab 04 Report Tháng giữ nguyên
-- và đọc CÙNG bảng này — một nguồn số duy nhất, không sinh bảng thứ hai để khỏi lệch nhau.
--
-- Nguồn tự động cho trang mới: file Dataraw "Live Analysis" xuất từ Seller Center ở view LINKED
-- ACCOUNTS (bản tiếng Anh, mỗi dòng = 1 phiên live của 1 creator affiliate). Bản mặc định chỉ có
-- tài khoản shop nên KHÔNG dùng được — xem parseLiveAnalysis ở lib/dataraw/parseDataRawExcel.ts.
--
-- 4 cột thêm ở đây là 4 dòng trong bảng phân tích của user mà schema 0067 chưa có chỗ chứa.
-- Các cột còn thiếu khác (GMV per hour, Target Completion %, ROAS, CTR live) đều là số DẪN XUẤT,
-- tính ở tầng UI, cố ý không lưu để khỏi lệch khi sửa số gốc.
--
-- Viết idempotent như 0065/0067 — an toàn chạy lại nếu SQL Editor lỡ chạy dở.

alter table brand_affiliate_actuals add column if not exists campaign_type text;
alter table brand_affiliate_actuals add column if not exists timeline_label text;
alter table brand_affiliate_actuals add column if not exists live_impressions numeric;
alter table brand_affiliate_actuals add column if not exists orders numeric;

comment on column brand_affiliate_actuals.campaign_type is
  'Phân loại camp do ops đặt (Big/Medium/Brand Day/Clearance...) — nhập tay, không file TikTok nào có.';
comment on column brand_affiliate_actuals.timeline_label is
  'Khung giờ live dạng "19:00 - 00:00" — nạp từ Live Analysis (Launched Time + Duration), ops sửa được.';
comment on column brand_affiliate_actuals.live_impressions is
  'Cột "Product Impressions" của Live Analysis.';
comment on column brand_affiliate_actuals.orders is
  'Cột "Orders Paid" của Live Analysis (khác items_sold = "LIVE-attributed items sold").';

-- Quyền: user chọn "brand cũng xem được" (2026-09-22). Policy 0067 chỉ cho brand đọc khi report
-- THÁNG ĐÓ đã published — không đủ, vì trang Affiliate đứng độc lập với vòng đời phát hành report.
-- Thay bằng policy đọc theo brand, bỏ điều kiện published. Vẫn chỉ READ: mọi thao tác ghi vẫn
-- thuộc ceo/admin/operations qua policy "brand_affiliate_actuals_ceo_admin_ops" (giữ nguyên).
drop policy if exists "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals;
drop policy if exists "brand_affiliate_actuals_brand_read" on brand_affiliate_actuals;
create policy "brand_affiliate_actuals_brand_read" on brand_affiliate_actuals for select
  using (
    current_user_role() = 'brand'
    and brand_id = current_user_brand_id()
  );
