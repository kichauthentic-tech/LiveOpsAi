-- 0176 — Bàn Trainer: quyền của role trainer, hạn đăng ký theo tuần, xếp nháp, công bố tuần, đổi lịch có lý do.
-- Chạy SAU 0175 (giá trị enum 'trainer' phải được commit trước).
--
-- Quyết định của user (13/10):
--   * trainer là role riêng; thấy rate host/trợ VÀ Finance (chỉ đọc — ghi Finance vẫn ceo/admin);
--   * trainer xếp người, dời giờ ca, thêm/bớt ca (ca thêm sau khi kế hoạch chốt = ca tăng cường 0165, không cộng target tháng);
--   * quy trình tuần: trainer đặt HẠN ĐÓNG ĐĂNG KÝ -> talent báo rảnh tới hạn -> trainer xếp NHÁP (talent/brand không thấy)
--     -> "Công bố tuần": chốt cả tuần trong một transaction, mỗi người MỘT thông báo tóm tắt;
--   * sau công bố, đổi người / dời giờ phải ghi lý do (roster_changes);
--   * luật giờ: quá 48 giờ/tuần CHẶN lúc công bố/đổi người; các luật khác chỉ cảnh báo ở client (ngưỡng ở roster_rules).
--
-- Phần 1  role_permissions: thêm dòng trainer + key mới manage_roster (gate DUY NHẤT mục menu "Bàn Trainer").
-- Phần 2  RLS: thêm trainer vào đúng các policy liệt kê dưới (đọc kế hoạch/kênh/phòng/đoạn người/nhận lịch/giá; ghi ca mở,
--         ca, lượt đăng ký; đọc rate + Finance). Không đụng các bảng đối soát, Dữ Liệu Gốc, report, CRM, hợp đồng.
-- Phần 3  talents_secure: trainer thấy rate.
-- Phần 4  RPC có sẵn nhận trainer: finalize_shift_slot, cancel_session, set_session_staff_segments,
--         bulk_assign_session_hosts, generate_shift_slots; notify_ops gửi cả trainer (báo không đi được).
-- Phần 5  Bảng mới: roster_weeks, roster_drafts, roster_changes, roster_rules.
-- Phần 6  Hạn đăng ký chặn ở DB (private.slot_open_for_registration).
-- Phần 7  Thông báo: 2 loại mới; trigger xếp ca im lặng trong lúc công bố tuần.
-- Phần 8  RPC: set_roster_deadline, publish_roster_week, roster_reassign, roster_move_session.
-- Phần 9  Chốt tự kiểm.

-- ===== Phần 1 =====
insert into public.role_permissions (role, permissions)
values ('trainer', jsonb_build_object(
  'manage_roster', true, 'manage_calendar', true, 'manage_talents', true,
  'manage_sessions', false, 'manage_studios_gear', false, 'manage_crm_projects', false,
  'manage_tiktok_api', false, 'manage_users_permissions', false))
on conflict (role) do nothing;

update public.role_permissions
   set permissions = permissions || jsonb_build_object('manage_roster', role in ('ceo', 'admin', 'operations', 'trainer'))
 where not (permissions ? 'manage_roster');

-- ===== Phần 2 — RLS, liệt kê tường minh (sinh từ pg_policies của bản replay 0001->0175, chỉ thêm 'trainer') =====
alter policy brand_channels_read on public.brand_channels using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (brand_id = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy brand_month_plan_slots_read_scoped on public.brand_month_plan_slots using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (private.month_plan_brand_id(plan_id) = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy brand_month_plans_read_scoped on public.brand_month_plans using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (brand_id = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy brand_platform_rate_history_read_scoped on public.brand_platform_rate_history using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (brand_id = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy brand_platform_rates_read_scoped on public.brand_platform_rates using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (brand_id = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy brand_studios_read_scoped on public.brand_studios using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'brand'::user_role) AND (brand_id = ( SELECT current_user_brand_id() AS current_user_brand_id)))));
alter policy engine_params_read_agency on public.engine_params using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy live_sessions_write_ceo_ops on public.live_sessions using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role]))) with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy plan_boost_slots_read_staff on public.plan_boost_slots using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy session_availability_delete_self_or_ceo_ops on public.session_availability using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((talent_id = ( SELECT current_user_talent_id() AS current_user_talent_id)) AND ( SELECT private.slot_open_for_registration(session_availability.slot_id, false) AS slot_open_for_registration))));
alter policy session_availability_insert_self_or_ceo_ops on public.session_availability with check (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((talent_id = ( SELECT current_user_talent_id() AS current_user_talent_id)) AND ( SELECT private.slot_open_for_registration(session_availability.slot_id, true) AS slot_open_for_registration))));
alter policy session_finance_read_ceo_admin on public.session_finance using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'admin'::user_role, 'trainer'::user_role])));
alter policy session_staff_segments_read on public.session_staff_segments using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'talent'::user_role) AND private.talent_on_session(session_id))));
alter policy shift_acks_read on public.shift_acks using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])) OR ((( SELECT current_user_role() AS current_user_role) = 'talent'::user_role) AND (talent_id = ( SELECT current_user_talent_id() AS current_user_talent_id)))));
alter policy shift_slots_write_ceo_ops on public.shift_slots using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role]))) with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy talent_rate_history_read_ceo_admin_self on public.talent_rate_history using (((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'admin'::user_role, 'trainer'::user_role])) OR (talent_id = ( SELECT current_user_talent_id() AS current_user_talent_id))));

-- ===== Phần 3 — talents_secure: rate hiện cho ceo/admin/trainer + chính chủ (giữ nguyên mọi vế khác) =====
-- 21/10: cùng định nghĩa với 0179 (che SĐT/ngày sinh/GMV/brands_worked_with với role brand; so role bằng ::text) — chạy 0176 trước
-- hay sau 0179 đều ra một view.
create or replace view public.talents_secure as
select
  id,
  name,
  avatar,
  role,
  gender,
  niches,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then avg_gmv_per_session end as avg_gmv_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then total_gmv end as total_gmv,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then ctr_avg end as ctr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then cvr_avg end as cvr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then rate_per_session end as rate_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then commission_rate end as commission_rate,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then overall_score end as overall_score,
  availability_status,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then brands_worked_with end as brands_worked_with,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then phone end as phone,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then date_of_birth end as date_of_birth,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then profile_id end as profile_id,
  created_at,
  updated_at,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then rate_per_hour end as rate_per_hour,
  nickname,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then assistant_rate_per_hour end as assistant_rate_per_hour
from talents;

-- ===== Phần 4 — RPC có sẵn nhận trainer (sửa đúng chuỗi guard, thân hàm còn lại giữ nguyên) =====
do $$
declare
  fn text;
  def text;
  pat constant text := 'not in (''ceo'', ''admin'', ''operations'')';
begin
  foreach fn in array array['finalize_shift_slot', 'cancel_session', 'set_session_staff_segments',
                            'bulk_assign_session_hosts', 'generate_shift_slots'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = fn;
    if def is null then
      raise exception '0176: không thấy hàm %', fn;
    end if;
    if position('''trainer''' in def) > 0 then
      continue; -- đã chạy rồi
    end if;
    if position(pat in def) = 0 then
      raise exception '0176: guard của % không đúng dạng mong đợi — kiểm tay trước khi chạy', fn;
    end if;
    execute replace(def, pat, 'not in (''ceo'', ''admin'', ''operations'', ''trainer'')');
  end loop;
end $$;

-- "Báo không đi được" (0116) là việc của người xếp lịch ⇒ trainer cũng nhận. notify_ops chỉ dùng cho loại đó.
create or replace function public.notify_ops(p_kind text, p_title text, p_body text, p_session_id uuid, p_brand_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, p_kind, p_title, p_body, p_session_id, p_brand_id
  from profiles p
  where p.role in ('ceo', 'operations', 'admin', 'trainer')
    and p.status = 'Active'
    and p.id is distinct from auth.uid();
$$;
revoke all on function public.notify_ops(text, text, text, uuid, uuid) from public;

-- ===== Phần 5 — bảng của Bàn Trainer =====
-- Một dòng mỗi tuần (thứ Hai). Chưa có dòng = tuần chưa đặt hạn, chưa công bố.
create table if not exists public.roster_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),
  signup_deadline timestamptz,
  published_at timestamptz,
  published_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Người xếp NHÁP cho một ca mở (shift_slots status open, chưa có phiên). Talent/brand không đọc được.
create table if not exists public.roster_drafts (
  slot_id uuid primary key references public.shift_slots(id) on delete cascade,
  host_id uuid references public.talents(id) on delete cascade,
  co_host_id uuid references public.talents(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (co_host_id is null or host_id is null or co_host_id <> host_id)
);

-- Nhật ký đổi lịch SAU khi ca đã lên lịch chung (đổi người / dời giờ qua Bàn Trainer). Chỉ ghi qua RPC.
create table if not exists public.roster_changes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.live_sessions(id) on delete set null,
  kind text not null check (kind in ('reassign', 'move')),
  reason text not null check (length(btrim(reason)) > 0),
  before jsonb not null,
  after jsonb not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);
create index if not exists roster_changes_session_idx on public.roster_changes (session_id);

-- Ngưỡng luật lịch, một dòng. max_week_hours là luật CHẶN (công bố/đổi người); còn lại client chỉ cảnh báo.
create table if not exists public.roster_rules (
  id smallint primary key default 1 check (id = 1),
  max_week_hours numeric not null default 48 check (max_week_hours between 1 and 168),
  warn_week_hours numeric not null default 40 check (warn_week_hours between 1 and 168),
  min_rest_hours numeric not null default 10 check (min_rest_hours between 0 and 24),
  late_end_time time not null default '23:00',
  max_day_hours numeric not null default 9 check (max_day_hours between 1 and 24),
  max_streak_days int not null default 6 check (max_streak_days between 1 and 31),
  min_room_change_minutes int not null default 30 check (min_room_change_minutes between 0 and 240),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.roster_rules (id) values (1) on conflict (id) do nothing;

alter table public.roster_weeks enable row level security;
alter table public.roster_drafts enable row level security;
alter table public.roster_changes enable row level security;
alter table public.roster_rules enable row level security;

drop policy if exists roster_weeks_read on public.roster_weeks;
create policy roster_weeks_read on public.roster_weeks for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer', 'talent'));
-- Không có policy ghi: đặt hạn và công bố chỉ qua RPC (có guard + thông báo).

drop policy if exists roster_drafts_staff on public.roster_drafts;
create policy roster_drafts_staff on public.roster_drafts for all
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'));

drop policy if exists roster_changes_read on public.roster_changes;
create policy roster_changes_read on public.roster_changes for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'));

drop policy if exists roster_rules_read on public.roster_rules;
create policy roster_rules_read on public.roster_rules for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'));
drop policy if exists roster_rules_update on public.roster_rules;
create policy roster_rules_update on public.roster_rules for update
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'))
  with check ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer'));

grant select on public.roster_weeks, public.roster_changes to authenticated;
grant select, insert, update, delete on public.roster_drafts to authenticated;
grant select, update on public.roster_rules to authenticated;

-- ===== Phần 6 — hạn đăng ký: qua hạn thì talent không báo rảnh / rút đăng ký được nữa (ops/trainer vẫn sửa hộ) =====
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
       and not exists (
         select 1 from roster_weeks w
          where w.week_start = s.date - (extract(isodow from s.date)::int - 1)
            and w.signup_deadline is not null
            and w.signup_deadline <= now()
       )
  )
$$;
revoke all on function private.slot_open_for_registration(uuid, boolean) from public;

-- ===== Phần 7 — thông báo =====
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'shift_assigned', 'shift_unassigned', 'shift_time_changed', 'shift_cancelled', 'report_reconciled',
  'shift_open', 'shift_dropout_request', 'handover_due', 'roster_published', 'signup_open']));

-- Lúc công bố tuần, trigger xếp ca không bắn "Bạn được xếp làm Host" từng ca — publish_roster_week gửi một tin tóm tắt.
do $$
declare
  def text;
  pat constant text := 'if v_future and new.status <> ''Cancelled'' then';
begin
  select pg_get_functiondef('public.notify_session_changes'::regproc) into def;
  if position('app.roster_publish' in def) > 0 then
    return;
  end if;
  if (length(def) - length(replace(def, pat, ''))) / length(pat) <> 1 then
    raise exception '0176: notify_session_changes không đúng dạng mong đợi — kiểm tay';
  end if;
  execute replace(def, pat,
    'if v_future and new.status <> ''Cancelled'' and coalesce(current_setting(''app.roster_publish'', true), '''') <> ''1'' then');
end $$;

-- ===== Phần 8 — RPC =====
create or replace function private.roster_hours(p_start time, p_end time)
returns numeric
language sql
immutable
as $$
  select (extract(epoch from (p_end - p_start)) / 3600.0)
         + case when p_end <= p_start then 24 else 0 end
$$;

create or replace function private.roster_staff_guard()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations', 'trainer') then
    raise exception 'Chỉ người xếp lịch (ceo/admin/vận hành/trainer) được làm việc này' using errcode = '42501';
  end if;
end;
$$;
revoke all on function private.roster_staff_guard() from public;

-- Giờ theo lịch của một người trong tuần (host + trợ, ca không huỷ), có thể bỏ một ca ra khỏi phép cộng.
create or replace function private.roster_week_hours(p_talent uuid, p_week_start date, p_skip_session uuid default null)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(private.roster_hours(s.start_time, s.end_time)), 0)
    from live_sessions s
   where s.date between p_week_start and p_week_start + 6
     and s.status <> 'Cancelled'
     and (s.host_id = p_talent or s.co_host_id = p_talent)
     and (p_skip_session is null or s.id <> p_skip_session)
$$;
revoke all on function private.roster_week_hours(uuid, date, uuid) from public;

create or replace function public.set_roster_deadline(p_week_start date, p_deadline timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old roster_weeks;
  v_open int;
  v_sent int := 0;
begin
  perform private.roster_staff_guard();
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Tuần phải bắt đầu từ thứ Hai.';
  end if;
  select * into v_old from roster_weeks where week_start = p_week_start for update;
  if v_old.published_at is not null then
    raise exception 'Tuần % đã công bố — không đổi hạn đăng ký nữa.', to_char(p_week_start, 'DD/MM');
  end if;

  insert into roster_weeks (week_start, signup_deadline, updated_by, updated_at)
  values (p_week_start, p_deadline, auth.uid(), now())
  on conflict (week_start) do update
    set signup_deadline = excluded.signup_deadline, updated_by = excluded.updated_by, updated_at = now();

  -- Báo talent khi đặt (hoặc đổi) một hạn còn ở tương lai và tuần còn ca mở. Đếm trước khi bắn.
  if p_deadline is not null and p_deadline > now()
     and p_deadline is distinct from v_old.signup_deadline then
    select count(*) into v_open from shift_slots
     where date between p_week_start and p_week_start + 6
       and status = 'open' and session_id is null
       and date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date;
    if v_open > 0 then
      insert into notifications (user_id, kind, title, body, session_id, brand_id)
      select p.id, 'signup_open',
        'Mở đăng ký tuần ' || to_char(p_week_start, 'DD/MM') || '–' || to_char(p_week_start + 6, 'DD/MM'),
        v_open || ' ca đang chờ. Hạn báo rảnh: '
          || to_char(p_deadline at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
          || '. Vào Đăng Ký Ca để báo ca bạn rảnh.',
        null, null
      from profiles p
      where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null;
      get diagnostics v_sent = row_count;
    end if;
  end if;
  return jsonb_build_object('notified', v_sent);
end;
$$;
revoke all on function public.set_roster_deadline(date, timestamptz) from public;
grant execute on function public.set_roster_deadline(date, timestamptz) to authenticated;

create or replace function public.publish_roster_week(p_week_start date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_end date := p_week_start + 6;
  v_max numeric;
  v_slots uuid[];
  v_bad text;
  v_over text;
  v_sid uuid;
  v_n int := 0;
  v_sent int := 0;
  r record;
begin
  perform private.roster_staff_guard();
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'Tuần phải bắt đầu từ thứ Hai.';
  end if;
  insert into roster_weeks (week_start, updated_by) values (p_week_start, auth.uid()) on conflict (week_start) do nothing;
  perform 1 from roster_weeks where week_start = p_week_start for update;
  select max_week_hours into v_max from roster_rules where id = 1;
  v_max := coalesce(v_max, 48);

  -- Ca nháp sẽ được chốt: ca mở (chưa có phiên) của tuần có người nháp.
  select array_agg(d.slot_id order by s.date, s.start_time) into v_slots
    from roster_drafts d join shift_slots s on s.id = d.slot_id
   where s.date between p_week_start and v_end and s.status = 'open' and s.session_id is null;

  select string_agg(to_char(s.date, 'DD/MM') || ' ' || to_char(s.start_time, 'HH24:MI') || ' ' || coalesce(s.brand_name, ''), ', ')
    into v_bad
    from roster_drafts d join shift_slots s on s.id = d.slot_id
   where d.slot_id = any (coalesce(v_slots, '{}')) and d.host_id is null;
  if v_bad is not null then
    raise exception 'Ca nháp chưa có host: %. Xếp host hoặc bỏ nháp của ca đó rồi công bố lại.', v_bad;
  end if;

  -- Luật chặn: quá max_week_hours giờ/tuần (ca đã lên lịch + ca nháp sắp chốt).
  with h as (
    select x.tid, sum(x.hours) as hours from (
      select s.host_id as tid, private.roster_hours(s.start_time, s.end_time) as hours
        from live_sessions s where s.date between p_week_start and v_end and s.status <> 'Cancelled' and s.host_id is not null
      union all
      select s.co_host_id, private.roster_hours(s.start_time, s.end_time)
        from live_sessions s where s.date between p_week_start and v_end and s.status <> 'Cancelled' and s.co_host_id is not null
      union all
      select d.host_id, private.roster_hours(s.start_time, s.end_time)
        from roster_drafts d join shift_slots s on s.id = d.slot_id where d.slot_id = any (coalesce(v_slots, '{}'))
      union all
      select d.co_host_id, private.roster_hours(s.start_time, s.end_time)
        from roster_drafts d join shift_slots s on s.id = d.slot_id where d.slot_id = any (coalesce(v_slots, '{}')) and d.co_host_id is not null
    ) x group by x.tid
  )
  select string_agg(coalesce(nullif(t.nickname, ''), t.name) || ' ' || to_char(h.hours, 'FM990.0') || ' giờ', ', ')
    into v_over
    from h join talents t on t.id = h.tid
   where h.hours > v_max;
  if v_over is not null then
    raise exception 'Quá % giờ/tuần: %. Bớt ca của người đó rồi công bố lại.', v_max, v_over;
  end if;

  perform set_config('app.roster_publish', '1', true);
  for r in
    select d.slot_id, d.host_id, d.co_host_id
      from roster_drafts d join shift_slots s on s.id = d.slot_id
     where d.slot_id = any (coalesce(v_slots, '{}'))
     order by s.date, s.start_time
  loop
    -- finalize_shift_slot: một ca = một phiên, khoá dòng slot; trigger 0143 chặn trùng người ⇒ lỗi là huỷ cả lần công bố.
    perform finalize_shift_slot(r.slot_id, r.host_id, r.co_host_id);
    v_n := v_n + 1;
  end loop;
  perform set_config('app.roster_publish', '', true);

  -- Mỗi người một tin: danh sách ca vừa chốt của họ trong tuần.
  insert into notifications (user_id, kind, title, body, session_id, brand_id)
  select p.id, 'roster_published',
    'Lịch tuần ' || to_char(p_week_start, 'DD/MM') || '–' || to_char(v_end, 'DD/MM') || ' đã công bố',
    'Bạn có ' || count(*) || ' ca: '
      || left(string_agg(x.line, '; ' order by x.date, x.start_time), 900)
      || '. Mở Hôm Nay để bấm "Đã nhận".',
    null, null
  from (
    select d.host_id as tid, s.date, s.start_time,
           to_char(s.date, 'DD/MM') || ' ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI')
             || ' ' || coalesce(s.brand_name, '') || coalesce(' ' || nullif(s.platform, 'TikTok'), '') || ' (Host)' as line
      from roster_drafts d join shift_slots s on s.id = d.slot_id where d.slot_id = any (coalesce(v_slots, '{}'))
    union all
    select d.co_host_id, s.date, s.start_time,
           to_char(s.date, 'DD/MM') || ' ' || to_char(s.start_time, 'HH24:MI') || '–' || to_char(s.end_time, 'HH24:MI')
             || ' ' || coalesce(s.brand_name, '') || coalesce(' ' || nullif(s.platform, 'TikTok'), '') || ' (Trợ live)'
      from roster_drafts d join shift_slots s on s.id = d.slot_id where d.slot_id = any (coalesce(v_slots, '{}')) and d.co_host_id is not null
  ) x
  join profiles p on p.assigned_talent_id = x.tid and p.role = 'talent' and p.status = 'Active'
  group by p.id;
  get diagnostics v_sent = row_count;

  delete from roster_drafts where slot_id = any (coalesce(v_slots, '{}'));
  update roster_weeks set published_at = now(), published_by = auth.uid(), updated_by = auth.uid(), updated_at = now()
   where week_start = p_week_start;

  return jsonb_build_object('published', v_n, 'notified', v_sent);
end;
$$;
revoke all on function public.publish_roster_week(date) from public;
grant execute on function public.publish_roster_week(date) to authenticated;

-- Đổi người của một ca đã lên lịch (từ Bàn Trainer). Bắt buộc lý do; chặn quá max_week_hours; ca đã chia đoạn người
-- (0138) phải sửa ở Cửa sổ Ca Live vì đoạn quyết định ai đứng bao lâu.
create or replace function public.roster_reassign(p_session_id uuid, p_host_id uuid, p_co_host_id uuid, p_reason text)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_week date;
  v_max numeric;
  v_h numeric := 0;
  v_host text;
  v_co text := '';
  v_row live_sessions;
  v_tid uuid;
begin
  perform private.roster_staff_guard();
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Ghi lý do đổi người.';
  end if;
  if p_host_id is null then
    raise exception 'Ca phải có host.';
  end if;
  if p_co_host_id is not null and p_co_host_id = p_host_id then
    raise exception 'Host và Trợ live phải là hai người khác nhau.';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ.';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca ngày đã qua — sửa người ở Cửa sổ Ca Live / Sổ Ca.';
  end if;
  if exists (select 1 from session_staff_segments where session_id = p_session_id) then
    raise exception 'Ca này đã chia đoạn người đứng — đổi ở Cửa sổ Ca Live.';
  end if;

  v_week := v_s.date - (extract(isodow from v_s.date)::int - 1);
  select max_week_hours into v_max from roster_rules where id = 1;
  v_max := coalesce(v_max, 48);
  foreach v_tid in array array_remove(array[p_host_id, p_co_host_id], null) loop
    if v_tid is distinct from v_s.host_id and v_tid is distinct from v_s.co_host_id then
      v_h := private.roster_week_hours(v_tid, v_week, p_session_id) + private.roster_hours(v_s.start_time, v_s.end_time);
      if v_h > v_max then
        raise exception '% sẽ có % giờ trong tuần (tối đa %).',
          (select coalesce(nullif(nickname, ''), name) from talents where id = v_tid), to_char(v_h, 'FM990.0'), v_max;
      end if;
    end if;
  end loop;

  select name into v_host from talents where id = p_host_id;
  if v_host is null then
    raise exception 'Không thấy host %', p_host_id;
  end if;
  if p_co_host_id is not null then
    select name into v_co from talents where id = p_co_host_id;
    if v_co is null then
      raise exception 'Không thấy trợ live %', p_co_host_id;
    end if;
  end if;

  update live_sessions
     set host_id = p_host_id, host_name = v_host, co_host_id = p_co_host_id, co_host_name = coalesce(v_co, '')
   where id = p_session_id
  returning * into v_row;

  insert into roster_changes (session_id, kind, reason, before, after, changed_by)
  values (p_session_id, 'reassign', btrim(p_reason),
    jsonb_build_object('host_id', v_s.host_id, 'host_name', v_s.host_name, 'co_host_id', v_s.co_host_id, 'co_host_name', v_s.co_host_name),
    jsonb_build_object('host_id', p_host_id, 'host_name', v_host, 'co_host_id', p_co_host_id, 'co_host_name', v_co),
    auth.uid());
  return v_row;
end;
$$;
revoke all on function public.roster_reassign(uuid, uuid, uuid, text) from public;
grant execute on function public.roster_reassign(uuid, uuid, uuid, text) to authenticated;

-- Dời ngày/giờ một ca đã lên lịch. Ca đã có số thì không dời (cùng luật màn Lịch); trùng người/phòng do trigger chặn.
create or replace function public.roster_move_session(p_session_id uuid, p_date date, p_start time, p_end time, p_reason text)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_row live_sessions;
  v_week date := p_date - (extract(isodow from p_date)::int - 1);
  v_max numeric;
  v_h numeric;
  v_tid uuid;
begin
  perform private.roster_staff_guard();
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Ghi lý do dời ca.';
  end if;
  if p_date is null or p_start is null or p_end is null or p_start = p_end then
    raise exception 'Giờ ca không hợp lệ.';
  end if;
  if p_date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Không dời ca sang ngày đã qua.';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ.';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca ngày đã qua — không dời.';
  end if;
  -- Cùng luật hasSessionData (lib/sessionStatus.ts): nguồn số trên bậc 'manual', hoặc đã có GMV / lượt xem.
  if coalesce(v_s.data_source, 'manual') <> 'manual' or coalesce(v_s.actual_gmv, 0) > 0 or coalesce(v_s.total_views, 0) > 0 then
    raise exception 'Ca đã có số — không dời giờ.';
  end if;

  select max_week_hours into v_max from roster_rules where id = 1;
  v_max := coalesce(v_max, 48);
  foreach v_tid in array array_remove(array[v_s.host_id, v_s.co_host_id], null) loop
    v_h := private.roster_week_hours(v_tid, v_week, p_session_id) + private.roster_hours(p_start, p_end);
    if v_h > v_max then
      raise exception '% sẽ có % giờ trong tuần (tối đa %).',
        (select coalesce(nullif(nickname, ''), name) from talents where id = v_tid), to_char(v_h, 'FM990.0'), v_max;
    end if;
  end loop;

  update live_sessions set date = p_date, start_time = p_start, end_time = p_end
   where id = p_session_id
  returning * into v_row;

  insert into roster_changes (session_id, kind, reason, before, after, changed_by)
  values (p_session_id, 'move', btrim(p_reason),
    jsonb_build_object('date', v_s.date, 'start_time', v_s.start_time, 'end_time', v_s.end_time),
    jsonb_build_object('date', p_date, 'start_time', p_start, 'end_time', p_end),
    auth.uid());
  return v_row;
end;
$$;
revoke all on function public.roster_move_session(uuid, date, time, time, text) from public;
grant execute on function public.roster_move_session(uuid, date, time, time, text) to authenticated;

-- ===== Phần 9 — chốt tự kiểm =====
do $$
declare
  fn text;
begin
  foreach fn in array array['finalize_shift_slot', 'cancel_session', 'set_session_staff_segments',
                            'bulk_assign_session_hosts', 'generate_shift_slots'] loop
    if position('''trainer''' in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                    where n.nspname = 'public' and p.proname = fn)) = 0 then
      raise exception '0176 tự kiểm: % chưa nhận trainer', fn;
    end if;
  end loop;
  if position('app.roster_publish' in pg_get_functiondef('public.notify_session_changes'::regproc)) = 0 then
    raise exception '0176 tự kiểm: notify_session_changes chưa có cờ công bố';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and (coalesce(qual, '') || coalesce(with_check, '')) like '%trainer%') < 16 then
    raise exception '0176 tự kiểm: thiếu policy có trainer';
  end if;
  if position('trainer' in pg_get_viewdef('public.talents_secure')) = 0 then
    raise exception '0176 tự kiểm: talents_secure chưa cho trainer thấy rate';
  end if;
  if not exists (select 1 from role_permissions where role = 'trainer') then
    raise exception '0176 tự kiểm: thiếu dòng role_permissions của trainer';
  end if;
end $$;
