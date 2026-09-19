-- Kế Hoạch Tháng tách khỏi Report Tháng (quyết định user 2026-09-20: "module report tháng là để sau
-- và riêng"). Trước đây target tổng, tỷ trọng khung và khoảng ngày camp đọc từ tab 05 Report Tháng;
-- giờ kế hoạch tự giữ target và khoảng camp của riêng nó.
alter table brand_month_plans add column if not exists target_gmv numeric not null default 0;
-- {"dday":{"start":"2026-10-08","end":"2026-10-10"},"midmonth":{…},"payday":{…}} — thiếu khoá nào thì
-- khoá đó theo lịch camp cố định (campaignDays.ts), giống ngữ nghĩa THAY THẾ đã chốt.
alter table brand_month_plans add column if not exists camp_ranges jsonb not null default '{}'::jsonb;
