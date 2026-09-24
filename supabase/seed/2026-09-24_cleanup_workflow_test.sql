-- Dọn dữ liệu test của phiên "chạy thử toàn bộ workflow" ngày 2026-09-24.
-- KHÔNG phải migration. Chạy tay trong Supabase SQL Editor, chạy 1 lần. Chạy lại cũng vô hại
-- (mọi câu đều xoá theo id, id đã mất thì xoá 0 dòng).
--
-- Mọi id dưới đây đọc THẲNG từ production ngày 2026-09-24, không suy từ code.
-- Chỉ chạm brand VERA (3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb) tháng 9/2026 + 1 lô đối soát test.
-- Dữ liệu CROCS nạp bù, plan CROCS T10, 2 report nháp T8 của CROCS/Franklin: KHÔNG bị đụng.
--
-- Sửa 2026-09-24 sau lần chạy đầu thất bại: bản trước lọc `brand_month_plans` bằng cột
-- `period_month` (ERROR 42703) — bảng đó dùng cột `month`. Bản này xoá kế hoạch theo id luôn.

begin;

-- 1) Report tháng VERA 2026-09 (phiên test đã phát hành).
delete from brand_monthly_reports
 where id = '152ee6aa-431e-4503-93bd-30aca6c4ae7e';

-- 2) Hai ca test — snapshot ca + report ca đi theo FK cascade.
--    Ca 23/09 đang Completed + tiktok_reconciled nên UI cố ý không cho xoá, phải xoá ở đây.
delete from live_sessions
 where id in ('9ceadca5-1b2d-41e1-96dc-9ddfcd8e4242',  -- 23/09, đã đối soát 72,5tr
              'e2f63244-4ee6-4512-ba6f-17961e4363fb'); -- 25/09, đã huỷ

-- 3) Lô đối soát test (ZZZ-Doi-Soat-test.xlsx). Lô thật 01/06–22/09 giữ nguyên.
delete from live_reconciliation_batches
 where id = '2f2168d8-6e2b-4dac-966a-cba73ad616ea';

-- 4) Ba ca chờ đăng ký test của VERA.
delete from shift_slots
 where id in ('f0bcc369-6631-4133-9908-a751c91c3c50',  -- 23/09
              '9c67ebca-39db-4a21-9d8e-ae5bac2b42a6',  -- 25/09 (cancelled)
              '6665c34f-4bad-4e33-8349-98d77173116a'); -- 26/09

-- 5) Kế hoạch tháng VERA 09/2026 + 2 ca kế hoạch. Xoá ca kế hoạch trước cho tường minh
--    (bảng cha có cascade, nhưng xoá tay thì đọc log thấy đúng số dòng).
delete from brand_month_plan_slots
 where id in ('926e379a-5bbb-4401-85a9-2de08159fb6c',
              'e65cad83-7325-4a2e-a4a1-e19ae00c8ca5');
delete from brand_month_plans
 where id = 'e2eef77b-fa08-475e-97ff-bb34cbdf7ddc';

-- 6) Cam kết tháng trước, hợp đồng sau — brand_monthly_commitments.contract_id trỏ tới hợp đồng.
delete from brand_monthly_commitments
 where id = '266561ac-78c4-4ee0-940f-b62ebc4b2e65';
delete from brand_contracts
 where id = '7b7d3876-2c86-492d-b59d-c3ef49d7dc04';

commit;

-- Kiểm chứng: cả 6 dòng phải ra 0.
-- select count(*) as sessions_vera   from live_sessions          where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';
-- select count(*) as slots           from shift_slots;
-- select count(*) as plans_vera      from brand_month_plans      where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';
-- select count(*) as contracts       from brand_contracts;
-- select count(*) as commitments     from brand_monthly_commitments;
-- select count(*) as reports_vera    from brand_monthly_reports  where brand_id = '3fb28f0f-032e-42d8-a9fb-1e5a32f13dcb';
--
-- Và 2 dòng này phải giữ nguyên số cũ (không bị dọn nhầm):
-- select count(*) as sessions_crocs  from live_sessions          where brand_id = '07de51d2-fae6-437c-bd00-f10c12ccfbf9';  -- 229
-- select count(*) as batches         from live_reconciliation_batches;                                                    -- 1
