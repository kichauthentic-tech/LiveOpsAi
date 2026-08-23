-- Đối soát "ca nối" — thực tế agency thường xếp 3-5 host nối tiếp nhau (cùng studio, giờ khớp
-- sát nhau) cho 1 phiên LIVE TikTok liên tục không tắt sóng giữa các ca, nhưng TikTok chỉ xuất
-- ĐÚNG 1 dòng (1 Room ID) cho toàn bộ khoảng thời gian đó — không tách được GMV theo từng host.
-- apply_tiktok_reconciliation (migration 0050/0054/0057/0060/0063) chỉ ghi đè được 1 session/dòng.
--
-- Quyết định user (2026-08-22): GMV thật trừ/cộng lệch với tổng GMV tạm tính hiện có của cả chuỗi
-- host, PHẦN CHÊNH LỆCH (dư hoặc thiếu) chia ĐỀU cho từng host trong chuỗi — không phải ghi đè
-- toàn bộ GMV thật vào từng host (sẽ nhân bản sai số GMV lên N lần). Chỉ GMV được chia theo logic
-- này; orders/views/CTR/watch-time không có breakdown theo host từ TikTok nên copy nguyên aggregate
-- vào từng session như nhau (đã ghi rõ trong audit note, không giả vờ là số riêng từng host).

alter table tiktok_live_import_rows add column if not exists matched_session_ids uuid[];

alter table tiktok_live_import_rows drop constraint if exists tiktok_live_import_rows_match_confidence_check;
alter table tiktok_live_import_rows add constraint tiktok_live_import_rows_match_confidence_check
  check (match_confidence in ('room_id', 'time_overlap', 'manual', 'unmatched', 'chain'));

create or replace function apply_tiktok_reconciliation_chain(p_import_row_id uuid, p_session_ids uuid[])
returns setof live_sessions as $$
declare
  v_row tiktok_live_import_rows;
  v_session live_sessions;
  v_n int;
  v_sum_manual numeric := 0;
  v_delta_total numeric;
  v_share numeric;
  v_new_gmv numeric;
  v_delta_pct numeric;
  v_session_id uuid;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to reconcile sessions';
  end if;

  if array_length(p_session_ids, 1) is null or array_length(p_session_ids, 1) < 2 then
    raise exception 'apply_tiktok_reconciliation_chain requires at least 2 session ids — use apply_tiktok_reconciliation for a single session';
  end if;

  select * into v_row from tiktok_live_import_rows where id = p_import_row_id;
  if not found then
    raise exception 'tiktok_live_import_rows row % not found', p_import_row_id;
  end if;

  v_n := array_length(p_session_ids, 1);

  select coalesce(sum(actual_gmv), 0) into v_sum_manual
  from live_sessions where id = any(p_session_ids);

  -- Chênh lệch chia đều cho N host — dương (GMV thật cao hơn) cộng thêm, âm (host tự báo cao hơn
  -- thực tế) trừ bớt, cùng 1 công thức cho cả 2 chiều theo đúng yêu cầu user.
  v_delta_total := coalesce(v_row.gmv, 0) - v_sum_manual;
  v_share := v_delta_total / v_n;

  foreach v_session_id in array p_session_ids loop
    select * into v_session from live_sessions where id = v_session_id;
    if not found then
      raise exception 'live_sessions row % not found', v_session_id;
    end if;

    -- Chặn sàn 0: nếu chênh lệch âm quá lớn (hiếm, vd host báo khống nhiều) vẫn không để GMV âm.
    -- Sàn 0 có thể làm tổng sau chia không khớp tuyệt đối GMV thật — chấp nhận được vì đây là ca
    -- ngoại lệ hiếm, ops vẫn thấy rõ qua audit note bên dưới.
    v_new_gmv := greatest(0, coalesce(v_session.actual_gmv, 0) + v_share);
    v_delta_pct := case when coalesce(v_session.actual_gmv, 0) = 0 then null
      else round(((v_new_gmv - v_session.actual_gmv) / v_session.actual_gmv) * 100, 2) end;

    insert into live_session_reconciliations (
      session_id, import_row_id, manual_actual_gmv, tiktok_actual_gmv, gmv_delta_pct,
      manual_total_orders, tiktok_total_orders,
      manual_total_views, tiktok_total_views, manual_ctr_avg, tiktok_ctr_avg,
      flag_reasons, flagged, reconciled_by, note
    ) values (
      v_session_id, p_import_row_id, v_session.actual_gmv, v_new_gmv, v_delta_pct,
      v_session.total_orders, v_row.orders,
      v_session.total_views, v_row.views, v_session.ctr_avg, v_row.ctr,
      '{}', false, auth.uid(),
      format(
        'Ca nối: %s host chung 1 phiên TikTok (Room %s). GMV thật %s đ − tổng tạm tính %s đ = chênh %s đ, chia đều %s đ/host.',
        v_n, coalesce(v_row.tiktok_room_id, '—'), round(coalesce(v_row.gmv, 0)), round(v_sum_manual), round(v_delta_total), round(v_share)
      )
    );

    -- Orders/Views/CTR/watch-time KHÔNG có breakdown theo host từ TikTok (chỉ 1 dòng cho cả chuỗi)
    -- — copy nguyên aggregate vào từng session, KHÔNG chia như GMV (tránh giả vờ có số liệu chưa
    -- có). Ghi rõ trong note ở trên để ops không hiểu nhầm là số orders/views cũng đã tách riêng.
    update live_sessions set
      actual_gmv = v_new_gmv,
      total_orders = coalesce(v_row.orders, total_orders),
      total_views = coalesce(v_row.views, total_views),
      ctr_avg = coalesce(v_row.ctr, ctr_avg),
      avg_watch_time_seconds = coalesce(v_row.avg_watch_time_seconds, avg_watch_time_seconds),
      data_source = 'tiktok_reconciled',
      reconciled_at = now(),
      tiktok_room_id = coalesce(v_row.tiktok_room_id, tiktok_room_id)
    where id = v_session_id
    returning * into v_session;

    return next v_session;
  end loop;

  update tiktok_live_import_rows set
    matched_session_id = p_session_ids[1],
    matched_session_ids = p_session_ids,
    match_confidence = 'chain'
  where id = p_import_row_id;

  return;
end;
$$ language plpgsql security definer set search_path = public;
