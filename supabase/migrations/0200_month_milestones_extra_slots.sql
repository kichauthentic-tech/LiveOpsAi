-- 0200 — Lịch tháng sau theo 2 đợt + ca bổ sung khi target brand cao hơn dự báo (06/11, user chốt).
--
-- Quy trình (user 06/11): lập lịch CẢ THÁNG sau một lần, chốt theo mốc trong tháng trước:
--   ngày 10 hết hạn đăng ký ca ngày 1–15, ngày 15 chốt lịch 1–15; ngày 20 hết hạn đăng ký ca 16–cuối, ngày 25 chốt phần còn lại.
-- Target chỉ có sau buổi họp monthly với brand (cuối tháng) ⇒ lịch lập theo GIỜ, target chia sau. Target brand cao hơn dự báo
-- của lịch đã chốt 10–30% ⇒ mở "ca bổ sung" (nằm TRONG kế hoạch, được chia target — khác ca tăng cường 0165).
--
-- Phần 1  roster_months: thêm hạn đăng ký đợt 2 + 2 ngày chốt lịch (mốc nhắc việc, không chặn gì).
--         signup_deadline (0180) = hạn đợt 1 (ngày 1–15); signup_deadline_2 = hạn đợt 2 (16–cuối). Đợt 2 trống ⇒ hạn đợt 1 áp cả tháng
--         (đúng như trước 0200).
-- Phần 2  shift_slots.signup_deadline: hạn riêng của một ca (ca bổ sung mở sau khi tháng đã đóng đăng ký). Có hạn riêng thì chỉ xét
--         hạn đó, bỏ qua hạn tháng/tuần.
-- Phần 3  private.slot_open_for_registration xét Phần 1 + Phần 2.
-- Phần 4  set_roster_month_milestones: đặt 4 mốc một lần, MỘT tin cho mỗi talent khi có hạn mới ở tương lai.
-- Phần 5  open_extra_plan_slots: thêm ca bổ sung vào kế hoạch ĐÃ CHỐT (target 0, chia sau bằng rebase 0164), chốt lại im lặng để sinh
--         ca mở, đặt hạn riêng, báo một tin cho người từng live kênh đó 90 ngày qua (không có ai thì mọi host/trợ).
-- Quyền: private.roster_staff_guard() (0176) = ceo/admin/operations/trainer.

-- ===== Phần 1 =====
alter table public.roster_months add column if not exists signup_deadline_2 timestamptz;
alter table public.roster_months add column if not exists publish_by_1 date;
alter table public.roster_months add column if not exists publish_by_2 date;
comment on column public.roster_months.signup_deadline is '0180/0200 — hạn đăng ký đợt 1 (ca ngày 1–15). signup_deadline_2 trống thì áp cả tháng.';
comment on column public.roster_months.signup_deadline_2 is '0200 — hạn đăng ký đợt 2 (ca ngày 16–cuối tháng).';
comment on column public.roster_months.publish_by_1 is '0200 — ngày phải chốt (công bố) lịch ca ngày 1–15. Chỉ để nhắc việc.';
comment on column public.roster_months.publish_by_2 is '0200 — ngày phải chốt (công bố) lịch ca ngày 16–cuối. Chỉ để nhắc việc.';

-- ===== Phần 2 =====
alter table public.shift_slots add column if not exists signup_deadline timestamptz;
comment on column public.shift_slots.signup_deadline is '0200 — hạn đăng ký riêng của ca (ca bổ sung). Có giá trị thì thay hạn tháng/tuần.';

-- ===== Phần 3 =====
create or replace function private.slot_open_for_registration(p_slot_id uuid, p_require_future boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shift_slots s
     where s.id = p_slot_id
       and s.status = 'open'
       and s.session_id is null
       and (not p_require_future or s.date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
       and (
         case
           when s.signup_deadline is not null then s.signup_deadline > now()
           else not exists (
                  select 1 from roster_months m
                   where m.month = date_trunc('month', s.date::timestamp)::date
                     and (case when extract(day from s.date) > 15 and m.signup_deadline_2 is not null
                               then m.signup_deadline_2 else m.signup_deadline end) <= now()
                )
            and not exists (
                  select 1 from roster_weeks w
                   where w.week_start = s.date - (extract(isodow from s.date)::int - 1)
                     and w.signup_deadline is not null
                     and w.signup_deadline <= now()
                )
         end
       )
  )
$$;
revoke all on function private.slot_open_for_registration(uuid, boolean) from public;
grant execute on function private.slot_open_for_registration(uuid, boolean) to authenticated;

-- ===== Phần 4 =====
create or replace function public.set_roster_month_milestones(
  p_month date,
  p_deadline_1 timestamptz,
  p_deadline_2 timestamptz,
  p_publish_1 date,
  p_publish_2 date
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old roster_months;
  v_open int := 0;
  v_sent int := 0;
  v_tz text := 'Asia/Ho_Chi_Minh';
  v_last int;
begin
  perform private.roster_staff_guard();
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Tháng phải là ngày 1.';
  end if;
  if p_deadline_1 is not null and p_deadline_2 is not null and p_deadline_2 < p_deadline_1 then
    raise exception 'Hạn đăng ký đợt 2 phải sau hạn đợt 1.';
  end if;
  if p_publish_1 is not null and p_publish_2 is not null and p_publish_2 < p_publish_1 then
    raise exception 'Ngày chốt lịch đợt 2 phải sau ngày chốt đợt 1.';
  end if;
  select * into v_old from roster_months where month = p_month for update;

  insert into roster_months (month, signup_deadline, signup_deadline_2, publish_by_1, publish_by_2, updated_by, updated_at)
  values (p_month, p_deadline_1, p_deadline_2, p_publish_1, p_publish_2, auth.uid(), now())
  on conflict (month) do update
    set signup_deadline = excluded.signup_deadline, signup_deadline_2 = excluded.signup_deadline_2,
        publish_by_1 = excluded.publish_by_1, publish_by_2 = excluded.publish_by_2,
        updated_by = excluded.updated_by, updated_at = now();

  select count(*) into v_open from shift_slots
   where date >= p_month and date < (p_month + interval '1 month')::date
     and status = 'open' and session_id is null
     and date >= (now() at time zone v_tz)::date;

  -- Một tin cho mỗi talent khi có ÍT NHẤT một hạn mới ở tương lai và tháng còn ca mở.
  if v_open > 0 and (
       (p_deadline_1 is not null and p_deadline_1 > now() and p_deadline_1 is distinct from v_old.signup_deadline)
    or (p_deadline_2 is not null and p_deadline_2 > now() and p_deadline_2 is distinct from v_old.signup_deadline_2)
  ) then
    v_last := extract(day from (p_month + interval '1 month - 1 day'))::int;
    insert into notifications (user_id, kind, title, body, session_id, brand_id)
    select p.id, 'signup_open',
      'Mở đăng ký ca tháng ' || to_char(p_month, 'MM/YYYY'),
      v_open || ' ca đang chờ. '
        || case
             when p_deadline_2 is null then 'Hạn đăng ký: ' || to_char(p_deadline_1 at time zone v_tz, 'HH24:MI DD/MM') || '.'
             else 'Hạn đăng ký ca ngày 1–15: ' || coalesce(to_char(p_deadline_1 at time zone v_tz, 'HH24:MI DD/MM'), 'chưa đặt')
                  || '; ca ngày 16–' || v_last || ': ' || to_char(p_deadline_2 at time zone v_tz, 'HH24:MI DD/MM') || '.'
           end
        || ' Vào Đăng Ký Ca để chọn ca bạn làm được.',
      null, null
    from profiles p
    where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null;
    get diagnostics v_sent = row_count;
  end if;
  return jsonb_build_object('notified', v_sent, 'open_slots', v_open);
end;
$$;
revoke all on function public.set_roster_month_milestones(date, timestamptz, timestamptz, date, date) from public, anon;
grant execute on function public.set_roster_month_milestones(date, timestamptz, timestamptz, date, date) to authenticated;

-- ===== Phần 5 =====
-- p_slots: [{date, start_time, end_time, expected_gmv?}]. Ca trùng giờ một ca kế hoạch có sẵn hoặc ở ngày đã qua bị bỏ qua.
create or replace function public.open_extra_plan_slots(p_plan_id uuid, p_slots jsonb, p_deadline timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan brand_month_plans%rowtype;
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_item jsonb;
  v_date date;
  v_start time;
  v_end time;
  v_new uuid;
  v_ids uuid[] := '{}';
  v_skipped int := 0;
  v_opened int := 0;
  v_sent int := 0;
  v_brand text;
  v_targets uuid[];
begin
  perform private.roster_staff_guard();
  select * into v_plan from brand_month_plans where id = p_plan_id for update;
  if v_plan.id is null then
    raise exception 'Không tìm thấy kế hoạch';
  end if;
  if v_plan.status is distinct from 'locked' then
    raise exception 'Ca bổ sung chỉ thêm vào kế hoạch đã chốt — kế hoạch nháp thì thêm thẳng vào lưới.';
  end if;
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Hạn đăng ký ca bổ sung phải ở tương lai.';
  end if;
  if jsonb_typeof(p_slots) is distinct from 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'Chưa chọn ca bổ sung nào.';
  end if;

  perform set_config('app.quiet_slot_notify', 'on', true);
  for v_item in select * from jsonb_array_elements(p_slots) loop
    v_date := (v_item->>'date')::date;
    v_start := (v_item->>'start_time')::time;
    v_end := (v_item->>'end_time')::time;
    if v_date < v_today or date_trunc('month', v_date::timestamp)::date <> v_plan.month
       or exists (select 1 from brand_month_plan_slots ps
                   where ps.plan_id = p_plan_id and ps.date = v_date and ps.start_time = v_start and ps.end_time = v_end) then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    insert into brand_month_plan_slots (plan_id, date, start_time, end_time, target_gmv, expected_gmv, note)
    values (p_plan_id, v_date, v_start, v_end, 0, coalesce(nullif(v_item->>'expected_gmv', '')::numeric, 0), 'Ca bổ sung')
    returning id into v_new;
    v_ids := v_ids || v_new;
  end loop;

  if array_length(v_ids, 1) is null then
    return jsonb_build_object('added', 0, 'opened', 0, 'skipped', v_skipped, 'notified', 0);
  end if;

  -- Chốt lại: sinh ca mở (plan_id = kế hoạch ⇒ không thành ca tăng cường) cho các dòng vừa thêm.
  perform lock_month_plan(p_plan_id);
  update shift_slots s set signup_deadline = p_deadline
    from brand_month_plan_slots ps
   where ps.id = any(v_ids) and ps.slot_id = s.id and s.status = 'open' and s.session_id is null;
  get diagnostics v_opened = row_count;

  if v_opened > 0 then
    select name into v_brand from brands where id = v_plan.brand_id;
    select array_agg(distinct t) into v_targets from (
      select ls.host_id as t from live_sessions ls
       where ls.brand_id = v_plan.brand_id and ls.platform::text = coalesce(v_plan.platform, 'TikTok')
         and ls.status <> 'Cancelled' and ls.date >= v_today - 90
      union
      select ls.co_host_id from live_sessions ls
       where ls.brand_id = v_plan.brand_id and ls.platform::text = coalesce(v_plan.platform, 'TikTok')
         and ls.status <> 'Cancelled' and ls.date >= v_today - 90
    ) x where t is not null;
    insert into notifications (user_id, kind, title, body, session_id, brand_id)
    select p.id, 'signup_open',
      'Ca bổ sung ' || coalesce(v_brand, '') || ' ' || coalesce(v_plan.platform, 'TikTok') || ' tháng ' || to_char(v_plan.month, 'MM/YYYY'),
      v_opened || ' ca mới cần người. Hạn đăng ký: ' || to_char(p_deadline at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
        || '. Vào Đăng Ký Ca để chọn ca bạn làm được.',
      null, v_plan.brand_id
    from profiles p
    where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null
      and (coalesce(array_length(v_targets, 1), 0) = 0 or p.assigned_talent_id = any(v_targets));
    get diagnostics v_sent = row_count;
  end if;

  return jsonb_build_object('added', array_length(v_ids, 1), 'opened', v_opened, 'skipped', v_skipped, 'notified', v_sent);
end;
$$;
revoke all on function public.open_extra_plan_slots(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.open_extra_plan_slots(uuid, jsonb, timestamptz) to authenticated;

-- ===== Chốt tự kiểm =====
do $$
begin
  if position('signup_deadline_2' in pg_get_functiondef('private.slot_open_for_registration(uuid, boolean)'::regprocedure)) = 0
     or position('s.signup_deadline is not null' in pg_get_functiondef('private.slot_open_for_registration(uuid, boolean)'::regprocedure)) = 0 then
    raise exception '0200 chốt 1: slot_open_for_registration chưa xét hạn đợt 2 / hạn riêng của ca';
  end if;
  if position('roster_staff_guard' in pg_get_functiondef('public.set_roster_month_milestones(date, timestamptz, timestamptz, date, date)'::regprocedure)) = 0
     or position('roster_staff_guard' in pg_get_functiondef('public.open_extra_plan_slots(uuid, jsonb, timestamptz)'::regprocedure)) = 0 then
    raise exception '0200 chốt 2: RPC mới thiếu kiểm quyền';
  end if;
end $$;
