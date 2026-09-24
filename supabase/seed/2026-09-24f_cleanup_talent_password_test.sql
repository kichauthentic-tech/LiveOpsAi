-- Dọn 2 tài khoản talent test dùng để verify ưu tiên #3 (mật khẩu ngẫu nhiên + bắt đổi lần đầu,
-- migration 0117) trên app thật (2026-09-24).
--
-- Không xoá được qua UI (Talent Pool → icon thùng rác): nút "Xóa Talent" gọi `window.confirm()`,
-- mà Browser pane của Claude Code CHẶN hộp thoại confirm() gốc — tự trả về false, nên xoá không
-- bao giờ chạy tới (xem console: "Page dialog suppressed (confirm) ... confirm() returned false").
-- Không phải lỗi app — ghi lại thành giới hạn của môi trường test, không phải bug cần vá.
--
-- Xoá `auth.users` cascade xoá `profiles` theo đúng FK (`profiles.id references auth.users(id)
-- on delete cascade`, 0001_init.sql) — không cần xoá `profiles` riêng.

-- BƯỚC 1 — chỉ SELECT, xác nhận đúng 2 tài khoản trước khi xoá. (`talents` không có cột email —
-- email nằm ở `profiles`, join qua `profile_id`.)
select id, name, profile_id from talents where name like 'ZZZ TEST Password Flow%';
select id, email from auth.users where email in ('kichauthentic+zzztestpw@gmail.com', 'kichauthentic+zzztestpw2@gmail.com');

-- BƯỚC 2 — xoá.
begin;

delete from talents where name like 'ZZZ TEST Password Flow%';
delete from auth.users where email in ('kichauthentic+zzztestpw@gmail.com', 'kichauthentic+zzztestpw2@gmail.com');

-- BƯỚC 3 — verify lại, cả 3 phải ra 0.
select count(*) as con_lai_talent from talents where name like 'ZZZ TEST Password Flow%';
select count(*) as con_lai_user from auth.users where email in ('kichauthentic+zzztestpw@gmail.com', 'kichauthentic+zzztestpw2@gmail.com');
select count(*) as con_lai_profile from profiles where email in ('kichauthentic+zzztestpw@gmail.com', 'kichauthentic+zzztestpw2@gmail.com');

commit;
