-- Giai đoạn 20 — Đóng Sổ Tháng (Payroll + Revenue reconciliation) + Xuất hoá đơn/công nợ Brand.
--
-- Bối cảnh: FinanceHr.tsx (Giai đoạn 7/19) đã tính đúng P&L từng session, nhưng chưa có báo cáo
-- gộp theo tháng (tổng lương talent, tổng doanh thu theo brand) và không có cơ chế khoá sổ —
-- session_finance của 1 tháng đã "chốt" vẫn có thể bị sửa âm thầm sau này (Studio/Ads cost, %
-- commission), làm số liệu đã báo cáo brand/kế toán "tự đổi". Đồng thời workflow CEO đã duyệt
-- (mục #3, BUSINESS_ROADMAP.md) cần theo dõi brand đã thu tiền hay chưa sau khi tính xong doanh
-- thu — tính doanh thu xong không có nghĩa là đã thu được tiền.
--
-- 2 bảng độc lập, không đụng session_finance/live_sessions hiện có:

create table monthly_closes (
  month text primary key check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'), -- "YYYY-MM"
  status text not null default 'open' check (status in ('open', 'locked')),
  locked_by uuid references profiles(id) on delete set null,
  locked_at timestamptz,
  notes text not null default '',
  updated_at timestamptz not null default now()
);

alter table monthly_closes enable row level security;
create policy "monthly_closes_read_all" on monthly_closes for select using (auth.role() = 'authenticated');
-- Khoá/mở khoá sổ là hành động nhạy cảm tài chính, cùng mức với duyệt session_finance
-- (session_finance_write_ceo hiện tại = ceo + admin, xem migration 0012) — không mở cho operations.
create policy "monthly_closes_write_ceo" on monthly_closes for all
  using (current_user_role() in ('ceo', 'admin'))
  with check (current_user_role() in ('ceo', 'admin'));

create table brand_invoices (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  amount numeric not null default 0,
  status text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  due_date date,
  paid_amount numeric not null default 0,
  paid_at timestamptz,
  notes text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, month)
);

alter table brand_invoices enable row level security;
create policy "brand_invoices_read_all" on brand_invoices for select using (auth.role() = 'authenticated');
-- Lập/theo dõi hoá đơn là việc vận hành thường xuyên (giống campaigns/brand_platform_rates) —
-- operations được ghi, không cần chờ ceo/admin cho từng hoá đơn.
create policy "brand_invoices_write_ceo_ops" on brand_invoices for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));

-- Khoá sổ chặn sửa session_finance của mọi session thuộc tháng đã khoá — trừ khi CEO/Admin tự
-- mở khoá tay (update monthly_closes.status về 'open') trước. session_report_metrics (Giai đoạn
-- 17, đang hoãn) chưa tồn tại nên chưa có gì để khoá thêm ở đó; sẽ bổ sung trigger tương tự khi
-- Giai đoạn 17 triển khai.
create or replace function trg_block_session_finance_when_locked() returns trigger as $$
declare
  session_month text;
begin
  select to_char(date, 'YYYY-MM') into session_month from live_sessions where id = new.session_id;
  if session_month is not null and exists(
    select 1 from monthly_closes where month = session_month and status = 'locked'
  ) then
    raise exception 'Tháng % đã khoá sổ — không thể sửa Finance của phiên thuộc tháng này. CEO/Admin cần mở khoá trước.', session_month;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_session_finance_lock_check
  before insert or update on session_finance
  for each row execute function trg_block_session_finance_when_locked();
