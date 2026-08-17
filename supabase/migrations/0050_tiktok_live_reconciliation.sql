-- Đối soát số liệu Live giữa Talent tự nhập (manual, real-time, chưa chính xác vì TikTok
-- chưa chốt hoàn/hủy) và số liệu chính thức từ TikTok (export/API, chỉ có sau khi tháng đóng
-- sổ). Nguyên tắc: không cộng dồn 2 nguồn — mỗi session tại 1 thời điểm chỉ có đúng 1 nguồn
-- "chính thức" trên live_sessions, chuyển từ manual sang tiktok_reconciled bằng cách GHI ĐÈ
-- (không cộng), đồng thời lưu lại cặp giá trị trước/sau để đối soát QA (phát hiện talent nhập
-- sai/lệch số). Xem thảo luận thiết kế trong phiên làm việc — chưa có pipeline tự động pull
-- TikTok API (TikTokApiAutomation.tsx mới có OAuth connect + webhook), nên giai đoạn đầu nạp
-- dữ liệu qua staging table (tiktok_live_import_rows) bằng import file, cùng schema này sẽ
-- dùng lại được khi wiring API pull tự động sau này (chỉ khác nguồn đổ vào bảng staging).

alter table live_sessions
  add column data_source text not null default 'manual'
    check (data_source in ('manual', 'tiktok_reconciled')),
  add column reconciled_at timestamptz,
  add column tiktok_room_id text;

create index idx_live_sessions_tiktok_room_id on live_sessions(tiktok_room_id) where tiktok_room_id is not null;

-- Batch import — 1 lần import = 1 khoảng ngày (thường là 1 tháng), theo dõi trạng thái xử lý.
create table tiktok_live_imports (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  source text not null default 'csv_export' check (source in ('csv_export', 'api')),
  status text not null default 'staged' check (status in ('staged', 'matched', 'applied')),
  imported_by uuid references profiles(id) on delete set null,
  imported_at timestamptz not null default now()
);

-- Từng dòng phiên live lấy từ TikTok (Live Analysis export hoặc sau này API), trước khi match
-- với live_sessions. raw jsonb giữ nguyên toàn bộ field gốc — tránh phải sửa schema mỗi khi
-- TikTok đổi format cột export, các cột định danh bên dưới chỉ là phần đã map để dùng ngay.
create table tiktok_live_import_rows (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references tiktok_live_imports(id) on delete cascade,

  tiktok_room_id text,
  creator_name text,
  start_time timestamptz not null,
  end_time timestamptz,

  gmv numeric,
  items_sold int,
  orders int,
  customers int,
  avg_price numeric,
  ctor numeric,
  ctr numeric,
  viewers int,
  views int,
  avg_watch_time_seconds int,
  new_followers int,
  product_impressions int,
  product_clicks int,

  raw jsonb not null default '{}'::jsonb,

  matched_session_id uuid references live_sessions(id) on delete set null,
  match_confidence text check (match_confidence in ('room_id', 'time_overlap', 'manual', 'unmatched'))
);

create index idx_tiktok_live_import_rows_import_id on tiktok_live_import_rows(import_id);
create index idx_tiktok_live_import_rows_matched_session_id on tiktok_live_import_rows(matched_session_id) where matched_session_id is not null;

-- Audit trail đối soát — lưu cặp giá trị manual (trước khi ghi đè) vs tiktok (sau khi ghi đè)
-- cho từng session, để phát hiện lệch số lớn (flagged) và làm nguồn cho tab "Đối soát" nội bộ
-- (chỉ ops/ceo/admin xem, không lộ brand — brand chỉ thấy số cuối cùng trên live_sessions).
create table live_session_reconciliations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  import_row_id uuid references tiktok_live_import_rows(id) on delete set null,

  manual_actual_gmv numeric,
  tiktok_actual_gmv numeric,
  gmv_delta_pct numeric,

  manual_total_views int,
  tiktok_total_views int,

  manual_ctr_avg numeric,
  tiktok_ctr_avg numeric,

  flagged boolean not null default false,
  note text,

  reconciled_by uuid references profiles(id) on delete set null,
  reconciled_at timestamptz not null default now()
);

create index idx_live_session_reconciliations_session_id on live_session_reconciliations(session_id);
create index idx_live_session_reconciliations_flagged on live_session_reconciliations(flagged) where flagged;

alter table tiktok_live_imports enable row level security;
alter table tiktok_live_import_rows enable row level security;
alter table live_session_reconciliations enable row level security;

-- Đối soát là nghiệp vụ vận hành nội bộ (giống Finance & HR) — chỉ ceo/admin/operations,
-- không mở cho talent hay brand. Không cần policy insert/update riêng cho client vì mọi ghi
-- (staging + reconciliation) đều đi qua RPC apply_tiktok_reconciliation bên dưới; import batch
-- header/rows do ops tạo qua service layer với service-role hoặc policy insert đơn giản dưới đây.
create policy "tiktok_live_imports_ceo_admin_ops" on tiktok_live_imports for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

create policy "tiktok_live_import_rows_ceo_admin_ops" on tiktok_live_import_rows for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

create policy "live_session_reconciliations_read_ceo_admin_ops" on live_session_reconciliations for select
  using (current_user_role() in ('ceo', 'admin', 'operations'));

-- RPC ghi đè 1 session bằng số TikTok đã match, đồng thời lưu cặp giá trị trước/sau vào
-- live_session_reconciliations. Gọi lặp lại cho từng session trong 1 import batch (UI ops
-- duyệt từng match hoặc bulk-apply nếu match_confidence = 'room_id'). Security definer để tự
-- kiểm tra quyền bên trong thay vì dựa RLS theo role/row (cùng lý do như submit_live_session_report
-- ở migration 0046 — RPC ghi vào live_sessions cần quyền vượt ngoài RLS SELECT thông thường).
create or replace function apply_tiktok_reconciliation(p_import_row_id uuid, p_session_id uuid)
returns live_sessions as $$
declare
  v_row tiktok_live_import_rows;
  v_session live_sessions;
  v_delta numeric;
begin
  if current_user_role() not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to reconcile sessions';
  end if;

  select * into v_row from tiktok_live_import_rows where id = p_import_row_id;
  if not found then
    raise exception 'tiktok_live_import_rows row % not found', p_import_row_id;
  end if;

  select * into v_session from live_sessions where id = p_session_id;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  v_delta := case when coalesce(v_session.actual_gmv, 0) = 0 then null
    else round(((v_row.gmv - v_session.actual_gmv) / v_session.actual_gmv) * 100, 2) end;

  insert into live_session_reconciliations (
    session_id, import_row_id, manual_actual_gmv, tiktok_actual_gmv, gmv_delta_pct,
    manual_total_views, tiktok_total_views, manual_ctr_avg, tiktok_ctr_avg,
    flagged, reconciled_by
  ) values (
    p_session_id, p_import_row_id, v_session.actual_gmv, v_row.gmv, v_delta,
    v_session.total_views, v_row.views, v_session.ctr_avg, v_row.ctr,
    (abs(coalesce(v_delta, 0)) > 10), auth.uid()
  );

  update live_sessions set
    actual_gmv = coalesce(v_row.gmv, actual_gmv),
    total_views = coalesce(v_row.views, total_views),
    ctr_avg = coalesce(v_row.ctr, ctr_avg),
    avg_watch_time_seconds = coalesce(v_row.avg_watch_time_seconds, avg_watch_time_seconds),
    data_source = 'tiktok_reconciled',
    reconciled_at = now(),
    tiktok_room_id = coalesce(v_row.tiktok_room_id, tiktok_room_id)
  where id = p_session_id
  returning * into v_session;

  update tiktok_live_import_rows set matched_session_id = p_session_id where id = p_import_row_id;

  return v_session;
end;
$$ language plpgsql security definer;
