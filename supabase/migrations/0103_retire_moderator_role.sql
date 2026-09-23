-- 0103 — Gỡ role 'moderator' (audit role × workspace, 2026-09-22).
--
-- VÌ SAO GỠ, không phải "sửa cho dùng được":
--   (1) Role này CHƯA BAO GIỜ đăng nhập được. `getDefaultTabForRole()` trả "calendar" cho mọi role
--       không phải brand/talent, mà tab đó gate bằng `manage_calendar` — false cho moderator kể từ
--       0010. Tài khoản moderator đăng nhập là rơi thẳng vào màn "Quyền Truy Cập Bị Hạn Chế", nút
--       "về trang mặc định" lại trỏ đúng về cái tab đang bị cấm. (Lưới an toàn đã thêm ở App.tsx
--       trong cùng đợt vá này, nhưng nó chỉ chữa triệu chứng.)
--   (2) Cột liên kết của role này chết: `live_sessions.assistant_id` không có luồng ghi nào trong
--       app (App.tsx luôn gửi assistant_name = ''), nên mọi dòng đều null.
--   (3) "Trợ live" THẬT trong app là một `talent` có `talents.role = 'Assistant'` (0087) được gắn
--       vào `live_sessions.co_host_id` — 212/218 ca thật trên DB đang đi đường này. Hai mô hình
--       song song cho cùng một vai trò nghiệp vụ, mô hình cũ không ai dùng.
--
-- Đo trên DB thật trước khi viết migration này (2026-09-22): `profiles` có đúng 2 dòng
-- (1 admin + 1 talent), KHÔNG dòng nào role = 'moderator'. Vẫn giữ guard bên dưới vì migration có
-- thể được chạy lại trên bản sao DB khác.

-- ---------------------------------------------------------------------------
-- 1) Guard — không tự ý đổi role của người thật
-- ---------------------------------------------------------------------------
-- Cố ý RAISE thay vì lặng lẽ `update ... set role = 'talent'`: đổi role của một tài khoản đang
-- hoạt động là quyết định nghiệp vụ, không phải việc của migration. Có dòng nào thì người chạy
-- migration phải tự xử lý trước rồi chạy lại.
do $$
declare
  n int;
begin
  select count(*) into n from profiles where role = 'moderator';
  if n > 0 then
    raise exception
      'Còn % tài khoản đang giữ role moderator. Đổi chúng sang role phù hợp (talent nếu là trợ live) rồi chạy lại migration này.', n;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Chặn gán lại ở tầng DB
-- ---------------------------------------------------------------------------
-- Postgres KHÔNG xoá được một value khỏi enum (`alter type ... drop value` không tồn tại), và
-- `user_role` còn được dùng ở `role_permissions.role` lẫn các hàm `current_user_role()`. Nên giá
-- trị 'moderator' vẫn nằm trong enum; thứ phải chặn là việc GÁN nó cho một tài khoản. Check
-- constraint trên `profiles.role` làm đúng việc đó, và nó chặn cả đường ghi thẳng qua PostgREST
-- lẫn đường server /api/admin/users/invite — chứ không chỉ chặn ở dropdown của UI.
alter table profiles drop constraint if exists profiles_role_not_moderator;
alter table profiles add constraint profiles_role_not_moderator
  check (role <> 'moderator');

comment on constraint profiles_role_not_moderator on profiles is
  'Role moderator đã gỡ khỏi app 2026-09-22 (xem migration 0103). Enum user_role vẫn còn value này vì Postgres không drop value khỏi enum được — constraint này mới là thứ chặn gán lại.';

-- ---------------------------------------------------------------------------
-- 3) Dọn dòng quyền chết
-- ---------------------------------------------------------------------------
-- Ma Trận Phân Quyền đọc thẳng `role_permissions` rồi map theo mảng role cứng trong
-- UserRoleSettings.tsx. Mảng đó đã bỏ 'moderator' cùng đợt này, nên dòng ở đây chỉ còn là rác.
delete from role_permissions where role = 'moderator';
