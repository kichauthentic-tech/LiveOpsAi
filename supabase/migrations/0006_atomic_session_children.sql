-- Fixes a data-loss bug: the app used to delete all session_skus/
-- session_checklist_items/session_minute_metrics rows for a session, then
-- re-insert the new set as separate client-side calls. If an insert failed
-- partway through (e.g. a bad row), the preceding delete had already
-- committed — permanently losing that session's child data with no rollback.
--
-- A single SQL function call runs inside one implicit transaction: if any
-- statement inside raises, everything in the function (including the
-- deletes) rolls back atomically. No SECURITY DEFINER — runs as the calling
-- user so the existing RLS write policies (ceo/operations only) still apply.
create or replace function replace_session_children(
  p_session_id uuid,
  p_skus jsonb,
  p_checklist jsonb,
  p_metrics jsonb
) returns void as $$
begin
  delete from session_skus where session_id = p_session_id;
  delete from session_checklist_items where session_id = p_session_id;
  delete from session_minute_metrics where session_id = p_session_id;

  insert into session_skus (
    session_id, code, name, category, original_price, live_price,
    commission, stock, sold_in_session, click_count, ctr, cvr
  )
  select
    p_session_id,
    x->>'code',
    x->>'name',
    coalesce(x->>'category', ''),
    coalesce((x->>'original_price')::numeric, 0),
    coalesce((x->>'live_price')::numeric, 0),
    coalesce((x->>'commission')::numeric, 0),
    coalesce((x->>'stock')::int, 0),
    coalesce((x->>'sold_in_session')::int, 0),
    coalesce((x->>'click_count')::int, 0),
    coalesce((x->>'ctr')::numeric, 0),
    coalesce((x->>'cvr')::numeric, 0)
  from jsonb_array_elements(coalesce(p_skus, '[]'::jsonb)) as x;

  insert into session_checklist_items (
    session_id, task, category, completed, assigned_to
  )
  select
    p_session_id,
    x->>'task',
    (x->>'category')::checklist_category,
    coalesce((x->>'completed')::boolean, false),
    coalesce(x->>'assigned_to', '')
  from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) as x;

  insert into session_minute_metrics (
    session_id, minute, time_string, viewers, peak_viewers, gmv_cumulative,
    gmv_per_minute, ctr, cvr, product_clicks, comments, event_trigger
  )
  select
    p_session_id,
    (x->>'minute')::int,
    x->>'time_string',
    coalesce((x->>'viewers')::int, 0),
    coalesce((x->>'peak_viewers')::int, 0),
    coalesce((x->>'gmv_cumulative')::numeric, 0),
    coalesce((x->>'gmv_per_minute')::numeric, 0),
    coalesce((x->>'ctr')::numeric, 0),
    coalesce((x->>'cvr')::numeric, 0),
    coalesce((x->>'product_clicks')::int, 0),
    coalesce((x->>'comments')::int, 0),
    x->>'event_trigger'
  from jsonb_array_elements(coalesce(p_metrics, '[]'::jsonb)) as x;
end;
$$ language plpgsql;
