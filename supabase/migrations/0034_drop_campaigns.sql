-- Xóa module Campaign — rà soát cho thấy campaign_id chỉ là tag/nhãn tùy chọn
-- (không nằm trong bất kỳ phép tính P&L/billing nào ở pnl.ts), luồng duyệt
-- Brand chưa từng verify qua tài khoản brand thật, và GMV Target vs Actual
-- (Giai đoạn C2) đã tính hoàn toàn từ live_sessions.targetGmv/actualGmv/date,
-- không phụ thuộc campaign. Xem WORKSPACE_DESIGN.md.

-- update_session_with_children (migration 0007, mở rộng ở 0010/0014/0022) ghi
-- trực tiếp campaign_id — replace lại trước khi drop cột để không còn tham chiếu.
create or replace function update_session_with_children(
  p_session_id uuid,
  p_session jsonb,
  p_skus jsonb,
  p_checklist jsonb,
  p_metrics jsonb
) returns live_sessions as $$
declare
  v_row live_sessions;
begin
  update live_sessions set
    title = p_session->>'title',
    brand_id = (p_session->>'brand_id')::uuid,
    brand_name = coalesce(p_session->>'brand_name', ''),
    project_id = (p_session->>'project_id')::uuid,
    shop_tiktok_handle = coalesce(p_session->>'shop_tiktok_handle', ''),
    studio_id = (p_session->>'studio_id')::uuid,
    studio_name = coalesce(p_session->>'studio_name', ''),
    host_id = (p_session->>'host_id')::uuid,
    host_name = coalesce(p_session->>'host_name', ''),
    assistant_id = (p_session->>'assistant_id')::uuid,
    assistant_name = coalesce(p_session->>'assistant_name', ''),
    co_host_id = (p_session->>'co_host_id')::uuid,
    co_host_name = coalesce(p_session->>'co_host_name', ''),
    platform = coalesce((p_session->>'platform')::session_platform, 'TikTok'),
    date = (p_session->>'date')::date,
    start_time = (p_session->>'start_time')::time,
    end_time = (p_session->>'end_time')::time,
    status = (p_session->>'status')::session_status,
    target_gmv = coalesce((p_session->>'target_gmv')::numeric, 0),
    actual_gmv = coalesce((p_session->>'actual_gmv')::numeric, 0),
    total_orders = coalesce((p_session->>'total_orders')::int, 0),
    avg_watch_time_seconds = coalesce((p_session->>'avg_watch_time_seconds')::int, 0),
    peak_viewers = coalesce((p_session->>'peak_viewers')::int, 0),
    total_views = coalesce((p_session->>'total_views')::int, 0),
    ctr_avg = coalesce((p_session->>'ctr_avg')::numeric, 0),
    cvr_avg = coalesce((p_session->>'cvr_avg')::numeric, 0),
    ai_analysis = p_session->'ai_analysis'
  where id = p_session_id
  returning * into v_row;

  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  perform replace_session_children(p_session_id, p_skus, p_checklist, p_metrics);

  return v_row;
end;
$$ language plpgsql;

alter table live_sessions drop column if exists campaign_id;
alter table shift_slots drop column if exists campaign_id;
alter table recurring_shift_templates drop column if exists campaign_id;

drop table if exists campaign_revision_notes;
drop table if exists campaigns;
drop table if exists campaign_templates;
