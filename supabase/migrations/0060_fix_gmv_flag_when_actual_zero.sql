-- Bug (audit 2026-08-20): apply_tiktok_reconciliation không bao giờ gắn cờ 'gmv' khi
-- live_sessions.actual_gmv chưa được khai (0 hoặc null) — tức là host chưa nhập report ca, hoặc
-- nhập 0. v_delta được set null vì chia cho 0 không tính được %, nhưng dòng if sau đó dùng
-- coalesce(v_delta, 0) nên null hoá thành 0, và abs(0) > ngưỡng % luôn false. Kết quả: đúng lúc
-- lệch nặng nhất (báo cáo ca trống hoàn toàn trong khi TikTok có GMV thật), hệ thống lại im lặng
-- không cảnh báo gì.
--
-- Fix: tách riêng nhánh actual_gmv chưa khai — nếu TikTok có GMV thật (> 0) thì luôn gắn cờ 'gmv'
-- bất kể % (vì % không tính được), chỉ bỏ qua khi cả 2 phía đều 0 (đúng là không có gì để đối
-- soát). Không đổi signature nên create or replace an toàn, không cần drop function.

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
$$ language plpgsql security definer;
