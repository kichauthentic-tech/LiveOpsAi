-- Report tháng cho Brand Workspace. Phần số liệu vận hành (GMV, Host Performance, Assortment/
-- SKU) luôn tính live từ live_sessions tại thời điểm xem — không lưu snapshot trùng lặp. Bảng
-- này chỉ giữ phần bắt buộc nhập tay (Ads/ROAS, Promotion/Voucher, Customer Insight, Account
-- Health — đã xác nhận không có API TikTok Shop cho các phần này, xem WORKSPACE_DESIGN.md mục
-- "Đối Soát Số Liệu TikTok") và trạng thái draft/published. 1 report = 1 brand + 1 tháng.
create table brand_monthly_reports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  period_month date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),

  ads_spend numeric,
  roas numeric,
  promotion_notes text,
  customer_insight_notes text,
  account_health_notes text,

  published_at timestamptz,
  published_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (brand_id, period_month)
);

create index idx_brand_monthly_reports_brand_id on brand_monthly_reports(brand_id);

create trigger trg_brand_monthly_reports_updated_at before update on brand_monthly_reports
  for each row execute function set_updated_at();

alter table brand_monthly_reports enable row level security;

-- Cùng mức quyền như Đối Soát TikTok (nghiệp vụ vận hành nội bộ) — ceo/admin/operations soạn/
-- sửa/phát hành, brand chỉ đọc được sau khi đã published (chưa published brand không thấy report
-- đang soạn dở hoặc số liệu chưa chốt).
create policy "brand_monthly_reports_ceo_admin_ops" on brand_monthly_reports for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

create policy "brand_monthly_reports_brand_read_published" on brand_monthly_reports for select
  using (current_user_role() = 'brand' and brand_id = current_user_brand_id() and status = 'published');

-- Phát hành report — chặn cứng ở DB (không chỉ client) nếu còn session Completed trong kỳ chưa
-- đối soát (data_source = 'manual'), trừ khi p_force = true (ops tự xác nhận qua checkbox UI đã
-- biết rủi ro số liệu tạm tính). p_force vẫn ghi log gián tiếp qua published_by/published_at.
create or replace function publish_brand_monthly_report(p_report_id uuid, p_force boolean default false)
returns brand_monthly_reports as $$
declare
  v_report brand_monthly_reports;
  v_unreconciled_count int;
  v_period_start date;
  v_period_end date;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to publish monthly report';
  end if;

  select * into v_report from brand_monthly_reports where id = p_report_id;
  if not found then
    raise exception 'brand_monthly_reports row % not found', p_report_id;
  end if;

  v_period_start := date_trunc('month', v_report.period_month)::date;
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  select count(*) into v_unreconciled_count
  from live_sessions
  where brand_id = v_report.brand_id
    and date >= v_period_start and date <= v_period_end
    and status = 'Completed'
    and data_source = 'manual';

  if v_unreconciled_count > 0 and not p_force then
    raise exception 'unreconciled_sessions:%', v_unreconciled_count;
  end if;

  update brand_monthly_reports set
    status = 'published',
    published_at = now(),
    published_by = auth.uid()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$ language plpgsql security definer;

-- Thu hồi report đã phát hành về draft (sửa lại khi phát hiện sai sót) — cùng quyền, không cần
-- check đối soát vì đây là bước lùi trạng thái, không phải phát hành mới.
create or replace function unpublish_brand_monthly_report(p_report_id uuid)
returns brand_monthly_reports as $$
declare
  v_report brand_monthly_reports;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to unpublish monthly report';
  end if;

  update brand_monthly_reports set
    status = 'draft',
    published_at = null,
    published_by = null
  where id = p_report_id
  returning * into v_report;

  if not found then
    raise exception 'brand_monthly_reports row % not found', p_report_id;
  end if;

  return v_report;
end;
$$ language plpgsql security definer;
