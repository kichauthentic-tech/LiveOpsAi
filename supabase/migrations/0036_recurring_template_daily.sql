-- Bổ sung tuỳ chọn "Hàng Ngày" cho Quy Tắc Lặp (bên cạnh lặp theo 1 thứ cụ
-- thể trong tuần đã có) — user cần mẫu áp dụng mọi ngày trong tháng, không
-- chỉ 1 thứ cố định.
alter table recurring_shift_templates add column is_daily boolean not null default false;

alter table recurring_shift_templates drop constraint recurring_shift_templates_weekday_check;
alter table recurring_shift_templates add constraint recurring_shift_templates_weekday_check
  check (is_daily or weekday between 0 and 6);
