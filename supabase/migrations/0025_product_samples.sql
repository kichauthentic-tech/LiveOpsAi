-- Giai đoạn B2 — Product Sample Inventory (Agency Workspace, nhóm "Content & Quality").
--
-- Tracking hàng mẫu vật lý brand gửi tới từng Studio: mã code, tình trạng, vị trí cụ thể trong
-- Studio. Agency-wide (Ops cần nhìn xuyên mọi Studio/Brand để biết hàng mẫu đang nằm đâu), không
-- thuộc Brand Workspace. Liên kết brand_id + studio_id (studio_id nullable — hàng mẫu có thể đang
-- "in_transit", chưa gán tới Studio nào), theo mục 6/WORKSPACE_DESIGN.md.

create table product_samples (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  studio_id uuid references studios(id) on delete set null,
  product_name text not null,
  sample_code text not null default '',
  quantity integer not null default 1 check (quantity >= 0),
  status text not null default 'in_transit'
    check (status in ('in_transit', 'at_studio', 'returned', 'damaged', 'lost')),
  location_note text not null default '',
  notes text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index product_samples_brand_id_idx on product_samples (brand_id);
create index product_samples_studio_id_idx on product_samples (studio_id);

alter table product_samples enable row level security;
create policy "product_samples_read_all" on product_samples for select using (auth.role() = 'authenticated');
-- Cùng mức quyền ghi với brand_skus/brand_platform_rates — module Content & Quality dùng lại
-- permission "manage_studios_gear" ở UI (tránh phình PermissionKey/RolePermissionsMap, đúng
-- nguyên tắc đã chốt ở WORKSPACE_DESIGN.md#5), RLS ghi giới hạn ceo/operations/admin.
create policy "product_samples_write_ceo_ops" on product_samples for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
