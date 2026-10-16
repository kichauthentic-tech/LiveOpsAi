-- 0177 — Link lịch riêng (.ics) cho từng host/trợ live (app talent bản 2, 16/10/2026).
--
-- Vì sao: đo 16/10 — 39 tài khoản talent, từ ngày ra app (11/10) chỉ 1 người từng mở, 0 lần bấm "Đã nhận". Lịch vẫn tới
-- host qua Google Sheet + Zalo. Link .ics thêm MỘT lần vào Google Calendar / Lịch iPhone: ca tự hiện, tự nhắc trước giờ live,
-- OP đổi giờ thì lịch điện thoại tự đổi theo. Đề xuất + số đo: https://claude.ai/artifact/JVFAC43zih6h2AaS1anErA
--
-- Một dòng = một người. `token` là mã bí mật nằm trong link (ai có link đọc được lịch ca của người đó: giờ, brand, phòng,
-- người đi cùng — KHÔNG có GMV/target/rate). Chỉ server (service_role) đọc/ghi: route /api/me/calendar-feed (lấy/tạo link của
-- chính mình), /api/me/calendar-feed/rotate (đổi link khi lộ), /api/calendar/<token>.ics (file lịch). Xem
-- src/server/calendarFeed.ts. Không có policy nào ⇒ anon/authenticated không đọc được mã của ai, kể cả của chính mình qua REST.

create table if not exists talent_calendar_feeds (
  talent_id uuid primary key references talents(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

alter table talent_calendar_feeds enable row level security;
revoke all on talent_calendar_feeds from anon, authenticated;
