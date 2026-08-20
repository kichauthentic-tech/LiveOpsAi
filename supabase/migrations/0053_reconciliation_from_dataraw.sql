-- Giai đoạn 1 lộ trình đối soát: bỏ luồng upload file riêng của module Đối Soát, lấy thẳng dữ
-- liệu "Live Analysis" từ kho Dataraw của brand (migration 0052). Trước đây ops phải upload CÙNG
-- một file 2 lần (1 lần vào Dataraw để lưu trữ/deep-dive, 1 lần vào Đối Soát để match session) —
-- 2 bản sao dễ lệch nhau. Nay Dataraw là nguồn duy nhất; batch staging tiktok_live_imports được
-- sinh ra TỪ 1 batch Dataraw và gắn ngược lại bằng dataraw_import_id.
--
-- Kèm theo brand_id: file Dataraw luôn thuộc đúng 1 brand, nên khi match session chỉ cần xét
-- session của brand đó thay vì toàn agency — giảm hẳn nhầm lẫn khi 2 brand có host trùng giờ.

alter table tiktok_live_imports drop constraint if exists tiktok_live_imports_source_check;
alter table tiktok_live_imports
  add constraint tiktok_live_imports_source_check check (source in ('csv_export', 'api', 'dataraw'));

alter table tiktok_live_imports
  add column if not exists brand_id uuid references brands(id) on delete cascade,
  add column if not exists dataraw_import_id uuid references brand_dataraw_imports(id) on delete set null;

-- 1 batch Dataraw chỉ sinh ra đúng 1 batch staging — nạp lại (sau khi ops upload đè Dataraw của
-- tháng đó) thì ghi đè batch cũ thay vì tạo thêm bản trùng.
create unique index if not exists idx_tiktok_live_imports_dataraw
  on tiktok_live_imports(dataraw_import_id) where dataraw_import_id is not null;

create index if not exists idx_tiktok_live_imports_brand
  on tiktok_live_imports(brand_id) where brand_id is not null;
