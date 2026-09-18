-- Dọn TOÀN BỘ mock data trước khi nạp dữ liệu thật (user chốt 2026-09-19). Chạy trong SQL Editor.
-- Bao gồm 2026-09_trial_seed_rollback.sql + 4 hồ sơ Talent A/B/C/D mẫu + 1 ca JOCKEY 19/09 chốt thử
-- từ slot với talent mẫu (slot đó trả về trạng thái "open").
--
-- GIỮ NGUYÊN: 4 brand, 5 studio, 29 ca JOCKEY tháng 9 ops tạo, 63 ca CROCS tháng 6 nạp bù
-- (is_backfill, host trống), batch Dữ Liệu Gốc CROCS tháng 6, 2 dòng report tháng 8 CROCS/Franklin
-- (ops tạo, không có dấu seed), tài khoản đăng nhập.
--
-- Tài khoản kichauthentic@gmail.com (role talent) sẽ mất assigned_talent_id (FK set null) — gắn lại
-- vào hồ sơ talent thật ở Phân Quyền & Role sau khi tạo host, hoặc xoá tài khoản nếu không dùng.

begin;

-- 1) Seed tuần chạy thử
delete from session_availability where talent_id in (
  '6ad34a98-d213-4ef0-a20e-66a7c45e3104','91d09294-b6fc-47d4-9ac4-693a589405fe',
  '701bfb56-25e2-49f0-9b55-48d8825eccad','a1411dde-8b66-4982-adf8-fef2e055dbd7');
delete from shift_slots where notes = 'SEED chạy thử';
delete from live_sessions where title like '[SEED] %';          -- cascade: reports, finance, skus, snapshots
delete from brand_monthly_reports where promotion_notes = 'SEED chạy thử';

-- 2) Ca chốt thử từ slot JOCKEY 19/09 với talent mẫu → xoá ca, mở lại slot
update shift_slots set status = 'open', session_id = null
where session_id in (select id from live_sessions where is_backfill = false and title not like '[SEED] %');
delete from live_sessions where is_backfill = false;

-- 3) Hồ sơ talent mẫu (cascade: talent_rate_history, session_availability; profiles.assigned_talent_id → null)
delete from talents where id in (
  '6ad34a98-d213-4ef0-a20e-66a7c45e3104','91d09294-b6fc-47d4-9ac4-693a589405fe',
  '701bfb56-25e2-49f0-9b55-48d8825eccad','a1411dde-8b66-4982-adf8-fef2e055dbd7');

commit;

-- Kiểm tra: mong đợi sessions_backfill = 63, sessions_other = 0, talents = 0, availability = 0,
-- slots_seed = 0, slots_finalized = 0, plans_seed = 0
select
  (select count(*) from live_sessions where is_backfill) as sessions_backfill,
  (select count(*) from live_sessions where not is_backfill) as sessions_other,
  (select count(*) from talents) as talents,
  (select count(*) from session_availability) as availability,
  (select count(*) from shift_slots where notes = 'SEED chạy thử') as slots_seed,
  (select count(*) from shift_slots where status <> 'open') as slots_finalized,
  (select count(*) from brand_monthly_reports where promotion_notes = 'SEED chạy thử') as plans_seed;
