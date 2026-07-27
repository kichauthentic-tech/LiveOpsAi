-- Giai đoạn 12 (bước 1/2) — thêm 'moderator' là role thật (có tài khoản đăng nhập,
-- profile, permission matrix riêng) thay vì chỉ là chuỗi text tự do gõ tay trong
-- live_sessions.assistant_name (xem PROJECT_STATUS.md mục "Còn lại" trước Giai đoạn 12).
--
-- QUAN TRỌNG: Postgres không cho dùng giá trị enum mới thêm trong CÙNG transaction
-- với lệnh ALTER TYPE ... ADD VALUE. Nếu Supabase SQL Editor chạy cả file như 1
-- transaction, mọi INSERT/UPDATE tham chiếu 'moderator' ở migration sau (0010) sẽ lỗi
-- nếu chạy chung 1 lần bấm Run với file này. Vì vậy: chạy RIÊNG file này trước, đợi
-- chạy xong (commit), rồi mới chạy tiếp 0010_moderator_setup.sql ở 1 lần Run khác.
alter type user_role add value if not exists 'moderator';
