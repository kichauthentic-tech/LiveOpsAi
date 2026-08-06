-- Giai đoạn B4 — Script & Teleprompter Library (Agency Workspace, nhóm "Content & Quality").
--
-- Kho kịch bản mẫu đã lưu (khác ScriptGenerator.tsx — công cụ SINH kịch bản mới bằng Gemini AI,
-- không lưu trữ gì, kết quả chỉ tồn tại trong state client). Đây là nơi lưu lại kịch bản đã dùng
-- để tái sử dụng + chế độ đọc teleprompter khi live. Theo quyết định phạm vi đã chốt với user:
-- lưu dạng text/markdown đơn giản (không parse lại cấu trúc JSON nhiều Part như ScriptGenerator).

create table script_library (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands(id) on delete set null,
  title text not null,
  hook text not null default '',
  content text not null default '',
  platform text not null default 'TikTok' check (platform in ('TikTok', 'Shopee')),
  pinned_sku_order text not null default '',
  tags text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index script_library_brand_id_idx on script_library (brand_id);

alter table script_library enable row level security;
create policy "script_library_read_all" on script_library for select using (auth.role() = 'authenticated');
-- Cùng mức quyền ghi với các module Content & Quality khác — Ops/CEO chuẩn bị kịch bản sẵn cho
-- Host dùng qua teleprompter, Host chỉ cần đọc (đã có ở policy read_all).
create policy "script_library_write_ceo_ops" on script_library for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
