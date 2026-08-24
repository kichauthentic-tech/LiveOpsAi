-- FIX: submit_live_session_report (0061, mới nhất pin search_path ở 0063) luôn set
-- data_source = 'manual', reconciled_at = null KHÔNG ĐIỀU KIỆN mỗi lần được gọi — kể cả khi
-- report chỉ sửa field không liên quan tới đối soát (OT/off sớm, status note, dashboard link...)
-- và actual_gmv/total_orders/total_views/ctr_avg/avg_watch_time_seconds giữ nguyên y hệt giá trị
-- đã đối soát TikTok trước đó.
--
-- Hệ quả thật: 1 session đã đối soát xong, trợ live chỉ mở form bổ sung OT muộn hơn (hoàn toàn
-- có thể xảy ra sau khi Ops đã đối soát tháng đó) → badge "Đã Đối Soát" biến mất dù số liệu
-- không đổi 1 đồng, Report Tháng lại gắn cờ "chưa đối soát" cho 1 session thực ra đã chuẩn, Ops
-- phải nhớ chạy lại đối soát chỉ để dọn cờ chứ không cần chỉnh số nào.
--
-- Sửa: chỉ reset data_source/reconciled_at khi ÍT NHẤT 1 trong 5 cột đối soát thực sự đổi giá
-- trị so với live_sessions hiện tại (dùng IS DISTINCT FROM để so sánh đúng cả trường hợp null).
-- Nếu không đổi, giữ nguyên data_source/reconciled_at cũ — session đang 'manual' vẫn 'manual'
-- (no-op, không đổi hành vi cũ), session đang 'tiktok_reconciled' thì giữ nguyên đúng như vậy.
--
-- Chữ ký giữ nguyên y hệt bản 0063 (24 tham số) nên create or replace thay thế trực tiếp.

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
  v_new_actual_gmv numeric;
  v_new_total_orders int;
  v_new_total_views int;
  v_new_ctr_avg numeric;
  v_new_avg_watch_time_seconds int;
  v_reconciled_fields_changed boolean;
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

  v_new_actual_gmv := coalesce(p_actual_gmv, v_session.actual_gmv);
  v_new_total_orders := coalesce(p_total_orders, v_session.total_orders);
  v_new_total_views := coalesce(p_total_views, v_session.total_views);
  v_new_ctr_avg := coalesce(p_ctr_avg, v_session.ctr_avg);
  v_new_avg_watch_time_seconds := coalesce(p_avg_watch_time_seconds, v_session.avg_watch_time_seconds);

  v_reconciled_fields_changed :=
    v_new_actual_gmv is distinct from v_session.actual_gmv
    or v_new_total_orders is distinct from v_session.total_orders
    or v_new_total_views is distinct from v_session.total_views
    or v_new_ctr_avg is distinct from v_session.ctr_avg
    or v_new_avg_watch_time_seconds is distinct from v_session.avg_watch_time_seconds;

  update live_sessions set
    actual_gmv = v_new_actual_gmv,
    total_orders = v_new_total_orders,
    total_views = v_new_total_views,
    ctr_avg = v_new_ctr_avg,
    avg_watch_time_seconds = v_new_avg_watch_time_seconds,
    data_source = case when v_reconciled_fields_changed then 'manual' else data_source end,
    reconciled_at = case when v_reconciled_fields_changed then null else reconciled_at end
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
