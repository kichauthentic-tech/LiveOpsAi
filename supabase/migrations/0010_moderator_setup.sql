-- Giai đoạn 12 (bước 2/2) — chạy SAU KHI 0009_moderator_role_type.sql đã chạy xong
-- và commit ở 1 lần Run riêng (xem lưu ý trong file đó).

-- Permission mặc định cho role moderator: hẹp nhất trong tất cả role — chỉ đọc dữ
-- liệu (lịch, checklist gear) qua các policy "*_read_all" sẵn có cho mọi authenticated
-- user, không có quyền quản lý/ghi nào theo mặc định. CEO vẫn có thể bật thêm qua Ma
-- Trận Role hoặc override riêng từng user như các role khác.
insert into role_permissions (role, permissions) values
  ('moderator', '{"view_financials":false,"view_executive_brief":false,"manage_sessions":false,"manage_calendar":false,"generate_scripts":false,"manage_talents":false,"manage_studios_gear":false,"manage_crm_projects":false,"manage_tiktok_api":false,"manage_finance_hr":false,"manage_ai_agents":false,"manage_users_permissions":false,"export_reports":false}'::jsonb)
on conflict (role) do nothing;

-- Liên kết assistant/moderator của 1 phiên live với 1 profile thật (uuid) thay vì chỉ
-- lưu tên tự do — giữ nguyên cột assistant_name (denormalized, dùng làm fallback hiển
-- thị khi assistant_id null, giống pattern brand_name/studio_name/host_name).
alter table live_sessions add column if not exists assistant_id uuid references profiles(id) on delete set null;

-- update_session_with_children (migration 0007) update trực tiếp từng cột theo tên,
-- nên phải replace lại để thêm assistant_id — nếu không, sửa 1 session hiện có sẽ
-- không bao giờ ghi được assistant_id dù client đã gửi đúng giá trị.
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
