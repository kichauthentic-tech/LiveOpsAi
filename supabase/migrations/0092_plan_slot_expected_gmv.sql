-- Kế Hoạch Tháng — giai đoạn D: lưu DỰ BÁO của engine cho từng ca kế hoạch lúc lưu, để cuối tháng
-- so kế hoạch vs thực tế (ca thật gắn qua slot_id → shift_slots.session_id → live_sessions) và tự
-- hiệu chỉnh trọng số ô thứ × giờ cho tháng sau. 0 = ca ops đặt tay không qua engine (không tính
-- vào hiệu chỉnh).
alter table brand_month_plan_slots add column if not exists expected_gmv numeric not null default 0;
