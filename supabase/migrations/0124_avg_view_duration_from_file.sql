-- Avg. view (avg_watch_time_seconds) KHÔNG BAO GIỜ được ghi cho ca chạy trong app.
--
-- 0084 coi 5 cột actual_gmv / total_orders / total_views / ctr_avg / avg_watch_time_seconds là
-- "số đọc từ file TikTok" và khoá không cho talent sửa tay khi ca đã có snapshot/đối soát. Nhưng
-- chỉ 4 trong 5 cột đó thật sự được đường đọc file ghi: `recompute_session_from_snapshot` (0080)
-- và `apply_live_reconciliation` (0082) không hề đụng tới avg_watch_time_seconds. Hệ quả: cột bị
-- khoá ở đúng giá trị nó đang có lúc up file — với ca mới là 0 — và vĩnh viễn không có đường sửa.
-- Ô "Avg. view (giây)" trong form report bị `disabled` nên talent cũng không nhập bù được.
--
-- Chưa ai thấy vì 229/229 ca trên DB là ca nạp bù, đi đường 0086 (đường đó CÓ ghi cột này). Ca
-- đầu tiên chạy thật trong app là lộ ngay.
--
-- CÁCH SỬA — vì sao không bê thẳng cột "Avg. viewing duration" vào:
-- Nó là TỶ LỆ (giây/lượt xem). Quy tắc của bảng `session_live_snapshot_rows` (0078) nói rõ: chỉ
-- tách ra các cột ĐẾM ĐƯỢC, tuyệt đối không tách cột tỷ lệ, vì hiệu của 2 tỷ lệ cộng dồn là số vô
-- nghĩa — mà trừ giữa 2 lần up chính là cơ chế sống còn của bảng này (2 ca nối nhau chung room).
-- Nên lưu `watch_seconds = "Avg. viewing duration" × Views` (đại lượng cộng được), trừ/cộng/chia
-- tỷ lệ trên nó, rồi cuối cùng mới chia lại cho views. Đúng bằng trung bình có trọng số mà
-- `src/lib/report/keyMetrics.ts` (watchSecViews / watchViews) đang dùng để gộp Avg. view nhiều ca.
--
-- Mẫu số là Views — xác nhận bằng chính dữ liệu thật, không phải suy đoán: 228 dòng đối soát trong
-- `live_reconciliation_rows.raw` cho thấy bản export TikTok có 2 cột giá trị TRÙNG Y HỆT,
-- "Avg. viewing duration" và "Avg. viewing duration per view" (26,74 / 41,62 / 37,47 giây trên 3
-- dòng đầu). Chính cột lặp đó nói ra mẫu số. Dải giá trị cũng khớp 229 ca nạp bù (p25–p75 = 32–40s).

-- ---------------------------------------------------------------------------
-- 1) Cột mới trên 2 bảng dòng-theo-room
-- ---------------------------------------------------------------------------
alter table session_live_snapshot_rows
  add column if not exists watch_seconds numeric not null default 0;
alter table live_reconciliation_rows
  add column if not exists watch_seconds numeric not null default 0;

-- Nạp bù cho các dòng đã có trong DB từ `raw` (giữ nguyên trạng cả 35 cột của file chính là để
-- dùng được lúc này — tính sai thì tính lại mà không cần ops up lại file).
update live_reconciliation_rows set
  watch_seconds = round(
    coalesce(nullif(replace(raw->>'Avg. viewing duration', ',', ''), '')::numeric, 0) * views
  )
where watch_seconds = 0
  and views > 0
  and coalesce(nullif(replace(raw->>'Avg. viewing duration', ',', ''), '')::numeric, 0) > 0;

update session_live_snapshot_rows set
  watch_seconds = round(
    coalesce(nullif(replace(raw->>'Avg. viewing duration', ',', ''), '')::numeric, 0) * views
  )
where watch_seconds = 0
  and views > 0
  and coalesce(nullif(replace(raw->>'Avg. viewing duration', ',', ''), '')::numeric, 0) > 0;

-- ---------------------------------------------------------------------------
-- 2) View quy tắc dùng chung — thêm watch_seconds vào CUỐI danh sách cột
--    (create or replace view chỉ cho phép thêm cột ở cuối, không đổi tên/kiểu cột cũ).
--    Nguyên văn 0080, chỉ thêm đúng 1 dòng delta.
-- ---------------------------------------------------------------------------
create or replace view session_room_deltas as
with snap as (
  select s.id as snapshot_id, s.session_id, s.boundary_at,
         (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' as session_start
  from session_live_snapshots s
  join live_sessions ls on ls.id = s.session_id
)
select
  sn.session_id, sn.session_start, sn.boundary_at,
  c.room_id, c.started_at, c.ended_at,
  c.gmv - coalesce(p.gmv, 0) as gmv,
  c.items_sold - coalesce(p.items_sold, 0) as items_sold,
  c.orders - coalesce(p.orders, 0) as orders,
  c.sku_orders - coalesce(p.sku_orders, 0) as sku_orders,
  c.views - coalesce(p.views, 0) as views,
  c.impressions - coalesce(p.impressions, 0) as impressions,
  c.product_impressions - coalesce(p.product_impressions, 0) as product_impressions,
  c.product_clicks - coalesce(p.product_clicks, 0) as product_clicks,
  c.new_followers - coalesce(p.new_followers, 0) as new_followers,
  c.comments - coalesce(p.comments, 0) as comments,
  c.shares - coalesce(p.shares, 0) as shares,
  c.likes - coalesce(p.likes, 0) as likes,
  c.duration_minutes - coalesce(p.duration_minutes, 0) as duration_minutes,
  c.watch_seconds - coalesce(p.watch_seconds, 0) as watch_seconds
from snap sn
join session_live_snapshot_rows c on c.snapshot_id = sn.snapshot_id
left join lateral (
  select pr.*
  from session_live_snapshot_rows pr
  join session_live_snapshots ps on ps.id = pr.snapshot_id
  where pr.room_id = c.room_id and ps.boundary_at < sn.boundary_at
  order by ps.boundary_at desc
  limit 1
) p on true
where (c.gmv - coalesce(p.gmv, 0) > 0
    or c.views - coalesce(p.views, 0) > 0
    or c.orders - coalesce(p.orders, 0) > 0
    or c.duration_minutes - coalesce(p.duration_minutes, 0) > 0)
  and (c.ended_at is null or c.ended_at >= sn.session_start)
  and (c.started_at is null or c.started_at <= sn.boundary_at);

-- ---------------------------------------------------------------------------
-- 3) Tính lại ca từ snapshot — nguyên văn 0080, thêm avg_watch_time_seconds
-- ---------------------------------------------------------------------------
create or replace function recompute_session_from_snapshot(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from session_live_snapshots where session_id = p_session_id) then
    return;
  end if;

  update live_sessions ls set
    actual_gmv = d.gmv, total_orders = d.orders, total_views = d.views,
    attributed_items_sold = d.items_sold, attributed_sku_orders = d.sku_orders,
    impressions = d.impressions, product_impressions = d.product_impressions,
    product_clicks = d.product_clicks, new_followers = d.new_followers,
    comments_count = d.comments, shares_count = d.shares, likes_count = d.likes,
    live_duration_minutes = d.duration_minutes,
    actual_start_at = d.started_at, actual_end_at = d.ended_at, live_room_ids = d.rooms,
    ctr_avg = case when d.views > 0 then round((d.product_clicks::numeric / d.views) * 100, 4) else 0 end,
    -- File cũ (up trước 0124) không có watch_seconds ⇒ tổng ra 0. GIỮ NGUYÊN số đang có thay vì
    -- ghi đè bằng 0: ca đó có thể đã được host khai tay trước khi up file, xoá đi là mất số thật.
    avg_watch_time_seconds = case
      when d.watch_seconds > 0 and d.views > 0 then round(d.watch_seconds / d.views)
      else ls.avg_watch_time_seconds
    end,
    data_source = 'live_snapshot',
    reconciled_at = now()
  from (
    select
      coalesce(sum(gmv), 0) as gmv, coalesce(sum(items_sold), 0)::int as items_sold,
      coalesce(sum(orders), 0)::int as orders, coalesce(sum(sku_orders), 0)::int as sku_orders,
      coalesce(sum(views), 0)::bigint as views, coalesce(sum(impressions), 0)::bigint as impressions,
      coalesce(sum(product_impressions), 0)::bigint as product_impressions,
      coalesce(sum(product_clicks), 0)::bigint as product_clicks,
      coalesce(sum(new_followers), 0)::int as new_followers, coalesce(sum(comments), 0)::int as comments,
      coalesce(sum(shares), 0)::int as shares, coalesce(sum(likes), 0)::int as likes,
      coalesce(sum(duration_minutes), 0) as duration_minutes,
      coalesce(sum(watch_seconds), 0) as watch_seconds,
      min(started_at) as started_at, max(ended_at) as ended_at,
      coalesce(array_agg(room_id order by started_at), '{}'::text[]) as rooms
    from session_room_deltas where session_id = p_session_id
  ) d
  where ls.id = p_session_id;
end;
$$;

revoke execute on function recompute_session_from_snapshot(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------
-- 4) Nạp snapshot — nguyên văn 0082, thêm watch_seconds vào insert và
--    avg_watch_time_seconds vào bản chụp nguyên trạng previous_values
-- ---------------------------------------------------------------------------
create or replace function apply_session_live_snapshot(
  p_session_id uuid,
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
  v_existing_id uuid;
  v_previous jsonb;
  v_snapshot_id uuid;
  v_boundary_at timestamptz;
  v_affected uuid;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được nạp số liệu cho ca.';
  end if;
  v_boundary_at := session_boundary_at(p_session_id);
  if v_boundary_at is null then
    raise exception 'Không tìm thấy ca cần nạp số liệu.';
  end if;

  select id, previous_values into v_existing_id, v_previous
  from session_live_snapshots where session_id = p_session_id;

  if v_existing_id is null then
    -- Lần up đầu tiên cho ca này: chụp lại nguyên trạng để còn khôi phục nếu up nhầm ca.
    -- 0124: thêm avg_watch_time_seconds — trước đây nó không nằm trong bản chụp nên xoá snapshot
    -- không khôi phục lại được số host đã khai tay (không lộ ra vì cột đó chưa bao giờ đổi).
    select to_jsonb(x) into v_previous from (
      select actual_gmv, total_orders, total_views, ctr_avg, avg_watch_time_seconds,
             attributed_items_sold, attributed_sku_orders, impressions, product_impressions,
             product_clicks, new_followers, comments_count, shares_count, likes_count,
             live_duration_minutes, actual_start_at, actual_end_at, live_room_ids,
             data_source, reconciled_at
      from live_sessions where id = p_session_id
    ) x;
  else
    delete from session_live_snapshots where id = v_existing_id;
  end if;

  insert into session_live_snapshots (session_id, file_name, period_label, boundary_at, row_count, previous_values, uploaded_by)
  values (p_session_id, p_file_name, p_period_label, v_boundary_at, coalesce(jsonb_array_length(p_rows), 0), v_previous, auth.uid())
  returning id into v_snapshot_id;

  insert into session_live_snapshot_rows (
    snapshot_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
  )
  select
    v_snapshot_id,
    r->>'roomId',
    r->>'roomTitle',
    nullif(r->>'startedAt', '')::timestamptz,
    nullif(r->>'endedAt', '')::timestamptz,
    coalesce(r->'raw', '{}'::jsonb),
    coalesce((r->>'durationMinutes')::numeric, 0),
    coalesce((r->>'gmv')::numeric, 0),
    coalesce((r->>'itemsSold')::int, 0),
    coalesce((r->>'orders')::int, 0),
    coalesce((r->>'skuOrders')::int, 0),
    coalesce((r->>'views')::bigint, 0),
    coalesce((r->>'impressions')::bigint, 0),
    coalesce((r->>'productImpressions')::bigint, 0),
    coalesce((r->>'productClicks')::bigint, 0),
    coalesce((r->>'newFollowers')::int, 0),
    coalesce((r->>'comments')::int, 0),
    coalesce((r->>'shares')::int, 0),
    coalesce((r->>'likes')::int, 0),
    coalesce((r->>'watchSeconds')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'roomId', '') <> '';

  perform recompute_session_from_snapshot(p_session_id);

  -- Up bù/up lại một ca cũ làm đổi mốc trừ của mọi ca SAU đó có chung room — phải tính lại chúng,
  -- nếu không số của các ca sau sẽ kẹt ở giá trị tính bằng mốc cũ đã không còn đúng.
  for v_affected in
    select distinct s.session_id
    from session_live_snapshots s
    join session_live_snapshot_rows r on r.snapshot_id = s.id
    where s.boundary_at > v_boundary_at
      and r.room_id in (select room_id from session_live_snapshot_rows where snapshot_id = v_snapshot_id)
  loop
    perform recompute_session_from_snapshot(v_affected);
  end loop;

  return query select * from live_sessions where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Xoá snapshot — nguyên văn 0082, thêm khôi phục avg_watch_time_seconds
-- ---------------------------------------------------------------------------
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
    -- Snapshot up TRƯỚC 0124 không có khoá này trong previous_values ⇒ giữ nguyên số đang có thay
    -- vì về 0 (coalesce vào chính cột cũ, không phải vào 0 như các cột khác).
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

-- ---------------------------------------------------------------------------
-- 6) Nạp file đối soát — nguyên văn 0082, thêm watch_seconds vào insert
-- ---------------------------------------------------------------------------
create or replace function import_live_reconciliation(
  p_file_name text,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch_id uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền nạp file đối soát';
  end if;
  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid())
  returning id into v_batch_id;

  insert into live_reconciliation_rows (
    batch_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
  )
  select
    v_batch_id, r->>'roomId', r->>'roomTitle',
    nullif(r->>'startedAt', '')::timestamptz, nullif(r->>'endedAt', '')::timestamptz,
    coalesce(r->'raw', '{}'::jsonb),
    coalesce((r->>'durationMinutes')::numeric, 0), coalesce((r->>'gmv')::numeric, 0),
    coalesce((r->>'itemsSold')::int, 0), coalesce((r->>'orders')::int, 0),
    coalesce((r->>'skuOrders')::int, 0), coalesce((r->>'views')::bigint, 0),
    coalesce((r->>'impressions')::bigint, 0), coalesce((r->>'productImpressions')::bigint, 0),
    coalesce((r->>'productClicks')::bigint, 0), coalesce((r->>'newFollowers')::int, 0),
    coalesce((r->>'comments')::int, 0), coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0),
    coalesce((r->>'watchSeconds')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'roomId', '') <> '';

  -- Khớp theo GIAO NHAU khung thời gian, đúng quy tắc đã dùng ở giai đoạn 1: room bắt đầu trước
  -- khi ca kết thúc VÀ kết thúc sau khi ca bắt đầu. Ca Cancelled không tính là ca của agency.
  with m as (
    select rr.id as row_id,
           array_agg(ls.id order by ls.date, ls.start_time) as sess,
           count(*) as n_sess,
           count(*) filter (where exists (select 1 from session_live_snapshots s where s.session_id = ls.id)) as n_snap
    from live_reconciliation_rows rr
    join live_sessions ls
      on ls.status <> 'Cancelled'
     and (rr.started_at is null or rr.started_at <= session_boundary_at(ls.id))
     and (rr.ended_at is null or rr.ended_at >= (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh')
    where rr.batch_id = v_batch_id
    group by rr.id
  )
  update live_reconciliation_rows rr set
    matched_session_ids = m.sess,
    -- Thiếu dù chỉ 1 snapshot trong chuỗi ca nối là mất ranh giới ⇒ chỉ chia ước lượng được.
    bucket = case when m.n_sess > 1 and m.n_snap < m.n_sess then 'review' else 'agency' end
  from m where rr.id = m.row_id;

  return v_batch_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) Áp dụng đối soát — nguyên văn 0082, thêm watch_seconds vào phép chia tỷ lệ
--    và avg_watch_time_seconds vào bản ghi cuối
-- ---------------------------------------------------------------------------
create or replace function apply_live_reconciliation(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền áp dụng đối soát';
  end if;
  create temporary table tmp_share on commit drop as
  with pair as (
    select rr.id as row_id, rr.room_id, rr.started_at, rr.ended_at,
           rr.gmv as f_gmv, rr.items_sold as f_items, rr.orders as f_orders,
           rr.sku_orders as f_sku, rr.views as f_views, rr.impressions as f_impr,
           rr.product_impressions as f_pimpr, rr.product_clicks as f_clicks,
           rr.new_followers as f_follow, rr.comments as f_cmt, rr.shares as f_share,
           rr.likes as f_like, rr.duration_minutes as f_dur, rr.watch_seconds as f_watch,
           -- Chỉ rổ 'agency' mới có đủ ranh giới snapshot để giữ tỷ lệ. Rổ 'review' thiếu snapshot
           -- ở ít nhất 1 ca trong chuỗi, nên tỷ lệ ghi nhận được là KHÔNG ĐẦY ĐỦ — dùng nó sẽ dồn
           -- toàn bộ số vào ca có snapshot và bỏ đói ca quên up. Buộc chia theo giao thời gian.
           rr.bucket = 'agency' as use_contrib,
           ls.id as session_id,
           greatest(extract(epoch from (
             least(rr.ended_at, session_boundary_at(ls.id))
             - greatest(rr.started_at, (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh')
           )), 1) as overlap_sec
    from live_reconciliation_rows rr
    join unnest(rr.matched_session_ids) as sid on true
    join live_sessions ls on ls.id = sid
    where rr.batch_id = p_batch_id and rr.bucket in ('agency', 'review')
  ),
  w as (
    select p.*,
           coalesce(d.gmv, 0) as c_gmv, coalesce(d.items_sold, 0) as c_items,
           coalesce(d.orders, 0) as c_orders, coalesce(d.sku_orders, 0) as c_sku,
           coalesce(d.views, 0) as c_views, coalesce(d.impressions, 0) as c_impr,
           coalesce(d.product_impressions, 0) as c_pimpr, coalesce(d.product_clicks, 0) as c_clicks,
           coalesce(d.new_followers, 0) as c_follow, coalesce(d.comments, 0) as c_cmt,
           coalesce(d.shares, 0) as c_share, coalesce(d.likes, 0) as c_like,
           coalesce(d.duration_minutes, 0) as c_dur, coalesce(d.watch_seconds, 0) as c_watch
    from pair p
    left join session_room_deltas d on d.session_id = p.session_id and d.room_id = p.room_id
  ),
  tot as (
    select row_id,
           sum(c_gmv) as t_gmv, sum(c_items) as t_items, sum(c_orders) as t_orders,
           sum(c_sku) as t_sku, sum(c_views) as t_views, sum(c_impr) as t_impr,
           sum(c_pimpr) as t_pimpr, sum(c_clicks) as t_clicks, sum(c_follow) as t_follow,
           sum(c_cmt) as t_cmt, sum(c_share) as t_share, sum(c_like) as t_like,
           sum(c_dur) as t_dur, sum(c_watch) as t_watch, sum(overlap_sec) as t_ov
    from w group by row_id
  )
  select
    w.session_id, w.room_id, w.started_at, w.ended_at,
    case when w.use_contrib and t.t_gmv > 0 then w.f_gmv * w.c_gmv / t.t_gmv else w.f_gmv * w.overlap_sec / t.t_ov end as gmv,
    case when w.use_contrib and t.t_items > 0 then w.f_items * w.c_items / t.t_items else w.f_items * w.overlap_sec / t.t_ov end as items_sold,
    case when w.use_contrib and t.t_orders > 0 then w.f_orders * w.c_orders / t.t_orders else w.f_orders * w.overlap_sec / t.t_ov end as orders,
    case when w.use_contrib and t.t_sku > 0 then w.f_sku * w.c_sku / t.t_sku else w.f_sku * w.overlap_sec / t.t_ov end as sku_orders,
    case when w.use_contrib and t.t_views > 0 then w.f_views * w.c_views / t.t_views else w.f_views * w.overlap_sec / t.t_ov end as views,
    case when w.use_contrib and t.t_impr > 0 then w.f_impr * w.c_impr / t.t_impr else w.f_impr * w.overlap_sec / t.t_ov end as impressions,
    case when w.use_contrib and t.t_pimpr > 0 then w.f_pimpr * w.c_pimpr / t.t_pimpr else w.f_pimpr * w.overlap_sec / t.t_ov end as product_impressions,
    case when w.use_contrib and t.t_clicks > 0 then w.f_clicks * w.c_clicks / t.t_clicks else w.f_clicks * w.overlap_sec / t.t_ov end as product_clicks,
    case when w.use_contrib and t.t_follow > 0 then w.f_follow * w.c_follow / t.t_follow else w.f_follow * w.overlap_sec / t.t_ov end as new_followers,
    case when w.use_contrib and t.t_cmt > 0 then w.f_cmt * w.c_cmt / t.t_cmt else w.f_cmt * w.overlap_sec / t.t_ov end as comments,
    case when w.use_contrib and t.t_share > 0 then w.f_share * w.c_share / t.t_share else w.f_share * w.overlap_sec / t.t_ov end as shares,
    case when w.use_contrib and t.t_like > 0 then w.f_like * w.c_like / t.t_like else w.f_like * w.overlap_sec / t.t_ov end as likes,
    case when w.use_contrib and t.t_dur > 0 then w.f_dur * w.c_dur / t.t_dur else w.f_dur * w.overlap_sec / t.t_ov end as duration_minutes,
    -- Giây xem chia y hệt các cột đếm được khác (đó chính là lý do quy tỷ lệ về giây xem ở 0124);
    -- Avg. view của ca được tính lại từ nó ở bước update bên dưới, không chia trực tiếp số trung bình.
    case when w.use_contrib and t.t_watch > 0 then w.f_watch * w.c_watch / t.t_watch else w.f_watch * w.overlap_sec / t.t_ov end as watch_seconds
  from w join tot t on t.row_id = w.row_id;

  update live_sessions ls set
    actual_gmv = a.gmv, total_orders = a.orders, total_views = a.views,
    attributed_items_sold = a.items_sold, attributed_sku_orders = a.sku_orders,
    impressions = a.impressions, product_impressions = a.product_impressions,
    product_clicks = a.product_clicks, new_followers = a.new_followers,
    comments_count = a.comments, shares_count = a.shares, likes_count = a.likes,
    live_duration_minutes = a.duration_minutes,
    actual_start_at = a.started_at, actual_end_at = a.ended_at, live_room_ids = a.rooms,
    ctr_avg = case when a.views > 0 then round((a.product_clicks::numeric / a.views) * 100, 4) else 0 end,
    -- Batch cũ (nạp trước 0124, chưa nạp bù được watch_seconds vì thiếu cột trong raw) ra 0 ⇒ giữ
    -- nguyên số đang có, không ghi đè bằng 0.
    avg_watch_time_seconds = case
      when a.watch_seconds > 0 and a.views > 0 then round(a.watch_seconds / a.views)
      else ls.avg_watch_time_seconds
    end,
    data_source = 'tiktok_reconciled',
    reconciled_at = now()
  from (
    select session_id,
      sum(gmv) as gmv, round(sum(items_sold))::int as items_sold, round(sum(orders))::int as orders,
      round(sum(sku_orders))::int as sku_orders, round(sum(views))::bigint as views,
      round(sum(impressions))::bigint as impressions, round(sum(product_impressions))::bigint as product_impressions,
      round(sum(product_clicks))::bigint as product_clicks, round(sum(new_followers))::int as new_followers,
      round(sum(comments))::int as comments, round(sum(shares))::int as shares, round(sum(likes))::int as likes,
      sum(duration_minutes) as duration_minutes, sum(watch_seconds) as watch_seconds,
      min(started_at) as started_at, max(ended_at) as ended_at,
      array_agg(distinct room_id) as rooms
    from tmp_share group by session_id
  ) a
  where ls.id = a.session_id;
  get diagnostics v_sessions = row_count;

  update live_reconciliation_batches set applied_at = now() where id = p_batch_id;
  return v_sessions;
end;
$$;
