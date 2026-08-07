-- Giai đoạn C1 — Onboarding Checklist theo Brand.
--
-- Checklist onboard brand mới gần như giống nhau giữa các brand (decor studio,
-- production requirement...) -> 1 template dùng chung (agency-wide, sửa hiếm khi),
-- copy ra instance riêng cho từng brand lúc onboard (mỗi bước gán được PIC + deadline
-- + trạng thái). Chỉ dùng 1 lần lúc onboard brand mới, khác CHECKLIST DAILY (việc lặp
-- lại hằng ngày, không gộp chung).

create table onboarding_checklist_templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  order_index int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table brand_onboarding_checklists (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  title text not null,
  description text not null default '',
  assignee text not null default '',
  deadline date,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed')),
  order_index int not null default 0,
  source_template_item_id uuid references onboarding_checklist_templates(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_onboarding_checklists_brand_id_idx on brand_onboarding_checklists (brand_id);

alter table onboarding_checklist_templates enable row level security;
alter table brand_onboarding_checklists enable row level security;

create policy "onboarding_checklist_templates_read_all" on onboarding_checklist_templates
  for select using (auth.role() = 'authenticated');
create policy "onboarding_checklist_templates_write_ceo_ops" on onboarding_checklist_templates for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create policy "brand_onboarding_checklists_read_all" on brand_onboarding_checklists
  for select using (auth.role() = 'authenticated');
create policy "brand_onboarding_checklists_write_ceo_ops" on brand_onboarding_checklists for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
