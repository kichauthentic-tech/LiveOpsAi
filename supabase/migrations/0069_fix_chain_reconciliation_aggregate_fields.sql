-- Sửa apply_tiktok_reconciliation_chain (migration 0068): trước đây copy nguyên đơn hàng/lượt
-- xem/CTR/thời lượng xem TRUNG BÌNH (aggregate của cả chuỗi) vào TỪNG session trong chuỗi. Vì các
-- dashboard tổng hợp bằng cách CỘNG các field này qua toàn bộ session (vd BrandDashboard.tsx,
-- PerformanceMetricsWidget.tsx), copy y nguyên vào N session làm số liệu bị nhân N lần sau khi đối
-- soát ca nối — trong khi GMV thì được chia đúng.
--
-- Quyết định user (2026-08-22, làm rõ luồng nghiệp vụ): trợ đã nhập tay riêng đơn/lượt xem cho
-- từng ca của mình TRƯỚC khi bàn giao host tiếp theo — TikTok chỉ gộp chung vì không tắt sóng
-- giữa các ca, không có nghĩa là số trợ nhập riêng biệt sai. Vì TikTok không tách được aggregate
-- này theo từng host, chỉ ghi đè orders/views/CTR/watch-time vào session ĐẦU CHUỖI (đại diện cho
-- cả phiên TikTok đó); các session còn lại trong chuỗi GIỮ NGUYÊN số trợ đã tự nhập, không ghi đè.
-- GMV vẫn chia đều phần chênh lệch cho mọi session như cũ (không đổi).

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
  v_is_first boolean;
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

  v_delta_total := coalesce(v_row.gmv, 0) - v_sum_manual;
  v_share := v_delta_total / v_n;

  for v_session_id, v_is_first in
    select s, s = p_session_ids[1] from unnest(p_session_ids) as s
  loop
    select * into v_session from live_sessions where id = v_session_id;
    if not found then
      raise exception 'live_sessions row % not found', v_session_id;
    end if;

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
      v_session.total_orders, case when v_is_first then v_row.orders else null end,
      v_session.total_views, case when v_is_first then v_row.views else null end,
      v_session.ctr_avg, case when v_is_first then v_row.ctr else null end,
      '{}', false, auth.uid(),
      case when v_is_first then
        format(
          'Ca nối: %s host chung 1 phiên TikTok (Room %s), session này là đại diện đầu chuỗi. GMV thật %s đ − tổng tạm tính %s đ = chênh %s đ, chia đều %s đ/host. Đơn hàng/lượt xem/CTR/thời lượng xem của cả phiên TikTok được ghi vào session này (không tách được theo host); các session còn lại trong chuỗi giữ nguyên số trợ tự nhập.',
          v_n, coalesce(v_row.tiktok_room_id, '—'), round(coalesce(v_row.gmv, 0)), round(v_sum_manual), round(v_delta_total), round(v_share)
        )
      else
        format(
          'Ca nối: %s host chung 1 phiên TikTok (Room %s). GMV thật %s đ − tổng tạm tính %s đ = chênh %s đ, chia đều %s đ/host. Đơn hàng/lượt xem/CTR/thời lượng xem của phiên TikTok này đã ghi vào session đầu chuỗi (không tách được theo host) — session này giữ nguyên số trợ tự nhập.',
          v_n, coalesce(v_row.tiktok_room_id, '—'), round(coalesce(v_row.gmv, 0)), round(v_sum_manual), round(v_delta_total), round(v_share)
        )
      end
    );

    if v_is_first then
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
    else
      update live_sessions set
        actual_gmv = v_new_gmv,
        data_source = 'tiktok_reconciled',
        reconciled_at = now(),
        tiktok_room_id = coalesce(v_row.tiktok_room_id, tiktok_room_id)
      where id = v_session_id
      returning * into v_session;
    end if;

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
