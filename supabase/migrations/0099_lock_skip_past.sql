-- 0099 — Chốt kế hoạch bỏ qua ngày đã qua (audit Q7, 2026-09-21).
--
-- Chốt lại giữa tháng: engine chỉ xếp ngày >= hôm nay nhưng ca nạp từ quy tắc lặp / thêm tay thì
-- không lọc → lock sinh shift_slots 'open' cho ngày đã qua, không ai chốt được, đếm vào "ca chưa có
-- người". Sửa: lock_month_plan bỏ qua ca kế hoạch có date < hôm nay (giờ VN), trả 'skipped_past'.
-- Thân hàm còn lại giữ nguyên 0098.

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
  v_skipped_past int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
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
    -- Q7: ca kế hoạch ở ngày đã qua (chốt lại giữa tháng, nháp còn ca cũ) thì không sinh slot —
    -- không ai chốt được nữa, chỉ làm tăng "ca chưa có người".
    if v_ps.date < v_today then
      v_skipped_past := v_skipped_past + 1;
      continue;
    end if;
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
                            'kept_registered', v_kept_registered, 'total_slots', v_kept,
                            'skipped_past', v_skipped_past);
end $$;

grant execute on function lock_month_plan(uuid) to authenticated;
