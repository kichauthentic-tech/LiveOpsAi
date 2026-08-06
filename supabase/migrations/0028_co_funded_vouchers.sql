-- Giai đoạn B5 — Co-Funded Voucher Request Center (Brand Workspace).
--
-- Voucher riêng cho 1 phiên live, đồng tài trợ giữa Brand/Agency/Sàn theo tỷ lệ %.
-- Tái dùng đúng pattern duyệt 2 chiều của Campaign (migration 0017): Ops/CEO tạo request
-- (draft) -> gửi Brand duyệt (sent_for_approval) -> Brand duyệt (approved, coi như "cấp quyền
-- áp trực tiếp") hoặc yêu cầu sửa (revision_requested) -> Ops sửa lại và gửi lại.

create table co_funded_vouchers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  voucher_code text not null default '',
  description text not null default '',
  total_value numeric not null default 0,
  brand_contribution_pct numeric not null default 0 check (brand_contribution_pct >= 0 and brand_contribution_pct <= 100),
  agency_contribution_pct numeric not null default 0 check (agency_contribution_pct >= 0 and agency_contribution_pct <= 100),
  platform_contribution_pct numeric not null default 0 check (platform_contribution_pct >= 0 and platform_contribution_pct <= 100),
  approval_status text not null default 'draft'
    check (approval_status in ('draft', 'sent_for_approval', 'revision_requested', 'approved')),
  sent_at timestamptz,
  approved_at timestamptz,
  revision_note text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index co_funded_vouchers_session_id_idx on co_funded_vouchers (session_id);
create index co_funded_vouchers_brand_id_idx on co_funded_vouchers (brand_id);

alter table co_funded_vouchers enable row level security;
create policy "co_funded_vouchers_read_all" on co_funded_vouchers for select using (auth.role() = 'authenticated');

-- Ops/CEO/Admin toàn quyền tạo/sửa/xoá (tạo request, gửi duyệt, sửa lại sau khi bị yêu cầu sửa).
create policy "co_funded_vouchers_write_ceo_ops" on co_funded_vouchers for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

-- Brand tự chuyển trạng thái voucher của chính mình, chỉ đúng 2 hướng hợp lệ
-- (sent_for_approval -> approved | revision_requested) — cùng pattern
-- "campaigns_update_approval_brand" ở migration 0017.
create policy "co_funded_vouchers_update_approval_brand" on co_funded_vouchers for update
  using (brand_id = current_user_brand_id() and approval_status = 'sent_for_approval')
  with check (brand_id = current_user_brand_id() and approval_status in ('approved', 'revision_requested'));
