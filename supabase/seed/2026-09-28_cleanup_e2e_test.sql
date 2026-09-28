-- Dọn dữ liệu test của phiên "check quy trình end-to-end vòng đời 1 ca live" ngày 2026-09-28.
-- KHÔNG phải migration. Chạy tay trong Supabase SQL Editor, chạy 1 lần. Chạy lại cũng vô hại
-- (mọi câu đều xoá theo id, id đã mất thì xoá 0 dòng).
--
-- Mọi id dưới đây đọc THẲNG từ production ngày 2026-09-28, không suy từ code.
-- Chỉ chạm brand VERA (3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb) tháng 9/2026.
-- Đã dọn sẵn qua UI (không còn gì ở đây): hợp đồng ZZZ-TEST-VERA-02 + cam kết tháng 9,
-- lô đối soát ZZZ-Doi-Soat-test-2809.xlsx, ca chờ đăng ký 30/09. Report VERA 09 đã thu hồi về nháp,
-- ca 28/09 đã "loại khỏi báo cáo" nên số CROCS/agency trên app đã đúng ngay cả trước khi chạy script.

begin;

-- 1) Report tháng VERA 2026-09 (nháp) + bản chụp số liệu của nó.
delete from brand_monthly_reports
 where id = '1e9e3fe1-d6da-486a-a1c2-69b2895dac22';
delete from brand_monthly_report_snapshots
 where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb' and period_month = '2026-09-01';

-- 2) Hai ca test. Snapshot ca (+ rows), report ca, thông báo gắn session_id đi theo FK cascade.
--    Ca 28/09 đã Completed + tiktok_reconciled nên UI cố ý không cho xoá/huỷ (Đ10).
delete from live_sessions
 where id in ('6246ec17-6221-4def-940f-ca9dd3d64df1',  -- 28/09 00:00–00:30, đối soát 18,2M, đã loại khỏi báo cáo
              'd5c01716-4576-4d46-ae03-b649836619c8'); -- 30/09 09:00–12:00, đã huỷ

-- 3) Ca chờ đăng ký 28/09 (finalized) sinh từ kế hoạch.
delete from shift_slots
 where id = '780fd5a0-37e3-4ae2-a9f6-c2616e028fbc';

-- 4) Kế hoạch tháng VERA 09/2026 — 2 ca kế hoạch đi theo cascade. UI chặn "Xoá kế hoạch" vì có
--    ca đã chốt người (đúng thiết kế 0115), nên phải xoá ở đây, SAU bước 2–3.
delete from brand_month_plans
 where id = '77fc44b0-92c6-453c-ad5d-fd1500c32064';

-- 5) Thông báo "Có ca mới đang mở đăng ký" lúc chốt kế hoạch (kind shift_open KHÔNG gắn session_id
--    nên không đi theo cascade ở bước 2). Khoanh đúng brand + đúng phút chốt 00:11 28/09 giờ VN.
delete from notifications
 where kind = 'shift_open'
   and brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb'
   and created_at between '2026-09-27 17:11:00+00' and '2026-09-27 17:13:00+00';

commit;

-- Kiểm chứng: 4 dòng đầu phải ra 0, 2 dòng sau giữ nguyên số cũ.
-- select count(*) from live_sessions               where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';  -- 0
-- select count(*) from shift_slots;                                                                        -- 0
-- select count(*) from brand_month_plans           where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';  -- 0
-- select count(*) from brand_monthly_reports       where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';  -- 0
-- select count(*) from live_sessions               where brand_id = '07de51d2-fae6-437c-bd00-f10c12ccfbf9';  -- 229
-- select count(*) from live_reconciliation_batches;                                                        -- 1
