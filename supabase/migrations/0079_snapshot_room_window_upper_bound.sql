-- FIX migration 0078: bộ lọc chọn room thuộc ca chỉ chặn đầu DƯỚI (room kết thúc sau khi ca bắt
-- đầu) mà không chặn đầu TRÊN, nên một room diễn ra hoàn toàn SAU ca vẫn lọt vào.
--
-- Không lộ ra ở luồng thường (trợ up ngay khi hết ca thì file chưa thể có phiên của ngày sau),
-- nhưng sai nặng ngay khi up bù: lấy file tải ngày 17/9 up cho ca ngày 1/9 thì mọi phiên từ 1/9
-- tới 17/9 đều bị cộng hết vào ca đó — bộ lọc "hiệu > 0" không cứu được vì các phiên ngày sau
-- chưa từng có snapshot nào để trừ.
--
-- Bổ sung vế còn lại để thành đúng phép giao khung thời gian: room phải BẮT ĐẦU trước khi ca kết
-- thúc VÀ KẾT THÚC sau khi ca bắt đầu. Đây cũng chính là quy tắc nghiệp vụ đã chốt ("phiên nào
-- nằm trong khung ca đã plan thì thuộc ca đó"), chỉ là trước đó cài thiếu một nửa.
create or replace function recompute_session_from_snapshot(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snapshot_id uuid;
  v_boundary_at timestamptz;
  v_session_start timestamptz;
  v_gmv numeric; v_items int; v_orders int; v_sku_orders int;
  v_views bigint; v_impressions bigint; v_prod_impressions bigint; v_prod_clicks bigint;
  v_followers int; v_comments int; v_shares int; v_likes int;
  v_duration numeric; v_start timestamptz; v_end timestamptz; v_rooms text[];
begin
  select id, boundary_at into v_snapshot_id, v_boundary_at
  from session_live_snapshots where session_id = p_session_id;
  if not found then return; end if;

  select (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
  into v_session_start
  from live_sessions ls where ls.id = p_session_id;

  select
    coalesce(sum(d.gmv), 0), coalesce(sum(d.items_sold), 0), coalesce(sum(d.orders), 0),
    coalesce(sum(d.sku_orders), 0), coalesce(sum(d.views), 0), coalesce(sum(d.impressions), 0),
    coalesce(sum(d.product_impressions), 0), coalesce(sum(d.product_clicks), 0),
    coalesce(sum(d.new_followers), 0), coalesce(sum(d.comments), 0), coalesce(sum(d.shares), 0),
    coalesce(sum(d.likes), 0), coalesce(sum(d.duration_minutes), 0),
    min(d.started_at), max(d.ended_at), coalesce(array_agg(d.room_id order by d.started_at), '{}'::text[])
  into
    v_gmv, v_items, v_orders, v_sku_orders, v_views, v_impressions, v_prod_impressions,
    v_prod_clicks, v_followers, v_comments, v_shares, v_likes, v_duration, v_start, v_end, v_rooms
  from (
    select
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
    from session_live_snapshot_rows c
    left join lateral (
      select pr.*
      from session_live_snapshot_rows pr
      join session_live_snapshots ps on ps.id = pr.snapshot_id
      where pr.room_id = c.room_id and ps.boundary_at < v_boundary_at
      order by ps.boundary_at desc
      limit 1
    ) p on true
    where c.snapshot_id = v_snapshot_id
  ) d
  where (d.gmv > 0 or d.views > 0 or d.orders > 0 or d.duration_minutes > 0)
    and (d.ended_at is null or v_session_start is null or d.ended_at >= v_session_start)
    and (d.started_at is null or d.started_at <= v_boundary_at);

  update live_sessions set
    actual_gmv = v_gmv,
    total_orders = v_orders,
    total_views = v_views,
    attributed_items_sold = v_items,
    attributed_sku_orders = v_sku_orders,
    impressions = v_impressions,
    product_impressions = v_prod_impressions,
    product_clicks = v_prod_clicks,
    new_followers = v_followers,
    comments_count = v_comments,
    shares_count = v_shares,
    likes_count = v_likes,
    live_duration_minutes = v_duration,
    actual_start_at = v_start,
    actual_end_at = v_end,
    live_room_ids = v_rooms,
    ctr_avg = case when v_views > 0 then round((v_prod_clicks::numeric / v_views) * 100, 4) else 0 end,
    data_source = 'live_snapshot',
    reconciled_at = now()
  where id = p_session_id;
end;
$$;

grant execute on function recompute_session_from_snapshot(uuid) to authenticated;
