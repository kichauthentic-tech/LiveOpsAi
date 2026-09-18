-- 0084 — Report ca không được hạ bậc số đã có nguồn tốt hơn (điểm nghẽn #4 của audit module
-- Vận Hành Live, phiên bản sau khi có tầng snapshot).
--
-- Vấn đề gốc của #4 là "cùng một số gõ hai lần": talent nhập tay GMV/đơn/view rồi cuối kỳ đối
-- soát ghi đè. Từ 0078, số của ca đã đến từ file Creator-Live-Performance up lúc giao ca
-- (data_source = 'live_snapshot'), nên phần "gõ lần một" không còn cần thiết — nhưng form report
-- vẫn cho gõ, và submit_live_session_report (0075) hễ thấy 5 cột đối soát đổi là reset
-- data_source về 'manual'. Tức là talent mở form sau khi trợ live đã up file, sửa GMV một chút
-- cho "tròn", là số thật từ TikTok bị thay bằng số gõ tay mà không ai biết.
--
-- Sửa ở 2 tầng: form khoá 5 ô số khi ca đã có snapshot/đối soát (UI), và RPC từ chối nếu
-- talent vẫn gửi số khác lên (hàng rào thật — UI ẩn không phải hàng rào, xem quy ước 0082).
-- Thân hàm trích nguyên văn từ 0075, chỉ chèn khối guard sau khi tính v_reconciled_fields_changed
-- và bọc coalesce cho check role (bẫy NULL của 0082).

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
  -- Bọc coalesce: v_role NULL (không có profiles) thì `not in` ra NULL và elsif KHÔNG chạy —
  -- cùng bẫy đã vá ở 0082.
  elsif coalesce(v_role::text, '') not in ('ceo', 'operations', 'admin') then
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

  -- 0084: talent KHÔNG được ghi đè số đã có nguồn tốt hơn. Ca đã có snapshot lúc giao ca hoặc đã
  -- đối soát thì 5 cột trên là số đọc từ file TikTok; cho talent sửa tay là hạ bậc tin cậy về
  -- 'manual' và mất số thật. Ops/admin vẫn sửa được (form bắt bật công tắc "sửa tay" rõ ràng) —
  -- vì đôi khi phải dọn số, và họ có đường up lại snapshot nếu muốn giữ bậc.
  if v_reconciled_fields_changed and v_role = 'talent'
     and v_session.data_source in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Ca này đã có số liệu từ file TikTok (%), không sửa tay được. Chỉ nhập phần OT/off sớm/ghi chú; cần chỉnh số thì báo Ops.',
      case v_session.data_source when 'live_snapshot' then 'snapshot lúc giao ca' else 'đã đối soát' end;
  end if;

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
