-- 0132 — Bỏ 4 bảng không còn code nào đọc/ghi, cùng những thứ chỉ tồn tại để phục vụ chúng.
-- Audit code chết 2026-10-02 (xem WORKSPACE_DESIGN.md, mục Hạ tầng Supabase).
--
-- ĐÃ CHẠY 2026-10-02 (lần 2). Lần 1 Supabase SQL Editor báo 42601 syntax error at end of input (LINE 0),
-- không áp gì, trong khi psql chạy sạch cả khi gửi cả file thành một query. Bản lần 2 chỉ đổi COMMENT.
-- Thứ duy nhất bản lần 1 có mà 131 migration đã chạy được không có: ký tự kẻ khung (U+2510/251C/2518).
-- Chưa chứng minh trên Studio, nhưng tests/sqlGuards.test.ts từ nay chặn ký tự kẻ khung trong migration.
--
--   workflow_rules           tab Workflow Automation Rules đã gỡ (chỉ lưu chữ, không engine nào chạy)
--   session_skus             3 bảng con của ca, di sản Live Sessions Hub (xoá 2026-09-13).
--   session_checklist_items  Không màn nào đọc từ 2026-09-23, client chỉ còn gửi mảng RỖNG vào RPC,
--   session_minute_metrics   tức mỗi lần sửa ca là một lượt delete + insert vô ích trên 3 bảng.
--
-- Đếm trên production 2026-10-02 (HEAD count=exact, phiên admin): cả 4 bảng 0 dòng.
--
-- Kéo theo, vì sau khi bỏ bảng chúng không còn ai dùng (đo trên replay 0001 → 0131):
--   • hàm replace_session_children(uuid, jsonb, jsonb, jsonb) của 0006 — chỉ ghi vào 3 bảng con
--   • private.session_brand_id(uuid) và private.session_month_published(uuid) của 0128 — chỉ policy
--     session_skus_read_published gọi (bảng đo trong 0128 ghi rõ). Hết luôn mục hoãn ở P2a-16
--     (bỏ 2 hàm nhận-cột khỏi policy của session_skus)
--   • enum checklist_category của 0001 — chỉ cột session_checklist_items.category dùng
--
-- Thêm 4 enum mồ côi TỪ TRƯỚC (đo trên replay: 0 cột, 0 chữ ký hay thân hàm, 0 view, 0 policy dùng):
--   • directive_department, directive_priority, directive_status (0001) — sót lại khi bảng
--     strategic_directives bị bỏ (xoá tay trên production, ghi sổ ở 0126)
--   • project_status (0001) — sót lại khi agency_projects bị bỏ ở 0045
--
-- update_session_with_children GIỮ TÊN (client đang gọi) nhưng thân bỏ dòng perform replace_session_children.
-- 3 tham số con giữ chữ ký, thêm default null và bị bỏ qua. Sau migration này cả client CŨ (gửi 5 tham số)
-- lẫn client MỚI (gửi 2) đều gọi được. Thứ tự bắt buộc: CHẠY FILE NÀY TRƯỚC, rồi mới deploy client mới
-- (client mới gọi 2 tham số vào DB chưa có file này sẽ nhận PGRST202 và màn sửa ca chết).
--
-- CỐ Ý KHÔNG dùng CASCADE ở bất kỳ lệnh drop nào: còn thứ gì phụ thuộc mà phép đo bỏ sót thì migration
-- phải VỠ TO ở đây, không lặng lẽ kéo theo thứ khác.

-- ============================================================================
-- 0) CHỐT AN TOÀN: không bỏ bảng còn dữ liệu (cùng khuôn 0126)
-- ============================================================================
do $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['workflow_rules', 'session_skus', 'session_checklist_items', 'session_minute_metrics'] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice '0132: bảng % không tồn tại — bỏ qua', t;
      continue;
    end if;
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception '0132: bảng % còn % dòng — DỪNG, không xoá gì. Đọc lại trước khi xoá.', t, n;
    end if;
  end loop;
end $$;

-- ============================================================================
-- 1) update_session_with_children: bản 0056, bỏ dòng ghi 3 bảng con
-- ============================================================================
-- Thân dưới đây giống hệt 0056 trừ `perform replace_session_children(...)` ở cuối. Không đụng
-- data_source / reconciled_at / tiktok_room_id (lý do: xem 0056).
create or replace function update_session_with_children(
  p_session_id uuid,
  p_session jsonb,
  p_skus jsonb default null,
  p_checklist jsonb default null,
  p_metrics jsonb default null
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

  -- RLS chặn hoặc id không tồn tại đều phải raise — xem 0056.
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  return v_row;
end;
$$ language plpgsql;

-- ============================================================================
-- 2) Bỏ hàm, bảng, hàm helper RLS, enum — đúng thứ tự phụ thuộc
-- ============================================================================
drop function if exists replace_session_children(uuid, jsonb, jsonb, jsonb);

-- Policy của 4 bảng rụng theo bảng.
drop table if exists session_skus;
drop table if exists session_checklist_items;
drop table if exists session_minute_metrics;
drop table if exists workflow_rules;

-- Chỉ `session_skus_read_published` gọi 2 hàm này (vừa rụng cùng bảng). Còn ai dùng thì lệnh drop
-- không-CASCADE sẽ báo lỗi phụ thuộc và cả migration rollback.
drop function if exists private.session_brand_id(uuid);
drop function if exists private.session_month_published(uuid);

drop type if exists checklist_category;
drop type if exists directive_department;
drop type if exists directive_priority;
drop type if exists directive_status;
drop type if exists project_status;

-- ============================================================================
-- 3) CHỐT TỰ KIỂM — sai một mục là raise, cả migration rollback
-- ============================================================================
do $$
begin
  if to_regclass('public.workflow_rules') is not null
     or to_regclass('public.session_skus') is not null
     or to_regclass('public.session_checklist_items') is not null
     or to_regclass('public.session_minute_metrics') is not null then
    raise exception '0132 chốt 1: còn bảng chưa bỏ';
  end if;

  if to_regprocedure('public.replace_session_children(uuid, jsonb, jsonb, jsonb)') is not null
     or to_regprocedure('private.session_brand_id(uuid)') is not null
     or to_regprocedure('private.session_month_published(uuid)') is not null then
    raise exception '0132 chốt 2: còn hàm chưa bỏ';
  end if;

  -- Thân mới không còn gọi hàm đã bỏ (nếu còn, lần sửa ca đầu tiên sẽ chết 42883 — đúng lớp lỗi 0056).
  if position('replace_session_children' in pg_get_functiondef(
       'public.update_session_with_children(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure)) > 0 then
    raise exception '0132 chốt 3: update_session_with_children vẫn gọi replace_session_children';
  end if;

  if exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname in
       ('checklist_category', 'directive_department', 'directive_priority', 'directive_status', 'project_status')) then
    raise exception '0132 chốt 5: còn enum chưa bỏ';
  end if;

  -- Ba helper RLS còn lại của 0128 vẫn phải nguyên vẹn (policy/view khác đang dùng).
  if to_regprocedure('private.month_plan_brand_id(uuid)') is null
     or to_regprocedure('private.brand_month_published(uuid, date)') is null
     or to_regprocedure('private.snapshot_session_id(uuid)') is null then
    raise exception '0132 chốt 4: mất helper RLS không thuộc phạm vi';
  end if;
end $$;
