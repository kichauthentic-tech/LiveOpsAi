-- Dọn ca chờ đăng ký còn sót từ thời demo (kiểm 2026-09-19 sau khi áp 0088):
--   153 ca `open` — tháng 8/2026: CROCS/Franklin/JOCKEY/VERA mỗi brand 31 ca (tạo 11/08),
--   tháng 9/2026: JOCKEY 29 ca (tạo 20/08). Không ca nào có người đăng ký, không ca nào gắn session.
-- Kèm 4 quy tắc lặp "Hàng Ngày" cũng từ thời demo (CROCS 09-12, Franklin 11-14, JOCKEY 19-22,
-- VERA 20-23) — lịch thật của từng brand ops sẽ khai lại ở Đăng Ký & Chốt Lịch.
--
-- Script này KHÔNG chạy tự động. Chỉ chạy khi đã quyết định bỏ hết ca demo. Điều kiện an toàn:
-- chỉ xoá ca open, chưa gắn session, không ai đăng ký, tạo trước 2026-09-18 (ngày bắt đầu chạy thật).

delete from shift_slots s
where s.status = 'open'
  and s.session_id is null
  and s.created_at < '2026-09-18'
  and not exists (select 1 from session_availability a where a.slot_id = s.id);

delete from recurring_shift_templates where created_at < '2026-09-18';

select (select count(*) from shift_slots) as slots_con_lai,
       (select count(*) from recurring_shift_templates) as quy_tac_con_lai;
