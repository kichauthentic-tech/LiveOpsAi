-- Giai đoạn 15 — Billing Model (GMV% / giờ live) + Campaign entity.
-- CEO đã duyệt toàn bộ workflow 11 bước (2026-08-01, xem BUSINESS_ROADMAP.md) —
-- giai đoạn này gộp thêm 2 mục đã duyệt: ưu tiên hoá studio (#5, xử lý ở tầng
-- UI, không cần cột mới) và đào tạo/brief Host theo campaign (#6, cột
-- host_briefing bên dưới).

-- ---------------------------------------------------------------------------
-- 1) Billing model của Brand — trước giờ mọi brand đều bị coi là thu theo
--    %GMV (session_finance.agency_commission_rate). Brand thu theo giờ live
--    thì doanh thu agency phải tính = giờ live thật × brand_platform_rates.
--    rate_per_hour (bảng đã có sẵn từ Giai đoạn 14a), không phải %GMV.
-- ---------------------------------------------------------------------------
alter table brands
  add column if not exists billing_model text not null default 'gmv_commission'
  check (billing_model in ('gmv_commission', 'hourly'));

-- ---------------------------------------------------------------------------
-- 2) Campaign — kế hoạch theo tháng của 1 brand (Daily/Mega D-Day/Mid-month/
--    Payday...) với KPI GMV đã chốt trước, dùng làm căn cứ phân bổ giờ live.
--    Khác với `agency_projects` (dự án hợp tác dài hạn, có team lead/ngân
--    sách riêng, quản lý ở CrmProjects.tsx) — Campaign là chu kỳ vận hành
--    ngắn hơn (thường theo tháng), gắn trực tiếp vào lịch live qua
--    shift_slots.campaign_id/recurring_shift_templates.campaign_id. 1 brand
--    có thể có nhiều Campaign chạy song song hoặc nối tiếp qua các tháng,
--    độc lập với vòng đời của agency_projects.
-- ---------------------------------------------------------------------------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  brand_name text not null default '',
  name text not null,
  type text not null default 'other' check (type in ('daily', 'mega', 'mid_month', 'payday', 'other')),
  target_gmv numeric not null default 0,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  -- Đào tạo/brief Host theo campaign (mục #6 đã CEO duyệt) — nội dung brief
  -- hiển thị cho Host/Trợ live khi xem ca thuộc campaign này, thay vì chỉ
  -- brief lẻ theo từng phiên qua checklist.
  host_briefing text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table campaigns enable row level security;
create policy "campaigns_read_all" on campaigns for select using (auth.role() = 'authenticated');
create policy "campaigns_write_ceo_ops" on campaigns for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create trigger trg_campaigns_updated_at before update on campaigns
  for each row execute function set_updated_at();

create index idx_campaigns_brand on campaigns(brand_id);
create index idx_campaigns_status on campaigns(status);

-- ---------------------------------------------------------------------------
-- 3) Gán slot/quy tắc lặp vào Campaign — nullable vì vẫn cần hỗ trợ slot lẻ
--    phát sinh ngoài kế hoạch, không thuộc campaign nào.
-- ---------------------------------------------------------------------------
alter table shift_slots add column if not exists campaign_id uuid references campaigns(id) on delete set null;
alter table recurring_shift_templates add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index idx_shift_slots_campaign on shift_slots(campaign_id);
create index idx_recurring_shift_templates_campaign on recurring_shift_templates(campaign_id);
