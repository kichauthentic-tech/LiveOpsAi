-- Report Tháng Tab 05 "Kế hoạch tháng sau" — 2 phần dữ liệu, cả 2 đều nhập tay (không có nguồn
-- tự động nào: đây là kế hoạch cho tháng CHƯA xảy ra, không thể tính từ Dataraw/LiveSession).
--
-- Viết idempotent (IF NOT EXISTS / DROP...IF EXISTS trước CREATE) vì bản đầu tiên đã chạy dở trên
-- Supabase thật rồi lỗi ở bước sau — chạy lại file này an toàn bất kể trước đó đã áp dụng tới đâu.
--
-- 1) Phân bổ target theo khung camp (Daily/D-Day/Mid-Month/Pay-Day) — thêm cột vào
--    brand_monthly_reports (migration 0051) thay vì bảng riêng: đây vẫn là 1 dòng/brand/tháng,
--    logic "kế hoạch tháng sau" được ops nhập cùng lúc soạn report tháng hiện tại nên sống chung
--    row, kế thừa đúng RLS/publish flow đã có sẵn — không cần bảng/policy mới cho phần này.
--    % gợi ý mặc định (trung bình % thực đạt các tháng trước, tính từ Dataraw) do CLIENT tính và
--    điền sẵn vào form, ops có thể sửa tay trước khi lưu — DB chỉ lưu giá trị cuối cùng đã chốt,
--    không lưu công thức gợi ý.
alter table brand_monthly_reports
  add column if not exists plan_target_gmv numeric,
  add column if not exists plan_target_hours numeric,
  add column if not exists plan_pct_daily numeric,
  add column if not exists plan_pct_dday numeric,
  add column if not exists plan_pct_midmonth numeric,
  add column if not exists plan_pct_payday numeric;

-- 2) Kế hoạch Affiliate theo creator — nhiều dòng/brand/tháng (lịch live dự kiến, camp tag,
--    target GMV, budget ads dự kiến), nên cần bảng riêng thay vì cột trên brand_monthly_reports.
--    period_month ở đây là THÁNG KẾ HOẠCH (tháng sau tháng report đang xem), khác period_month của
--    brand_monthly_reports (tháng đang report) — 2 giá trị lệch nhau đúng 1 tháng theo thiết kế UI.
create table if not exists brand_affiliate_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  period_month date not null,
  creator_name text not null,
  camp_tag text,
  schedule_label text,
  timeline_label text,
  duration_hours numeric,
  target_gmv numeric,
  budget_ads numeric,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_brand_affiliate_plans_brand_period on brand_affiliate_plans(brand_id, period_month);

drop trigger if exists trg_brand_affiliate_plans_updated_at on brand_affiliate_plans;
create trigger trg_brand_affiliate_plans_updated_at before update on brand_affiliate_plans
  for each row execute function set_updated_at();

alter table brand_affiliate_plans enable row level security;

drop policy if exists "brand_affiliate_plans_ceo_admin_ops" on brand_affiliate_plans;
create policy "brand_affiliate_plans_ceo_admin_ops" on brand_affiliate_plans for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

-- Brand chỉ đọc kế hoạch tháng sau khi report của THÁNG TRƯỚC kế hoạch đó (tức tháng đang xem, nơi
-- tab "Kế hoạch tháng sau" hiển thị) đã published — cùng logic hiển thị "canManage || isPublished"
-- phía UI, chặn cả ở DB để tránh brand đọc thẳng qua PostgREST.
drop policy if exists "brand_affiliate_plans_brand_read_when_report_published" on brand_affiliate_plans;
create policy "brand_affiliate_plans_brand_read_when_report_published" on brand_affiliate_plans for select
  using (
    current_user_role() = 'brand'
    and brand_id = current_user_brand_id()
    and exists (
      select 1 from brand_monthly_reports r
      where r.brand_id = brand_affiliate_plans.brand_id
        and r.period_month = (date_trunc('month', brand_affiliate_plans.period_month) - interval '1 month')::date
        and r.status = 'published'
    )
  );
