-- 0165 — "Ca tăng cường": ca OP mở thêm sau khi kế hoạch đã chốt TỰ có chỗ trong kế hoạch, kèm target đề xuất của engine,
-- nhưng target đó KHÔNG cộng vào target tháng / run-rate.
--
-- Bối cảnh (10/10): ca OP tạo ở Lịch & Studio chỉ ghi `shift_slots` (rồi `live_sessions` khi chốt người) — không có dòng nào
-- trong `brand_month_plan_slots`, nên nằm ngoài kế hoạch cho tới khi ai đó bấm "Chia lại theo lịch hiện có…". User chốt:
--   * ca tăng cường nhận target ĐỀ XUẤT TỪ ENGINE (dự báo riêng của ca), các ca khác KHÔNG đổi;
--   * target đó KHÔNG cộng vào target tháng (target tháng, run-rate, % đạt vẫn chỉ tính kế hoạch gốc — luật run-rate 28/09);
--     GMV của ca tăng cường vẫn cộng vào thực đạt như trước.
-- Vì vậy dòng tăng cường nằm ở BẢNG RIÊNG `plan_boost_slots`, không chung `brand_month_plan_slots` (mọi chỗ đang cộng bảng đó
-- thành target tháng: lockedPlanTargets.monthTotals, planRunRate, Báo cáo, Dashboard…).
--
-- Cách hoạt động:
--   1) Trigger trên shift_slots (INSERT / đổi ngày giờ / mở lại): kênh (brand, sàn, tháng của ca) có kế hoạch ĐÃ CHỐT mà chưa có
--      ca kế hoạch / dòng tăng cường cùng giờ ⇒ chèn dòng tăng cường `target_pending = true` (chưa có target).
--   2) Client (Kế Hoạch Tháng) tính dự báo engine cho các dòng đang chờ rồi gọi set_boost_targets() — engine chạy ở client nên
--      DB không tự điền được target.
--   3) Khi một dòng tăng cường sau này được đưa vào kế hoạch gốc (Chốt lại thêm ca cùng giờ, hoặc "Chia lại theo lịch hiện có…")
--      thì trigger trên brand_month_plan_slots xoá dòng tăng cường tương ứng — một ca không bao giờ có hai chỗ.
--
-- Không làm (cố ý): ca nạp bù từ file (không có shift_slot, is_backfill) và tháng chưa có kế hoạch chốt không sinh dòng tăng cường.
-- Dời giờ ca đã gắn ca kế hoạch gốc KHÔNG sửa dòng kế hoạch (vẫn là việc của "Chốt lại").
--
-- Thứ tự deploy: chạy migration TRƯỚC khi dùng client mới. Client cũ không bị ảnh hưởng. Chạy lại nhiều lần không sao.

create table if not exists plan_boost_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references brand_month_plans(id) on delete cascade,
  shift_slot_id uuid references shift_slots(id) on delete set null,
  date date not null,
  start_time time not null,
  end_time time not null,
  -- Target đề xuất của engine (dự báo riêng của ca). KHÔNG cộng vào target tháng.
  target_gmv numeric not null default 0,
  expected_gmv numeric not null default 0,
  -- true = chưa có target đề xuất, chờ client điền (set_boost_targets).
  target_pending boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_boost_slots_unique unique (plan_id, date, start_time, end_time)
);
create index if not exists idx_plan_boost_slots_plan on plan_boost_slots(plan_id, date);
create index if not exists idx_plan_boost_slots_shift on plan_boost_slots(shift_slot_id);

alter table plan_boost_slots enable row level security;
drop policy if exists "plan_boost_slots_read_staff" on plan_boost_slots;
-- Đọc: chỉ nhân sự agency (brand không thấy target nội bộ của ca tăng cường). Ghi: không có policy ghi — chỉ trigger và
-- set_boost_targets() (security definer) ghi được.
create policy "plan_boost_slots_read_staff" on plan_boost_slots for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin'));

drop trigger if exists trg_plan_boost_slots_updated_at on plan_boost_slots;
create trigger trg_plan_boost_slots_updated_at before update on plan_boost_slots
  for each row execute function set_updated_at();

-- ----------------------------------------------------------------------------------------------------------------------
-- Tạo dòng tăng cường cho một ca (idempotent).
-- ----------------------------------------------------------------------------------------------------------------------
create or replace function ensure_boost_slot(p_slot_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s shift_slots%rowtype;
  p brand_month_plans%rowtype;
begin
  select * into s from shift_slots where id = p_slot_id;
  if s.id is null or s.status = 'cancelled' or s.brand_id is null then
    return;
  end if;
  -- rebase_month_plan (0164) đang đưa ca vào kế hoạch GỐC trong cùng transaction: không sinh dòng tăng cường chen vào.
  if coalesce(current_setting('app.retarget_plan', true), '') <> '' then
    return;
  end if;
  select * into p from brand_month_plans
   where brand_id = s.brand_id and platform = s.platform::text
     and month = date_trunc('month', s.date)::date and status = 'locked';
  if p.id is null then
    return;
  end if;
  -- Đã là ca kế hoạch gốc (gắn slot, hoặc cùng giờ — lúc Chốt/Chốt lại sinh ca cho dòng kế hoạch) thì không phải ca tăng cường.
  if exists (
    select 1 from brand_month_plan_slots ps
     where ps.plan_id = p.id
       and (ps.slot_id = s.id or (ps.date = s.date and ps.start_time = s.start_time and ps.end_time = s.end_time))
  ) then
    return;
  end if;
  insert into plan_boost_slots (plan_id, shift_slot_id, date, start_time, end_time)
  values (p.id, s.id, s.date, s.start_time, s.end_time)
  on conflict (plan_id, date, start_time, end_time) do nothing;
end;
$$;
revoke all on function ensure_boost_slot(uuid) from public, anon, authenticated;

create or replace function trg_shift_slots_boost() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and (new.date <> old.date or new.start_time <> old.start_time or new.end_time <> old.end_time
                           or new.platform is distinct from old.platform or new.brand_id is distinct from old.brand_id) then
    -- Ca bị dời: dòng tăng cường cũ không còn đúng giờ — bỏ rồi tạo lại ở giờ mới (target chờ engine điền lại).
    delete from plan_boost_slots where shift_slot_id = new.id;
  end if;
  perform ensure_boost_slot(new.id);
  return new;
end;
$$;
revoke all on function trg_shift_slots_boost() from public, anon, authenticated;

drop trigger if exists trg_shift_slots_boost on shift_slots;
create trigger trg_shift_slots_boost
  after insert or update of date, start_time, end_time, status, platform, brand_id on shift_slots
  for each row execute function trg_shift_slots_boost();

-- ----------------------------------------------------------------------------------------------------------------------
-- Ca đã vào kế hoạch GỐC thì không còn là ca tăng cường.
-- ----------------------------------------------------------------------------------------------------------------------
create or replace function trg_plan_slots_drop_boost() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from plan_boost_slots b
   where b.plan_id = new.plan_id
     and ((new.slot_id is not null and b.shift_slot_id = new.slot_id)
          or (b.date = new.date and b.start_time = new.start_time and b.end_time = new.end_time));
  return new;
end;
$$;
revoke all on function trg_plan_slots_drop_boost() from public, anon, authenticated;

drop trigger if exists trg_plan_slots_drop_boost on brand_month_plan_slots;
create trigger trg_plan_slots_drop_boost
  after insert or update of slot_id, date, start_time, end_time on brand_month_plan_slots
  for each row execute function trg_plan_slots_drop_boost();

-- ----------------------------------------------------------------------------------------------------------------------
-- Điền target đề xuất (client tính bằng engine). Mỗi phần tử: {"id": <dòng tăng cường>, "target": n, "expected": n}.
-- ----------------------------------------------------------------------------------------------------------------------
create or replace function set_boost_targets(p_plan_id uuid, p_items jsonb) returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_target numeric;
  v_n int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được ghi target ca tăng cường' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Thiếu danh sách ca tăng cường';
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_target := (v_item->>'target')::numeric;
    if v_target is null or v_target < 0 then
      raise exception 'Target ca tăng cường phải là số không âm';
    end if;
    update plan_boost_slots
       set target_gmv = round(v_target),
           expected_gmv = greatest(coalesce((v_item->>'expected')::numeric, 0), 0),
           target_pending = false
     where id = (v_item->>'id')::uuid and plan_id = p_plan_id;
    if not found then
      raise exception 'Ca tăng cường % không thuộc kế hoạch này', v_item->>'id';
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function set_boost_targets(uuid, jsonb) from public, anon;
grant execute on function set_boost_targets(uuid, jsonb) to authenticated;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_shift_slots_boost' and not tgisinternal) then
    raise exception '0165 chốt 1: thiếu trigger trg_shift_slots_boost';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_plan_slots_drop_boost' and not tgisinternal) then
    raise exception '0165 chốt 2: thiếu trigger trg_plan_slots_drop_boost';
  end if;
  if has_function_privilege('anon', 'public.set_boost_targets(uuid,jsonb)', 'execute') then
    raise exception '0165 chốt 3: anon gọi được set_boost_targets';
  end if;
  if has_function_privilege('authenticated', 'public.ensure_boost_slot(uuid)', 'execute') then
    raise exception '0165 chốt 4: ensure_boost_slot không được gọi trực tiếp từ client';
  end if;
  if exists (select 1 from pg_policies where tablename = 'plan_boost_slots' and cmd <> 'SELECT') then
    raise exception '0165 chốt 5: plan_boost_slots có policy ghi — chỉ trigger/RPC được ghi';
  end if;
end $$;
