-- 0187 — Câu lỗi từ database dùng thuật ngữ chuẩn (audit thuật ngữ 27/10, vòng 3).
-- Các câu `raise exception` hiện thẳng lên màn (toast/khung lỗi) vẫn nói "up file", "up số", "off sớm".
-- Mỗi hàm dưới đây chép NGUYÊN VĂN bản định nghĩa mới nhất, chỉ đổi chữ trong câu lỗi:
-- up file → tải lên file, up lại file → tải lại file, up số → cập nhật số liệu, off sớm → kết thúc sớm,
-- có số → có số liệu. Không đổi logic, chữ ký hay quyền (create or replace giữ grant cũ).
-- App không so khớp chữ của các câu lỗi này ở đâu cả (đã grep src/).

-- submit_live_session_report — nguyên văn từ 0084, chỉ đổi chữ trong raise exception.
create or replace function submit_live_session_report(
  p_session_id uuid,
  p_actual_gmv numeric,
  p_total_orders int,
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
  p_coin_spent numeric,
  p_ot_minutes int,
  p_early_leave_minutes int
) returns live_sessions as $$
declare
  v_session live_sessions;
  v_role user_role := current_user_role();
  v_talent_id uuid := current_user_talent_id();
  v_new_actual_gmv numeric;
  v_new_total_orders int;
  v_new_total_views int;
  v_new_ctr_avg numeric;
  v_new_avg_watch_time_seconds int;
  v_reconciled_fields_changed boolean;
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
  -- Bọc coalesce: v_role NULL (không có profiles) thì `not in` ra NULL và elsif KHÔNG chạy —
  -- cùng bẫy đã vá ở 0082.
  elsif coalesce(v_role::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'not authorized to submit session report';
  end if;

  v_new_actual_gmv := coalesce(p_actual_gmv, v_session.actual_gmv);
  v_new_total_orders := coalesce(p_total_orders, v_session.total_orders);
  v_new_total_views := coalesce(p_total_views, v_session.total_views);
  v_new_ctr_avg := coalesce(p_ctr_avg, v_session.ctr_avg);
  v_new_avg_watch_time_seconds := coalesce(p_avg_watch_time_seconds, v_session.avg_watch_time_seconds);

  v_reconciled_fields_changed :=
    v_new_actual_gmv is distinct from v_session.actual_gmv
    or v_new_total_orders is distinct from v_session.total_orders
    or v_new_total_views is distinct from v_session.total_views
    or v_new_ctr_avg is distinct from v_session.ctr_avg
    or v_new_avg_watch_time_seconds is distinct from v_session.avg_watch_time_seconds;

  -- 0084: talent KHÔNG được ghi đè số đã có nguồn tốt hơn. Ca đã có snapshot lúc giao ca hoặc đã
  -- đối soát thì 5 cột trên là số đọc từ file TikTok; cho talent sửa tay là hạ bậc tin cậy về
  -- 'manual' và mất số thật. Ops/admin vẫn sửa được (form bắt bật công tắc "sửa tay" rõ ràng) —
  -- vì đôi khi phải dọn số, và họ có đường up lại snapshot nếu muốn giữ bậc.
  if v_reconciled_fields_changed and v_role = 'talent'
     and v_session.data_source in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Ca này đã có số liệu từ file TikTok (%), không sửa tay được. Chỉ nhập phần OT/kết thúc sớm/ghi chú; cần chỉnh số thì báo Ops.',
      case v_session.data_source when 'live_snapshot' then 'snapshot lúc giao ca' else 'đã đối soát' end;
  end if;

  update live_sessions set
    actual_gmv = v_new_actual_gmv,
    total_orders = v_new_total_orders,
    total_views = v_new_total_views,
    ctr_avg = v_new_ctr_avg,
    avg_watch_time_seconds = v_new_avg_watch_time_seconds,
    data_source = case when v_reconciled_fields_changed then 'manual' else data_source end,
    reconciled_at = case when v_reconciled_fields_changed then null else reconciled_at end
  where id = p_session_id
  returning * into v_session;

  insert into live_session_reports (
    session_id, restart_count, cross_live, host_late, status_note, gmv_total,
    dashboard_link_1, dashboard_link_2, impression_count, ads_cost, enter_room_rate, ctor,
    avg_order_value, atc_count, gpm, checkout_count, coin_spent,
    ot_minutes, early_leave_minutes,
    submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    p_session_id, coalesce(p_restart_count, 0), coalesce(p_cross_live, false), coalesce(p_host_late, false),
    coalesce(p_status_note, ''), p_gmv_total, p_dashboard_link_1, p_dashboard_link_2,
    p_impression_count, p_ads_cost, p_enter_room_rate, p_ctor, p_avg_order_value,
    p_atc_count, p_gpm, p_checkout_count, p_coin_spent,
    greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
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
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  return v_session;
end;
$$ language plpgsql security definer set search_path = public;

-- submit_tiktok_handover — nguyên văn từ 0145, chỉ đổi chữ trong raise exception.
create or replace function submit_tiktok_handover(
  p_session_id uuid,
  p_ot_minutes int default 0,
  p_early_leave_minutes int default 0,
  p_restart_count int default 0,
  p_host_late boolean default false,
  p_status_note text default ''
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if s.platform::text <> 'TikTok' then
    raise exception 'Ca Shopee giao ca bằng link dashboard + số, không qua file.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Tải lên file Creator-Live-Performance của ca trước (bước 1), rồi mới giao ca.' using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  return s;
end;
$$;

-- set_session_actuals — nguyên văn từ 0152, chỉ đổi chữ trong raise exception.
create or replace function set_session_actuals(
  p_session_id uuid,
  p_gmv numeric,
  p_live_start time default null,
  p_live_end time default null
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_start timestamptz;
  v_end timestamptz;
  v_minutes numeric;
  v_row live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'Chỉ OPS mới nhập tay số thực tế của ca.' using errcode = 'P0001';
  end if;
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không nhập số.' using errcode = 'P0001';
  end if;
  if coalesce(s.data_source::text, 'manual') <> 'manual' then
    raise exception 'Ca này đã có số liệu từ file / giao ca / đối soát — tải lên file mới để cập nhật, không nhập tay ghi đè.' using errcode = 'P0001';
  end if;
  if (s.date + s.start_time) at time zone 'Asia/Ho_Chi_Minh' > now() then
    raise exception 'Ca chưa bắt đầu — chưa có số thực tế để nhập.' using errcode = 'P0001';
  end if;
  if p_gmv is null or p_gmv < 0 then
    raise exception 'GMV không được để trống hoặc âm.' using errcode = 'P0001';
  end if;
  if (p_live_start is null) <> (p_live_end is null) then
    raise exception 'Giờ live: gõ cả giờ bắt đầu và giờ kết thúc, hoặc để trống cả hai.' using errcode = 'P0001';
  end if;

  if p_live_start is not null then
    if p_live_start = p_live_end then
      raise exception 'Giờ bắt đầu và giờ kết thúc live không được trùng nhau.' using errcode = 'P0001';
    end if;
    -- Giờ bắt đầu live ở ngày của ca; ca qua nửa đêm mà live bắt đầu sau 00:00 thì thuộc ngày hôm sau.
    v_start := ((s.date + case when s.end_time <= s.start_time and p_live_start < s.start_time then 1 else 0 end) + p_live_start)
               at time zone 'Asia/Ho_Chi_Minh';
    v_end := ((s.date + case when s.end_time <= s.start_time and p_live_start < s.start_time then 1 else 0 end
                      + case when p_live_end <= p_live_start then 1 else 0 end) + p_live_end)
             at time zone 'Asia/Ho_Chi_Minh';
    v_minutes := extract(epoch from (v_end - v_start)) / 60;
    if v_minutes > 24 * 60 then
      raise exception 'Giờ live dài quá 24 giờ — kiểm tra lại.' using errcode = 'P0001';
    end if;
  end if;

  update live_sessions set
    actual_gmv = p_gmv,
    actual_start_at = v_start,
    actual_end_at = v_end,
    live_duration_minutes = v_minutes,
    data_source = 'manual',
    reconciled_at = null
  where id = p_session_id
  returning * into v_row;
  return v_row;
end;
$$;

-- estimate_handover_split — nguyên văn từ 0153, chỉ đổi chữ trong raise exception.
create or replace function estimate_handover_split(p_prev uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
  v_next_snap uuid;
  v_snap uuid;
  v_boundary timestamptz;
  v_previous jsonb;
  v_rows int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations mới chia ước lượng theo thời gian.';
  end if;
  select next_session_id into v_next from session_room_links where prev_session_id = p_prev;
  if v_next is null then raise exception 'Ca này chưa được đánh dấu nối với ca nào.'; end if;
  if exists (select 1 from session_live_snapshots where session_id = p_prev) then
    raise exception 'Ca trước đã có file số liệu — không cần ước lượng.';
  end if;
  select id into v_next_snap from session_live_snapshots where session_id = v_next;
  if v_next_snap is null then raise exception 'Ca sau chưa tải lên file — chưa có số liệu để chia.'; end if;
  v_boundary := session_boundary_at(p_prev);

  select to_jsonb(x) into v_previous from (
    select actual_gmv, total_orders, total_views, ctr_avg, avg_watch_time_seconds,
           attributed_items_sold, attributed_sku_orders, impressions, product_impressions,
           product_clicks, new_followers, comments_count, shares_count, likes_count,
           live_duration_minutes, actual_start_at, actual_end_at, live_room_ids,
           data_source, reconciled_at
    from live_sessions where id = p_prev
  ) x;

  insert into session_live_snapshots (session_id, file_name, period_label, boundary_at, row_count, previous_values, uploaded_by, is_estimated)
  values (p_prev, '(ước lượng chia theo thời gian)', null, v_boundary, 0, v_previous, auth.uid(), true)
  returning id into v_snap;

  -- f = phần room đã chạy tới giờ hết ca A (0..1). Mọi cột ĐẾM được nhân f; tỷ lệ tính lại sau từ số đã chia.
  insert into session_live_snapshot_rows (
    snapshot_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
  )
  select v_snap, r.room_id, r.room_title, r.started_at, least(coalesce(r.ended_at, v_boundary), v_boundary),
         jsonb_build_object('estimated', true, 'fraction', round(f.f::numeric, 4)),
         round(r.duration_minutes * f.f, 2), round(r.gmv * f.f), round(r.items_sold * f.f), round(r.orders * f.f),
         round(r.sku_orders * f.f), round(r.views * f.f), round(r.impressions * f.f),
         round(r.product_impressions * f.f), round(r.product_clicks * f.f), round(r.new_followers * f.f),
         round(r.comments * f.f), round(r.shares * f.f), round(r.likes * f.f), round(r.watch_seconds * f.f)
  from session_live_snapshot_rows r
  cross join lateral (
    select least(greatest(
      extract(epoch from (v_boundary - r.started_at)) /
      nullif(extract(epoch from (coalesce(r.ended_at, now()) - r.started_at)), 0), 0), 1) as f
  ) f
  where r.snapshot_id = v_next_snap and r.started_at is not null and r.started_at < v_boundary and f.f > 0;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    delete from session_live_snapshots where id = v_snap;
    raise exception 'Không có phòng nào của ca sau bắt đầu trước giờ hết ca này — không có gì để chia.';
  end if;

  update session_live_snapshots set row_count = v_rows where id = v_snap;
  perform private.recompute_chain_from(p_prev);
  return jsonb_build_object('prev', p_prev, 'next', v_next, 'rooms', v_rows);
end;
$$;

-- delete_session_live_snapshot — nguyên văn từ 0153, chỉ đổi chữ trong raise exception.
create or replace function delete_session_live_snapshot(p_session_id uuid)
returns setof live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous jsonb;
  v_boundary_at timestamptz;
  v_rooms text[];
  v_affected uuid;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được xoá số liệu của ca.';
  end if;
  select previous_values, boundary_at into v_previous, v_boundary_at
  from session_live_snapshots where session_id = p_session_id;
  if not found then
    raise exception 'Ca này chưa có file số liệu nào để xoá.';
  end if;
  if exists (
    select 1 from session_room_links l
    join session_live_snapshots n on n.session_id = l.next_session_id
    where l.prev_session_id = p_session_id
  ) then
    raise exception 'Ca nối phía sau đã tải lên file và đang dùng file này làm mốc trừ. Gỡ liên kết nối ca (hoặc xoá file của ca sau) trước.';
  end if;

  select coalesce(array_agg(distinct room_id), '{}'::text[]) into v_rooms
  from session_live_snapshot_rows r
  join session_live_snapshots s on s.id = r.snapshot_id
  where s.session_id = p_session_id;

  delete from session_live_snapshots where session_id = p_session_id;

  update live_sessions set
    actual_gmv = coalesce((v_previous->>'actual_gmv')::numeric, 0),
    total_orders = coalesce((v_previous->>'total_orders')::int, 0),
    total_views = coalesce((v_previous->>'total_views')::bigint, 0),
    ctr_avg = coalesce((v_previous->>'ctr_avg')::numeric, 0),
    avg_watch_time_seconds = coalesce((v_previous->>'avg_watch_time_seconds')::int, avg_watch_time_seconds),
    attributed_items_sold = coalesce((v_previous->>'attributed_items_sold')::int, 0),
    attributed_sku_orders = coalesce((v_previous->>'attributed_sku_orders')::int, 0),
    impressions = coalesce((v_previous->>'impressions')::bigint, 0),
    product_impressions = coalesce((v_previous->>'product_impressions')::bigint, 0),
    product_clicks = coalesce((v_previous->>'product_clicks')::bigint, 0),
    new_followers = coalesce((v_previous->>'new_followers')::int, 0),
    comments_count = coalesce((v_previous->>'comments_count')::int, 0),
    shares_count = coalesce((v_previous->>'shares_count')::int, 0),
    likes_count = coalesce((v_previous->>'likes_count')::int, 0),
    live_duration_minutes = nullif(v_previous->>'live_duration_minutes', '')::numeric,
    actual_start_at = nullif(v_previous->>'actual_start_at', '')::timestamptz,
    actual_end_at = nullif(v_previous->>'actual_end_at', '')::timestamptz,
    live_room_ids = coalesce((select array_agg(value::text) from jsonb_array_elements_text(coalesce(v_previous->'live_room_ids', '[]'::jsonb)) value), '{}'::text[]),
    data_source = coalesce(v_previous->>'data_source', 'manual'),
    reconciled_at = nullif(v_previous->>'reconciled_at', '')::timestamptz
  where id = p_session_id;

  for v_affected in
    select distinct s.session_id
    from session_live_snapshots s
    join session_live_snapshot_rows r on r.snapshot_id = s.id
    where s.boundary_at > v_boundary_at and r.room_id = any(v_rooms)
  loop
    perform recompute_session_from_snapshot(v_affected);
  end loop;

  return query select * from live_sessions where id = p_session_id;
end;
$$;

-- apply_session_snapshot_part — nguyên văn từ 0153, chỉ đổi chữ trong raise exception.
create or replace function apply_session_snapshot_part(
  p_session_id uuid,
  p_reason text,
  p_note text,
  p_file_name text,
  p_period_label text,
  p_rows jsonb
)
returns setof live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_estimated boolean;
  v_boundary_at timestamptz;
  v_part_id uuid;
  v_part_no int;
  v_rooms text[];
  v_affected uuid;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được thêm mảnh số liệu cho ca.';
  end if;
  if p_reason not in ('network', 'manual_restart', 'device_change', 'platform_cut', 'test_room', 'other') then
    raise exception 'Lý do ngắt room không hợp lệ.';
  end if;
  select id, is_estimated, boundary_at into v_snapshot_id, v_estimated, v_boundary_at
  from session_live_snapshots where session_id = p_session_id;
  if v_snapshot_id is null then
    raise exception 'Tải lên file của ca (mảnh đầu) trước, rồi mới thêm mảnh sau.';
  end if;
  if v_estimated then
    raise exception 'Số liệu của ca này đang là ước lượng theo thời gian — tải lên file thật trước khi thêm mảnh.';
  end if;

  select coalesce(array_agg(distinct r->>'roomId'), '{}'::text[]) into v_rooms
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where coalesce(r->>'roomId', '') <> '';

  select coalesce(max(part_no), 1) + 1 into v_part_no from session_snapshot_parts where session_id = p_session_id;
  insert into session_snapshot_parts (session_id, part_no, reason, note, file_name, period_label, room_ids, uploaded_by)
  values (p_session_id, v_part_no, p_reason, nullif(btrim(coalesce(p_note, '')), ''), p_file_name, p_period_label, v_rooms, auth.uid())
  returning id into v_part_id;

  if array_length(v_rooms, 1) is not null then
    delete from session_live_snapshot_rows where snapshot_id = v_snapshot_id and room_id = any(v_rooms);
    insert into session_live_snapshot_rows (
      snapshot_id, part_id, room_id, room_title, started_at, ended_at, raw,
      duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
      product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
    )
    select
      v_snapshot_id, v_part_id,
      r->>'roomId', r->>'roomTitle',
      nullif(r->>'startedAt', '')::timestamptz, nullif(r->>'endedAt', '')::timestamptz,
      coalesce(r->'raw', '{}'::jsonb),
      coalesce((r->>'durationMinutes')::numeric, 0), coalesce((r->>'gmv')::numeric, 0),
      coalesce((r->>'itemsSold')::int, 0), coalesce((r->>'orders')::int, 0), coalesce((r->>'skuOrders')::int, 0),
      coalesce((r->>'views')::bigint, 0), coalesce((r->>'impressions')::bigint, 0),
      coalesce((r->>'productImpressions')::bigint, 0), coalesce((r->>'productClicks')::bigint, 0),
      coalesce((r->>'newFollowers')::int, 0), coalesce((r->>'comments')::int, 0),
      coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0), coalesce((r->>'watchSeconds')::numeric, 0)
    from jsonb_array_elements(p_rows) r
    where coalesce(r->>'roomId', '') <> '';
    update session_live_snapshots set row_count = (select count(*) from session_live_snapshot_rows where snapshot_id = v_snapshot_id) where id = v_snapshot_id;
  end if;

  perform private.recompute_chain_from(p_session_id);

  -- Ca khác (không nối tường minh) dùng chung room với mảnh mới: tính lại như apply_session_live_snapshot.
  for v_affected in
    select distinct s.session_id
    from session_live_snapshots s
    join session_live_snapshot_rows r on r.snapshot_id = s.id
    where s.boundary_at > v_boundary_at and r.room_id = any(v_rooms)
  loop
    perform recompute_session_from_snapshot(v_affected);
  end loop;

  return query select * from live_sessions where id = p_session_id;
end;
$$;

-- apply_segment_checkpoint_file — nguyên văn từ 0168, chỉ đổi chữ trong raise exception.
create or replace function apply_segment_checkpoint_file(
  p_session_id uuid,
  p_at_min integer,
  p_file_name text,
  p_rows jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_start timestamptz;
  v_cp_time timestamptz;
  v_boundary timestamptz;
  v_gmv numeric;
  v_orders int;
  v_views bigint;
  v_atc numeric;
  v_rooms int;
  v_lo record;
  v_hi record;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới cập nhật số liệu lúc đổi host được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không cập nhật số liệu lúc đổi host.' using errcode = 'P0001';
  end if;
  if s.brand_id is not null and private.brand_month_published(s.brand_id, s.date) then
    raise exception 'Tháng %/% của % đã phát hành Report cho brand — số đã đóng sổ.',
      to_char(s.date, 'MM'), to_char(s.date, 'YYYY'), coalesce(nullif(s.brand_name, ''), 'brand') using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.to_min = p_at_min)
     or not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.from_min >= p_at_min) then
    raise exception 'Phút % không phải chỗ đổi host của ca này. Khai báo người đứng ca ở "Đổi người giữa ca" trước.', p_at_min using errcode = 'P0001';
  end if;

  v_start := (s.date + s.start_time) at time zone 'Asia/Ho_Chi_Minh';
  v_cp_time := v_start + make_interval(mins => p_at_min);
  v_boundary := session_boundary_at(p_session_id);

  -- Mỗi phòng (TikTok) / phiên (Shopee) trong file: số cộng dồn − số lần up trước của cùng mã (ranh giới = giờ hết ca trước đó).
  -- ATC chỉ có ở file Shopee (raw.atc); không có ⇒ null.
  select coalesce(sum(greatest(d.gmv, 0)), 0), coalesce(sum(greatest(d.orders, 0)), 0)::int,
         coalesce(sum(greatest(d.views, 0)), 0)::bigint, sum(greatest(d.atc, 0)), count(*)::int
    into v_gmv, v_orders, v_views, v_atc, v_rooms
  from (
    select c.gmv - coalesce(p.gmv, 0) as gmv, c.orders - coalesce(p.orders, 0) as orders, c.views - coalesce(p.views, 0) as views,
           case when c.atc is not null then c.atc - coalesce(p.atc, 0) end as atc,
           c.started_at, c.ended_at, c.picked
    from (
      select r->>'roomId' as room_id,
             nullif(r->>'startedAt', '')::timestamptz as started_at,
             nullif(r->>'endedAt', '')::timestamptz as ended_at,
             coalesce((r->>'gmv')::numeric, 0) as gmv,
             coalesce((r->>'orders')::int, 0) as orders,
             coalesce((r->>'views')::bigint, 0) as views,
             (r->'raw'->>'atc')::numeric as atc,
             coalesce(r->'raw'->>'picked', '') = 'true' as picked
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
       where coalesce(r->>'roomId', '') <> ''
    ) c
    left join lateral (
      select pr.gmv, pr.orders, pr.views, (pr.raw->>'atc')::numeric as atc
        from session_live_snapshot_rows pr
        join session_live_snapshots ps on ps.id = pr.snapshot_id
       where pr.room_id = c.room_id and ps.session_id <> s.id and ps.boundary_at <= v_boundary
       order by ps.boundary_at desc
       limit 1
    ) p on true
  ) d
  where (d.gmv > 0 or d.views > 0 or d.orders > 0)
    and (d.picked
      or ((d.ended_at is null or d.ended_at >= v_start)
          and (d.started_at is null or d.started_at <= v_cp_time)));

  if v_rooms = 0 then
    raise exception 'File không có phiên live nào thuộc ca này tính tới lúc đổi host. Có thể up nhầm ca, hoặc file tải trước khi host xuống.' using errcode = 'P0001';
  end if;

  select cum_gmv, at_min into v_lo from session_segment_checkpoints where session_id = s.id and at_min < p_at_min order by at_min desc limit 1;
  if found and v_gmv < v_lo.cum_gmv then
    raise exception 'GMV % nhỏ hơn số lúc đổi host trước đó (phút %: %). File up sau phải là file mới hơn.', v_gmv, v_lo.at_min, v_lo.cum_gmv using errcode = 'P0001';
  end if;
  select cum_gmv, at_min into v_hi from session_segment_checkpoints where session_id = s.id and at_min > p_at_min order by at_min asc limit 1;
  if found and v_gmv > v_hi.cum_gmv then
    raise exception 'GMV % lớn hơn số lúc đổi host sau đó (phút %: %).', v_gmv, v_hi.at_min, v_hi.cum_gmv using errcode = 'P0001';
  end if;
  if s.data_source::text = 'live_snapshot' and v_gmv > coalesce(s.actual_gmv, 0) then
    raise exception 'GMV % lớn hơn số cả ca đã up (%). File lúc đổi host phải được tải TRƯỚC file giao ca.', v_gmv, s.actual_gmv using errcode = 'P0001';
  end if;

  insert into session_segment_checkpoints (
    session_id, at_min, dashboard_link, live_ref, cum_gmv, cum_views, cum_orders, cum_atc,
    base_gmv, base_views, base_orders, base_atc, source, file_name, reported_by_talent_id, reported_by_role, reported_at
  ) values (
    s.id, p_at_min, null, null, v_gmv, v_views, v_orders, round(v_atc)::int, 0, 0, 0, 0, 'file', p_file_name,
    current_user_talent_id(), current_user_role(), now()
  )
  on conflict (session_id, at_min) do update set
    dashboard_link = null, live_ref = null, cum_gmv = excluded.cum_gmv, cum_views = excluded.cum_views, cum_orders = excluded.cum_orders,
    cum_atc = excluded.cum_atc, base_gmv = 0, base_views = 0, base_orders = 0, base_atc = 0, source = 'file', file_name = excluded.file_name,
    reported_by_talent_id = excluded.reported_by_talent_id, reported_by_role = excluded.reported_by_role, reported_at = now();

  return jsonb_build_object('session_id', s.id, 'at_min', p_at_min, 'cum_gmv', v_gmv, 'cum_orders', v_orders, 'cum_views', v_views, 'cum_atc', round(v_atc), 'rooms', v_rooms);
end;
$$;

-- apply_live_reconciliation — nguyên văn từ 0171, chỉ đổi chữ trong raise exception.
create or replace function apply_live_reconciliation(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions int;
  v_brand uuid;
  v_platform text;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền áp dụng đối soát';
  end if;
  select brand_id, platform into v_brand, v_platform from live_reconciliation_batches where id = p_batch_id;
  if not found then
    raise exception 'Không thấy lô đối soát %', p_batch_id;
  end if;
  if v_brand is null then
    raise exception 'Lô này nạp trước khi đối soát gắn brand (0133) — xoá lô và tải lại file, chọn đúng brand.';
  end if;

  create temporary table tmp_share on commit drop as
  select sh.*
    from private.recon_shares(p_batch_id) sh
    join live_reconciliation_rows rr on rr.id = sh.row_id
   where rr.bucket in ('agency', 'review') and not rr.excluded;

  update live_sessions ls set
    actual_gmv = a.gmv, total_orders = a.orders, total_views = a.views,
    attributed_items_sold = a.items_sold, attributed_sku_orders = a.sku_orders,
    impressions = a.impressions, product_impressions = a.product_impressions,
    product_clicks = a.product_clicks, new_followers = a.new_followers,
    comments_count = a.comments, shares_count = a.shares, likes_count = a.likes,
    live_duration_minutes = a.duration_minutes,
    actual_start_at = a.started_at, actual_end_at = a.ended_at, live_room_ids = a.rooms,
    ctr_avg = case when a.views > 0 then round((a.product_clicks::numeric / a.views) * 100, 4) else 0 end,
    avg_watch_time_seconds = case
      when a.watch_seconds > 0 and a.views > 0 then round(a.watch_seconds / a.views)
      else ls.avg_watch_time_seconds
    end,
    data_source = 'tiktok_reconciled',
    reconciled_at = now()
  from (
    select t.session_id,
      sum(t.gmv) as gmv, round(sum(t.items_sold))::int as items_sold, round(sum(t.orders))::int as orders,
      round(sum(t.sku_orders))::int as sku_orders, round(sum(t.views))::bigint as views,
      round(sum(t.impressions))::bigint as impressions, round(sum(t.product_impressions))::bigint as product_impressions,
      round(sum(t.product_clicks))::bigint as product_clicks, round(sum(t.new_followers))::int as new_followers,
      round(sum(t.comments))::int as comments, round(sum(t.shares))::int as shares, round(sum(t.likes))::int as likes,
      sum(t.duration_minutes) as duration_minutes, sum(t.watch_seconds) as watch_seconds,
      min(t.started_at) as started_at, max(t.ended_at) as ended_at,
      array_agg(distinct t.room_id) as rooms
    from tmp_share t group by t.session_id
  ) a
  where ls.id = a.session_id;
  get diagnostics v_sessions = row_count;

  -- 0150: lô Shopee (Live List) mang ATC của phiên trong raw.atc — chia cho ca theo tỷ lệ lượt xem đã chia.
  insert into live_session_reports (session_id, atc_count)
  select t.session_id,
         round(sum((rr.raw->>'atc')::numeric * case when rr.views > 0 then t.views / rr.views when rr.gmv > 0 then t.gmv / rr.gmv else 1 end))::int
    from tmp_share t
    join live_reconciliation_rows rr on rr.id = t.row_id
   where rr.raw ? 'atc'
   group by t.session_id
  on conflict (session_id) do update set atc_count = excluded.atc_count;

  update live_reconciliation_batches set applied_at = now() where id = p_batch_id;
  return v_sessions;
end;
$$;

-- set_session_snapshot_gmv — nguyên văn từ 0174, chỉ đổi chữ trong raise exception.
create or replace function set_session_snapshot_gmv(p_session_id uuid, p_gmv numeric)
returns setof live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap session_live_snapshots;
  v_all boolean := false;
  v_fix numeric;
  v_adj numeric;
  v_n int;
  v_k numeric;
  v_bad record;
  v_affected uuid;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới sửa được GMV của ca.';
  end if;
  select * into v_snap from session_live_snapshots where session_id = p_session_id for update;
  if not found then
    raise exception 'Ca này chưa tải lên file số liệu — tải lên file trước rồi mới sửa GMV.';
  end if;
  if p_gmv is not null and p_gmv < 0 then
    raise exception 'GMV không được âm.';
  end if;

  -- Luôn tính từ số GỐC của file (gõ lại nhiều lần không cộng dồn sai số).
  perform private.snapshot_restore_file_numbers(v_snap.id);

  if p_gmv is not null then
    if private.session_waits_for_prev(p_session_id) then
      raise exception 'Ca này nối từ ca trước mà ca trước chưa tải lên file — chưa có mốc để tính GMV ca này. Tải lên file ca trước (hoặc OPS chia ước lượng) trước.';
    end if;

    -- Phần của từng room = hiệu so với mốc trước (đúng view tính số ca). Room CÒN LIVE lúc hết ca mới chứa phần của ca sau.
    select coalesce(sum(d.gmv) filter (where not (d.ended_at is null or d.ended_at > d.boundary_at)), 0),
           coalesce(sum(d.gmv) filter (where d.ended_at is null or d.ended_at > d.boundary_at), 0),
           count(*) filter (where d.ended_at is null or d.ended_at > d.boundary_at)
      into v_fix, v_adj, v_n
      from session_room_deltas d where d.session_id = p_session_id;
    if v_n = 0 then
      v_all := true;
      select 0, coalesce(sum(d.gmv), 0), count(*) into v_fix, v_adj, v_n
        from session_room_deltas d where d.session_id = p_session_id;
    end if;
    if v_n = 0 then
      raise exception 'File không có phòng nào tính cho ca này — không có gì để sửa.';
    end if;
    if p_gmv < v_fix - 0.5 then
      raise exception 'GMV nhập (%) nhỏ hơn phần của các phòng đã tắt trước giờ hết ca (%).', round(p_gmv), round(v_fix);
    end if;
    if v_adj <= 0 then
      if abs(p_gmv - v_fix) > 0.5 then
        raise exception 'Phòng còn live lúc hết ca chưa có GMV trong file — không chia được. GMV của ca theo file là %.', round(v_fix);
      end if;
      v_k := 1;
    else
      v_k := (p_gmv - v_fix) / v_adj;
    end if;

    update session_live_snapshot_rows r set
      raw = r.raw
        || jsonb_build_object('orig', jsonb_build_object(
             'gmv', r.gmv, 'items_sold', r.items_sold, 'orders', r.orders, 'sku_orders', r.sku_orders, 'views', r.views,
             'impressions', r.impressions, 'product_impressions', r.product_impressions, 'product_clicks', r.product_clicks,
             'new_followers', r.new_followers, 'comments', r.comments, 'shares', r.shares, 'likes', r.likes,
             'duration_minutes', r.duration_minutes, 'watch_seconds', r.watch_seconds)
           || case when r.raw ? 'atc' then jsonb_build_object('atc', r.raw->'atc') else '{}'::jsonb end)
        || case when r.raw ? 'atc' and d.atc is not null
                then jsonb_build_object('atc', round(coalesce((r.raw->>'atc')::numeric, 0) - (1 - v_k) * d.atc))
                else '{}'::jsonb end,
      gmv = r.gmv - (1 - v_k) * d.gmv,
      items_sold = round(r.items_sold - (1 - v_k) * d.items_sold),
      orders = round(r.orders - (1 - v_k) * d.orders),
      sku_orders = round(r.sku_orders - (1 - v_k) * d.sku_orders),
      views = round(r.views - (1 - v_k) * d.views),
      impressions = round(r.impressions - (1 - v_k) * d.impressions),
      product_impressions = round(r.product_impressions - (1 - v_k) * d.product_impressions),
      product_clicks = round(r.product_clicks - (1 - v_k) * d.product_clicks),
      new_followers = round(r.new_followers - (1 - v_k) * d.new_followers),
      comments = round(r.comments - (1 - v_k) * d.comments),
      shares = round(r.shares - (1 - v_k) * d.shares),
      likes = round(r.likes - (1 - v_k) * d.likes),
      watch_seconds = r.watch_seconds - (1 - v_k) * d.watch_seconds,
      -- Room còn live lúc hết ca: thời lượng tới giờ hết ca (không vượt số file khi file có thời lượng, không dưới mốc trước).
      duration_minutes = case
        when d.started_at is not null and (d.ended_at is null or d.ended_at > d.boundary_at) then
          least(greatest(round((extract(epoch from (d.boundary_at - d.started_at)) / 60)::numeric, 2), r.duration_minutes - d.duration_minutes),
                case when r.duration_minutes > 0 then r.duration_minutes else 1e9 end)
        else r.duration_minutes end
    from session_room_deltas d
    where r.snapshot_id = v_snap.id and d.session_id = p_session_id and d.room_id = r.room_id
      and (v_all or d.ended_at is null or d.ended_at > d.boundary_at);

    -- Số đã quy về giờ hết ca không được vượt số mà ca SAU đã up cho cùng room (file sau tải muộn hơn ⇒ cộng dồn lớn hơn).
    select r.room_id, r.gmv, n.gmv as next_gmv into v_bad
      from session_live_snapshot_rows r
      join lateral (
        select nr.gmv from session_live_snapshot_rows nr
          join session_live_snapshots ns on ns.id = nr.snapshot_id
         where nr.room_id = r.room_id and ns.boundary_at > v_snap.boundary_at
         order by ns.boundary_at limit 1
      ) n on true
     where r.snapshot_id = v_snap.id and r.gmv > n.gmv + 0.5
     limit 1;
    if found then
      raise exception 'GMV nhập lớn quá: room % sẽ thành % trong khi ca sau đã up % cho room này.', v_bad.room_id, round(v_bad.gmv), round(v_bad.next_gmv);
    end if;

    update session_live_snapshots set typed_gmv = p_gmv, typed_by = auth.uid(), typed_at = now() where id = v_snap.id;
  end if;

  perform private.recompute_chain_from(p_session_id);
  -- Ca sau (không nối tường minh) dùng chung room: mốc trừ vừa đổi ⇒ tính lại, như apply_session_live_snapshot.
  for v_affected in
    select distinct s.session_id
      from session_live_snapshots s
      join session_live_snapshot_rows r on r.snapshot_id = s.id
     where s.boundary_at > v_snap.boundary_at
       and r.room_id in (select room_id from session_live_snapshot_rows where snapshot_id = v_snap.id)
  loop
    perform recompute_session_from_snapshot(v_affected);
  end loop;

  return query select * from live_sessions where id = p_session_id;
end;
$$;

-- submit_file_handover — nguyên văn từ 0180, chỉ đổi chữ trong raise exception.
create or replace function public.submit_file_handover(
  p_session_id uuid,
  p_ot_minutes integer default 0,
  p_early_leave_minutes integer default 0,
  p_restart_count integer default 0,
  p_host_late boolean default false,
  p_status_note text default '',
  p_early_leave_reason text default null
)
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_reason text := case when coalesce(p_early_leave_minutes, 0) > 0 then nullif(p_early_leave_reason, '') end;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Tải lên file số liệu của ca (%) trước, rồi mới giao ca.',
      case when s.platform::text = 'Shopee' then 'Live List của Shopee' else 'Creator-Live-Performance của TikTok' end using errcode = 'P0001';
  end if;
  if v_reason is not null and v_reason not in ('low_sales', 'technical', 'staff', 'brand', 'other') then
    raise exception 'Lý do kết thúc sớm không hợp lệ: %', v_reason using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, early_leave_reason, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0), v_reason,
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    early_leave_reason = excluded.early_leave_reason,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  return s;
end;
$$;
