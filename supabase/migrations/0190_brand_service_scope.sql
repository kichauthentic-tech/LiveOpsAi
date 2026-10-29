-- 0190 — PHẠM VI DỊCH VỤ theo brand × sàn (29/10). Report Tháng chọn trang theo việc YFB thật sự làm cho brand,
-- không theo "có file hay không": VERA đã tải file Ads Campaign overview T6–T10 và Live Analysis Affiliate T8–T10
-- dù YFB chỉ live ⇒ luật cũ đưa trang Ads/Affiliate vào report VERA. Khai ở CRM → Hợp đồng & giá (chỗ nhập duy
-- nhất cho điều khoản thương mại), cùng dòng với giá/% hoàn.
--   scope_ads        — YFB chạy/được giao ngân sách Ads toàn shop.
--   scope_affiliate  — YFB book + theo dõi creator affiliate.
--   has_inhouse_live — brand tự live trên cùng tài khoản shop (VERA 9–25% GMV live không khớp ca YFB) ⇒ trang
--                      Toàn shop rút gọn, nhãn "gồm cả brand tự live", bỏ nhóm đối chứng + Direct/Indirect.
-- Mặc định = hành vi cũ (bật Ads + Affiliate, không tự live). Trigger lịch sử giá (0018) chỉ ghi khi rate đổi.

alter table brand_platform_rates
  add column if not exists scope_ads boolean not null default true,
  add column if not exists scope_affiliate boolean not null default true,
  add column if not exists has_inhouse_live boolean not null default false;

-- VERA, JOCKEY: YFB chỉ live, brand có tự live (user chốt 29/10). Upsert để không đụng giá/% hoàn đang có.
insert into brand_platform_rates (brand_id, platform, scope_ads, scope_affiliate, has_inhouse_live)
select b.id, c.platform::session_platform, false, false, true
from brands b
join brand_channels c on c.brand_id = b.id
where upper(b.name) in ('VERA', 'JOCKEY')
on conflict (brand_id, platform) do update
  set scope_ads = false, scope_affiliate = false, has_inhouse_live = true;
