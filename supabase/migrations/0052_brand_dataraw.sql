-- Module "Dataraw" Brand Workspace — kho lưu nguyên trạng 4 report Excel mà ops tải tay từ
-- TikTok Shop Seller Center mỗi tuần/tháng cho từng brand: Shop Promotion List, Product List,
-- Live Analysis, Shop Analytics (Key metrics). Đây KHÔNG phải luồng đối soát session (khác mục
-- đích với tiktok_live_imports ở migration 0050 — bảng đó match+ghi đè GMV từng live_sessions,
-- bảng này giữ nguyên toàn bộ report để làm cơ sở dựng report tháng + tra cứu/deep-dive sau này,
-- không match với session nào cả). Mỗi report có cấu trúc cột rất khác nhau (product_list có tới
-- 176 cột do TikTok lồng nhiều nhóm chỉ số) nên không map cứng từng cột vào schema — lưu "columns"
-- (thứ tự + tên cột gốc, đã khử trùng tên trùng bằng hậu tố __2/__3...) ở batch, mỗi dòng lưu
-- "raw" jsonb keyed đúng theo "columns" đó. Giữ nguyên cấu trúc gốc từ file, không chuẩn hoá.
create table brand_dataraw_imports (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  report_type text not null check (report_type in ('shop_promotion', 'product_list', 'live_analysis', 'shop_analytics')),

  period_label text, -- chuỗi khoảng ngày gốc đọc được từ file (vd "2026-08-01 ~ 2026-08-18"), không ép parse được thì null
  period_start date,
  period_end date,

  file_name text,
  columns jsonb not null default '[]'::jsonb, -- [{key, label}], đúng thứ tự cột trong file gốc
  summary jsonb, -- riêng cho shop_analytics: khối "Tổng quan dữ liệu" (totals + % thay đổi) nằm tách biệt khỏi bảng theo ngày
  row_count int not null default 0,

  imported_by uuid references profiles(id) on delete set null,
  imported_at timestamptz not null default now()
);

create index idx_brand_dataraw_imports_brand_report on brand_dataraw_imports(brand_id, report_type, imported_at desc);

create table brand_dataraw_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references brand_dataraw_imports(id) on delete cascade,
  row_index int not null,
  raw jsonb not null default '{}'::jsonb
);

create index idx_brand_dataraw_rows_import_id on brand_dataraw_rows(import_id);
-- deep-dive theo giá trị bất kỳ trong raw (vd tra 1 tên sản phẩm/creator xuyên nhiều import) —
-- GIN cho phép query jsonb containment/key lookup nhanh mà không cần biết trước schema cột.
create index idx_brand_dataraw_rows_raw_gin on brand_dataraw_rows using gin (raw);

alter table brand_dataraw_imports enable row level security;
alter table brand_dataraw_rows enable row level security;

-- Nội bộ vận hành (giống Đối Soát/Finance) — brand không có role đăng nhập nên không cần policy
-- riêng cho role "brand" (xem thảo luận thiết kế: report tháng brand chỉ xuất ra ngoài app, brand
-- không tự vào xem raw data qua hệ thống).
create policy "brand_dataraw_imports_ceo_admin_ops" on brand_dataraw_imports for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

create policy "brand_dataraw_rows_ceo_admin_ops" on brand_dataraw_rows for all
  using (
    exists (select 1 from brand_dataraw_imports i where i.id = import_id and current_user_role() in ('ceo', 'admin', 'operations'))
  )
  with check (
    exists (select 1 from brand_dataraw_imports i where i.id = import_id and current_user_role() in ('ceo', 'admin', 'operations'))
  );
