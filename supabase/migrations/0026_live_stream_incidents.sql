-- Giai đoạn B3 — Live Stream Incident Log (Agency Workspace, nhóm "Content & Quality").
--
-- Nhật ký sự cố khi live (rớt mạng, khoá giỏ hàng, host trễ, hết voucher...), mức độ nghiêm
-- trọng, xử lý khắc phục. Liên kết session_id, theo mục 6/WORKSPACE_DESIGN.md.
--
-- Roadmap gợi ý "tái dùng pattern append-only của audit_logs", nhưng khác audit_logs (log hành vi
-- hệ thống, không sửa được), incident cần cập nhật resolution/status sau khi Ops xử lý xong sự cố
-- — nên dùng full CRUD như product_samples/brand_skus thay vì append-only thuần, giữ đúng convention
-- ghi/xoá ceo-operations-admin đã dùng xuyên suốt dự án.

create table live_stream_incidents (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  category text not null
    check (category in ('network_drop', 'cart_locked', 'host_late', 'voucher_exhausted', 'other')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  description text not null default '',
  resolution text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  reported_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index live_stream_incidents_session_id_idx on live_stream_incidents (session_id);

alter table live_stream_incidents enable row level security;
create policy "live_stream_incidents_read_all" on live_stream_incidents for select using (auth.role() = 'authenticated');
create policy "live_stream_incidents_write_ceo_ops" on live_stream_incidents for all
  using (current_user_role() in ('ceo', 'operations', 'admin'))
  with check (current_user_role() in ('ceo', 'operations', 'admin'));
