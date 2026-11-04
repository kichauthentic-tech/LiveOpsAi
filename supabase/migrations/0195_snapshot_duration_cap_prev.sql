-- 0195 — GIỜ LIVE CỦA CA = trừ thời lượng ca trước ĐÚNG TẠI MỐC KẾT THÚC CA TRƯỚC, không phải tại giờ tải file.
--
-- Lỗi (VERA Shopee T4 04/11 11:00–14:00): room chạy 11:00–14:14 (194') nhưng ca hiện 2,4h (144'). File Live List là số CỘNG DỒN
-- của room tại lúc tải; file ca trước tải trễ ~50' sau 11:00 nên thời lượng cộng dồn của nó đã gồm 50' đầu của ca này, và view
-- trừ luôn 50' đó ⇒ ca sau thiếu giờ, GMV/giờ phình. Trễ trung vị của file snapshot ≈ 54' nên lỗi này xảy ra ở hầu hết ca nối.
--
-- Sửa: thời lượng của dòng ca trước (p) bị chặn trên bởi (mốc kết thúc ca trước − giờ room bắt đầu) trước khi trừ. Room thật
-- không thể chạy lâu hơn khoảng đó tại mốc ca trước, nên phần dư chính là giờ của ca này. Không có started_at ⇒ giữ cách cũ.
-- Chỉ đổi cột duration_minutes; số khác (GMV, đơn...) vẫn là hiệu hai file như trước.
-- Thân view = nguyên văn 0168. Sau khi tạo view, tính lại các ca đang lấy số từ snapshot. Chạy lại nhiều lần không sao.

create or replace view session_room_deltas as
with snap as (
  select s.id as snapshot_id, s.session_id, s.boundary_at,
         (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' as session_start,
         l.prev_session_id
  from session_live_snapshots s
  join live_sessions ls on ls.id = s.session_id
  left join session_room_links l on l.next_session_id = s.session_id
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
  c.duration_minutes - coalesce(
    case when p.started_at is not null
         then least(p.duration_minutes, greatest(extract(epoch from (p.p_boundary_at - p.started_at)) / 60, 0))
         else p.duration_minutes end, 0) as duration_minutes,
  c.watch_seconds - coalesce(p.watch_seconds, 0) as watch_seconds,
  -- Cột MỚI nằm cuối (create or replace view không cho chèn giữa). null = file không có ATC (file TikTok).
  case when c.raw ? 'atc'
       then coalesce((c.raw->>'atc')::numeric, 0) - coalesce((p.raw->>'atc')::numeric, 0)
  end as atc
from snap sn
join session_live_snapshot_rows c on c.snapshot_id = sn.snapshot_id
left join lateral (
  select pr.*, ps.boundary_at as p_boundary_at
  from session_live_snapshot_rows pr
  join session_live_snapshots ps on ps.id = pr.snapshot_id
  where pr.room_id = c.room_id and ps.boundary_at < sn.boundary_at
    and (sn.prev_session_id is null or ps.session_id = sn.prev_session_id)
  order by ps.boundary_at desc
  limit 1
) p on true
where (c.gmv - coalesce(p.gmv, 0) > 0
    or c.views - coalesce(p.views, 0) > 0
    or c.orders - coalesce(p.orders, 0) > 0
    or c.duration_minutes - coalesce(p.duration_minutes, 0) > 0)
  and (c.raw->>'picked' = 'true'
    or ((c.ended_at is null or c.ended_at >= sn.session_start)
        and (c.started_at is null or c.started_at <= sn.boundary_at)))
  and (sn.prev_session_id is null or exists (select 1 from session_live_snapshots x where x.session_id = sn.prev_session_id));

do $$
declare r record;
begin
  for r in
    select distinct s.session_id from session_live_snapshots s
    join live_sessions ls on ls.id = s.session_id
    where ls.data_source = 'live_snapshot'
  loop
    perform recompute_session_from_snapshot(r.session_id);
  end loop;
end $$;
