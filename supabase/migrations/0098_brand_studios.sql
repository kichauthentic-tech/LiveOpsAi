-- 0098 — Phòng live mặc định theo brand × nền tảng (audit N3, 2026-09-21).
--
-- lock_month_plan (0093) insert shift_slots không có studio_id/studio_name → ca chốt ra
-- studioId="" → không hiện trên ma trận studio của Lịch & Studio, kiểm trùng phòng (SlotDetailModal,
-- bulkFinalize, checkConflicts đều `if (studioId && …)`) thành vô nghĩa.
--
-- Mỗi brand có phòng riêng, nhưng VERA live 2 nền tảng (TikTok Shop ở "VERA TTS", Shopee ở
-- "VERA SPE") và mỗi nền tảng 1 phòng → khoá theo (brand, platform) như brand_platform_rates, KHÔNG
-- gắn cột lên brands. Không dùng brand_platform_rates vì insert vào đó sinh dòng lịch sử rate 0đ.
-- Kế Hoạch Tháng hiện chỉ lập cho TikTok (lock ghi platform 'TikTok' cứng) → lấy phòng TikTok.

create table if not exists brand_studios (
  brand_id uuid not null references brands(id) on delete cascade,
  platform session_platform not null,
  studio_id uuid not null references studios(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (brand_id, platform)
);

alter table brand_studios enable row level security;
drop policy if exists "brand_studios_read_all" on brand_studios;
create policy "brand_studios_read_all" on brand_studios for select using (auth.role() = 'authenticated');
drop policy if exists "brand_studios_write_ceo_ops" on brand_studios;
create policy "brand_studios_write_ceo_ops" on brand_studios for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

drop trigger if exists trg_brand_studios_updated_at on brand_studios;
create trigger trg_brand_studios_updated_at before update on brand_studios
  for each row execute function set_updated_at();

-- Khớp lần đầu theo tên phòng đang có: "<brand>" hoặc "<brand> TTS" → TikTok, "<brand> SPE" → Shopee.
-- Chỉ điền chỗ trống; ops đổi sau ở Kế Hoạch Tháng → Tham số → Phòng live.
insert into brand_studios (brand_id, platform, studio_id)
select b.id, 'TikTok', s.id
  from brands b join studios s on upper(trim(s.name)) in (upper(trim(b.name)), upper(trim(b.name)) || ' TTS')
on conflict do nothing;
insert into brand_studios (brand_id, platform, studio_id)
select b.id, 'Shopee', s.id
  from brands b join studios s on upper(trim(s.name)) = upper(trim(b.name)) || ' SPE'
on conflict do nothing;

-- Chốt kế hoạch: ca mới sinh mang phòng mặc định của brand; ca ops mở tay được gắn mà chưa có phòng
-- thì điền luôn (cùng brand, cùng nền tảng — phòng ấy là của brand).
create or replace function lock_month_plan(p_plan_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
  v_brand_name text;
  v_studio_id uuid;
  v_studio_name text := '';
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
  select bs.studio_id, st.name into v_studio_id, v_studio_name
    from brand_studios bs join studios st on st.id = bs.studio_id
   where bs.brand_id = v_plan.brand_id and bs.platform = 'TikTok';

  -- Huỷ ca mở mồ côi: sinh từ plan này (plan_id), không còn ca kế hoạch trỏ tới, chưa ai đăng ký.
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
      -- Gắn để đổ target, KHÔNG gán plan_id: ca này không phải của kế hoạch.
      update brand_month_plan_slots set slot_id = v_existing where id = v_ps.id;
      if v_studio_id is not null then
        update shift_slots set studio_id = v_studio_id, studio_name = coalesce(v_studio_name, '')
         where id = v_existing and studio_id is null;
      end if;
      v_linked := v_linked + 1;
    else
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                               notes, status, created_by, plan_id)
      values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), 'TikTok',
              v_studio_id, coalesce(v_studio_name, ''), v_ps.note, 'open', auth.uid(), p_plan_id)
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
