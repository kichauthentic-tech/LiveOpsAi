-- 0194 — Ca dự phòng của Kế Hoạch Tháng (2026-10-31).
--
-- Lúc lập kế hoạch, ops đặt sẵn một nhóm ca "dự phòng" ngoài lưới chính. Đến các mốc kiểm (sau D-Day, sau Mid-Month, ngày 20) nếu
-- dự báo hụt target, engine cho biết cần thêm bao nhiêu giờ và app chỉ ra nên mở những ca dự phòng nào. Cột chỉ là NHÁP lập kế
-- hoạch: ca dự phòng KHÔNG sinh shift_slots khi Chốt, KHÔNG cộng vào target tháng (target tháng = Σ target ca của lưới chính như
-- cũ); chỉ khi OP mở thật qua ca tăng cường (0165) thì mới thành ca.
-- Dạng [{"date":"2026-11-14","startTime":"20:00","endTime":"23:00","expectedGmv":58000000}, ...]. Không thêm vào trigger rớt
-- xác nhận 0110: dự phòng không đổi lịch brand đã xác nhận.

alter table brand_month_plans
  add column if not exists reserve_slots jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_reserve_slots_array') then
    alter table brand_month_plans
      add constraint brand_month_plans_reserve_slots_array check (jsonb_typeof(reserve_slots) = 'array');
  end if;
end $$;
