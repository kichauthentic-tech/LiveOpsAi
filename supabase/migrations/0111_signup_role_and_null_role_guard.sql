-- 0111 — CHẶN TỰ PHONG ROLE KHI ĐĂNG KÝ + BỊT NỐT 11 POLICY CÒN DÍNH KHUÔN NULL-ROLE.
-- (Đánh số lại từ 0110 → 0111 ngày 2026-09-23: trùng số với 0110_brand_confirms_next_month_plan.sql
-- do 2 phiên làm việc song song cùng lấy số kế tiếp sau 0109. File kia đã CHẠY & user xác nhận
-- trước khi phát hiện trùng, nên giữ nguyên số của nó; file này (chưa chạy) nhường số, đổi thành 0111.)
-- (Phát hiện 2026-09-23, quét tiếp sau khi 0109 đã chạy.)
--
-- ============================================================================
-- LỖ 1 — NGHIÊM TRỌNG: người lạ tự tạo tài khoản `ceo`
-- ============================================================================
-- `handle_new_user` (0002) đọc role do CLIENT gửi lên:
--     requested_role text := new.raw_user_meta_data->>'role';
-- `raw_user_meta_data` chính là `options.data` của `supabase.auth.signUp()` — client tự đặt,
-- GoTrue không kiểm gì cả. Form đăng ký trong app chỉ gửi `{name}` nên qua UI thì ra `talent`,
-- NHƯNG `/auth/v1/signup` là endpoint HTTP công khai: ai có khoá anon (nằm sẵn trong bundle
-- trình duyệt) đều POST thẳng được với `data: {"role":"ceo"}`.
--
-- Đã kiểm trên bản sao cục bộ: thêm user với raw_user_meta_data = '{"role":"ceo"}' ⇒ profiles
-- tạo ra role = **ceo**. Và `GET /auth/v1/settings` của project thật trả `disable_signup: false`
-- ⇒ tự đăng ký đang BẬT. (Không thử trên DB thật — tạo tài khoản ceo thật là hành vi phá hoại.)
--
-- CÁCH VÁ: trigger KHÔNG bao giờ tin role của client nữa — luôn tạo bằng role thấp nhất
-- (`talent`). Luồng mời người dùng hợp lệ (`/api/admin/users`, chạy bằng service_role) sẽ tự
-- ghi đè role ngay sau khi tạo — xem `src/server/createApp.ts`, đúng pattern nó đang làm với
-- `assigned_brand_id`/`assigned_talent_id`. Quyền cấp role vì vậy nằm hẳn ở phía server.
--
-- BỎ LUÔN `exception when others then raise warning`: nuốt lỗi nghĩa là auth.users có dòng mà
-- profiles không có ⇒ current_user_role() = NULL ⇒ đúng loại tài khoản lọt qua các policy ở
-- LỖ 2 bên dưới. Từ nay insert hỏng thì đăng ký hỏng luôn — fail đóng, không fail mở.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- KHÔNG đọc role từ new.raw_user_meta_data: client tự đặt được. Luôn role thấp nhất.
  -- Muốn cấp role cao hơn thì phải đi qua service_role (server), không qua đường đăng ký.
  insert into public.profiles (id, name, email, role, custom_role_title)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    new.email,
    'talent',
    ''
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

-- ============================================================================
-- LỖ 2 — 11 policy còn dùng khuôn `is distinct from 'brand'` trần
-- ============================================================================
-- Cùng bệnh với 0109: role NULL thì `null is distinct from 'brand'` = TRUE nên lọt.
-- Sau 0109 thì `anon` đã bị thu quyền nên người lạ không với tới được, NHƯNG tài khoản ĐÃ
-- ĐĂNG NHẬP mà thiếu dòng profiles (role NULL) thì vẫn đọc được — đã đo: `live_session_reports`
-- trả về đủ dòng cho tài khoản kiểu đó.
--
-- Bọc thêm vế `is not null` vào 11 policy, viết bằng vòng lặp thay vì chép tay 11 biểu thức
-- (chép tay là chỗ dễ sai nhất). Policy nào đã có `is not null` thì bỏ qua ⇒ chạy lại được.
do $$
declare
  r record;
  q text;
begin
  for r in
    select c.relname as tbl, p.polname as pol, pg_get_expr(p.polqual, p.polrelid) as qual
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and p.polcmd = 'r'
      and p.polpermissive
      and p.polroles = '{0}'                                    -- to public
      and pg_get_expr(p.polqual, p.polrelid) ilike '%is distinct from%'
      and pg_get_expr(p.polqual, p.polrelid) not ilike '%is not null%'
  loop
    q := format(
      '(select current_user_role()) is not null and (%s)',
      r.qual
    );
    execute format('drop policy %I on public.%I', r.pol, r.tbl);
    execute format('create policy %I on public.%I for select using (%s)', r.pol, r.tbl, q);
    raise notice 'đã siết policy %.%', r.tbl, r.pol;
  end loop;
end $$;

-- ============================================================================
-- CÒN LẠI — KHÔNG SỬA ĐƯỢC BẰNG SQL, PHẢI VÀO DASHBOARD
-- ============================================================================
-- `disable_signup` đang là false ⇒ bất kỳ ai cũng tự tạo được tài khoản (sau migration này thì
-- chỉ ra role `talent`, không còn leo lên ceo — nhưng vẫn là người lạ có tài khoản trong hệ
-- thống nội bộ). Đây là công cụ nội bộ của agency, không có lý do gì để mở đăng ký công khai:
--   Supabase Dashboard → Authentication → Sign In / Providers → Email → tắt "Allow new users
--   to sign up". Người dùng mới vào bằng đường mời ở màn hình "Phân Quyền & Role".
