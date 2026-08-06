-- Giai đoạn B1 — SKU Showcase & Hero Product Catalog (Brand Workspace).
--
-- Danh sách SKU lên sóng của 1 brand: giá flash-deal, hero SKU, tỷ lệ xả kho, thứ tự ghim.
-- Không có ở agency-level UI nào hiện tại — chỉ hiển thị trong Brand Workspace (mỗi brand tự
-- quản lý danh mục SKU của mình), theo mục 6/WORKSPACE_DESIGN.md.

create table brand_skus (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  sku_code text not null default '',
  flash_price numeric not null default 0,
  original_price numeric not null default 0,
  is_hero boolean not null default false,
  pin_order integer not null default 0,
  clearance_rate numeric not null default 0 check (clearance_rate >= 0 and clearance_rate <= 100),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index brand_skus_brand_id_pin_order_idx on brand_skus (brand_id, pin_order);

alter table brand_skus enable row level security;
create policy "brand_skus_read_all" on brand_skus for select using (auth.role() = 'authenticated');
-- Cùng mức quyền ghi với brand_platform_rates/brand_invoices (migration 0014/0019) — role "brand"
-- xem catalog của mình qua Brand Workspace nhưng không tự sửa trực tiếp trong DB, giữ đúng
-- nguyên tắc đã chốt ở WORKSPACE_DESIGN.md#2 (brand isolation qua workspace access, không phải
-- Ma Trận Phân Quyền).
create policy "brand_skus_write_ceo_ops" on brand_skus for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
