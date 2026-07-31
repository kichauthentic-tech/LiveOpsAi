-- Giai đoạn 14b — Quy tắc lặp theo thứ trong tuần cho "Mở Ca Mới".
--
-- Đối chiếu lại file Excel gốc (ĐĂNG KÍ LỊCH THÁNG 8): mỗi tháng có ~270
-- dòng đăng ký, và số liệu cho thấy pattern lặp khá đều theo thứ trong
-- tuần (VD thứ 7 luôn có VERA 10h-13h, 18h-20h, 20h-23h... cuối tuần nhiều
-- ca hơn ngày thường). Vấn đề không phải ở việc đăng ký theo từng ca cụ thể
-- (giữ nguyên — 1 host có thể chỉ nhận 1 trong nhiều brand cùng khung giờ,
-- đúng như Excel), mà là ops phải tạo tay từng dòng mỗi tháng. Bảng này cho
-- ops khai báo quy tắc 1 lần, hệ thống tự sinh ra shift_slots cho cả tháng.

create table recurring_shift_templates (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6), -- 0=CN...6=Thứ 7, khớp Date.getDay() phía frontend
  brand_id uuid references brands(id) on delete set null,
  brand_name text not null default '',
  platform session_platform not null default 'TikTok',
  start_time time not null,
  end_time time not null,
  studio_id uuid references studios(id) on delete set null,
  studio_name text not null default '',
  notes text not null default '',
  active boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table recurring_shift_templates enable row level security;
create policy "recurring_shift_templates_read_all" on recurring_shift_templates for select using (auth.role() = 'authenticated');
create policy "recurring_shift_templates_write_ceo_ops" on recurring_shift_templates for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create trigger trg_recurring_shift_templates_updated_at before update on recurring_shift_templates
  for each row execute function set_updated_at();

create index idx_recurring_shift_templates_weekday on recurring_shift_templates(weekday);

-- Đánh dấu ca nào do quy tắc lặp sinh ra (để hiện badge "Tự động" trong UI
-- và để chặn sinh trùng — 1 quy tắc chỉ sinh tối đa 1 ca cho mỗi ngày cụ thể).
alter table shift_slots add column if not exists template_id uuid references recurring_shift_templates(id) on delete set null;

create unique index idx_shift_slots_template_date on shift_slots(template_id, date) where template_id is not null;
