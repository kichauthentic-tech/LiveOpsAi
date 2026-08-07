-- Giai đoạn C4 — Price List Import (SKU pricing theo platform, Brand Workspace).
--
-- Giá bán niêm yết (RRP) + giá sau markdown theo từng SKU/platform, brand/ops import từ file
-- Excel vận hành thật (không có form CRUD chi tiết từng field — chỉ 1 luồng import). Khác
-- brand_platform_rates (đó là % hoa hồng agency ăn theo platform) — bảng này là giá bán SKU
-- thực tế trên sàn. Mỗi lần import thay thế toàn bộ danh sách giá hiện tại của brand đó (snapshot
-- mới nhất, tránh tích luỹ dữ liệu cũ trùng SKU qua nhiều lần upload).

create table sku_platform_prices (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  sku_code text not null default '',
  sku_name text not null,
  platform text not null check (platform in ('TikTok', 'Shopee')),
  rrp numeric not null default 0,
  markdown_price numeric not null default 0,
  is_eol boolean not null default false,
  imported_at timestamptz not null default now(),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index sku_platform_prices_brand_id_platform_idx on sku_platform_prices (brand_id, platform);

alter table sku_platform_prices enable row level security;
create policy "sku_platform_prices_read_all" on sku_platform_prices for select using (auth.role() = 'authenticated');
-- Cùng mức quyền ghi với brand_skus/brand_platform_rates — role "brand" xem giá của mình qua
-- Brand Workspace nhưng không tự ghi trực tiếp trong DB, cô lập theo workspace access (không
-- phải Ma Trận Phân Quyền), đúng WORKSPACE_DESIGN.md#2.
create policy "sku_platform_prices_write_ceo_ops" on sku_platform_prices for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
