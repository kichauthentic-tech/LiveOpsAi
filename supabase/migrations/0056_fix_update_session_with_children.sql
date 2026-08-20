-- FIX: sửa phiên live hỏng hoàn toàn kể từ migration 0045.
--
-- 0045 drop cột live_sessions.project_id (cùng lúc drop bảng agency_projects), nhưng
-- update_session_with_children — định nghĩa lần cuối ở 0034 — vẫn ghi vào cột đó:
--     project_id = (p_session->>'project_id')::uuid,
-- Postgres chỉ plan thân plpgsql khi hàm được gọi lần đầu, nên 0045 chạy không báo lỗi;
-- mọi lời gọi RPC sau đó fail với:
--     42703: column "project_id" of relation "live_sessions" does not exist
--
-- updateSession() (src/lib/db/sessions.ts) là đường duy nhất để ghi mọi thay đổi lên phiên
-- live, nên lỗi này làm chết: modal Sửa phiên (LiveSessionHub / LiveCalendar / DayMatrix),
-- kéo-thả đổi lịch, và luồng "Báo bận / Tìm người thay". Không ai phát hiện vì DB đang có
-- 0 phiên live để sửa.
--
-- Bản dưới đây giống hệt 0034, chỉ bỏ dòng project_id. Không đụng tới data_source /
-- reconciled_at / tiktok_room_id (thêm ở 0050) — 3 cột đó chỉ do RPC đối soát TikTok
-- (apply_tiktok_reconciliation) ghi, sửa phiên bằng tay không được phép reset chúng.
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

  -- Không tìm thấy row có 2 nguyên nhân: id không tồn tại, HOẶC RLS chặn (vd brand user
  -- sửa phiên của brand khác — policy 0035 chỉ cho ghi phiên thuộc brand của mình).
  -- Cả hai đều phải raise: update() của PostgREST lọc 0 row thì KHÔNG trả error, nên nếu
  -- ở đây im lặng thì UI sẽ báo "đã lưu" trong khi DB không đổi gì.
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  perform replace_session_children(p_session_id, p_skus, p_checklist, p_metrics);

  return v_row;
end;
$$ language plpgsql;
