-- Giai đoạn C3 — Scheme (khung giờ vàng/khuyến mãi) tích hợp vào Lịch Vận Hành.
--
-- Scheme là 1 kế hoạch khuyến mãi áp dụng cho 1 khoảng ngày (không gắn session cụ thể,
-- không gắn brand cụ thể — áp dụng toàn agency). Chỉ 3 field nghiệp vụ: tên, khoảng ngày,
-- mô tả tự do (đủ chứa mã voucher nếu cần, không cấu trúc hoá thêm — phạm vi đã chốt với
-- user). Hiển thị dạng badge nhỏ trên ô ngày của LiveCalendar/BrandCalendar.

create table promo_schemes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  start_date date not null,
  end_date date not null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create index promo_schemes_date_range_idx on promo_schemes (start_date, end_date);

alter table promo_schemes enable row level security;
create policy "promo_schemes_read_all" on promo_schemes for select using (auth.role() = 'authenticated');
create policy "promo_schemes_write_ceo_ops" on promo_schemes for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
