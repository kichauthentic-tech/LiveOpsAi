-- 0173 — Role "trainer" (người quản lý nhân sự live: xếp lịch tuần, chọn người cho ca, công bố lịch).
--
-- File này CHỈ thêm giá trị enum. Postgres không cho dùng một giá trị enum mới trong cùng transaction
-- vừa thêm nó ('unsafe use of new value'), mà SQL Editor của Supabase chạy cả file trong một lần — nên
-- quyền, bảng và RPC của trainer nằm ở 0174, chạy SAU file này.
--
-- Thứ tự: 0173 rồi 0174, cả hai trước khi deploy client có màn "Bàn Trainer" (client cũ không biết
-- role trainer: tài khoản trainer đăng nhập client cũ sẽ chỉ thấy menu mặc định, không hỏng gì khác).

alter type public.user_role add value if not exists 'trainer';
