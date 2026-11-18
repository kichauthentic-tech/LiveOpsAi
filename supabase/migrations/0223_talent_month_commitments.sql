-- 0223: GIỜ CAM KẾT THEO THÁNG của từng người = TRẦN giờ trong tháng (Điều Phối Lịch Live, Tự fill).
-- Chị Trainer chỉ đặt cho host rate cao / chiến lược riêng; không có dòng = giới hạn mặc định theo vai.
-- Xếp ngày 1–15 thì bộ xếp chỉ nhận tới max_hours × tỷ lệ giờ ca của nửa đầu (+ dung sai ở AI Training), trừ khi
-- first_half_max ghi đè số nửa đầu. Trước 0223 trần nằm localStorage của trình duyệt (roster.personCaps).
create table if not exists talent_month_commitments (
  id uuid primary key default gen_random_uuid(),
  month text not null check (month ~ '^[0-9]{4}-[0-9]{2}$'),
  talent_id uuid not null references talents(id) on delete cascade,
  max_hours numeric not null check (max_hours > 0),
  first_half_max numeric check (first_half_max is null or first_half_max >= 0),
  note text not null default '',
  updated_at timestamptz not null default now(),
  unique (month, talent_id)
);
create index if not exists idx_talent_month_commitments_month on talent_month_commitments (month);

alter table talent_month_commitments enable row level security;
drop policy if exists "talent_month_commitments_read_staff" on talent_month_commitments;
create policy "talent_month_commitments_read_staff" on talent_month_commitments for select
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
drop policy if exists "talent_month_commitments_write_staff" on talent_month_commitments;
create policy "talent_month_commitments_write_staff" on talent_month_commitments for all
  using ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'trainer', 'admin'));
