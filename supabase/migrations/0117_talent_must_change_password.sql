-- Ưu tiên #3 của đợt audit (2026-09-24): "Thêm Talent Mới" ở Talent Pool trước đây tạo account với
-- mật khẩu HARDCODE "000000" cho MỌI talent, không có cơ chế bắt đổi mật khẩu lần đầu — chỉ có dòng
-- chữ nhắc trong UI (TalentMatcher.tsx). Cấp tài khoản cho 33 talent nghĩa là 33 tài khoản chung một
-- mật khẩu đoán được. Từ nay: server tự sinh mật khẩu ngẫu nhiên, hiện 1 lần cho ops, và app chặn
-- vào màn chính cho tới khi talent tự đặt mật khẩu mới.
--
-- Cột này chỉ đọc/ghi qua `profiles` — không cần policy mới: RLS `profiles_update_self_or_ceo`
-- (0001_init.sql, nới ở 0012) đã cho phép user tự update chính hàng của mình, đủ để talent tự tắt
-- cờ này sau khi đổi mật khẩu xong (xem ResetPasswordScreen.tsx, prop forceChange).

alter table profiles
  add column if not exists must_change_password boolean not null default false;
