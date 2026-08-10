-- Template hoá Campaign — nhiều brand tháng nào cũng chắc chắn lặp lại cùng
-- một bộ Campaign (Daily/Mega D-Day/Mid-month/Payday...), ops phải gõ tay lại
-- form 6 field mỗi tháng. Bảng này cho ops khai báo mẫu 1 lần (brand, loại,
-- KPI mặc định, khoảng ngày-trong-tháng), hệ thống tự sinh Campaign cho
-- tháng đang chọn — cùng tinh thần với recurring_shift_templates (migration
-- 0015) đã giải quyết bài toán tương tự cho Ca.

create table campaign_templates (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  brand_name text not null default '',
  name text not null,
  type text not null default 'other' check (type in ('daily', 'mega', 'mid_month', 'payday', 'other')),
  target_gmv numeric not null default 0,
  -- Ngày-trong-tháng (1-31), không phải ngày tuyệt đối — sinh Campaign cho
  -- tháng nào thì clamp vào số ngày thực của tháng đó (vd 31 -> 28/29/30 tuỳ
  -- tháng). end_day >= start_day (đảm bảo bởi check dưới).
  start_day int not null check (start_day between 1 and 31),
  end_day int not null check (end_day between 1 and 31),
  host_briefing text not null default '',
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_templates_day_range check (end_day >= start_day)
);

alter table campaign_templates enable row level security;
create policy "campaign_templates_read_all" on campaign_templates for select using (auth.role() = 'authenticated');
create policy "campaign_templates_write_ceo_ops" on campaign_templates for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create trigger trg_campaign_templates_updated_at before update on campaign_templates
  for each row execute function set_updated_at();

create index idx_campaign_templates_brand on campaign_templates(brand_id);

-- Đánh dấu Campaign nào do mẫu sinh ra (hiện badge "Tự động" + chặn sinh
-- trùng cho cùng 1 mẫu trong cùng 1 ngày bắt đầu — logic dedup theo tháng
-- nằm ở tầng app, giống hệt cách handleGenerateMonthSlots đang làm cho Ca).
alter table campaigns add column if not exists template_id uuid references campaign_templates(id) on delete set null;

create unique index idx_campaigns_template_start on campaigns(template_id, start_date) where template_id is not null;
