-- 0182 — Action plan của Report Tháng (2026-10-27).
--
-- Học deck CROCS T9 (slide "Plans for OCT"): mỗi việc tháng sau có 3 cột Hành động · Căn cứ · Chỉ tiêu theo dõi.
-- Plan lưu ở report của tháng VIẾT ra nó; report của tháng sau tự chấm Đạt/Chưa đạt bằng bộ số của chính nó
-- (logic chấm ở client: src/lib/report/actionPlan.ts). Việc không đo được bằng số thì ops tự chấm, kết quả ghi
-- ngược vào đúng dòng plan này (khoá items[].manual).
--
-- Dạng: { "items": [ { "id", "action", "basis", "trackText",
--                      "target": { "metric", "scope", "op": "gte"|"lte", "value" } | null,
--                      "manual": { "status": "met"|"missed", "at" } | null } ], "savedAt": "<iso>" }
--
-- Chỉ thêm cột (cùng cách 0121 section_notes): RLS 0051/0107/0114 áp nguyên cho dòng — ops ghi, brand chỉ đọc dòng
-- đã phát hành. Client ghi đi đường riêng saveMonthlyReportActionPlan(), không qua upsert các cột khác.

alter table brand_monthly_reports
  add column if not exists action_plan jsonb;

alter table brand_monthly_reports
  drop constraint if exists brand_monthly_reports_action_plan_shape;
alter table brand_monthly_reports
  add constraint brand_monthly_reports_action_plan_shape
  check (action_plan is null or (jsonb_typeof(action_plan) = 'object' and jsonb_typeof(action_plan -> 'items') = 'array'));

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'brand_monthly_reports' and column_name = 'action_plan'
  ) then
    raise exception '0182: cột action_plan chưa có';
  end if;
end $$;
