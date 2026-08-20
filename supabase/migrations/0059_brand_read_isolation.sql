-- FIX (audit 2026-08-20): cô lập dữ liệu giữa các brand hiện CHỈ có ở tầng UI.
--
-- Phía ghi đã đúng từ lâu — 0035/0037/0038 giới hạn brand chỉ tạo/sửa được dòng có
-- brand_id = current_user_brand_id(). Nhưng phía ĐỌC thì hầu hết bảng vẫn giữ policy baseline
-- của 0001: `for select using (auth.role() = 'authenticated')`. UI chỉ lọc theo effectiveWorkspace
-- trong React, nên tài khoản brand A mở DevTools gọi PostgREST bằng tay là đọc trọn vẹn
-- live_sessions / SKU / scheme / rate card của brand B. Với app có nhiều brand đối tác cùng lúc
-- (JOCKEY, VERA, CROCS, Franklin) đây là rò rỉ dữ liệu khách hàng chéo nhau.
--
-- ============================================================================
-- CẢNH BÁO QUAN TRỌNG cho mọi migration sau này — TUYỆT ĐỐI KHÔNG dùng vòng lặp quét
-- pg_tables/information_schema để sửa policy hàng loạt.
--
-- Introspect schema thật (2026-08-20) cho thấy Supabase project này đang CHIA SẺ với một app
-- KHÁC không thuộc LiveOps: workspaces, creators, campaigns, outreach_emails, conversations,
-- posted_videos, content_reviews, creator_campaign_assignments, bulk_outreach_jobs, tasks,
-- notifications, activities, settings, app_config, unmatched_inbound_emails — 15 bảng dùng
-- naming camelCase (creatorIds, workspaceId, startDate), không có trong migration nào của
-- LiveOps và không có dòng code nào trong src/ đụng tới. Một vòng lặp "sửa mọi bảng trong
-- public" sẽ ghi đè policy của app kia.
--
-- Vì vậy danh sách bảng dưới đây được liệt kê TƯỜNG MINH, không suy ra từ catalog.
-- ============================================================================

-- Helper: brand_id của session, dùng cho các bảng con chỉ có session_id.
-- security definer để tránh RLS-trong-RLS (policy của bảng con lại phải đi qua policy của
-- live_sessions), cùng pattern current_user_role/current_user_brand_id/current_user_talent_id.
create or replace function session_brand_id(p_session_id uuid) returns uuid as $$
  select brand_id from live_sessions where id = p_session_id;
$$ language sql stable security definer;

do $$
declare
  t text;
  p text;
  -- Bảng có brand_id trực tiếp.
  direct text[] := array[
    'live_sessions', 'shift_slots', 'recurring_shift_templates', 'promo_schemes',
    'brand_skus', 'sku_platform_prices', 'brand_platform_rates',
    'brand_platform_rate_history', 'product_samples', 'script_library'
  ];
  -- Bảng con của live_sessions, suy brand qua session_id.
  via_session text[] := array[
    'session_skus', 'session_checklist_items', 'session_minute_metrics',
    'live_session_reports', 'live_stream_incidents'
  ];
  -- Dữ liệu nội bộ agency — brand không có việc gì phải đọc.
  agency_only text[] := array[
    'workflow_rules', 'strategic_directives', 'audit_logs', 'tiktok_webhook_events'
  ];
begin
  -- Drop theo cmd='SELECT' chứ không theo tên: policy baseline của 0001 sinh bằng format() nên
  -- tên không đồng nhất giữa các migration, mà drop sót một cái là hỏng toàn bộ mục đích —
  -- policy PERMISSIVE cộng dồn bằng OR, còn sót "read_all" thì mọi policy chặt bên dưới vô nghĩa.
  -- Chỉ đụng cmd='SELECT': policy 'ALL' (vd *_write_ceo_ops) phải giữ nguyên cho ceo/ops/admin.
  foreach t in array direct || via_session || agency_only loop
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on %I', p, t);
    end loop;
  end loop;

  -- `is distinct from` chứ không phải `<>`: current_user_role() trả null cho user chưa có dòng
  -- profiles, mà `null <> 'brand'` ra NULL (không phải true) → sẽ khoá sạch những user đó.
  -- `is distinct from` null-safe, giữ nguyên hành vi hiện tại cho MỌI role không phải brand.
  foreach t in array direct loop
    execute format(
      'create policy %I on %I for select using (
         current_user_role() is distinct from ''brand'' or brand_id = current_user_brand_id())',
      t || '_read_scoped', t);
  end loop;

  foreach t in array via_session loop
    execute format(
      'create policy %I on %I for select using (
         current_user_role() is distinct from ''brand''
         or session_brand_id(session_id) = current_user_brand_id())',
      t || '_read_scoped', t);
  end loop;

  foreach t in array agency_only loop
    execute format(
      'create policy %I on %I for select using (current_user_role() is distinct from ''brand'')',
      t || '_read_agency_only', t);
  end loop;
end $$;

-- brands: cột định danh là `id`, không phải `brand_id` — xử lý riêng ngoài vòng lặp.
-- Brand đọc được cả bảng brands nghĩa là đọc được trọn danh sách khách hàng của agency.
-- Role 'brand' không cần danh sách này: effectiveWorkspace của họ chốt cứng theo
-- activeUser.assignedBrandId (App.tsx), và mọi lookup brands.find() vẫn tìm thấy brand
-- của chính họ trong mảng đã lọc.
drop policy if exists "brands_read_all" on brands;
create policy "brands_read_scoped" on brands for select using (
  current_user_role() is distinct from 'brand' or id = current_user_brand_id()
);

-- CỐ Ý KHÔNG đụng tới:
--   tiktok_live_imports / tiktok_live_import_rows / live_session_reconciliations (0050),
--   brand_dataraw_imports / brand_dataraw_rows (0052) — đã chặt sẵn ở ceo/admin/operations,
--     viết lại theo khuôn trên sẽ NỚI ra cho brand đọc được.
--   brand_monthly_reports (0051) — đã có policy brand đọc đúng brand mình và chỉ khi published.
--   session_finance, talent_rate_history (0047) — đã khoá ở ceo/admin.
--   talents/talents_secure, studios, equipments — tài nguyên dùng chung, không thuộc brand nào;
--     siết ở đây sẽ vỡ Brand Calendar mà không chặn được rò rỉ nào.
--   profiles, role_permissions, session_availability — không phải dữ liệu brand.
