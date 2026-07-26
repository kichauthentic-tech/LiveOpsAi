-- Giai đoạn 7: Finance & HR thật — P&L thật theo từng phiên live đã hoàn thành.
-- Sidecar 1-1 với live_sessions (giống pattern role_permissions: số dòng cố định theo session,
-- không phải entity độc lập có insert/delete tự do).

create table if not exists session_finance (
  session_id uuid primary key references live_sessions(id) on delete cascade,
  agency_commission_rate numeric not null default 15,
  studio_cost numeric not null default 0,
  ads_cost numeric not null default 0,
  host_fix_rate_override numeric,
  host_commission_rate_override numeric,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved', 'rejected')),
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table session_finance enable row level security;

create policy "session_finance_read_all" on session_finance for select using (auth.role() = 'authenticated');

-- manage_finance_hr permission is CEO-only in role_permissions seed data (unlike most other
-- modules where operations can also write) — write access mirrors that.
create policy "session_finance_write_ceo" on session_finance for all
  using (current_user_role() = 'ceo') with check (current_user_role() = 'ceo');
