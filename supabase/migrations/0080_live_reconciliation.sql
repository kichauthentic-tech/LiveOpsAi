-- Giai đoạn 2 của tầng dữ liệu gốc mới: module đối soát cho Operation.
--
-- Số TikTok về TRỄ (GMV attribution còn chạy thêm nhiều giờ sau khi tắt live), nên số chốt tại
-- thời điểm giao ca ở giai đoạn 1 là TẠM TÍNH. Ops tải lại file theo ngày/tuần/tháng rồi up một
-- lần để chỉnh lại toàn bộ các ca trong kỳ cho khớp số cuối cùng.
--
-- Điểm mấu chốt: file cả ngày chỉ có TỔNG của mỗi room, không tách được ca nào bao nhiêu khi 2 ca
-- dùng chung room. Ranh giới đó chỉ tồn tại trong snapshot giai đoạn 1 — nên đối soát KHÔNG ghi đè
-- ranh giới, mà giữ nguyên tỷ lệ đóng góp đã ghi nhận rồi scale lên theo số cuối.

-- ---------------------------------------------------------------------------
-- Quy tắc "room nào thuộc ca nào, đóng góp bao nhiêu" giờ nằm ở ĐÚNG MỘT chỗ.
-- Trước đây nó nằm trong thân recompute_session_from_snapshot; đối soát cũng cần đúng quy tắc
-- này nên tách ra view dùng chung, tránh 2 bản logic trôi lệch nhau theo thời gian.
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
  c.duration_minutes - coalesce(p.duration_minutes, 0) as duration_minutes
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

-- Tính lại ca từ snapshot — giờ chỉ còn là phép cộng trên view, mọi quy tắc nằm ở view.
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
      min(started_at) as started_at, max(ended_at) as ended_at,
      coalesce(array_agg(room_id order by started_at), '{}'::text[]) as rooms
    from session_room_deltas where session_id = p_session_id
  ) d
  where ls.id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kho file đối soát của Operation
-- ---------------------------------------------------------------------------
create table live_reconciliation_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text,
  period_label text,
  period_start date,
  period_end date,
  row_count int not null default 0,
  applied_at timestamptz, -- null = đã up nhưng ops chưa bấm áp dụng
  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index idx_live_recon_batches_created on live_reconciliation_batches(created_at desc);

create table live_reconciliation_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references live_reconciliation_batches(id) on delete cascade,

  room_id text not null,
  room_title text,
  started_at timestamptz,
  ended_at timestamptz,

  raw jsonb not null default '{}'::jsonb,
  duration_minutes numeric not null default 0,
  gmv numeric not null default 0,
  items_sold int not null default 0,
  orders int not null default 0,
  sku_orders int not null default 0,
  views bigint not null default 0,
  impressions bigint not null default 0,
  product_impressions bigint not null default 0,
  product_clicks bigint not null default 0,
  new_followers int not null default 0,
  comments int not null default 0,
  shares int not null default 0,
  likes int not null default 0,

  -- agency     = khớp khung giờ ca đã chốt, có đủ ranh giới snapshot để chia chính xác
  -- review     = khớp ca nhưng thiếu snapshot ranh giới (trợ quên up) — chỉ chia được ước lượng
  -- unassigned = không khớp ca nào; MẶC ĐỊNH, chờ ops xác nhận đã xem qua
  -- inhouse    = ops đã xác nhận là ca brand tự live; ghi nhận để so hiệu suất agency vs inhouse
  -- Chỉ agency/review mới được phân bổ vào live_sessions — 2 nhãn còn lại không đụng số của ca,
  -- nên gán nhãn sai cũng không làm sai số liệu, chỉ sai thống kê so sánh.
  bucket text not null default 'unassigned' check (bucket in ('agency', 'review', 'unassigned', 'inhouse')),
  matched_session_ids uuid[] not null default '{}'::uuid[]
);

create index idx_live_recon_rows_batch on live_reconciliation_rows(batch_id, bucket);

alter table live_reconciliation_batches enable row level security;
alter table live_reconciliation_rows enable row level security;

-- Đối soát là việc của Operation, không mở cho talent/trợ live như bảng snapshot.
create policy "live_recon_batches_ceo_admin_ops" on live_reconciliation_batches for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

create policy "live_recon_rows_ceo_admin_ops" on live_reconciliation_rows for all
  using (current_user_role() in ('ceo', 'admin', 'operations'))
  with check (current_user_role() in ('ceo', 'admin', 'operations'));

-- ---------------------------------------------------------------------------
-- Nạp file đối soát + tự khớp room với ca theo khung giờ (chưa ghi gì vào live_sessions)
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
  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid())
  returning id into v_batch_id;

  insert into live_reconciliation_rows (
    batch_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes
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
    coalesce((r->>'comments')::int, 0), coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0)
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

-- Nút "toàn bộ rổ này là inhouse" (và ngược lại nếu ops đổi ý).
create or replace function set_reconciliation_bucket(
  p_batch_id uuid,
  p_from_bucket text,
  p_to_bucket text
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_to_bucket not in ('agency', 'review', 'unassigned', 'inhouse') then
    raise exception 'Nhãn không hợp lệ: %', p_to_bucket;
  end if;
  update live_reconciliation_rows set bucket = p_to_bucket
  where batch_id = p_batch_id and bucket = p_from_bucket;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Áp dụng đối soát: phân bổ số cuối cùng của mỗi room về các ca đã khớp.
--
-- Với mỗi cột đếm được:
--   - còn ghi nhận đóng góp từ snapshot (tổng > 0) ⇒ GIỮ NGUYÊN tỷ lệ đã ghi nhận, chỉ scale lên
--     cho khớp số cuối. Đây là chỗ ranh giới ca nối từ giai đoạn 1 phát huy tác dụng.
--   - không có gì để dựa (ca quên up snapshot) ⇒ chia theo số giây khung ca GIAO với khung room.
--     Kém chính xác nhưng không bỏ sót, và ops đã được cảnh báo qua rổ "review".
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
  create temporary table tmp_share on commit drop as
  with pair as (
    select rr.id as row_id, rr.room_id, rr.started_at, rr.ended_at,
           rr.gmv as f_gmv, rr.items_sold as f_items, rr.orders as f_orders,
           rr.sku_orders as f_sku, rr.views as f_views, rr.impressions as f_impr,
           rr.product_impressions as f_pimpr, rr.product_clicks as f_clicks,
           rr.new_followers as f_follow, rr.comments as f_cmt, rr.shares as f_share,
           rr.likes as f_like, rr.duration_minutes as f_dur,
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
           coalesce(d.duration_minutes, 0) as c_dur
    from pair p
    left join session_room_deltas d on d.session_id = p.session_id and d.room_id = p.room_id
  ),
  tot as (
    select row_id,
           sum(c_gmv) as t_gmv, sum(c_items) as t_items, sum(c_orders) as t_orders,
           sum(c_sku) as t_sku, sum(c_views) as t_views, sum(c_impr) as t_impr,
           sum(c_pimpr) as t_pimpr, sum(c_clicks) as t_clicks, sum(c_follow) as t_follow,
           sum(c_cmt) as t_cmt, sum(c_share) as t_share, sum(c_like) as t_like,
           sum(c_dur) as t_dur, sum(overlap_sec) as t_ov
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
    case when w.use_contrib and t.t_dur > 0 then w.f_dur * w.c_dur / t.t_dur else w.f_dur * w.overlap_sec / t.t_ov end as duration_minutes
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
    data_source = 'tiktok_reconciled',
    reconciled_at = now()
  from (
    select session_id,
      sum(gmv) as gmv, round(sum(items_sold))::int as items_sold, round(sum(orders))::int as orders,
      round(sum(sku_orders))::int as sku_orders, round(sum(views))::bigint as views,
      round(sum(impressions))::bigint as impressions, round(sum(product_impressions))::bigint as product_impressions,
      round(sum(product_clicks))::bigint as product_clicks, round(sum(new_followers))::int as new_followers,
      round(sum(comments))::int as comments, round(sum(shares))::int as shares, round(sum(likes))::int as likes,
      sum(duration_minutes) as duration_minutes,
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

grant execute on function import_live_reconciliation(text, text, date, date, jsonb) to authenticated;
grant execute on function set_reconciliation_bucket(uuid, text, text) to authenticated;
grant execute on function apply_live_reconciliation(uuid) to authenticated;
grant select on session_room_deltas to authenticated;
