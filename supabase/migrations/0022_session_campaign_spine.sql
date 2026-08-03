-- Giai đoạn 26 — Campaign làm "xương sống": thêm live_sessions.campaign_id.
--
-- Trước giờ Campaign chỉ có FK thật tới shift_slots/recurring_shift_templates
-- (migration 0016) — live_sessions không có cột này, nên
-- campaignActualGmv (ShiftScheduling.tsx) phải suy luận quan hệ Session↔Campaign
-- qua brand_id + date nằm trong [start_date, end_date] của campaign. Suy luận
-- này chấp nhận được khi Campaign mới là 1 "view" phụ, nhưng gây sai lệch khi
-- 1 brand có 2 campaign chạy chồng ngày, hoặc khi session Completed nhưng
-- brand đổi campaign giữa chừng. Thêm FK thật để filter chính xác 1-1.
alter table live_sessions
  add column if not exists campaign_id uuid references campaigns(id) on delete set null;

create index if not exists idx_live_sessions_campaign on live_sessions(campaign_id);

-- Backfill best-effort cho session đã có sẵn: chỉ gán khi brand_id khớp và
-- date nằm trong khoảng ngày campaign (đúng logic suy luận cũ). Nếu 1 session
-- khớp nhiều campaign chồng ngày, ưu tiên campaign có start_date gần nhất
-- (khả năng đúng nhất theo trực giác vận hành). Session không khớp campaign
-- nào giữ nguyên campaign_id = null — hợp lệ, coi là session phát sinh ngoài
-- kế hoạch, không phải lỗi.
with ranked as (
  select
    s.id as session_id,
    c.id as campaign_id,
    row_number() over (
      partition by s.id
      order by c.start_date desc
    ) as rn
  from live_sessions s
  join campaigns c
    on c.brand_id = s.brand_id
    and s.date >= c.start_date
    and s.date <= c.end_date
  where s.campaign_id is null
)
update live_sessions s
set campaign_id = ranked.campaign_id
from ranked
where ranked.session_id = s.id and ranked.rn = 1;

-- update_session_with_children (migration 0007, mở rộng ở 0010/0014) update
-- trực tiếp từng cột theo tên nên phải replace lại để ghi được campaign_id.
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
    campaign_id = (p_session->>'campaign_id')::uuid,
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
