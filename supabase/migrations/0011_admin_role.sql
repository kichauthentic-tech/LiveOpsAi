-- Giai đoạn 13 (bước 1/2) — thêm 'admin' là role thật, quyền tối cao trong hệ thống
-- (superset của 'ceo': mọi thao tác CEO làm được thì Admin cũng làm được, cộng thêm
-- quyền độc quyền cấu hình AI Training — xem PROJECT_STATUS.md Giai đoạn 13).
--
-- QUAN TRỌNG: Postgres không cho dùng giá trị enum mới thêm trong CÙNG transaction
-- với lệnh ALTER TYPE ... ADD VALUE (đã gặp ở Giai đoạn 12 với 'moderator'). Chạy
-- RIÊNG file này trước, đợi chạy xong (commit), rồi mới chạy tiếp
-- 0012_admin_ai_training_setup.sql ở 1 lần Run khác.
alter type user_role add value if not exists 'admin';
