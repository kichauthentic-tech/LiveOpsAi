-- Dọn 1 dòng thông báo do vòng probe 0116 sinh ra (2026-09-24).
--
-- Bối cảnh: để kiểm constraint `kind` có thật sự nhận 'shift_open' hay không, tôi tạo 1 shift_slot
-- tương lai rồi xoá. Ca đã xoá sạch, NHƯNG `notifications` không có cột trỏ về slot (chỉ có
-- session_id / brand_id), nên dòng thông báo trigger vừa sinh không đi theo — talent sẽ thấy
-- "Có ca mới đang mở đăng ký · Ca VERA 30/12 … ZZZ-PROBE-0116" về một ca không còn tồn tại.
--
-- Không tự xoá được từ app: `notifications` cố ý CHỈ có policy SELECT (0083 — "thông báo là bản ghi
-- những gì hệ thống đã nói với một người", cho sửa là cho phép 'tôi chưa từng được báo'). Đúng
-- thiết kế, nên đây là việc chạy tay một lần.
--
-- Đáng ghi lại như một giới hạn thật: mọi thông báo về SHIFT SLOT đều mồ côi khi ca bị xoá. Với
-- ca thật thì không thành vấn đề (ca thật hiếm khi bị xoá cứng, và huỷ ca vẫn giữ dòng), nhưng
-- lần sau probe trigger thì nhớ trước là nó để lại vết.

delete from notifications
 where kind = 'shift_open'
   and body like '%ZZZ-PROBE-0116%';

-- Kiểm lại: phải ra 0.
select count(*) as con_lai_probe
  from notifications
 where body like '%ZZZ-PROBE-0116%';
