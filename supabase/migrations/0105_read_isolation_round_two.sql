-- 0105 — Vòng 2 của cô lập tầng đọc (audit role × workspace, 2026-09-22).
--
-- 0059 đã chuyển mọi bảng CÓ LÚC ĐÓ sang công thức cô lập theo brand. Mọi bảng tạo SAU 0059 lại
-- quay về `for select using (auth.role() = 'authenticated')` của 0001 — quy ước không được viết ra
-- ở đâu nên migration sau không biết mà theo.
--
-- ĐO THẬT TRÊN DB PRODUCTION trước khi viết migration này (2026-09-22, đăng nhập bằng tài khoản
-- role `talent` rồi gọi PostgREST trực tiếp):
--     brand_month_plan_slots  → 75 dòng   (kế hoạch + target GMV của brand khác)
--     brand_month_plans       →  1 dòng
--     audit_logs              → 12 dòng   (ai đổi quyền của ai, ai xoá gì)
--     brand_platform_rates    →  1 dòng   (ĐƠN GIÁ agency bán cho từng khách)
--     calendar_events         → 32 dòng
--     brand_studios           →  5 dòng
-- Tài khoản talent không có màn hình nào hiện những thứ này — UI chưa bao giờ lộ, nhưng RLS là thứ
-- chặn DevTools/PostgREST, và đó mới là mặt phải chặn.
--
-- HAI LỖ KHÁC NHAU, đừng gộp làm một:
--   (a) chéo brand — brand A đọc được dữ liệu brand B  → công thức của 0059.
--   (b) rò lên trên — talent đọc được dữ liệu nội bộ agency → 0059 KHÔNG chặn, vì nhóm
--       `agency_only` của nó viết `current_user_role() is distinct from 'brand'`, tức chỉ loại
--       đúng role brand. Talent/mọi role khác vẫn lọt.
--
-- QUY ƯỚC BẮT BUỘC ÁP DỤNG Ở ĐÂY (rút từ 0101): mọi lời gọi current_user_role() /
-- current_user_brand_id() trong thân policy phải bọc `(select ...)` để Postgres nâng thành InitPlan
-- — tính MỘT lần cho cả câu query thay vì mỗi dòng. 0101 là bản vá cho đúng sự cố này (view
-- talents_secure không bọc → query của role talent chạy 19–40s rồi Cloudflare trả 522).
--
-- Dùng `in (...)` chứ không `not in (...)`: current_user_role() trả NULL khi người gọi chưa có dòng
-- `profiles`, mà `NULL not in (...)` ra NULL — policy bỏ qua dòng đó thì còn may, nhưng viết
-- khẳng định thì hướng hỏng luôn là ĐÓNG. Xem bẫy đã ghi ở 0082.

-- ---------------------------------------------------------------------------
-- Helper: brand_id của một kế hoạch tháng, cho bảng con chỉ có plan_id.
-- ---------------------------------------------------------------------------
-- security definer để tránh RLS-trong-RLS (policy của bảng con lại phải đi qua policy của
-- brand_month_plans) — cùng pattern session_brand_id() của 0059.
create or replace function month_plan_brand_id(p_plan_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select brand_id from brand_month_plans where id = p_plan_id
$$;

revoke all on function month_plan_brand_id(uuid) from public;
grant execute on function month_plan_brand_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Kế hoạch tháng — chéo brand + rò lên trên
-- ---------------------------------------------------------------------------
-- Brand ĐƯỢC đọc kế hoạch của chính mình (không chặn hẳn): Đợt C của roadmap sẽ hiện kế hoạch
-- tháng sau cho brand xem/xác nhận, policy này là thứ mở đường sẵn cho việc đó.
drop policy if exists "brand_month_plans_read_all" on brand_month_plans;
drop policy if exists "brand_month_plans_read_scoped" on brand_month_plans;
create policy "brand_month_plans_read_scoped" on brand_month_plans for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
);

drop policy if exists "brand_month_plan_slots_read_all" on brand_month_plan_slots;
drop policy if exists "brand_month_plan_slots_read_scoped" on brand_month_plan_slots;
create policy "brand_month_plan_slots_read_scoped" on brand_month_plan_slots for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and month_plan_brand_id(plan_id) = (select current_user_brand_id()))
);

-- ---------------------------------------------------------------------------
-- 2) Rate card — ĐƠN GIÁ agency bán cho khách
-- ---------------------------------------------------------------------------
-- 0059 đã chặn chéo brand nhưng để lọt talent. Host biết agency bán giờ của mình cho brand bao
-- nhiêu là chuyện thương lượng lương, không phải dữ liệu vận hành.
drop policy if exists "brand_platform_rates_read_all" on brand_platform_rates;
drop policy if exists "brand_platform_rates_read_scoped" on brand_platform_rates;
create policy "brand_platform_rates_read_scoped" on brand_platform_rates for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
);

-- Lịch sử rate cũng vậy (0018 để read_all, 0059 không đụng vì không nằm trong danh sách).
drop policy if exists "brand_platform_rate_history_read_all" on brand_platform_rate_history;
drop policy if exists "brand_platform_rate_history_read_scoped" on brand_platform_rate_history;
create policy "brand_platform_rate_history_read_scoped" on brand_platform_rate_history for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
);

-- ---------------------------------------------------------------------------
-- 3) Dữ liệu nội bộ agency — đóng hẳn với mọi role ngoài ceo/operations/admin
-- ---------------------------------------------------------------------------
-- audit_logs phải cho `operations` ĐỌC dù tab Audit Log nằm trong màn gate `manage_users_permissions`
-- (ceo/admin): createAuditLog() ghi bằng `.insert().select().single()`, mà RETURNING đi qua policy
-- SELECT — chặn đọc là mọi thao tác của ops có ghi log sẽ ném lỗi ngay sau khi ghi thành công.
-- Policy INSERT (0013) đã là ceo/operations/admin, nên hai vế khớp nhau.
do $$
declare
  t text;
  p text;
  agency_only text[] := array['audit_logs', 'workflow_rules', 'strategic_directives', 'tiktok_webhook_events', 'engine_params'];
begin
  foreach t in array agency_only loop
    -- Bỏ qua bảng không tồn tại trên môi trường này: strategic_directives được tạo ở 0001 nhưng
    -- đã bị xoá tay khỏi production cùng đợt dọn mock/tính năng (không có migration DROP nào ghi
    -- lại) — trong khi harness dựng lại từ đầu chuỗi 0001→nay vẫn còn bảng này nên không bắt được.
    continue when to_regclass('public.' || t) is null;

    -- Drop theo cmd='SELECT' chứ không theo tên: tên policy không đồng nhất giữa 0001/0059/0095,
    -- mà policy PERMISSIVE cộng dồn bằng OR — sót một cái "read_all" là mọi policy chặt bên dưới
    -- thành vô nghĩa. Chỉ đụng cmd='SELECT', policy ghi giữ nguyên.
    for p in select policyname from pg_policies
             where schemaname = 'public' and tablename = t and cmd = 'SELECT' loop
      execute format('drop policy %I on %I', p, t);
    end loop;
    execute format(
      'create policy %I on %I for select using ((select current_user_role()) in (''ceo'', ''operations'', ''admin''))',
      t || '_read_agency', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Phòng live theo brand
-- ---------------------------------------------------------------------------
-- BrandCalendar (brand xem được) đọc bảng này, nên brand phải đọc dòng của chính mình.
drop policy if exists "brand_studios_read_all" on brand_studios;
drop policy if exists "brand_studios_read_scoped" on brand_studios;
create policy "brand_studios_read_scoped" on brand_studios for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
);

-- ---------------------------------------------------------------------------
-- CỐ Ý KHÔNG ĐỤNG
-- ---------------------------------------------------------------------------
-- calendar_events (0091) — nội dung là ngày lễ Việt Nam + ngày mega-sale của nền tảng. Thông tin
--   công khai, không mang giá trị thương mại, và Đợt C sẽ hiện nó cho brand xem cùng kế hoạch
--   tháng. Siết ở đây chỉ thêm nhiễu chứ không chặn được rò rỉ nào.
-- profiles (0001 read_all) — mọi tài khoản đọc được danh sách tài khoản khác. Đây là lỗ thật
--   (brand đọc được email/tên người liên hệ của brand khác) nhưng KHÔNG vá ở đây: `profiles` là
--   bảng mà current_user_role()/current_user_brand_id() tự đọc, siết nó phải rà lại toàn bộ hàm
--   security definer trước, và app còn join tên người dùng ở nhiều chỗ. Tách thành việc riêng.
