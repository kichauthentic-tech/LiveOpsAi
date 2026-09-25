-- 0119 — Bản chụp số liệu Report Tháng (2026-09-25).
--
-- Trước đây Report Tháng KHÔNG lưu con số nào: mỗi lần mở là tính lại từ ca + file Dữ Liệu Gốc.
-- Đo thật CROCS T9/2026: ~17 MB mỗi lần mở (file product_list 5,3 MB bị tải 3 lần, file
-- Creator-Live-Performance tải 4 lần dù chỉ là nguồn dự phòng), và số đã phát hành vẫn tự đổi dưới
-- chân brand khi có ca đối soát lại/file up đè.
--
-- Nay: ops bấm "Tạo report"/"Cập nhật số liệu" → app tính 1 lần, lưu vào đây. Mọi lần mở (ops lẫn
-- brand) chỉ đọc bản chụp. Nội dung jsonb do client dựng (lib/report/monthlySnapshot.ts) — DB không
-- diễn giải, chỉ giữ + phân quyền.
--
-- Bảng RIÊNG thay vì cột trên brand_monthly_reports: bảng đó bị `select *` ở nhiều chỗ (App nạp mọi
-- dòng để phân bổ target, 2 RPC phát hành/thu hồi trả nguyên dòng) — gắn vài trăm KB jsonb vào sẽ
-- kéo theo mọi lời gọi đó. Khoá tự nhiên (brand_id, period_month) như brand_monthly_reports nên tạo
-- được bản chụp trước khi tháng có dòng report.

create table if not exists brand_monthly_report_snapshots (
  brand_id uuid not null references brands(id) on delete cascade,
  period_month date not null check (extract(day from period_month) = 1),
  snapshot jsonb not null,
  computed_at timestamptz not null default now(),
  computed_by uuid default auth.uid(),
  primary key (brand_id, period_month)
);

alter table brand_monthly_report_snapshots enable row level security;

-- Ops soạn/cập nhật. Viết khẳng định + bọc (select …) theo quy ước 0105/0111: role NULL ra NULL ⇒
-- không qua, không có nhánh `is distinct from` nào để lọt.
drop policy if exists "brand_monthly_report_snapshots_ops" on brand_monthly_report_snapshots;
create policy "brand_monthly_report_snapshots_ops" on brand_monthly_report_snapshots for all
  using ((select current_user_role()) in ('ceo', 'admin', 'operations'))
  with check ((select current_user_role()) in ('ceo', 'admin', 'operations'));

-- Brand chỉ đọc bản chụp của CHÍNH brand mình và chỉ khi tháng đó đã phát hành (cùng mốc với 0107:
-- brand không thấy con số nào chưa phát hành). brand_month_published là security definer (0107).
drop policy if exists "brand_monthly_report_snapshots_brand_read_published" on brand_monthly_report_snapshots;
create policy "brand_monthly_report_snapshots_brand_read_published" on brand_monthly_report_snapshots for select
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and brand_month_published(brand_id, period_month)
  );
