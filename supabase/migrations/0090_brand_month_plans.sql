-- Module "Kế Hoạch Tháng" — giai đoạn A (thiết kế ở WORKSPACE_DESIGN, user chốt 2026-09-19).
--
-- Ops lập kế hoạch ca cho brand theo tháng TRƯỚC khi mở đăng ký: lưới ngày × ca (giờ bắt đầu/kết
-- thúc + target GMV từng ca) → nháp → CHỐT. Chốt = sinh shift_slots chờ đăng ký cho từng ca của
-- kế hoạch (qua cùng khoá tự nhiên chống trùng của 0088) và ghi slot_id ngược lại để sau này đối
-- chiếu kế hoạch ↔ ca thật. Target/ca của kế hoạch đã chốt sẽ là nguồn target cho ca (giai đoạn B);
-- shift_slots/live_sessions KHÔNG thêm cột — kế hoạch là lớp riêng phía trên.
--
-- Nguồn sự thật giữ nguyên chỗ cũ: giờ cam kết ở brand_monthly_commitments, target tổng + % khung ở
-- brand_monthly_reports (tab 05). Bảng này chỉ giữ phần chi tiết theo ca + tham số lập kế hoạch.

create table if not exists brand_month_plans (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  month date not null,                                   -- ngày 1 của tháng
  status text not null default 'draft' check (status in ('draft', 'locked')),
  default_slot_hours numeric not null default 3 check (default_slot_hours > 0 and default_slot_hours <= 12),
  live_window_start time not null default '09:00',
  live_window_end time not null default '23:00',
  max_slots_per_day int not null default 3 check (max_slots_per_day between 1 and 8),
  notes text not null default '',
  locked_at timestamptz,
  locked_by uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_month_plans_month_first_day check (extract(day from month) = 1),
  constraint brand_month_plans_unique unique (brand_id, month)
);

create table if not exists brand_month_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references brand_month_plans(id) on delete cascade,
  date date not null,
  start_time time not null,
  end_time time not null,
  target_gmv numeric not null default 0,
  -- Ca thật sinh ra lúc chốt (null = chưa chốt / ca thật đã bị xoá).
  slot_id uuid references shift_slots(id) on delete set null,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint brand_month_plan_slots_unique unique (plan_id, date, start_time, end_time)
);

create index if not exists idx_brand_month_plan_slots_plan on brand_month_plan_slots(plan_id, date);

alter table brand_month_plans enable row level security;
alter table brand_month_plan_slots enable row level security;

create policy "brand_month_plans_read_all" on brand_month_plans for select using (auth.role() = 'authenticated');
create policy "brand_month_plans_write_ceo_ops" on brand_month_plans for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

create policy "brand_month_plan_slots_read_all" on brand_month_plan_slots for select using (auth.role() = 'authenticated');
create policy "brand_month_plan_slots_write_ceo_ops" on brand_month_plan_slots for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

drop trigger if exists trg_brand_month_plans_updated_at on brand_month_plans;
create trigger trg_brand_month_plans_updated_at before update on brand_month_plans
  for each row execute function set_updated_at();
drop trigger if exists trg_brand_month_plan_slots_updated_at on brand_month_plan_slots;
create trigger trg_brand_month_plan_slots_updated_at before update on brand_month_plan_slots
  for each row execute function set_updated_at();

-- Chốt kế hoạch: 1 transaction — với mỗi ca kế hoạch chưa gắn ca thật (hoặc ca thật đã huỷ):
--   có sẵn ca thật chưa huỷ cùng khoá brand|ngày|giờ|nền tảng (ops đã mở tay) → GẮN (linked),
--   chưa có → TẠO (created) status open. Không đụng ca thật đã có người / đã chốt host.
-- Guard trong thân hàm theo mẫu 0082 (security definer bỏ qua RLS). Không chặn chốt lại: giai đoạn
-- C sẽ thêm diff (huỷ ca open bị bỏ khỏi kế hoạch); hiện tại chốt lại chỉ thêm ca mới.
create or replace function lock_month_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
  v_brand_name text;
  v_ps record;
  v_existing uuid;
  v_new uuid;
  v_created int := 0;
  v_linked int := 0;
  v_kept int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được chốt kế hoạch' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  select name into v_brand_name from brands where id = v_plan.brand_id;

  for v_ps in
    select ps.* from brand_month_plan_slots ps
    left join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and (ps.slot_id is null or s.id is null or s.status = 'cancelled')
    order by ps.date, ps.start_time
  loop
    select id into v_existing from shift_slots s
      where s.brand_id = v_plan.brand_id and s.date = v_ps.date and s.start_time = v_ps.start_time
        and s.end_time = v_ps.end_time and s.platform = 'TikTok' and s.status <> 'cancelled'
      limit 1;
    if v_existing is not null then
      update brand_month_plan_slots set slot_id = v_existing where id = v_ps.id;
      v_linked := v_linked + 1;
    else
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, notes, status, created_by)
      values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), 'TikTok',
              v_ps.note, 'open', auth.uid())
      returning id into v_new;
      update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
      v_created := v_created + 1;
    end if;
    v_existing := null;
  end loop;

  select count(*) into v_kept from brand_month_plan_slots ps
    join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and s.status <> 'cancelled';

  update brand_month_plans set status = 'locked', locked_at = now(), locked_by = auth.uid() where id = p_plan_id;

  return jsonb_build_object('created', v_created, 'linked', v_linked, 'total_slots', v_kept);
end $$;

grant execute on function lock_month_plan(uuid) to authenticated;
