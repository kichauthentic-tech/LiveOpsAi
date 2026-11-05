-- 0198 — Phạm vi đọc/ghi của role talent + 2 lỗ ghi đo được trong audit trước launch (05/11). Chạy SAU 0197.
--
-- Đo trên replay 0001→0197 có quyền mặc định Supabase (mọi bảng/view mới tự GRANT ALL cho anon/authenticated):
--   A) `talents_secure` là view MỘT bảng, không security_invoker ⇒ tự cập nhật được và chạy bằng quyền owner (bỏ qua RLS).
--      Mọi phiên đã đăng nhập — talent, brand, kể cả không có dòng profiles — UPDATE / DELETE / INSERT được `talents` qua view:
--      xoá một host kéo theo (cascade) lịch sử rate, giờ làm theo ca (session_staff_segments), đăng ký, xác nhận lịch và gỡ host
--      khỏi mọi ca. live_sessions_secure / brand_commitment_progress / session_room_deltas cũng mang quyền ghi thừa (không cập
--      nhật được nên chưa thành lỗ) — thu luôn.
--   B) `notify_ops` / `notify_talent` (security definer) gọi thẳng được qua /rpc với tiêu đề + nội dung tuỳ ý ⇒ một tài khoản
--      host/brand bắn thông báo giả tới toàn bộ ops/CEO hoặc tới host khác. Client không gọi; chỉ notify_session_changes và
--      request_shift_dropout (cả hai security definer của postgres) gọi.
-- Phạm vi đọc của talent (user duyệt 05/11: điểm 3, 4, 5; ca + báo cáo ca giữ như cũ):
--   3) talents_secure: SĐT, ngày sinh, GMV/chỉ số, brands_worked_with, profile_id của host KHÁC che với role talent (chính
--      chủ vẫn thấy đủ). App talent chỉ dùng số của chính mình.
--   4) profiles: talent chỉ đọc dòng của mình (trước: email mọi tài khoản).
--   5) brands: thêm view `brands_secure` che người liên hệ / SĐT / email / tổng GMV / hình thức tính phí với role talent; talent
--      bị đóng bảng gốc (khuôn 0107 của brand với live_sessions). Client đọc danh sách brand qua view; ghi vẫn vào bảng.
-- Deploy: chạy migration rồi deploy client (client cũ đọc bảng gốc ⇒ role talent thấy 0 brand, tên brand trên lịch talent trống
-- tới khi deploy; role khác không đổi).

-- ============================================================================
-- A) View chỉ để ĐỌC
-- ============================================================================
revoke insert, update, delete, truncate, references, trigger on public.talents_secure from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.live_sessions_secure from public, anon, authenticated;
do $$ begin
  if to_regclass('public.brand_commitment_progress') is not null then
    revoke insert, update, delete, truncate, references, trigger on public.brand_commitment_progress from public, anon, authenticated;
  end if;
  if to_regclass('public.session_room_deltas') is not null then
    revoke insert, update, delete, truncate, references, trigger on public.session_room_deltas from public, anon, authenticated;
  end if;
end $$;

-- ============================================================================
-- B) Hàm gửi thông báo chỉ gọi từ hàm khác
-- ============================================================================
revoke execute on function public.notify_ops(text, text, text, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.notify_talent(uuid, text, text, text, uuid, uuid) from public, anon, authenticated;

-- ============================================================================
-- 3) talents_secure — thông tin cá nhân + số của host khác chỉ nhân viên agency thấy
-- ============================================================================
-- Cùng cột, cùng thứ tự với 0176/0179. Vế rate giữ nguyên (ceo/admin/trainer + chính chủ); vế còn lại bỏ 'talent' khỏi danh sách
-- và thêm chính chủ theo hồ sơ đã gắn (id = current_user_talent_id()). Role NULL ⇒ coalesce '' ⇒ che (hỏng về phía ĐÓNG).
create or replace view public.talents_secure as
select
  id,
  name,
  avatar,
  role,
  gender,
  niches,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then avg_gmv_per_session end as avg_gmv_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then total_gmv end as total_gmv,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then ctr_avg end as ctr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then cvr_avg end as cvr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then rate_per_session end as rate_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then commission_rate end as commission_rate,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then overall_score end as overall_score,
  availability_status,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then brands_worked_with end as brands_worked_with,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then phone end as phone,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then date_of_birth end as date_of_birth,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then profile_id end as profile_id,
  created_at,
  updated_at,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then rate_per_hour end as rate_per_hour,
  nickname,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer')
         or profile_id = (select auth.uid()) or id = (select current_user_talent_id())
       then assistant_rate_per_hour end as assistant_rate_per_hour
from public.talents;

revoke all on public.talents_secure from public, anon, authenticated;
grant select on public.talents_secure to authenticated;

-- ============================================================================
-- 4) profiles — talent chỉ đọc dòng của mình
-- ============================================================================
drop policy if exists profiles_read_scoped on public.profiles;
create policy profiles_read_scoped on public.profiles for select
  using (coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer') or id = (select auth.uid()));

-- ============================================================================
-- 5) brands — view che liên hệ với role talent; talent đóng bảng gốc
-- ============================================================================
create or replace view public.brands_secure as
select
  id,
  name,
  logo,
  industry,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()))
       then contact_name end as contact_name,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()))
       then phone end as phone,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()))
       then email end as email,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()))
       then total_gmv end as total_gmv,
  contract_status,
  owner,
  owner_user_id,
  created_at,
  updated_at,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer')
         or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()))
       then billing_model end as billing_model
from public.brands
-- View chạy quyền owner (bỏ qua RLS bảng gốc) ⇒ WHERE này là hàng rào dòng duy nhất. Khẳng định role (không dùng phủ định):
-- role NULL ⇒ 0 dòng.
where coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent')
   or ((select current_user_role())::text = 'brand' and id = (select current_user_brand_id()));

revoke all on public.brands_secure from public, anon, authenticated;
grant select on public.brands_secure to authenticated;

-- Bảng gốc: nhân viên agency + brand của chính mình (ghi + đọc lại sau khi ghi). Talent đọc qua view.
drop policy if exists brands_read_scoped on public.brands;
create policy brands_read_scoped on public.brands for select
  using ((select current_user_role()) in ('ceo', 'operations', 'admin', 'trainer')
         or ((select current_user_role()) = 'brand' and id = (select current_user_brand_id())));

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
declare
  v_bad text;
begin
  select string_agg(table_name || ':' || grantee || ':' || privilege_type, ', ') into v_bad
  from information_schema.role_table_grants g
  join pg_class c on c.relname = g.table_name and c.relnamespace = 'public'::regnamespace and c.relkind = 'v'
  where g.table_schema = 'public' and g.grantee in ('anon', 'authenticated', 'PUBLIC') and g.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception '0198: view trong public còn quyền ghi cho người dùng: %', v_bad;
  end if;
  if has_function_privilege('authenticated', 'public.notify_ops(text, text, text, uuid, uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_talent(uuid, text, text, text, uuid, uuid)', 'execute') then
    raise exception '0198: authenticated vẫn gọi được notify_ops/notify_talent';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_read_scoped'
             and qual ~ '''talent''') then
    raise exception '0198: profiles_read_scoped vẫn mở cho talent';
  end if;
end $$;
