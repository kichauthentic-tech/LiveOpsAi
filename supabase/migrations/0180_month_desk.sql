-- 0180 — Điều Phối Lịch Live đợt 2 (24/10, user chốt khi duyệt đề xuất https://claude.ai/artifact/Rjp94U78WQfT1UehDwAPNX):
--   * trainer LẬP + CHỐT Kế Hoạch Tháng (trước chỉ đọc), đọc cam kết tháng / hợp đồng / sổ dự báo, sửa cam kết tháng;
--   * một HẠN ĐĂNG KÝ cho cả THÁNG (trước theo tuần — app talent đăng ký theo tháng từ 16/10);
--   * giao ca ghi LÝ DO TẮT SỚM (đo T10: 29/224 ca tắt sớm > 15 phút, GMV/giờ 0,67× kênh — cần biết phần nào là bán kém).
-- Chạy SAU 0176. Chạy được trước hoặc sau deploy client (client tự suy manage_month_plan từ manage_sessions khi DB chưa có key;
-- client mới gọi submit_file_handover có p_early_leave_reason — DB cũ chưa có tham số đó sẽ báo lỗi ⇒ nên chạy TRƯỚC deploy).
--
-- Phần 1  role_permissions: key mới manage_month_plan (gate DUY NHẤT mục menu "Kế Hoạch Tháng") = ceo/admin/operations/trainer.
-- Phần 2  RLS: thêm trainer vào đúng 7 policy liệt kê (kế hoạch, ca kế hoạch, cam kết tháng: ghi; hợp đồng, sổ dự báo, nhật ký chia
--         target: đọc; quy tắc lặp: ghi). Không đụng promo_schemes, calendar_events, hợp đồng (ghi), đối soát, report.
-- Phần 3  RPC nhận trainer: lock_month_plan, delete_month_plan, set_boost_targets, record_forecast_snapshots.
--         KHÔNG đổi: rebase_month_plan / retarget_month_plan (chia lại target kế hoạch đã chốt — vẫn chỉ ceo/admin),
--         generate_contract_commitments (CRM).
-- Phần 4  roster_months + set_roster_month_deadline; private.slot_open_for_registration xét hạn THÁNG (hạn tuần cũ vẫn xét — không còn UI).
-- Phần 5  live_session_reports.early_leave_reason + submit_file_handover thêm p_early_leave_reason (drop chữ ký cũ + create).
-- Phần 6  Chốt tự kiểm.

-- ===== Phần 1 =====
update public.role_permissions
   set permissions = permissions || jsonb_build_object('manage_month_plan', role::text in ('ceo', 'admin', 'operations', 'trainer'))
 where not (permissions ? 'manage_month_plan');

-- ===== Phần 2 — RLS, liệt kê tường minh (định nghĩa lấy từ pg_policies của bản replay 0001->0179, chỉ thêm 'trainer') =====
alter policy brand_month_plans_write_ceo_ops on public.brand_month_plans
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])))
  with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy brand_month_plan_slots_write_ceo_ops on public.brand_month_plan_slots
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])))
  with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy brand_monthly_commitments_ceo_admin_ops on public.brand_monthly_commitments
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'admin'::user_role, 'operations'::user_role, 'trainer'::user_role])))
  with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'admin'::user_role, 'operations'::user_role, 'trainer'::user_role])));
alter policy forecast_snapshots_read_staff on public.forecast_snapshots
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy plan_target_audit_read_staff on public.plan_target_audit
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
alter policy recurring_shift_templates_write_ceo_ops on public.recurring_shift_templates
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])))
  with check ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role])));
-- Hợp đồng: trainer chỉ ĐỌC (giờ cam kết mặc định của tháng). Ghi hợp đồng vẫn ở CRM, ceo/admin/operations.
drop policy if exists brand_contracts_read_trainer on public.brand_contracts;
create policy brand_contracts_read_trainer on public.brand_contracts for select
  using ((( SELECT current_user_role() AS current_user_role) = 'trainer'::user_role));

-- ===== Phần 3 — RPC nhận trainer (sửa đúng chuỗi guard, thân hàm còn lại giữ nguyên) =====
do $$
declare
  r record;
  def text;
begin
  for r in
    select * from (values
      ('lock_month_plan',          'not in (''ceo'', ''admin'', ''operations'')',  'not in (''ceo'', ''admin'', ''operations'', ''trainer'')'),
      ('delete_month_plan',        'not in (''ceo'', ''admin'', ''operations'')',  'not in (''ceo'', ''admin'', ''operations'', ''trainer'')'),
      ('set_boost_targets',        'not in (''ceo'', ''admin'', ''operations'')',  'not in (''ceo'', ''admin'', ''operations'', ''trainer'')'),
      ('record_forecast_snapshots','not in (''ceo'', ''operations'', ''admin'')',  'not in (''ceo'', ''operations'', ''admin'', ''trainer'')')
    ) v(fn, pat, rep)
  loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.fn;
    if def is null then
      raise exception '0180: không thấy hàm %', r.fn;
    end if;
    if position(r.rep in def) > 0 then
      continue; -- đã chạy rồi
    end if;
    if (length(def) - length(replace(def, r.pat, ''))) / length(r.pat) <> 1 then
      raise exception '0180: guard của % không đúng dạng mong đợi — kiểm tay trước khi chạy', r.fn;
    end if;
    execute replace(def, r.pat, r.rep);
  end loop;
end $$;

-- ===== Phần 4 — hạn đăng ký theo THÁNG =====
-- Một dòng mỗi tháng (ngày 1). Chưa có dòng = tháng chưa đặt hạn.
create table if not exists public.roster_months (
  month date primary key check (extract(day from month) = 1),
  signup_deadline timestamptz,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.roster_months enable row level security;
revoke all on public.roster_months from anon;
grant select on public.roster_months to authenticated;
drop policy if exists roster_months_read on public.roster_months;
create policy roster_months_read on public.roster_months for select
  using ((( SELECT current_user_role() AS current_user_role) = ANY (ARRAY['ceo'::user_role, 'operations'::user_role, 'admin'::user_role, 'trainer'::user_role, 'talent'::user_role])));
-- Không có policy ghi: đặt hạn chỉ qua RPC (có guard + thông báo).

-- Ca còn mở đăng ký: ca mở, chưa chốt, (tuỳ) chưa qua ngày, chưa qua hạn THÁNG và chưa qua hạn TUẦN (0176, không còn UI đặt).
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
         select 1 from roster_months m
          where m.month = date_trunc('month', s.date::timestamp)::date
            and m.signup_deadline is not null
            and m.signup_deadline <= now()
       )
       and not exists (
         select 1 from roster_weeks w
          where w.week_start = s.date - (extract(isodow from s.date)::int - 1)
            and w.signup_deadline is not null
            and w.signup_deadline <= now()
       )
  )
$$;
revoke all on function private.slot_open_for_registration(uuid, boolean) from public;

create or replace function public.set_roster_month_deadline(p_month date, p_deadline timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old roster_months;
  v_open int;
  v_sent int := 0;
begin
  perform private.roster_staff_guard();
  if p_month is null or extract(day from p_month) <> 1 then
    raise exception 'Tháng phải là ngày 1.';
  end if;
  select * into v_old from roster_months where month = p_month for update;

  insert into roster_months (month, signup_deadline, updated_by, updated_at)
  values (p_month, p_deadline, auth.uid(), now())
  on conflict (month) do update
    set signup_deadline = excluded.signup_deadline, updated_by = excluded.updated_by, updated_at = now();

  -- Báo talent khi đặt (hoặc đổi) một hạn còn ở tương lai và tháng còn ca mở. Đếm trước khi bắn; mỗi người MỘT tin.
  if p_deadline is not null and p_deadline > now()
     and p_deadline is distinct from v_old.signup_deadline then
    select count(*) into v_open from shift_slots
     where date >= p_month and date < (p_month + interval '1 month')::date
       and status = 'open' and session_id is null
       and date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date;
    if v_open > 0 then
      insert into notifications (user_id, kind, title, body, session_id, brand_id)
      select p.id, 'signup_open',
        'Mở đăng ký ca tháng ' || to_char(p_month, 'MM/YYYY'),
        v_open || ' ca đang chờ. Hạn đăng ký: '
          || to_char(p_deadline at time zone 'Asia/Ho_Chi_Minh', 'HH24:MI DD/MM')
          || '. Vào Đăng Ký Ca để chọn ca bạn làm được.',
        null, null
      from profiles p
      where p.role = 'talent' and p.status = 'Active' and p.assigned_talent_id is not null;
      get diagnostics v_sent = row_count;
    end if;
  end if;
  return jsonb_build_object('notified', v_sent, 'open_slots', coalesce(v_open, 0));
end;
$$;
revoke all on function public.set_roster_month_deadline(date, timestamptz) from public;
grant execute on function public.set_roster_month_deadline(date, timestamptz) to authenticated;

-- ===== Phần 5 — lý do tắt sớm =====
alter table public.live_session_reports add column if not exists early_leave_reason text;
alter table public.live_session_reports drop constraint if exists live_session_reports_early_leave_reason_check;
alter table public.live_session_reports add constraint live_session_reports_early_leave_reason_check
  check (early_leave_reason is null or early_leave_reason in ('low_sales', 'technical', 'staff', 'brand', 'other'));
comment on column public.live_session_reports.early_leave_reason is
  '0180 — lý do off sớm khai lúc giao ca: low_sales (bán kém) / technical (sự cố kỹ thuật) / staff (host, trợ) / brand (brand yêu cầu) / other. NULL khi không off sớm.';

drop function if exists public.submit_file_handover(uuid, integer, integer, integer, boolean, text);
create or replace function public.submit_file_handover(
  p_session_id uuid,
  p_ot_minutes integer default 0,
  p_early_leave_minutes integer default 0,
  p_restart_count integer default 0,
  p_host_late boolean default false,
  p_status_note text default '',
  p_early_leave_reason text default null
)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_reason text := case when coalesce(p_early_leave_minutes, 0) > 0 then nullif(p_early_leave_reason, '') end;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Up file số liệu của ca (%) trước, rồi mới giao ca.',
      case when s.platform::text = 'Shopee' then 'Live List của Shopee' else 'Creator-Live-Performance của TikTok' end using errcode = 'P0001';
  end if;
  if v_reason is not null and v_reason not in ('low_sales', 'technical', 'staff', 'brand', 'other') then
    raise exception 'Lý do off sớm không hợp lệ: %', v_reason using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, early_leave_reason, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0), v_reason,
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    early_leave_reason = excluded.early_leave_reason,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  return s;
end;
$$;
revoke all on function public.submit_file_handover(uuid, integer, integer, integer, boolean, text, text) from public;
grant execute on function public.submit_file_handover(uuid, integer, integer, integer, boolean, text, text) to authenticated;

-- ===== Phần 6 — tự kiểm =====
do $$
declare
  fn text;
begin
  foreach fn in array array['lock_month_plan', 'delete_month_plan', 'set_boost_targets', 'record_forecast_snapshots'] loop
    if position('''trainer''' in (select pg_get_functiondef(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname = fn)) = 0 then
      raise exception '0180 tự kiểm: % chưa nhận trainer', fn;
    end if;
  end loop;
  if (select count(*) from pg_policies where policyname in ('brand_month_plans_write_ceo_ops', 'brand_month_plan_slots_write_ceo_ops',
        'brand_monthly_commitments_ceo_admin_ops', 'forecast_snapshots_read_staff', 'plan_target_audit_read_staff',
        'recurring_shift_templates_write_ceo_ops') and qual like '%trainer%') <> 6 then
    raise exception '0180 tự kiểm: thiếu policy có trainer';
  end if;
  if position('roster_months' in pg_get_functiondef('private.slot_open_for_registration(uuid, boolean)'::regprocedure)) = 0 then
    raise exception '0180 tự kiểm: slot_open_for_registration chưa xét hạn tháng';
  end if;
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'submit_file_handover') <> 1 then
    raise exception '0180 tự kiểm: submit_file_handover còn hai chữ ký';
  end if;
  if exists (select 1 from role_permissions where not (permissions ? 'manage_month_plan')) then
    raise exception '0180 tự kiểm: còn role chưa có manage_month_plan';
  end if;
end $$;
