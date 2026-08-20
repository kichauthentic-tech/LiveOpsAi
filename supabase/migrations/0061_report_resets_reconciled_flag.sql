-- FIX M2 (audit 2026-08-20): report ca live ghi đè được số đã đối soát mà badge vẫn báo
-- "Đã đối soát TikTok".
--
-- submit_live_session_report (0046, đổi chữ ký ở 0055/0057) UPDATE thẳng actual_gmv/
-- total_orders/total_views/ctr_avg/avg_watch_time_seconds trên live_sessions nhưng không đụng
-- data_source/reconciled_at. Sau khi ops đã đối soát 1 phiên (apply_tiktok_reconciliation set
-- data_source = 'tiktok_reconciled'), host/co-host vẫn nộp lại report được — số tay đè lên số
-- TikTok chính thức, còn badge (DataSourceBadge.tsx) và Report Tháng (0051, cảnh báo dựa đúng
-- cột data_source) tiếp tục coi phiên đó là đã đối soát, báo yên tâm sai.
--
-- Đúng nguyên tắc "2 lớp dữ liệu, không cộng dồn" đã nêu ở 0050: submit_live_session_report LÀ
-- lớp tạm tính (manual), nên mỗi lần gọi phải tự đưa session về đúng lớp đó — set lại
-- data_source = 'manual', reconciled_at = null. Không chặn hẳn việc nộp lại (host có thể cần
-- sửa báo cáo), chỉ đảm bảo badge/report tháng phản ánh đúng: phiên vừa bị ghi đè bằng tay thì
-- không còn là "đã đối soát" nữa, và sẽ được Report Tháng gắn cờ "chưa đối soát" đúng như một
-- phiên mới — ops đối soát lại là xong, không cần thao tác dọn dẹp gì thêm.
--
-- Chữ ký giống hệt bản 0057 (23 tham số) nên create or replace thay thế trực tiếp, không cần drop.

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
$$ language plpgsql security definer;
