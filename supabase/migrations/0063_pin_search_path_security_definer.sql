-- FIX L10 (audit 2026-08-21): 4 hàm SECURITY DEFINER không set search_path — sync_profile_email
-- (0047), trg_talent_rate_history (0055), submit_live_session_report (0061, bản mới nhất — đổi
-- chữ ký ở 0055/0057), apply_tiktok_reconciliation (0060, bản mới nhất). SECURITY DEFINER chạy
-- với quyền của người TẠO hàm, không phải người gọi — nếu không cố định search_path, một session
-- nào đó tự đổi search_path (ví dụ tạo schema trùng tên rồi trỏ search_path vào trước public) có
-- thể khiến hàm gọi nhầm bảng/hàm giả mạo thay vì đúng bảng trong public, chiếm quyền SECURITY
-- DEFINER. Đây là lỗ hổng "search_path hijack" kinh điển của Postgres — cách vá là cố định cứng
-- `set search_path = public` ngay trên hàm, đúng pattern đã dùng cho handle_new_user ở migration
-- 0002. Chữ ký (tham số/kiểu trả về) giữ nguyên y hệt bản mới nhất của từng hàm nên create or
-- replace thay thế trực tiếp, không cần drop.

create or replace function sync_profile_email() returns trigger as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function trg_talent_rate_history() returns trigger as $$
declare
  open_row talent_rate_history%rowtype;
begin
  if tg_op = 'INSERT' then
    insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, effective_from)
    values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, current_date);
    return new;
  end if;

  if new.rate_per_session is distinct from old.rate_per_session
     or new.commission_rate is distinct from old.commission_rate
     or new.rate_per_hour is distinct from old.rate_per_hour then
    select * into open_row from talent_rate_history
      where talent_id = new.id and effective_to is null
      order by effective_from desc limit 1;

    if open_row.id is not null and open_row.effective_from = current_date then
      update talent_rate_history
        set rate_per_session = new.rate_per_session,
            commission_rate = new.commission_rate,
            rate_per_hour = new.rate_per_hour
        where id = open_row.id;
    else
      if open_row.id is not null then
        update talent_rate_history set effective_to = current_date - 1 where id = open_row.id;
      end if;
      insert into talent_rate_history (talent_id, rate_per_session, commission_rate, rate_per_hour, effective_from)
        values (new.id, new.rate_per_session, new.commission_rate, new.rate_per_hour, current_date);
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function submit_live_session_report(
  p_session_id uuid,
  p_actual_gmv numeric,
  p_total_orders int,
  p_total_views int,
  p_ctr_avg numeric,
  p_avg_watch_time_seconds int,
  p_restart_count int,
  p_cross_live boolean,
  p_host_late boolean,
  p_status_note text,
  p_gmv_total numeric,
  p_dashboard_link_1 text,
  p_dashboard_link_2 text,
  p_impression_count bigint,
  p_ads_cost numeric,
  p_enter_room_rate numeric,
  p_ctor numeric,
  p_avg_order_value numeric,
  p_atc_count int,
  p_gpm numeric,
  p_checkout_count int,
  p_coin_spent numeric,
  p_ot_minutes int,
  p_early_leave_minutes int
) returns live_sessions as $$
declare
  v_session live_sessions;
  v_role user_role := current_user_role();
  v_talent_id uuid := current_user_talent_id();
begin
  select * into v_session from live_sessions where id = p_session_id;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  if v_role = 'talent' then
    if v_talent_id is null
        or (v_session.host_id is distinct from v_talent_id and v_session.co_host_id is distinct from v_talent_id) then
      raise exception 'not authorized to submit report for this session';
    end if;
  elsif v_role not in ('ceo', 'operations', 'admin') then
    raise exception 'not authorized to submit session report';
  end if;

  update live_sessions set
    actual_gmv = coalesce(p_actual_gmv, actual_gmv),
    total_orders = coalesce(p_total_orders, total_orders),
    total_views = coalesce(p_total_views, total_views),
    ctr_avg = coalesce(p_ctr_avg, ctr_avg),
    avg_watch_time_seconds = coalesce(p_avg_watch_time_seconds, avg_watch_time_seconds),
    data_source = 'manual',
    reconciled_at = null
  where id = p_session_id
  returning * into v_session;

  insert into live_session_reports (
    session_id, restart_count, cross_live, host_late, status_note, gmv_total,
    dashboard_link_1, dashboard_link_2, impression_count, ads_cost, enter_room_rate, ctor,
    avg_order_value, atc_count, gpm, checkout_count, coin_spent,
    ot_minutes, early_leave_minutes,
    submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    p_session_id, coalesce(p_restart_count, 0), coalesce(p_cross_live, false), coalesce(p_host_late, false),
    coalesce(p_status_note, ''), p_gmv_total, p_dashboard_link_1, p_dashboard_link_2,
    p_impression_count, p_ads_cost, p_enter_room_rate, p_ctor, p_avg_order_value,
    p_atc_count, p_gpm, p_checkout_count, p_coin_spent,
    greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    v_talent_id, v_role, now(), now()
  )
  on conflict (session_id) do update set
    restart_count = excluded.restart_count,
    cross_live = excluded.cross_live,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    gmv_total = excluded.gmv_total,
    dashboard_link_1 = excluded.dashboard_link_1,
    dashboard_link_2 = excluded.dashboard_link_2,
    impression_count = excluded.impression_count,
    ads_cost = excluded.ads_cost,
    enter_room_rate = excluded.enter_room_rate,
    ctor = excluded.ctor,
    avg_order_value = excluded.avg_order_value,
    atc_count = excluded.atc_count,
    gpm = excluded.gpm,
    checkout_count = excluded.checkout_count,
    coin_spent = excluded.coin_spent,
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  return v_session;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function apply_tiktok_reconciliation(p_import_row_id uuid, p_session_id uuid)
returns live_sessions as $$
declare
  v_row tiktok_live_import_rows;
  v_session live_sessions;
  v_delta numeric;
  v_manual_start timestamptz;
  v_manual_minutes int;
  v_tiktok_minutes int;
  v_start_delta int;
  v_duration_delta int;
  v_reasons text[] := '{}';
  v_th record;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to reconcile sessions';
  end if;

  select * into v_row from tiktok_live_import_rows where id = p_import_row_id;
  if not found then
    raise exception 'tiktok_live_import_rows row % not found', p_import_row_id;
  end if;

  select * into v_session from live_sessions where id = p_session_id;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  select * into v_th from reconciliation_thresholds();

  v_delta := case when coalesce(v_session.actual_gmv, 0) = 0 then null
    else round(((v_row.gmv - v_session.actual_gmv) / v_session.actual_gmv) * 100, 2) end;

  -- live_sessions.date/start_time/end_time là wall-clock VN (không kèm offset) nên phải gắn
  -- Asia/Ho_Chi_Minh trước khi so với v_row.start_time (timestamptz thật).
  v_manual_start := (v_session.date + v_session.start_time) at time zone 'Asia/Ho_Chi_Minh';

  -- Ca qua nửa đêm (end < start) tính sang ngày hôm sau thay vì ra thời lượng âm.
  v_manual_minutes := case
    when v_session.end_time is null or v_session.start_time is null then null
    when v_session.end_time >= v_session.start_time
      then extract(epoch from (v_session.end_time - v_session.start_time)) / 60
    else extract(epoch from (v_session.end_time - v_session.start_time)) / 60 + 1440
  end;

  v_tiktok_minutes := case when v_row.end_time is null then null
    else extract(epoch from (v_row.end_time - v_row.start_time)) / 60 end;

  v_start_delta := round(extract(epoch from (v_row.start_time - v_manual_start)) / 60);
  v_duration_delta := case when v_manual_minutes is null or v_tiktok_minutes is null then null
    else v_tiktok_minutes - v_manual_minutes end;

  -- array_append chứ không phải `arr || 'gmv'`: toán tử || với literal chưa định kiểu sẽ được
  -- Postgres hiểu là array literal và báo "malformed array literal".
  --
  -- v_delta = null nghĩa là actual_gmv chưa khai (0/null), không phải "lệch 0%". Nếu TikTok có
  -- GMV thật thì đây là ca chưa báo cáo gì trong khi đã live thật — luôn gắn cờ. Chỉ bỏ qua khi
  -- cả 2 phía đều 0 (thật sự không có gì để đối soát, ví dụ ca hủy/chưa lên sóng).
  if v_delta is null then
    if coalesce(v_row.gmv, 0) > 0 then
      v_reasons := array_append(v_reasons, 'gmv');
    end if;
  elsif abs(v_delta) > v_th.gmv_pct then
    v_reasons := array_append(v_reasons, 'gmv');
  end if;
  if abs(coalesce(v_start_delta, 0)) > v_th.start_minutes then
    v_reasons := array_append(v_reasons, 'start_time');
  end if;
  if abs(coalesce(v_duration_delta, 0)) > v_th.duration_minutes then
    v_reasons := array_append(v_reasons, 'duration');
  end if;

  insert into live_session_reconciliations (
    session_id, import_row_id, manual_actual_gmv, tiktok_actual_gmv, gmv_delta_pct,
    manual_total_orders, tiktok_total_orders,
    manual_total_views, tiktok_total_views, manual_ctr_avg, tiktok_ctr_avg,
    manual_start_time, tiktok_start_time, manual_duration_minutes, tiktok_duration_minutes,
    start_delta_minutes, duration_delta_minutes, flag_reasons,
    flagged, reconciled_by
  ) values (
    p_session_id, p_import_row_id, v_session.actual_gmv, v_row.gmv, v_delta,
    v_session.total_orders, v_row.orders,
    v_session.total_views, v_row.views, v_session.ctr_avg, v_row.ctr,
    v_manual_start, v_row.start_time, v_manual_minutes, v_tiktok_minutes,
    v_start_delta, v_duration_delta, v_reasons,
    (cardinality(v_reasons) > 0), auth.uid()
  );

  -- KHÔNG cập nhật date/start_time/end_time: giờ công tính lương giữ nguyên theo khai báo.
  update live_sessions set
    actual_gmv = coalesce(v_row.gmv, actual_gmv),
    total_orders = coalesce(v_row.orders, total_orders),
    total_views = coalesce(v_row.views, total_views),
    ctr_avg = coalesce(v_row.ctr, ctr_avg),
    avg_watch_time_seconds = coalesce(v_row.avg_watch_time_seconds, avg_watch_time_seconds),
    data_source = 'tiktok_reconciled',
    reconciled_at = now(),
    tiktok_room_id = coalesce(v_row.tiktok_room_id, tiktok_room_id)
  where id = p_session_id
  returning * into v_session;

  update tiktok_live_import_rows set matched_session_id = p_session_id where id = p_import_row_id;

  return v_session;
end;
$$ language plpgsql security definer set search_path = public;
