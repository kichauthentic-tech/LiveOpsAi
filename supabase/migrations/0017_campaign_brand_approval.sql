-- Giai đoạn 16 — Luồng duyệt Campaign với Brand (Brand Client Portal).
-- Role `brand` đã tồn tại sẵn từ trước (profiles.assigned_brand_id) nhưng
-- chưa gắn tính năng duyệt lịch nào — giai đoạn này thêm bước approval trên
-- Campaign (đã có từ 0016) + 1 bảng ghi chú yêu cầu sửa của brand.

-- ---------------------------------------------------------------------------
-- 1) Trạng thái duyệt trên Campaign.
--    draft -> sent_for_approval -> (revision_requested <-> sent_for_approval)
--    -> approved. Ops chuyển sang sent_for_approval khi gửi brand duyệt;
--    brand chỉ được chuyển sent_for_approval -> approved/revision_requested
--    (xem policy update bên dưới) — không tự ý đổi trạng thái khác.
-- ---------------------------------------------------------------------------
alter table campaigns
  add column if not exists approval_status text not null default 'draft'
  check (approval_status in ('draft', 'sent_for_approval', 'revision_requested', 'approved')),
  add column if not exists sent_at timestamptz,
  add column if not exists approved_at timestamptz;

-- Helper: brand_id gán cho user đang đăng nhập, dùng cho RLS bên dưới —
-- cùng pattern current_user_talent_id() ở 0014_host_scheduling.sql.
create or replace function current_user_brand_id() returns uuid as $$
  select assigned_brand_id from profiles where id = auth.uid();
$$ language sql stable security definer;

-- Cho phép brand tự chuyển trạng thái campaign của chính mình, chỉ trong
-- đúng 2 hướng hợp lệ (sent_for_approval -> approved | revision_requested).
-- Không dùng column-level security (repo này chưa có tiền lệ) — chấp nhận
-- rủi ro brand có thể sửa kèm field khác trong cùng 1 UPDATE, chặn ở tầng UI.
create policy "campaigns_update_approval_brand" on campaigns for update
  using (brand_id = current_user_brand_id() and approval_status = 'sent_for_approval')
  with check (brand_id = current_user_brand_id() and approval_status in ('approved', 'revision_requested'));

-- ---------------------------------------------------------------------------
-- 2) Ghi chú yêu cầu sửa — brand ghi trực tiếp khi bấm "Yêu cầu sửa", ops đọc
--    và điều chỉnh slot. Append-only (giống audit_logs), không update/delete.
-- ---------------------------------------------------------------------------
create table campaign_revision_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  note text not null,
  requested_by uuid references profiles(id) on delete set null,
  requested_by_name text not null default '',
  created_at timestamptz not null default now()
);

alter table campaign_revision_notes enable row level security;
create policy "campaign_revision_notes_read_all" on campaign_revision_notes for select using (auth.role() = 'authenticated');
create policy "campaign_revision_notes_insert_brand_or_staff" on campaign_revision_notes for insert
  with check (
    current_user_role() in ('ceo', 'operations', 'admin')
    or exists (
      select 1 from campaigns c
      where c.id = campaign_id and c.brand_id = current_user_brand_id()
    )
  );

create index idx_campaign_revision_notes_campaign on campaign_revision_notes(campaign_id);
