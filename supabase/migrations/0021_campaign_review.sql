-- Giai đoạn 25 — Đánh giá cuối Campaign & Quyết định gia hạn Brand (Bước 11
-- trong workflow 11 bước, CEO đã duyệt 2026-08-01).
--
-- Không tạo bảng mới: campaigns đã có brand_id/target_gmv/start_date/end_date,
-- chỉ cần thêm 5 cột "đóng" campaign khi đã hoàn tất, đúng tinh thần
-- "sidecar field trên entity có sẵn" giống cách Giai đoạn 23 thêm
-- daily_available_hours vào studios. Ghi bởi ceo/operations/admin qua policy
-- "campaigns_write_ceo_ops" đã có sẵn (0016) — không cần policy riêng.
alter table campaigns
  add column if not exists outcome text check (outcome in ('kpi_met', 'kpi_missed', 'partial')),
  add column if not exists renewal_decision text check (renewal_decision in ('renew', 'at_risk', 'churned')),
  add column if not exists review_notes text not null default '',
  add column if not exists reviewed_by uuid references profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz;
