-- 0110 — Kế hoạch tháng sau + nút xác nhận cho brand (Đợt C/2, 2026-09-23).
--
-- 0105 đã mở đường ĐỌC: brand_month_plans_read_scoped cho brand đọc đúng kế hoạch của chính mình
-- (mọi trạng thái draft/locked), brand_month_plan_slots_read_scoped tương tự cho ca kế hoạch. Cả
-- hai bảng KHÔNG có policy ghi nào cho brand (write vẫn khoá ceo/operations/admin, đúng như
-- 0090) — nên "xác nhận" chỉ có thể đi qua RPC security definer, không thể là UPDATE thẳng.
--
-- Ý nghĩa của "xác nhận": brand đã xem lịch tháng sau ops soạn và đồng ý. KHÔNG chặn ops chốt kế
-- hoạch khi brand chưa xác nhận — đó là thay đổi luồng vận hành, ngoài phạm vi mục này (roadmap chỉ
-- ghi "hiện cho brand xem + nút xác nhận", không ghi "brand phải duyệt trước khi chốt").
--
-- Cờ này PHẢI tự rớt khi kế hoạch đổi sau khi brand đã xác nhận, không thì brand nhìn thấy dấu
-- "đã xác nhận" trong khi lịch thật đã khác — xem 2 trigger ở cuối file.

-- ---------------------------------------------------------------------------
-- 1) Cột trạng thái xác nhận.
-- ---------------------------------------------------------------------------
alter table brand_month_plans
  add column if not exists brand_confirmed_at timestamptz,
  add column if not exists brand_confirmed_by uuid references profiles(id) on delete set null;

-- ---------------------------------------------------------------------------
-- 2) RPC xác nhận — theo mẫu lock_month_plan (0090): guard role trong thân hàm, security definer
--    để bỏ qua việc phải mở policy UPDATE cho brand (brand vẫn không ghi được cột nào khác).
-- ---------------------------------------------------------------------------
create or replace function confirm_month_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
begin
  if coalesce(current_user_role()::text, '') <> 'brand' then
    raise exception 'Chỉ brand mới xác nhận kế hoạch của chính mình' using errcode = '42501';
  end if;

  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  if v_plan.brand_id <> current_user_brand_id() then
    raise exception 'Không có quyền xác nhận kế hoạch của brand khác' using errcode = '42501';
  end if;

  update brand_month_plans
    set brand_confirmed_at = now(), brand_confirmed_by = auth.uid()
    where id = p_plan_id
    returning * into v_plan;

  return to_jsonb(v_plan);
end;
$$;

revoke all on function confirm_month_plan(uuid) from public;
grant execute on function confirm_month_plan(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Tự rớt xác nhận khi kế hoạch đổi sau khi brand đã duyệt.
-- ---------------------------------------------------------------------------
-- (a) Ops sửa THAM SỐ kế hoạch (upsertMonthPlan luôn gửi đủ các cột này trong một lần upsert, nên
--     `update of <cột>` bắt được cả khi ops lưu lại y hệt giá trị cũ — chấp nhận, an toàn hơn bỏ sót).
create or replace function reset_month_plan_confirmation() returns trigger
language plpgsql as $$
begin
  if old.brand_confirmed_at is not null then
    new.brand_confirmed_at := null;
    new.brand_confirmed_by := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_brand_month_plans_reset_confirm on brand_month_plans;
create trigger trg_brand_month_plans_reset_confirm
  before update of default_slot_hours, live_window_start, live_window_end, max_slots_per_day,
    notes, blackout_dates, target_gmv, camp_ranges
  on brand_month_plans
  for each row execute function reset_month_plan_confirmation();

-- (b) Ops sửa CA kế hoạch — replacePlanSlots() xoá/upsert thẳng trên brand_month_plan_slots, không
--     đi qua một UPDATE nào trên brand_month_plans, nên trigger (a) không thấy. Bắt ở bảng con.
create or replace function reset_month_plan_confirmation_on_slots() returns trigger
language plpgsql as $$
declare
  v_plan_id uuid := coalesce(new.plan_id, old.plan_id);
begin
  update brand_month_plans
    set brand_confirmed_at = null, brand_confirmed_by = null
    where id = v_plan_id and brand_confirmed_at is not null;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_brand_month_plan_slots_reset_confirm on brand_month_plan_slots;
create trigger trg_brand_month_plan_slots_reset_confirm
  after insert or update or delete on brand_month_plan_slots
  for each row execute function reset_month_plan_confirmation_on_slots();
