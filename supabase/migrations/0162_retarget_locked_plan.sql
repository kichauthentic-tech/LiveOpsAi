-- 0162 — Chia lại target CẢ LƯỚI của kế hoạch ĐÃ CHỐT, kể cả ca ngày đã qua, có nhật ký.
--
-- Bối cảnh (10/10): đang giai đoạn thử tối ưu engine chia target ca (allocationModel v2) — cần chia lại target T10 nhiều vòng
-- trên toàn bộ lưới. Trigger guard_locked_plan_slot (0133) chặn đổi target ca ngày đã qua ("mẫu số run-rate") nên sau chốt chỉ
-- sửa được ca từ hôm nay; còn "mở khoá về Nháp" thì Dashboard mất target trong khoảng Nháp và mỗi vòng phải chốt lại.
--
-- Cách làm: MỘT RPC retarget_month_plan(plan, [{id, target}], note) chạy trong một transaction:
--   • chỉ ceo/admin (đổi mẫu số run-rate của cả tháng không phải việc của ops thường);
--   • chỉ kế hoạch đã chốt; chỉ đổi target ca (giờ/ca KHÔNG đổi — guard vẫn chặn dời giờ ca ngày đã qua);
--   • ghi nhật ký từng ca đổi (plan_target_audit: target cũ → mới, ai, lúc nào, cùng batch_id) để so các vòng thử với nhau;
--   • cập nhật brand_month_plans.target_gmv = Σ target ca (luật "target tháng = tổng target ca" sau chốt).
-- Trigger guard chỉ nới đúng một chỗ: ca ngày đã qua ĐƯỢC đổi target khi biến phiên app.retarget_plan = id kế hoạch đó (RPC đặt
-- bằng set_config(..., is_local := true), hết transaction là mất; PostgREST không cho client gọi set_config trực tiếp).
--
-- Thứ tự deploy: chạy migration TRƯỚC khi dùng nút "Chia lại target cả lưới" ở client (client cũ không bị ảnh hưởng). Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Nhật ký
-- ============================================================================
create table if not exists plan_target_audit (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  plan_id uuid not null references brand_month_plans(id) on delete cascade,
  plan_slot_id uuid,                       -- không FK: ca kế hoạch có thể bị xoá về sau, nhật ký vẫn giữ
  date date not null,
  start_time time not null,
  end_time time not null,
  old_target numeric not null,
  new_target numeric not null,
  note text not null default '',
  changed_by uuid,
  changed_at timestamptz not null default now()
);

create index if not exists idx_plan_target_audit_plan on plan_target_audit(plan_id, changed_at desc);

alter table plan_target_audit enable row level security;
drop policy if exists "plan_target_audit_read_staff" on plan_target_audit;
create policy "plan_target_audit_read_staff" on plan_target_audit for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'));
-- Không có policy insert/update/delete: chỉ retarget_month_plan (security definer) ghi được.

-- ============================================================================
-- 2) Trigger guard: nới đúng một chỗ (target ca ngày đã qua khi RPC đang chạy)
-- ============================================================================
create or replace function guard_locked_plan_slot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_status text;
  v_moved boolean;
  v_retarget boolean;
begin
  if tg_op = 'INSERT' then
    select status into v_status from brand_month_plans where id = new.plan_id;
    if v_status = 'locked' and new.date < v_today then
      raise exception 'Kế hoạch đã chốt: không thêm ca vào ngày đã qua (%) — target các ngày đã qua giữ như lúc chốt.', to_char(new.date, 'DD/MM');
    end if;
    return new;
  end if;

  select status into v_status from brand_month_plans where id = old.plan_id;
  if not found or v_status is distinct from 'locked' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_moved := tg_op = 'DELETE' or new.date <> old.date or new.start_time <> old.start_time or new.end_time <> old.end_time;
  -- 0162: retarget_month_plan đặt app.retarget_plan = id kế hoạch (local theo transaction) — chỉ khi đúng kế hoạch của dòng này.
  v_retarget := tg_op = 'UPDATE' and coalesce(current_setting('app.retarget_plan', true), '') = old.plan_id::text;

  if v_moved and old.slot_id is not null and exists (
    select 1 from shift_slots s join live_sessions ls on ls.id = s.session_id
     where s.id = old.slot_id and s.status = 'finalized' and ls.status <> 'Cancelled'
  ) then
    raise exception 'Ca kế hoạch % %–% đã chốt người — không bỏ/dời trong lưới được (chốt lại sẽ giữ ca cũ và mở thêm ca mới). Huỷ ca ở Cửa sổ Ca Live trước.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if old.date < v_today and (v_moved or (new.target_gmv <> old.target_gmv and not v_retarget)) then
    raise exception 'Kế hoạch đã chốt: ca ngày đã qua (% %–%) giữ nguyên giờ và target như lúc chốt — đó là mẫu số run-rate.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function guard_locked_plan_slot() from public;

-- ============================================================================
-- 3) RPC chia lại target
-- ============================================================================
create or replace function retarget_month_plan(p_plan_id uuid, p_targets jsonb, p_note text default '') returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan brand_month_plans%rowtype;
  v_batch uuid := gen_random_uuid();
  v_slot brand_month_plan_slots%rowtype;
  v_item jsonb;
  v_id uuid;
  v_target numeric;
  v_seen uuid[] := '{}';
  v_changed int := 0;
  v_past_changed int := 0;
  v_old_total numeric;
  v_new_total numeric;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin') then
    raise exception 'Chỉ ceo/admin được chia lại target kế hoạch đã chốt' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  if v_plan.status <> 'locked' then
    raise exception 'Kế hoạch chưa chốt — chia lại target ở lưới nháp';
  end if;
  if p_targets is null or jsonb_typeof(p_targets) <> 'array' or jsonb_array_length(p_targets) = 0 then
    raise exception 'Thiếu danh sách target ca';
  end if;

  select coalesce(sum(target_gmv), 0) into v_old_total from brand_month_plan_slots where plan_id = p_plan_id;

  perform set_config('app.retarget_plan', p_plan_id::text, true);
  for v_item in select * from jsonb_array_elements(p_targets) loop
    v_id := (v_item->>'id')::uuid;
    v_target := (v_item->>'target')::numeric;
    if v_target is null or v_target < 0 then
      raise exception 'Target ca phải là số không âm';
    end if;
    if v_id = any (v_seen) then
      raise exception 'Ca % xuất hiện hai lần trong danh sách', v_id;
    end if;
    v_seen := v_seen || v_id;
    select * into v_slot from brand_month_plan_slots where id = v_id and plan_id = p_plan_id for update;
    if v_slot.id is null then
      raise exception 'Ca % không thuộc kế hoạch này', v_id;
    end if;
    if v_slot.target_gmv is distinct from v_target then
      insert into plan_target_audit (batch_id, plan_id, plan_slot_id, date, start_time, end_time, old_target, new_target, note, changed_by)
      values (v_batch, p_plan_id, v_slot.id, v_slot.date, v_slot.start_time, v_slot.end_time, v_slot.target_gmv, v_target, coalesce(p_note, ''), auth.uid());
      update brand_month_plan_slots set target_gmv = v_target where id = v_slot.id;
      v_changed := v_changed + 1;
      if v_slot.date < v_today then
        v_past_changed := v_past_changed + 1;
      end if;
    end if;
  end loop;
  perform set_config('app.retarget_plan', '', true);

  select coalesce(sum(target_gmv), 0) into v_new_total from brand_month_plan_slots where plan_id = p_plan_id;
  update brand_month_plans set target_gmv = v_new_total where id = p_plan_id;

  return jsonb_build_object(
    'batch_id', v_batch, 'changed', v_changed, 'past_changed', v_past_changed,
    'old_total', v_old_total, 'new_total', v_new_total
  );
end;
$$;

revoke all on function retarget_month_plan(uuid, jsonb, text) from public;
grant execute on function retarget_month_plan(uuid, jsonb, text) to authenticated;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if position('app.retarget_plan' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0 then
    raise exception '0162 chốt 1: guard_locked_plan_slot chưa có nhánh retarget';
  end if;
  if position('không thêm ca vào ngày đã qua' in pg_get_functiondef('public.guard_locked_plan_slot()'::regprocedure)) = 0 then
    raise exception '0162 chốt 2: guard_locked_plan_slot mất luật chặn thêm ca ngày đã qua của 0133';
  end if;
  if not exists (select 1 from pg_proc where proname = 'retarget_month_plan') then
    raise exception '0162 chốt 3: thiếu retarget_month_plan';
  end if;
end $$;
