-- Nạp bù ca từ file Creator-Live-Performance (user chốt 2026-09-19).
--
-- Bối cảnh: app chạy thật từ tháng 9/2026, nhưng brand đã live từ tháng 4. File
-- Creator-Live-Performance (1 dòng / Room ID) có đủ ngày, giờ bắt đầu/kết thúc, GMV, đơn, view của
-- từng room — thứ duy nhất KHÔNG có là host (file export theo tài khoản shop). Thay vì ops tạo tay
-- 60 ca/tháng/brand rồi gán host từng ca:
--   1. create_backfill_sessions: 1 room → 1 ca Completed, số liệu đã đối soát sẵn
--      (data_source = 'tiktok_reconciled'), host trống, cờ is_backfill. Chạy lại không tạo trùng:
--      room đã thuộc ca nào (tiktok_room_id hoặc live_room_ids) thì bỏ qua.
--   2. bulk_assign_session_hosts: gán host/trợ live cho nhiều ca trong 1 lệnh — UI lưới ngày × ca
--      với công cụ "điền theo thứ" gọi vào đây.
--   3. split_backfill_session: room dài bất thường (host không tắt stream giữa 2 ca) tách làm 2
--      ca theo mốc giờ, số đếm chia theo tỷ lệ thời gian, tổng 2 phần = room.
--
-- Parse file (tiền "39,286,556.94₫", giờ "3h00m") KHÔNG làm lại trong SQL — client dùng đúng
-- parser sẵn có (lib/dataraw/creatorLivePerfSlice.ts) rồi gửi số đã chuẩn hoá vào RPC. Một parser
-- duy nhất cho mọi đường đi của file này.
--
-- Ca backfill KHÔNG vào Finance & P&L (rate card tháng cũ không chuẩn) — Finance lọc theo cờ này ở
-- client. Có vào hiệu suất host, giờ live theo khung, lịch sử cho phân bổ target.
--
-- Quy ước guard (0082): security definer bỏ qua RLS, PUBLIC có EXECUTE mặc định — kiểm tra role
-- phải nằm trong thân hàm, và luôn coalesce vì current_user_role() trả NULL khi chưa có profiles.

alter table live_sessions add column if not exists is_backfill boolean not null default false;
create index if not exists idx_live_sessions_backfill_room on live_sessions(tiktok_room_id) where is_backfill;

-- ---------------------------------------------------------------------------
-- 1) Sinh ca từ room
-- ---------------------------------------------------------------------------
-- p_rows: jsonb array, mỗi phần tử:
--   { room_id, room_title, started_at (ISO), ended_at (ISO), duration_minutes, gmv, orders,
--     items_sold, sku_orders, views, impressions, product_impressions, product_clicks,
--     new_followers, comments, shares, likes, avg_view_duration_sec }
-- Trả về { inserted, skipped_existing, skipped_invalid }.
create or replace function create_backfill_sessions(p_brand_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_brand_name text;
  r jsonb;
  v_room text;
  v_start timestamptz;
  v_end timestamptz;
  v_start_vn timestamp;
  v_end_vn timestamp;
  v_views bigint;
  v_orders int;
  v_clicks bigint;
  v_duration numeric;
  v_inserted int := 0;
  v_skipped_existing int := 0;
  v_skipped_invalid int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được sinh ca từ file' using errcode = '42501';
  end if;

  select name into v_brand_name from brands where id = p_brand_id;
  if v_brand_name is null then
    raise exception 'Brand không tồn tại';
  end if;

  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_room := nullif(trim(r->>'room_id'), '');
    v_start := (r->>'started_at')::timestamptz;
    v_end := (r->>'ended_at')::timestamptz;
    if v_room is null or v_start is null or v_end is null or v_end <= v_start then
      v_skipped_invalid := v_skipped_invalid + 1;
      continue;
    end if;
    -- Room đã thuộc ca nào của brand này (snapshot lúc giao ca, đối soát, hoặc lần sinh trước) → bỏ qua.
    if exists (
      select 1 from live_sessions
      where brand_id = p_brand_id
        and (tiktok_room_id = v_room or live_room_ids @> array[v_room])
    ) then
      v_skipped_existing := v_skipped_existing + 1;
      continue;
    end if;

    v_start_vn := v_start at time zone 'Asia/Ho_Chi_Minh';
    v_end_vn := v_end at time zone 'Asia/Ho_Chi_Minh';
    v_views := coalesce((r->>'views')::bigint, 0);
    v_orders := coalesce((r->>'orders')::int, 0);
    v_clicks := coalesce((r->>'product_clicks')::bigint, 0);
    v_duration := coalesce((r->>'duration_minutes')::numeric, extract(epoch from (v_end - v_start)) / 60);

    insert into live_sessions (
      title, brand_id, brand_name, shop_tiktok_handle, studio_id, studio_name,
      host_id, host_name, co_host_id, co_host_name, platform,
      date, start_time, end_time, status, target_gmv,
      actual_gmv, total_orders, avg_watch_time_seconds, peak_viewers, total_views, ctr_avg, cvr_avg,
      data_source, reconciled_at, tiktok_room_id, live_room_ids,
      actual_start_at, actual_end_at, live_duration_minutes,
      attributed_items_sold, attributed_sku_orders, impressions, product_impressions, product_clicks,
      new_followers, comments_count, shares_count, likes_count, is_backfill
    ) values (
      coalesce(nullif(trim(r->>'room_title'), ''), v_brand_name || ' live ' || to_char(v_start_vn, 'DD/MM')),
      p_brand_id, v_brand_name, '', null, '',
      null, '', null, '', 'TikTok',
      v_start_vn::date, date_trunc('minute', v_start_vn)::time, date_trunc('minute', v_end_vn)::time, 'Completed', 0,
      coalesce((r->>'gmv')::numeric, 0), v_orders, coalesce((r->>'avg_view_duration_sec')::numeric, 0), 0, v_views,
      case when v_views > 0 then round((v_clicks::numeric / v_views) * 100, 4) else 0 end,
      case when v_views > 0 then round((v_orders::numeric / v_views) * 100, 4) else 0 end,
      'tiktok_reconciled', now(), v_room, array[v_room],
      v_start, v_end, v_duration,
      coalesce((r->>'items_sold')::int, 0), coalesce((r->>'sku_orders')::int, 0),
      coalesce((r->>'impressions')::bigint, 0), coalesce((r->>'product_impressions')::bigint, 0), v_clicks,
      coalesce((r->>'new_followers')::int, 0), coalesce((r->>'comments')::int, 0),
      coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0), true
    );
    v_inserted := v_inserted + 1;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'skipped_existing', v_skipped_existing,
    'skipped_invalid', v_skipped_invalid
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Gán host / trợ live hàng loạt
-- ---------------------------------------------------------------------------
-- p_assignments: [{ session_id, host_id (uuid|null), co_host_id (uuid|null) }]
-- null = bỏ trống. Tên lấy từ talents tại thời điểm gán (giống hành vi form sửa ca).
-- Ca quá khứ nên trigger thông báo 0083 không bắn; ca tương lai (nếu ops dùng lưới cho tháng đang
-- chạy) thì bắn như bình thường — đúng ý.
create or replace function bulk_assign_session_hosts(p_assignments jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  a jsonb;
  v_session_id uuid;
  v_host uuid;
  v_cohost uuid;
  v_host_name text;
  v_cohost_name text;
  v_updated int := 0;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được gán host hàng loạt' using errcode = '42501';
  end if;

  for a in select * from jsonb_array_elements(coalesce(p_assignments, '[]'::jsonb)) loop
    v_session_id := (a->>'session_id')::uuid;
    v_host := nullif(a->>'host_id', '')::uuid;
    v_cohost := nullif(a->>'co_host_id', '')::uuid;
    if v_session_id is null then continue; end if;
    if v_host is not null and v_cohost is not null and v_host = v_cohost then
      raise exception 'Host và trợ live không được là cùng một người (ca %)', v_session_id;
    end if;

    v_host_name := '';
    v_cohost_name := '';
    if v_host is not null then
      select name into v_host_name from talents where id = v_host;
      if v_host_name is null then raise exception 'Talent % không tồn tại', v_host; end if;
    end if;
    if v_cohost is not null then
      select name into v_cohost_name from talents where id = v_cohost;
      if v_cohost_name is null then raise exception 'Talent % không tồn tại', v_cohost; end if;
    end if;

    update live_sessions set
      host_id = v_host, host_name = v_host_name,
      co_host_id = v_cohost, co_host_name = v_cohost_name
    where id = v_session_id
      and (host_id is distinct from v_host or co_host_id is distinct from v_cohost);
    if found then v_updated := v_updated + 1; end if;
  end loop;

  return v_updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Tách 1 ca backfill thành 2 theo mốc giờ
-- ---------------------------------------------------------------------------
-- Phần 1 giữ nguyên id (kết thúc tại p_split_at), phần 2 là dòng mới. Số đếm chia theo tỷ lệ thời
-- gian, phần 2 = tổng − phần 1 nên cộng lại luôn bằng room gốc. Tỷ lệ (ctr/cvr/avg watch) tính lại
-- theo số đã chia. Cả 2 phần vẫn mang room id — skip-check của create_backfill_sessions nhìn thấy.
create or replace function split_backfill_session(p_session_id uuid, p_split_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions%rowtype;
  v_ratio numeric;
  v_new_id uuid;
  v_split_vn timestamp;
  -- phần 1
  g1 numeric; o1 int; i1 int; sk1 int; v1 bigint; im1 bigint; pi1 bigint; pc1 bigint; nf1 int; c1 int; sh1 int; l1 int; d1 numeric;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ CEO/Admin/Operations được tách ca' using errcode = '42501';
  end if;

  select * into s from live_sessions where id = p_session_id;
  if s.id is null then raise exception 'Ca không tồn tại'; end if;
  if not s.is_backfill then raise exception 'Chỉ tách được ca sinh từ file (backfill)'; end if;
  if s.actual_start_at is null or s.actual_end_at is null then raise exception 'Ca không có giờ live thật để tách'; end if;
  if p_split_at <= s.actual_start_at or p_split_at >= s.actual_end_at then
    raise exception 'Mốc tách phải nằm trong khoảng % → %', s.actual_start_at, s.actual_end_at;
  end if;

  v_ratio := extract(epoch from (p_split_at - s.actual_start_at)) / extract(epoch from (s.actual_end_at - s.actual_start_at));
  v_split_vn := p_split_at at time zone 'Asia/Ho_Chi_Minh';

  g1 := round(s.actual_gmv * v_ratio, 2);
  o1 := round(s.total_orders * v_ratio);
  i1 := round(coalesce(s.attributed_items_sold, 0) * v_ratio);
  sk1 := round(coalesce(s.attributed_sku_orders, 0) * v_ratio);
  v1 := round(s.total_views * v_ratio);
  im1 := round(coalesce(s.impressions, 0) * v_ratio);
  pi1 := round(coalesce(s.product_impressions, 0) * v_ratio);
  pc1 := round(coalesce(s.product_clicks, 0) * v_ratio);
  nf1 := round(coalesce(s.new_followers, 0) * v_ratio);
  c1 := round(coalesce(s.comments_count, 0) * v_ratio);
  sh1 := round(coalesce(s.shares_count, 0) * v_ratio);
  l1 := round(coalesce(s.likes_count, 0) * v_ratio);
  d1 := round(extract(epoch from (p_split_at - s.actual_start_at)) / 60, 4);

  -- Phần 2: phần còn lại
  insert into live_sessions (
    title, brand_id, brand_name, shop_tiktok_handle, studio_id, studio_name,
    host_id, host_name, co_host_id, co_host_name, platform,
    date, start_time, end_time, status, target_gmv,
    actual_gmv, total_orders, avg_watch_time_seconds, peak_viewers, total_views, ctr_avg, cvr_avg,
    data_source, reconciled_at, tiktok_room_id, live_room_ids,
    actual_start_at, actual_end_at, live_duration_minutes,
    attributed_items_sold, attributed_sku_orders, impressions, product_impressions, product_clicks,
    new_followers, comments_count, shares_count, likes_count, is_backfill
  ) values (
    regexp_replace(s.title, ' \(1/2\)$', '') || ' (2/2)', s.brand_id, s.brand_name, s.shop_tiktok_handle, s.studio_id, s.studio_name,
    null, '', null, '', s.platform,
    v_split_vn::date, date_trunc('minute', v_split_vn)::time, s.end_time, s.status, 0,
    s.actual_gmv - g1, s.total_orders - o1, s.avg_watch_time_seconds, s.peak_viewers, s.total_views - v1,
    case when (s.total_views - v1) > 0 then round(((coalesce(s.product_clicks, 0) - pc1)::numeric / (s.total_views - v1)) * 100, 4) else 0 end,
    case when (s.total_views - v1) > 0 then round(((s.total_orders - o1)::numeric / (s.total_views - v1)) * 100, 4) else 0 end,
    s.data_source, s.reconciled_at, s.tiktok_room_id, s.live_room_ids,
    p_split_at, s.actual_end_at, round(coalesce(s.live_duration_minutes, 0) - d1, 4),
    coalesce(s.attributed_items_sold, 0) - i1, coalesce(s.attributed_sku_orders, 0) - sk1,
    coalesce(s.impressions, 0) - im1, coalesce(s.product_impressions, 0) - pi1, coalesce(s.product_clicks, 0) - pc1,
    coalesce(s.new_followers, 0) - nf1, coalesce(s.comments_count, 0) - c1,
    coalesce(s.shares_count, 0) - sh1, coalesce(s.likes_count, 0) - l1, true
  ) returning id into v_new_id;

  -- Phần 1: cắt tại mốc
  update live_sessions set
    title = regexp_replace(title, ' \(1/2\)$', '') || ' (1/2)',
    end_time = date_trunc('minute', v_split_vn)::time,
    actual_end_at = p_split_at,
    live_duration_minutes = d1,
    actual_gmv = g1, total_orders = o1, total_views = v1,
    ctr_avg = case when v1 > 0 then round((pc1::numeric / v1) * 100, 4) else 0 end,
    cvr_avg = case when v1 > 0 then round((o1::numeric / v1) * 100, 4) else 0 end,
    attributed_items_sold = i1, attributed_sku_orders = sk1,
    impressions = im1, product_impressions = pi1, product_clicks = pc1,
    new_followers = nf1, comments_count = c1, shares_count = sh1, likes_count = l1
  where id = p_session_id;

  return v_new_id;
end;
$$;

grant execute on function create_backfill_sessions(uuid, jsonb) to authenticated;
grant execute on function bulk_assign_session_hosts(jsonb) to authenticated;
grant execute on function split_backfill_session(uuid, timestamptz) to authenticated;
