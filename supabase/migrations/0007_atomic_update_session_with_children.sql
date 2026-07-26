-- Closes the remaining gap from migration 0006: updateSession() still ran as
-- two separate client calls — (1) UPDATE live_sessions, then (2) the
-- replace_session_children() RPC for the child tables. If step (2) failed,
-- the parent row had already committed with new values while the child rows
-- kept their old contents — no data loss, but a temporarily inconsistent
-- session until the user retried.
--
-- This wraps the parent UPDATE and the child replace in a single function
-- call (one implicit transaction), so a failure in either half rolls back
-- both. No SECURITY DEFINER — runs as the calling user, so the existing RLS
-- write policy (ceo/operations only) still applies.
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
    assistant_name = coalesce(p_session->>'assistant_name', ''),
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

  -- Reuses the existing atomic child-replace function (migration 0006) —
  -- nested function calls share the same outer transaction, so a failure
  -- here rolls back the UPDATE above too.
  perform replace_session_children(p_session_id, p_skus, p_checklist, p_metrics);

  return v_row;
end;
$$ language plpgsql;
