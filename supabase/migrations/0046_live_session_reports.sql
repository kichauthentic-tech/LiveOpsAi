-- Module Report Số Liệu Live Theo Ca — sidecar 1-1 với live_sessions (cùng pattern
-- session_finance ở migration 0004), chứa field vận hành sâu (đối chiếu file Excel thật
-- YFB Working File 2026) mà live_sessions chưa có: Impression/ADS COST/ERR/CTOR (TikTok),
-- ATC/GPM/CO/Xu đã tung (Shopee), RESTART/Host đến trễ/Cross Live/Link dashboard đối soát.
-- Field đã có sẵn trên live_sessions (actual_gmv/total_views/ctr_avg/avg_watch_time_seconds,
-- khớp "GMV Live"/"View"/"CTR"/"AVG.view" trong Excel) KHÔNG lặp lại ở đây — RPC bên dưới ghi
-- thẳng vào live_sessions cho 4 field đó. peak_viewers/cvr_avg (Giai đoạn B6) nằm ngoài phạm vi
-- module này (Excel không có khái niệm PCU/CVR), vẫn nhập qua LiveSessionHub như cũ.

create table live_session_reports (
  session_id uuid primary key references live_sessions(id) on delete cascade,

  -- Field chung mọi platform
  restart_count int not null default 0,
  cross_live boolean not null default false,
  host_late boolean not null default false,
  status_note text not null default '',
  gmv_total numeric, -- cột "GMV" riêng trong Excel, khác actual_gmv ("GMV Live")
  dashboard_link_1 text,
  dashboard_link_2 text,

  -- Field riêng TikTok
  impression_count bigint,
  ads_cost numeric,
  enter_room_rate numeric, -- ERR (%)
  ctor numeric, -- CTOR (%)
  avg_order_value numeric, -- AVG.price

  -- Field riêng Shopee
  atc_count int,
  gpm numeric,
  checkout_count int, -- "CO"
  coin_spent numeric, -- Xu đã tung

  -- Audit
  submitted_by_talent_id uuid references talents(id) on delete set null,
  submitted_by_role user_role,
  submitted_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table live_session_reports enable row level security;

-- Đọc chung mọi authenticated, giống live_sessions_read_all — không tạo policy insert/update
-- trực tiếp trên bảng, mọi ghi đều qua RPC submit_live_session_report bên dưới (hàm tự làm
-- trọng tài quyền theo talent sở hữu ca / role ops, RLS theo row/role đơn thuần không đủ vì cần
-- phân biệt "talent chỉ được report đúng ca của mình" trong khi vẫn dùng chung 1 bảng).
create policy "live_session_reports_read_all" on live_session_reports for select using (auth.role() = 'authenticated');

-- RPC riêng cho report — KHÔNG tái dùng update_session_with_children (hàm đó ghi toàn bộ field
-- session kể cả brand/host/date; nếu mở RLS UPDATE live_sessions cho talent theo row sở hữu thì
-- Postgres RLS chỉ chặn được theo row, không chặn theo cột, nên talent sẽ vô tình sửa được cả
-- host/brand/ngày của chính session mình). Hàm này hẹp đúng phạm vi field report, security
-- definer có chủ đích để tự kiểm tra quyền bên trong thay vì dựa vào RLS theo role/row.
create or replace function submit_live_session_report(
  p_session_id uuid,
  p_actual_gmv numeric,
  p_total_views int,
  p_ctr_avg numeric,
  p_avg_watch_time_seconds int,
  p_restart_count int,
  p_cross_live boolean,
  p_host_late boolean,
  p_status_note text,
  p_gmv_total numeric,
  p_dashboard_link_1 text,
  p_dashboard_link_2 text,
  p_impression_count bigint,
  p_ads_cost numeric,
  p_enter_room_rate numeric,
  p_ctor numeric,
  p_avg_order_value numeric,
  p_atc_count int,
  p_gpm numeric,
  p_checkout_count int,
  p_coin_spent numeric
) returns live_sessions as $$
declare
  v_session live_sessions;
  v_role user_role := current_user_role();
  v_talent_id uuid := current_user_talent_id();
begin
  select * into v_session from live_sessions where id = p_session_id;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;

  if v_role = 'talent' then
    if v_talent_id is null
        or (v_session.host_id is distinct from v_talent_id and v_session.co_host_id is distinct from v_talent_id) then
      raise exception 'not authorized to submit report for this session';
    end if;
  elsif v_role not in ('ceo', 'operations', 'admin') then
    raise exception 'not authorized to submit session report';
  end if;

  update live_sessions set
    actual_gmv = coalesce(p_actual_gmv, actual_gmv),
    total_views = coalesce(p_total_views, total_views),
    ctr_avg = coalesce(p_ctr_avg, ctr_avg),
    avg_watch_time_seconds = coalesce(p_avg_watch_time_seconds, avg_watch_time_seconds)
  where id = p_session_id
  returning * into v_session;

  insert into live_session_reports (
    session_id, restart_count, cross_live, host_late, status_note, gmv_total,
    dashboard_link_1, dashboard_link_2, impression_count, ads_cost, enter_room_rate, ctor,
    avg_order_value, atc_count, gpm, checkout_count, coin_spent,
    submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    p_session_id, coalesce(p_restart_count, 0), coalesce(p_cross_live, false), coalesce(p_host_late, false),
    coalesce(p_status_note, ''), p_gmv_total, p_dashboard_link_1, p_dashboard_link_2,
    p_impression_count, p_ads_cost, p_enter_room_rate, p_ctor, p_avg_order_value,
    p_atc_count, p_gpm, p_checkout_count, p_coin_spent,
    v_talent_id, v_role, now(), now()
  )
  on conflict (session_id) do update set
    restart_count = excluded.restart_count,
    cross_live = excluded.cross_live,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    gmv_total = excluded.gmv_total,
    dashboard_link_1 = excluded.dashboard_link_1,
    dashboard_link_2 = excluded.dashboard_link_2,
    impression_count = excluded.impression_count,
    ads_cost = excluded.ads_cost,
    enter_room_rate = excluded.enter_room_rate,
    ctor = excluded.ctor,
    avg_order_value = excluded.avg_order_value,
    atc_count = excluded.atc_count,
    gpm = excluded.gpm,
    checkout_count = excluded.checkout_count,
    coin_spent = excluded.coin_spent,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  return v_session;
end;
$$ language plpgsql security definer;
