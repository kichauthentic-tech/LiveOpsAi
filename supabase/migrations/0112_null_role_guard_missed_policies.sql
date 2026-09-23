-- 0112 — Vá 7 policy mà vòng lặp của 0111 lẽ ra phải chạm tới nhưng lại bỏ sót.
--
-- Verify SQL của 0111 (2026-09-23, đọc pg_policy trên Supabase thật qua SQL Editor) cho thấy trigger
-- handle_new_user() đã đúng (luôn insert role 'talent', không đọc raw_user_meta_data->>'role'), NHƯNG
-- phần "11 policy" (LỖ 2) chỉ vá được 3: brands_read_scoped, live_sessions_read_no_brand,
-- session_skus_read_published. Còn NGUYÊN 7 policy vẫn dùng `current_user_role() is distinct from
-- 'brand'` KHÔNG có `is not null` bọc ngoài:
--   brand_skus_read_scoped, promo_schemes_read_scoped, recurring_shift_templates_read_scoped,
--   shift_slots_read_scoped, live_session_reports_read_no_brand, session_checklist_items_read_no_brand,
--   session_minute_metrics_read_no_brand
-- Trớ trêu: `live_session_reports` chính là bảng comment của 0111 dùng làm ví dụ đã "đo được" lỗ hổng.
--
-- Đã kiểm cả polcmd/polpermissive/polroles của 7 policy này — đều khớp đúng điều kiện lọc mà vòng
-- lặp DO của 0111 dùng (`polcmd='r'`, `polpermissive`, `polroles='{0}'` tức `to public`), nên KHÔNG
-- rõ vì sao vòng lặp đó bỏ sót đúng 7 dòng này lúc chạy — có thể liên quan sự cố đánh số/2 phiên làm
-- việc song song mà chính 0111 đã ghi lại (0110↔0111 trùng số). Không cố truy nguyên nhân lịch sử
-- (không giúp gì thêm) — vá trực tiếp bằng ĐÚNG TÊN POLICY đã đo được, không dùng lại bộ lọc quét
-- theo text để tránh lặp lại đúng kiểu sót y như 0111.
--
-- Công thức: bọc `(select current_user_role()) is not null and (...)` quanh nguyên qual cũ, giữ
-- nguyên ý nghĩa gốc của từng policy (không đổi sang công thức "chuẩn mới" `in (...)` của 0105 —
-- đổi công thức không phải mục tiêu của bản vá này, chỉ đóng lỗ NULL-role).

drop policy if exists "brand_skus_read_scoped" on brand_skus;
create policy "brand_skus_read_scoped" on brand_skus for select using (
  (select current_user_role()) is not null
  and ((select current_user_role()) is distinct from 'brand' or brand_id = (select current_user_brand_id()))
);

drop policy if exists "promo_schemes_read_scoped" on promo_schemes;
create policy "promo_schemes_read_scoped" on promo_schemes for select using (
  (select current_user_role()) is not null
  and ((select current_user_role()) is distinct from 'brand' or brand_id = (select current_user_brand_id()))
);

drop policy if exists "recurring_shift_templates_read_scoped" on recurring_shift_templates;
create policy "recurring_shift_templates_read_scoped" on recurring_shift_templates for select using (
  (select current_user_role()) is not null
  and ((select current_user_role()) is distinct from 'brand' or brand_id = (select current_user_brand_id()))
);

drop policy if exists "shift_slots_read_scoped" on shift_slots;
create policy "shift_slots_read_scoped" on shift_slots for select using (
  (select current_user_role()) is not null
  and ((select current_user_role()) is distinct from 'brand' or brand_id = (select current_user_brand_id()))
);

drop policy if exists "live_session_reports_read_no_brand" on live_session_reports;
create policy "live_session_reports_read_no_brand" on live_session_reports for select using (
  (select current_user_role()) is not null
  and (select current_user_role()) is distinct from 'brand'
);

drop policy if exists "session_checklist_items_read_no_brand" on session_checklist_items;
create policy "session_checklist_items_read_no_brand" on session_checklist_items for select using (
  (select current_user_role()) is not null
  and (select current_user_role()) is distinct from 'brand'
);

drop policy if exists "session_minute_metrics_read_no_brand" on session_minute_metrics;
create policy "session_minute_metrics_read_no_brand" on session_minute_metrics for select using (
  (select current_user_role()) is not null
  and (select current_user_role()) is distinct from 'brand'
);

-- ============================================================================
-- VERIFY sau khi chạy — dán lại câu này, kỳ vọng 0 dòng (không còn policy select nào "is distinct
-- from" mà thiếu "is not null"):
-- ============================================================================
-- select c.relname as tbl, p.polname as pol, pg_get_expr(p.polqual, p.polrelid) as qual
-- from pg_policy p
-- join pg_class c on c.oid = p.polrelid
-- join pg_namespace n on n.oid = c.relnamespace
-- where n.nspname = 'public'
--   and pg_get_expr(p.polqual, p.polrelid) ilike '%is distinct from%'
--   and pg_get_expr(p.polqual, p.polrelid) not ilike '%is not null%';
