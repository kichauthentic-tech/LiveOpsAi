-- Dọn ca test dùng để verify Đ7 (thông báo "Có ca mới đang mở đăng ký") và Đ9 (talent báo không đi
-- được ca) trên tài khoản talent thật (2026-09-24).
--
-- Đã làm trên app thật: admin mở 1 ca chờ đăng ký (Franklin, FRANKLIN Room 202, 2026-09-24
-- 19:00–22:00, ghi chú "ZZZ TEST - verify Đ7/Đ9 thông báo, xoá sau khi xong") → talent nhận đúng
-- thông báo shift_open, đăng ký rảnh → admin chốt Host Huỳnh Thái Toàn / Trợ live Nguyễn Quốc Việt
-- → talent bấm "Tôi không đi được ca này" (chỉ bấm được từ tab Đăng Ký Ca, xem ghi chú lỗi UI ở
-- WORKSPACE_DESIGN.md) → admin nhận đúng thông báo shift_dropout_request → admin Huỷ ca (soft
-- cancel qua cancel_session, reopen_slot=false, lý do "ZZZ TEST dọn sau khi verify Đ7/Đ9").
--
-- Xoá cứng (hard delete) bị chặn tự làm theo quy tắc an toàn ("Xoá hẳn ca này" trong app đụng data
-- production thật) — đây là script chạy tay 1 lần trong Supabase SQL Editor.
--
-- Lưu ý cấu trúc (rút ra khi viết script này): `shift_slots.notes` KHÔNG được copy sang
-- `live_sessions` (session không có cột notes). Thông báo `shift_open` có `session_id = NULL` (fan-out
-- cho mọi talent, không link session) nên phải xoá riêng bằng match `body`; thông báo `shift_assigned`
-- và `shift_dropout_request` có `session_id` trỏ đúng session nên tự xoá theo khi xoá `live_sessions`
-- (FK `on delete cascade`, xem 0083).

-- BƯỚC 1 — chỉ SELECT, xác nhận đúng 1 slot / 1 session trước khi xoá gì cả.
select id, date, start_time, end_time, brand_name, studio_name, status, session_id, notes
  from shift_slots
 where date = '2026-09-24' and start_time = '19:00' and end_time = '22:00'
   and brand_name ilike 'Franklin'
   and notes ilike '%ZZZ TEST%';

select id, status, brand_name, host_name, co_host_name, cancel_reason
  from live_sessions
 where cancel_reason like '%ZZZ TEST%';

select id, kind, title, body, session_id, user_id
  from notifications
 where body like '%ZZZ TEST%'
    or session_id in (select id from live_sessions where cancel_reason like '%ZZZ TEST%');

-- BƯỚC 2 — xoá, theo đúng thứ tự (chạy sau khi đã soát kỹ kết quả SELECT ở trên).
begin;

-- 2a) thông báo shift_open mồ côi (session_id NULL, không cascade được)
delete from notifications
 where kind = 'shift_open'
   and body like '%ZZZ TEST%'
   and body like '%Franklin%'
   and body like '%24/09%';

-- 2b) live_sessions — cascade xoá luôn shift_assigned + shift_dropout_request qua FK session_id
delete from live_sessions
 where status = 'Cancelled'
   and cancel_reason like '%ZZZ TEST%';

-- 2c) shift_slots
delete from shift_slots
 where date = '2026-09-24' and start_time = '19:00' and end_time = '22:00'
   and brand_name ilike 'Franklin'
   and notes ilike '%ZZZ TEST%';

-- BƯỚC 3 — verify lại, cả 3 phải ra 0.
select count(*) as con_lai_slot from shift_slots where notes ilike '%ZZZ TEST%';
select count(*) as con_lai_session from live_sessions where cancel_reason like '%ZZZ TEST%';
select count(*) as con_lai_notif from notifications where body like '%ZZZ TEST%';

commit;
