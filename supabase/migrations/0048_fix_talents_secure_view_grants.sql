-- Sửa lỗi "permission denied for table talents" phát sinh ngay sau khi chạy
-- 0047_talent_rate_and_finance_security.sql.
--
-- Nguyên nhân: view `talents_secure` được tạo với `security_invoker = true`, khiến
-- Postgres kiểm tra QUYỀN GRANT (không phải chỉ RLS) trên bảng gốc `talents` theo
-- đúng role đang gọi (authenticated) thay vì theo owner của view — trong khi migration
-- 0047 đã revoke SELECT trên `talents` khỏi `authenticated`, nên mọi query qua view
-- đều bị chặn ngay ở tầng GRANT trước khi tới được logic mask trong CASE. Chuyển view
-- về mặc định (definer-style: chạy bằng quyền owner của view, thường là role tạo view
-- qua SQL Editor, vốn đã có đủ SELECT trên `talents`) — không ảnh hưởng logic mask vì
-- current_user_role()/auth.uid() đọc từ JWT của request thật, không phụ thuộc
-- security_invoker.
alter view talents_secure set (security_invoker = false);

-- Nguyên nhân thứ 2: `createTalent()` (lib/db/talents.ts) làm INSERT ... RETURNING id
-- trực tiếp trên bảng gốc `talents` (không qua view) để lấy id vừa tạo — Postgres yêu
-- cầu quyền SELECT trên cột được RETURNING dù đó là INSERT, không chỉ INSERT privilege.
-- Mở lại đúng 1 cột `id` (không nhạy cảm, đã lộ qua view mask rồi) thay vì mở lại toàn bộ
-- bảng.
grant select (id) on talents to authenticated;
