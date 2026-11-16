-- 0220 — Kế Hoạch Tháng "Chốt lại": cho phép bỏ ca còn MỞ dù đã có người báo rảnh.
-- Trước: ca bị bỏ khỏi kế hoạch mà đã có người báo rảnh thì bị GIỮ (kept_registered) và không có nút nào để bỏ tiếp (kẹt).
-- Nay: lock_month_plan(p_plan_id, p_drop_registered default false). Khi true (client chỉ gửi sau hộp xác nhận liệt kê số ca/số lượt):
--   gỡ lượt báo rảnh, huỷ ca mở, báo từng người đã báo rảnh (kind 'shift_cancelled'). Ca đã chốt người KHÔNG bị đụng (vòng lặp chỉ xét ca status 'open').
-- Mặc định false = hành vi cũ. Thân hàm còn lại = 0185. Chạy lại nhiều lần không sao.
-- Thứ tự deploy: chạy TRƯỚC khi deploy client (client cũ vẫn gọi 1 tham số → mặc định false).

drop function if exists lock_month_plan(uuid);
create or replace function lock_month_plan(p_plan_id uuid, p_drop_registered boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_plan brand_month_plans%rowtype;
  v_platform session_platform;
  v_brand_name text;
  v_studio_id uuid;
  v_studio_name text := '';
  v_ps record;
  v_existing uuid;
  v_new uuid;
  v_sess_id uuid;
  v_sess_studio uuid;
  v_sess_studio_name text;
  v_linked_sessions int := 0;
  v_created int := 0;
  v_linked int := 0;
  v_cancelled int := 0;
  v_kept_registered int := 0;
  v_dropped_regs int := 0;
  v_dropped_slots int := 0;
  v_n int;
  v_slot shift_slots%rowtype;
  v_kept int := 0;
  v_skipped_past int := 0;
  v_kept_cancelled int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations', 'trainer') then
    raise exception 'Chỉ ceo/admin/operations được chốt kế hoạch' using errcode = '42501';
  end if;
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  v_platform := coalesce(v_plan.platform, 'TikTok')::session_platform;
  select name into v_brand_name from brands where id = v_plan.brand_id;
  select bs.studio_id, st.name into v_studio_id, v_studio_name
    from brand_studios bs join studios st on st.id = bs.studio_id
   where bs.brand_id = v_plan.brand_id and bs.platform = v_platform;

  -- Huỷ ca mở mồ côi: sinh từ plan này (plan_id), không còn ca kế hoạch trỏ tới, chưa ai đăng ký.
  for v_ps in
    select s.id from shift_slots s
    where s.plan_id = p_plan_id and s.status = 'open'
      and not exists (select 1 from brand_month_plan_slots ps where ps.slot_id = s.id)
  loop
    if exists (select 1 from session_availability a where a.slot_id = v_ps.id) then
      if p_drop_registered then
        -- 0220: ca còn MỞ (chưa chốt ai) bị bỏ khỏi kế hoạch thì huỷ luôn, kể cả khi đã có người báo rảnh: gỡ lượt báo rảnh + báo từng người.
        select * into v_slot from shift_slots where id = v_ps.id;
        insert into notifications (user_id, kind, title, body, session_id, brand_id)
        select p.id, 'shift_cancelled', 'Ca bạn đã báo rảnh bị bỏ khỏi lịch',
          'Ca ' || coalesce(nullif(v_slot.brand_name, ''), 'chưa rõ brand') || ' ' || to_char(v_slot.date, 'DD/MM')
            || ' ' || to_char(v_slot.start_time, 'HH24:MI') || '–' || to_char(v_slot.end_time, 'HH24:MI')
            || ' không còn trong lịch tháng. Lượt báo rảnh của bạn cho ca này đã được gỡ.',
          null, v_slot.brand_id
        from session_availability a
        join profiles p on p.assigned_talent_id = a.talent_id and p.status = 'Active'
        where a.slot_id = v_ps.id;
        delete from session_availability where slot_id = v_ps.id;
        get diagnostics v_n = row_count;
        v_dropped_regs := v_dropped_regs + v_n;
        v_dropped_slots := v_dropped_slots + 1;
        update shift_slots set status = 'cancelled' where id = v_ps.id;
        v_cancelled := v_cancelled + 1;
      else
        v_kept_registered := v_kept_registered + 1;
      end if;
    else
      update shift_slots set status = 'cancelled' where id = v_ps.id;
      v_cancelled := v_cancelled + 1;
    end if;
  end loop;

  for v_ps in
    select ps.*, (s.id is not null and s.status = 'cancelled') as was_cancelled
      from brand_month_plan_slots ps
      left join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and (ps.slot_id is null or s.id is null or s.status = 'cancelled')
    order by ps.date, ps.start_time
  loop
    -- Chỉ gắn ca ĐÚNG SÀN: VERA live TikTok và Shopee cùng giờ, gắn lẫn sàn là đổ target TikTok xuống ca Shopee.
    select id into v_existing from shift_slots s
      where s.brand_id = v_plan.brand_id and s.date = v_ps.date and s.start_time = v_ps.start_time
        and s.end_time = v_ps.end_time and s.platform = v_platform and s.status <> 'cancelled'
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
      -- 0151: ca thật nạp sẵn (chưa có shift_slot nào trỏ tới) cùng brand|ngày|giờ|sàn.
      select ls.id, ls.studio_id, ls.studio_name into v_sess_id, v_sess_studio, v_sess_studio_name
        from live_sessions ls
       where ls.brand_id = v_plan.brand_id and ls.platform = v_platform and ls.date = v_ps.date
         and ls.start_time = v_ps.start_time and ls.end_time = v_ps.end_time and ls.status <> 'Cancelled'
         and not exists (select 1 from shift_slots x where x.session_id = ls.id and x.status <> 'cancelled')
       order by ls.created_at, ls.id
       limit 1;
      if v_sess_id is not null then
        -- Ca 'finalized' trỏ tới ca thật (cùng hình dạng finalize_shift_slot tạo): target đổ xuống ca thật, không mở đăng ký.
        insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                                 notes, status, session_id, created_by)
        values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), v_platform,
                v_sess_studio, coalesce(v_sess_studio_name, ''), v_ps.note, 'finalized', v_sess_id, auth.uid())
        returning id into v_new;
        update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
        v_linked_sessions := v_linked_sessions + 1;
      elsif v_ps.was_cancelled then
        -- 0185: ca đã huỷ mà lịch không có ca thay thế ⇒ giữ huỷ, KHÔNG mở lại chờ đăng ký.
        v_kept_cancelled := v_kept_cancelled + 1;
      elsif v_ps.date < v_today then
        v_skipped_past := v_skipped_past + 1;
      else
        insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name,
                                 notes, status, created_by, plan_id)
        values (v_ps.date, v_ps.start_time, v_ps.end_time, v_plan.brand_id, coalesce(v_brand_name, ''), v_platform,
                v_studio_id, coalesce(v_studio_name, ''), v_ps.note, 'open', auth.uid(), p_plan_id)
        returning id into v_new;
        update brand_month_plan_slots set slot_id = v_new where id = v_ps.id;
        v_created := v_created + 1;
      end if;
    end if;
    v_existing := null;
    v_sess_id := null;
  end loop;

  select count(*) into v_kept from brand_month_plan_slots ps
    join shift_slots s on s.id = ps.slot_id
    where ps.plan_id = p_plan_id and s.status <> 'cancelled';

  update brand_month_plans set status = 'locked', locked_at = now(), locked_by = auth.uid() where id = p_plan_id;

  return jsonb_build_object('created', v_created, 'linked', v_linked, 'cancelled', v_cancelled,
                            'kept_registered', v_kept_registered, 'dropped_registered_slots', v_dropped_slots, 'dropped_registrations', v_dropped_regs, 'total_slots', v_kept,
                            'skipped_past', v_skipped_past,
                            'linked_sessions', v_linked_sessions,
                            'kept_cancelled', v_kept_cancelled);
end $$;


revoke all on function lock_month_plan(uuid, boolean) from public;
grant execute on function lock_month_plan(uuid, boolean) to authenticated;
