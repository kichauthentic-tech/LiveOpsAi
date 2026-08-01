-- Giai đoạn 23 — Studio Utilization & Capacity Planning
-- Studio chưa có khái niệm "số giờ hoạt động/ngày" để làm mẫu số tính tỷ lệ lấp đầy
-- (used hours / available hours). Thêm 1 cột đơn giản, mặc định 16h/ngày (8:00-24:00,
-- khung giờ vận hành phổ biến của agency livestream), không phá dữ liệu cũ.
alter table public.studios
  add column if not exists daily_available_hours numeric not null default 16;
