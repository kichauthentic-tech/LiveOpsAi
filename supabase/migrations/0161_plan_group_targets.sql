-- 0161 — Target theo nhóm ngày của Kế Hoạch Tháng (2026-10-09).
--
-- Ops chốt trước target từng nhóm ngày (D-Day / Mid-Month / Pay Day / ngày thường) rồi mới chia xuống ca — đúng cách user
-- tự tính bản T10 ngoài Excel. Cột chỉ là NHÁP lập kế hoạch: lúc chốt, target ca (brand_month_plan_slots.target_gmv) vẫn là
-- số cam kết và target tháng = tổng target ca như cũ, nên không migration nào khác phải đổi.
-- Dạng {"dday": 1079671740, "midmonth": 822607040, "payday": 925432920, "daily": 2313582300}; khoá thiếu = nhóm đó tự chia
-- theo mô hình từ phần còn lại của target tháng. Không thêm vào trigger rớt xác nhận 0110: sửa target nhóm làm target ca đổi,
-- và target ca đã có trigger riêng ở bảng con.

alter table brand_month_plans
  add column if not exists group_targets jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_month_plans_group_targets_object') then
    alter table brand_month_plans
      add constraint brand_month_plans_group_targets_object check (jsonb_typeof(group_targets) = 'object');
  end if;
end $$;
