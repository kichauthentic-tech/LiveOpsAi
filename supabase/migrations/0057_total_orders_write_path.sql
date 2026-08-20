-- FIX C2 (audit 2026-08-20): live_sessions.total_orders không có BẤT KỲ đường ghi nào.
--
-- Cột có từ 0001, được đọc ở 5 nơi (PerformanceMetricsWidget, KpiComparison, BrandDashboard,
-- BrandMonthlyReport) nhưng mọi đường ghi đều là hằng số 0: App.tsx:1242, LiveCalendar.tsx:587,
-- BrandSessionModal.tsx:144 đều hard-code 0, còn LiveSessionHub.tsx:136 chỉ chuyền lại giá trị
-- cũ. Form Report ca live không có ô "Đơn hàng". Hệ quả: "Tổng Đơn Hàng" trong Report Tháng gửi
-- cho brand luôn = 0, và AOV ở Brand Dashboard / KPI Comparison (= totalGmv / totalOrders) luôn
-- rơi vào nhánh chia-cho-0 nên cũng = 0.
--
-- Nối total_orders vào ĐÚNG mô hình 2 lớp mà actual_gmv đang chạy (xem "Lộ trình Đối Soát &
-- Report" trong WORKSPACE_DESIGN.md):
--   lớp tạm tính  — host tự khai sau ca qua submit_live_session_report
--   lớp chính thức — ghi đè bằng số TikTok qua apply_tiktok_reconciliation
-- Không cộng dồn 2 nguồn; badge dataSource sẵn có tự phản ánh nguồn đang hiển thị.
--
-- tiktok_live_import_rows.orders đã có sẵn từ 0050 và pipeline Dataraw đã parse đúng cột
-- "Đơn hàng đã thanh toán" vào đó (COLUMN_PATTERNS.ordersPaid trong tiktokReconciliation.ts) —
-- dữ liệu vẫn nằm đó từ đầu, chỉ thiếu đúng dòng ghi ra live_sessions.

-- 1) Lưu lại cặp manual/tiktok cho đơn hàng, đồng bộ với gmv/views/ctr đã có.
-- Nguyên tắc của 0050: đối soát GHI ĐÈ nhưng luôn giữ cặp trước/sau để QA phát hiện host nhập
-- lệch. Ghi đè total_orders mà không lưu số cũ sẽ phá nguyên tắc đó.
alter table live_session_reconciliations
  add column if not exists manual_total_orders int,
  add column if not exists tiktok_total_orders int;

-- 2) Lớp tạm tính — thêm p_total_orders vào RPC report ca.
-- Đổi chữ ký nên phải DROP bản cũ trước: create or replace với danh sách tham số khác sẽ tạo
-- OVERLOAD thứ 2 chứ không thay thế, và PostgREST sẽ không biết chọn bản nào (cùng lý do đã ghi
-- ở 0055). Chữ ký dưới đây là bản 0055 (23 tham số, đã có p_ot_minutes/p_early_leave_minutes).
drop function if exists submit_live_session_report(
  uuid, numeric, int, numeric, int, int, boolean, boolean, text, numeric, text, text,
  bigint, numeric, numeric, numeric, numeric, int, numeric, int, numeric, int, int
);

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
    avg_watch_time_seconds = coalesce(p_avg_watch_time_seconds, avg_watch_time_seconds)
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

-- 3) Lớp chính thức — đối soát ghi đè total_orders bằng số TikTok.
-- Bản dưới đây giống hệt 0054, chỉ thêm: total_orders vào câu UPDATE, và cặp
-- manual_total_orders/tiktok_total_orders vào bản ghi đối soát.
--
-- CỐ Ý KHÔNG đụng tới logic gắn cờ: ngưỡng vẫn chỉ xét gmv/start_time/duration, không thêm lý do
-- 'orders'. Đây là fix đường ghi dữ liệu, không phải đổi tiêu chí cảnh báo cho ops.
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
  if abs(coalesce(v_delta, 0)) > v_th.gmv_pct then
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
$$ language plpgsql security definer;

comment on column live_session_reconciliations.manual_total_orders is
  'Số đơn host tự khai trong report ca, trước khi đối soát ghi đè.';
comment on column live_session_reconciliations.tiktok_total_orders is
  'Số đơn từ cột "Đơn hàng đã thanh toán" của report Live Analysis TikTok.';
