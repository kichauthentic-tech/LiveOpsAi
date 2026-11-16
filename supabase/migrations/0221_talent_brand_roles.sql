-- 0221: vai được xếp của talent THEO TỪNG BRAND (host / trợ live / cả hai).
-- Hồ sơ talent chỉ có MỘT nhãn vai, trong khi thực tế một bạn host brand A nhưng chỉ làm trợ ở brand B.
-- Không có dòng = chưa cài ⇒ giữ nguyên cách xếp cũ (không hạn chế). Tự fill / gợi ý người / cảnh báo lịch đọc bảng này.

create table if not exists talent_brand_roles (
  id uuid primary key default gen_random_uuid(),
  talent_id uuid not null references talents(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  role text not null check (role in ('host', 'assistant', 'both')),
  created_at timestamptz not null default now(),
  unique (talent_id, brand_id)
);
create index if not exists idx_talent_brand_roles_brand on talent_brand_roles (brand_id);

alter table talent_brand_roles enable row level security;
drop policy if exists "talent_brand_roles_read_staff" on talent_brand_roles;
create policy "talent_brand_roles_read_staff" on talent_brand_roles for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "talent_brand_roles_write_staff" on talent_brand_roles;
create policy "talent_brand_roles_write_staff" on talent_brand_roles for all
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
