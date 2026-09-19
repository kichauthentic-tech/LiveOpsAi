-- Kế Hoạch Tháng — giai đoạn C (thiết kế ở WORKSPACE_DESIGN): lịch ngày lễ/sự kiện dùng chung, ngày
-- brand cấm live theo kế hoạch, và CHỐT LẠI có diff (huỷ ca mở không còn trong kế hoạch).

-- 1) Lịch sự kiện dùng chung mọi brand: ngày lễ VN + sự kiện mua sắm nền tảng. Engine gợi ý học hệ
--    số theo `kind` từ lịch sử (đủ dữ liệu) hoặc mặc định 1.0 và chỉ GHI NHÃN để ops tự quyết —
--    không giả định ngày lễ là tốt hay xấu cho live. Ops thêm/sửa được (RLS ops ghi).
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  kind text not null check (kind in ('holiday', 'mega_sale', 'event')),
  label text not null,
  created_at timestamptz not null default now(),
  constraint calendar_events_unique unique (date, kind, label)
);
alter table calendar_events enable row level security;
create policy "calendar_events_read_all" on calendar_events for select using (auth.role() = 'authenticated');
create policy "calendar_events_write_ceo_ops" on calendar_events for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

insert into calendar_events (date, kind, label) values
  -- 2026
  ('2026-01-01', 'holiday', 'Tết Dương lịch'),
  ('2026-02-16', 'holiday', 'Giao thừa Tết Bính Ngọ'),
  ('2026-02-17', 'holiday', 'Mùng 1 Tết'),
  ('2026-02-18', 'holiday', 'Mùng 2 Tết'),
  ('2026-02-19', 'holiday', 'Mùng 3 Tết'),
  ('2026-02-20', 'holiday', 'Mùng 4 Tết'),
  ('2026-04-26', 'holiday', 'Giỗ Tổ Hùng Vương'),
  ('2026-04-30', 'holiday', 'Giải phóng miền Nam'),
  ('2026-05-01', 'holiday', 'Quốc tế Lao động'),
  ('2026-09-02', 'holiday', 'Quốc khánh'),
  ('2026-02-14', 'event', 'Valentine'),
  ('2026-03-08', 'event', 'Quốc tế Phụ nữ'),
  ('2026-10-20', 'event', 'Phụ nữ Việt Nam'),
  ('2026-11-27', 'mega_sale', 'Black Friday'),
  ('2026-12-12', 'mega_sale', '12.12'),
  ('2026-12-24', 'event', 'Giáng sinh'),
  ('2026-12-25', 'event', 'Giáng sinh'),
  -- 2027
  ('2027-01-01', 'holiday', 'Tết Dương lịch'),
  ('2027-02-05', 'holiday', 'Giao thừa Tết Đinh Mùi'),
  ('2027-02-06', 'holiday', 'Mùng 1 Tết'),
  ('2027-02-07', 'holiday', 'Mùng 2 Tết'),
  ('2027-02-08', 'holiday', 'Mùng 3 Tết'),
  ('2027-02-09', 'holiday', 'Mùng 4 Tết'),
  ('2027-04-16', 'holiday', 'Giỗ Tổ Hùng Vương'),
  ('2027-04-30', 'holiday', 'Giải phóng miền Nam'),
  ('2027-05-01', 'holiday', 'Quốc tế Lao động'),
  ('2027-09-02', 'holiday', 'Quốc khánh'),
  ('2027-02-14', 'event', 'Valentine'),
  ('2027-03-08', 'event', 'Quốc tế Phụ nữ'),
  ('2027-10-20', 'event', 'Phụ nữ Việt Nam'),
  ('2027-11-26', 'mega_sale', 'Black Friday'),
  ('2027-12-12', 'mega_sale', '12.12')
on conflict do nothing;

-- 2) Ngày brand cấm live trong tháng kế hoạch (engine bỏ qua, lưới khoá ô).
alter table brand_month_plans add column if not exists blackout_dates date[] not null default '{}';

-- 3) Ca thật biết mình sinh từ kế hoạch nào — để chốt lại tìm được ca mở đã bị bỏ khỏi kế hoạch
--    (plan_slots đã bị xoá khi ops sửa lưới nên không tra ngược qua slot_id được).
alter table shift_slots add column if not exists plan_id uuid references brand_month_plans(id) on delete set null;
create index if not exists idx_shift_slots_plan on shift_slots(plan_id) where plan_id is not null;

-- Chốt lại có diff: ngoài gắn/tạo như 0090, còn HUỶ ca `open` sinh từ chính kế hoạch này mà không còn
-- ca kế hoạch nào trỏ tới — trừ ca đã có người đăng ký (giữ, báo về để ops tự xử). Ca đã chốt host
-- (finalized) không bao giờ đụng.
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
  v_cancelled int := 0;
  v_kept_registered int := 0;
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

  -- Huỷ ca mở mồ côi (sinh từ plan này, không còn ca kế hoạch trỏ tới).
  for v_ps in
    select s.id from shift_slots s
    where s.plan_id = p_plan_id and s.status = 'open'
      and not exists (select 1 from brand_month_plan_slots ps where ps.slot_id = s.id)
  loop
    if exists (select 1 from session_availability a where a.slot_id = v_ps.id) then
      v_kept_registered := v_kept_registered + 1;
    else
      update shift_slots set status = 'cancelled' where id = v_ps.id;
      v_cancelled := v_cancelled + 1;
    end if;
  end loop;

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
      update shift_slots set plan_id = p_plan_id where id = v_existing and plan_id is null;
      v_linked := v_linked + 1;
    else
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, notes, status, created_by, plan_id)
      values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), 'TikTok',
              v_ps.note, 'open', auth.uid(), p_plan_id)
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

  return jsonb_build_object('created', v_created, 'linked', v_linked, 'cancelled', v_cancelled,
                            'kept_registered', v_kept_registered, 'total_slots', v_kept);
end $$;

grant execute on function lock_month_plan(uuid) to authenticated;
