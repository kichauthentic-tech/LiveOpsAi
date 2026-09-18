-- Gỡ toàn bộ seed chạy thử (2026-09_trial_seed.sql). Chạy trong Supabase SQL Editor.
-- Không đụng: 13 ca JOCKEY do ops tạo, 4 brand, 4 hồ sơ talent mẫu (rate card mới giữ nguyên).
-- Ca đã CHỐT từ slot seed (live_sessions tạo bởi "Chốt hàng loạt") không có dấu [SEED] —
-- xoá tay trong Live Sessions nếu muốn sạch hẳn.
begin;
delete from session_availability where talent_id in (
  '6ad34a98-d213-4ef0-a20e-66a7c45e3104','91d09294-b6fc-47d4-9ac4-693a589405fe',
  '701bfb56-25e2-49f0-9b55-48d8825eccad','a1411dde-8b66-4982-adf8-fef2e055dbd7');
delete from shift_slots where notes = 'SEED chạy thử';
delete from live_sessions where title like '[SEED] %';          -- cascade: reports, finance, skus, snapshots
delete from brand_monthly_reports where promotion_notes = 'SEED chạy thử';
commit;
