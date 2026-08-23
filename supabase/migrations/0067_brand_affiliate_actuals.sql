-- Report Tháng Tab 04 Affiliate — chuyển từ tự tính (join Dataraw creatorName với LiveSession
-- hostName) sang NHẬP TAY hoàn toàn (migration 0066 đổi nguồn Livestream sang
-- creator_live_performance, file này không có cột tên host/creator nên hết cách ghép tự động;
-- đúng tinh thần Module 4 trong brief: "Hoàn toàn loại B/C — không có file Excel nào cung cấp dữ
-- liệu creator affiliate riêng lẻ"). period_month ở đây là THÁNG ĐANG XEM (khác
-- brand_affiliate_plans của Tab 05 vốn là tháng kế hoạch, lệch 1 tháng).
--
-- Viết idempotent (IF NOT EXISTS / DROP...IF EXISTS trước CREATE) theo cùng lý do đã sửa ở 0065 —
-- an toàn chạy lại nếu SQL Editor lỡ chạy dở.
create table if not exists brand_affiliate_actuals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  period_month date not null,
  creator_name text not null,
  live_date_label text,
  target_gmv numeric,
  direct_gmv numeric,
  duration_hours numeric,
  ads_cost numeric,
  items_sold numeric,
  avg_price numeric,
  viewer numeric,
  ctr numeric,
  ctor numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_affiliate_actuals_brand_period on brand_affiliate_actuals(brand_id, period_month);

drop trigger if exists trg_brand_affiliate_actuals_updated_at on brand_affiliate_actuals;
create trigger trg_brand_affiliate_actuals_updated_at before update on brand_affiliate_actuals
  for each row execute function set_updated_at();

alter table brand_affiliate_actuals enable row level security;

drop policy if exists "brand_affiliate_actuals_ceo_admin_ops" on brand_affiliate_actuals;
create policy "brand_affiliate_actuals_ceo_admin_ops" on brand_affiliate_actuals for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

-- Cùng period_month với brand_monthly_reports (khác brand_affiliate_plans lệch 1 tháng) — brand
-- chỉ đọc khi report ĐÚNG tháng đó đã published.
drop policy if exists "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals;
create policy "brand_affiliate_actuals_brand_read_when_published" on brand_affiliate_actuals for select
  using (
    current_user_role() = 'brand'
    and brand_id = current_user_brand_id()
    and exists (
      select 1 from brand_monthly_reports r
      where r.brand_id = brand_affiliate_actuals.brand_id
        and r.period_month = brand_affiliate_actuals.period_month
        and r.status = 'published'
    )
  );
