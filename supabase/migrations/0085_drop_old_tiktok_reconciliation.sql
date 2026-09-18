-- 0085 — Dọn module đối soát cũ khỏi DB (user chốt 2026-09-18, sau khi code đã gỡ ở commit
-- "Gỡ module đối soát cũ..."). Module cũ (0050/0053/0054/0057/0060/0063/0068/0069): nạp file
-- Live Analysis từ Dataraw vào bảng staging, khớp tay từng dòng với ca theo ngày + tên host, rồi
-- ghi đè. Đã bị thay hoàn toàn bởi tầng snapshot theo ca (0078) + Đối Soát Số Liệu theo Room ID
-- (0080). Không còn dòng code nào đọc/ghi các bảng này.
--
-- GIỮ NGUYÊN trên live_sessions: cột data_source / reconciled_at / tiktok_room_id (thêm ở 0050)
-- — tầng mới vẫn dùng, chỉ bảng staging + RPC + hàm ngưỡng của bản cũ mới bị xoá.
--
-- Bảng live_session_reconciliations giữ lịch sử "đã đối soát dòng nào, lệch bao nhiêu" của bản cũ.
-- Xoá là mất lịch sử đó — user đã xác nhận không cần tra lại.

-- Hàm trước, bảng sau: apply_* tham chiếu bảng, drop bảng trước sẽ để lại hàm chết (không lỗi lúc
-- drop, chỉ lỗi khi gọi — đúng cái bẫy đã ghi ở quy ước "drop column/table").
drop function if exists apply_tiktok_reconciliation_chain(uuid, uuid[]);
drop function if exists apply_tiktok_reconciliation(uuid, uuid);
drop function if exists reconciliation_thresholds();

-- Policy/index/FK đi theo bảng. live_session_reconciliations FK tới cả 2 bảng kia nên drop trước.
drop table if exists live_session_reconciliations;
drop table if exists tiktok_live_import_rows;
drop table if exists tiktok_live_imports;
