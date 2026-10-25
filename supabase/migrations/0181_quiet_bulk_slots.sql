-- 0181 — Điều Phối Lịch Live bản gọn đợt 2 (25/10): mở ca HÀNG LOẠT không dội thông báo.
--
-- Trước 0181:
--   * trg_notify_slot_opened (0116) báo MỖI talent cho MỖI ca mở tạo tay (plan_id null). Nút mới "Chép khung giờ tuần trước"
--     thử trên DB thật 25/10 = 34 ca ⇒ 34 tin/người × ~27 talent ≈ 900 tin.
--   * trg_notify_plan_locked (0116/0140) báo mỗi talent MỖI kế hoạch chốt. "Mở lịch tháng 11" chốt 7 kênh + đặt hạn tháng
--     ⇒ 8 tin/người cho một việc.
--
-- Phần 1  Hai trigger trên bỏ qua khi transaction đặt set_config('app.quiet_slot_notify', 'on', true). Thân hàm còn lại = bản cũ.
-- Phần 2  create_open_slots(p_slots jsonb, p_notify boolean): mở nhiều ca mở trong MỘT transaction, bỏ ca trùng khoá tự nhiên
--         (idx_shift_slots_natural_key 0088), rồi MỘT tin tóm tắt cho mỗi talent (nếu p_notify và có ca mới từ hôm nay).
-- Phần 3  lock_month_plans(p_plan_ids uuid[], p_notify boolean): gọi lock_month_plan từng kế hoạch trong MỘT transaction, im lặng,
--         rồi MỘT tin tóm tắt/người. Nơi gọi đặt hạn đăng ký ngay sau đó thì truyền p_notify = false — set_roster_month_deadline
--         (0180) đã báo "Mở đăng ký ca tháng … N ca đang chờ. Hạn …" một tin/người.
-- Quyền: private.roster_staff_guard() (0176) = ceo/admin/operations/trainer — cùng nhóm được chốt kế hoạch từ 0180.

-- ===== Phần 1 — trigger im lặng khi mở hàng loạt =====
create or replace function notify_slot_opened() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  if coalesce(current_setting('app.quiet_slot_notify', true), '') = 'on' then
    return new;
  end if;
  if new.status <> 'open' or new.plan_id is not null or new.date < v_today then
    return new;
  end if;
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, 'shift_open', 'Có ca mới đang mở đăng ký',
    'Ca ' || coalesce(nullif(new.brand_name, ''), 'chưa rõ brand')
      || ' ' || to_char(new.date, 'DD/MM')
      || ' ' || to_char(new.start_time, 'HH24:MI') || '–' || to_char(new.end_time, 'HH24:MI')
      || case when coalesce(new.notes, '') <> '' then ' — ' || new.notes else '' end
      || '. Vào Đăng Ký Ca để báo rảnh.',
    null, new.brand_id
  from profiles p
  where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
    and p.id is distinct from auth.uid();
  return new;
end;
$$;
revoke all on function notify_slot_opened() from public;

create or replace function notify_plan_locked() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_open int;
  v_brand text;
begin
  if coalesce(current_setting('app.quiet_slot_notify', true), '') = 'on' then
    return new;
  end if;
  select count(*) into v_open from shift_slots
   where plan_id = new.id and status = 'open' and date >= v_today;
  if v_open = 0 then
    return new;
  end if;
  select name into v_brand from brands where id = new.brand_id;
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, 'shift_open',
    'Lịch tháng ' || to_char(new.month, 'MM/YYYY') || ' đã mở đăng ký',
    coalesce(v_brand, 'Brand') || case when new.platform = 'Shopee' then ' Shopee' else '' end
      || ': ' || v_open || ' ca đang chờ đăng ký. Vào Đăng Ký Ca để báo ca bạn rảnh.',
    null, new.brand_id
  from profiles p
  where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
    and p.id is distinct from auth.uid();
  return new;
end;
$$;
revoke all on function notify_plan_locked() from public;

-- ===== Phần 2 — mở nhiều ca mở một lần =====
-- p_slots: [{date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name, notes}]
create or replace function public.create_open_slots(p_slots jsonb, p_notify boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_created int := 0;
  v_skipped int := 0;
  v_upcoming int := 0;
  v_first date;
  v_last date;
  v_sent int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  perform private.roster_staff_guard();
  if jsonb_typeof(p_slots) is distinct from 'array' then
    raise exception 'p_slots phải là mảng ca.';
  end if;
  perform set_config('app.quiet_slot_notify', 'on', true);
  for r in select * from jsonb_array_elements(p_slots) loop
    begin
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name, notes, status, created_by)
      values (
        (r->>'date')::date, (r->>'start_time')::time, (r->>'end_time')::time,
        nullif(r->>'brand_id', '')::uuid, coalesce(r->>'brand_name', ''), coalesce(nullif(r->>'platform', ''), 'TikTok')::session_platform,
        nullif(r->>'studio_id', '')::uuid, coalesce(r->>'studio_name', ''), coalesce(r->>'notes', ''), 'open', auth.uid()
      );
      v_created := v_created + 1;
      if (r->>'date')::date >= v_today then
        v_upcoming := v_upcoming + 1;
        v_first := least(coalesce(v_first, (r->>'date')::date), (r->>'date')::date);
        v_last := greatest(coalesce(v_last, (r->>'date')::date), (r->>'date')::date);
      end if;
    exception when unique_violation then
      v_skipped := v_skipped + 1;
    end;
  end loop;
  perform set_config('app.quiet_slot_notify', 'off', true);

  if p_notify and v_upcoming > 0 then
    insert into notifications (user_id, kind, title, body, session_id, brand_id)
    select p.id, 'shift_open', 'Có ' || v_upcoming || ' ca mới đang mở đăng ký',
      'Ca từ ' || to_char(v_first, 'DD/MM') || case when v_last <> v_first then ' đến ' || to_char(v_last, 'DD/MM') else '' end
        || '. Vào Đăng Ký Ca để báo ca bạn rảnh.',
      null, null
    from profiles p
    where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
      and p.id is distinct from auth.uid();
    get diagnostics v_sent = row_count;
  end if;
  return jsonb_build_object('created', v_created, 'skipped', v_skipped, 'notified', v_sent);
end;
$$;
revoke all on function public.create_open_slots(jsonb, boolean) from public;
grant execute on function public.create_open_slots(jsonb, boolean) to authenticated;

-- ===== Phần 3 — chốt nhiều kế hoạch một lần =====
create or replace function public.lock_month_plans(p_plan_ids uuid[], p_notify boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_res jsonb;
  v_out jsonb := '{}'::jsonb;
  v_months date[];
  v_open int := 0;
  v_sent int := 0;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
begin
  perform private.roster_staff_guard();
  perform set_config('app.quiet_slot_notify', 'on', true);
  foreach v_id in array coalesce(p_plan_ids, '{}') loop
    v_res := lock_month_plan(v_id);
    v_out := v_out || jsonb_build_object(v_id::text, v_res);
  end loop;
  perform set_config('app.quiet_slot_notify', 'off', true);

  select array_agg(distinct month) into v_months from brand_month_plans where id = any(coalesce(p_plan_ids, '{}'));
  select count(*) into v_open from shift_slots
   where plan_id = any(coalesce(p_plan_ids, '{}')) and status = 'open' and date >= v_today;
  if p_notify and v_open > 0 then
    insert into notifications (user_id, kind, title, body, session_id, brand_id)
    select p.id, 'shift_open',
      'Lịch tháng ' || (select string_agg(to_char(m, 'MM/YYYY'), ', ' order by m) from unnest(v_months) m) || ' đã mở đăng ký',
      v_open || ' ca đang chờ đăng ký. Vào Đăng Ký Ca để báo ca bạn rảnh.',
      null, null
    from profiles p
    where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
      and p.id is distinct from auth.uid();
    get diagnostics v_sent = row_count;
  end if;
  return jsonb_build_object('plans', v_out, 'open_slots', v_open, 'notified', v_sent);
end;
$$;
revoke all on function public.lock_month_plans(uuid[], boolean) from public;
grant execute on function public.lock_month_plans(uuid[], boolean) to authenticated;

-- ===== Chốt tự kiểm =====
do $$
begin
  if position('app.quiet_slot_notify' in (select pg_get_functiondef('public.notify_slot_opened()'::regprocedure))) = 0
     or position('app.quiet_slot_notify' in (select pg_get_functiondef('public.notify_plan_locked()'::regprocedure))) = 0 then
    raise exception '0181 chốt 1: trigger thông báo chưa nhận cờ im lặng';
  end if;
  if position('roster_staff_guard' in (select pg_get_functiondef('public.create_open_slots(jsonb, boolean)'::regprocedure))) = 0
     or position('roster_staff_guard' in (select pg_get_functiondef('public.lock_month_plans(uuid[], boolean)'::regprocedure))) = 0 then
    raise exception '0181 chốt 2: RPC mở hàng loạt thiếu kiểm quyền';
  end if;
end $$;
