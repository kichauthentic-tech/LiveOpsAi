-- 0202 — MÃ PHÒNG SHOPEE CHỈ NỐI TRONG CÙNG BRAND + SÀN.
--
-- Lỗi (VERA Shopee CN 08/11 11:00–14:00): phiên VERA 10:58→13:58 (180', 8,23M) nhưng ca hiện 59' / 3,73M.
-- Shopee không có Room ID nên app đặt mã tổng hợp SHP-<ngày>-<giờ bắt đầu> (shopeeStreamsToSnapshotRows). Franklin Shopee cùng
-- ngày cũng bật live lúc 10:58 ⇒ cùng mã SHP-2026-11-08-1058. View session_room_deltas tìm "lần up trước của cùng room" theo
-- room_id ở MỌI ca, nên coi file Franklin (121', 4,5M, tải 14:29) là phần ca trước của phiên VERA và trừ đi.
--
-- Sửa: với mã SHP-…, dòng của lần up trước chỉ được tính khi ca của nó cùng brand + sàn với ca đang xét (giống quy ước
-- "chung room = cùng brand + sàn" của 0189). Room TikTok là ID thật của sàn nên giữ nguyên cách cũ.
-- Áp cho: view session_room_deltas (thân = nguyên văn 0195), apply_segment_checkpoint_file (đổi người giữa ca bằng file) và
-- set_session_snapshot_gmv (kiểm "không vượt số ca sau") — hai hàm sau vá từ định nghĩa đang có trong DB như 0189.
-- Cuối file tính lại các ca đang lấy số từ snapshot. Chạy lại nhiều lần không sao.

create or replace function private.room_rows_comparable(p_room_id text, p_session_a uuid, p_session_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_room_id is null
      or p_room_id not like 'SHP-%'
      or exists (
        select 1 from live_sessions a
          join live_sessions b on b.id = p_session_b
         where a.id = p_session_a and a.brand_id = b.brand_id and a.platform = b.platform
      );
$$;
revoke all on function private.room_rows_comparable(text, uuid, uuid) from public, anon, authenticated;

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
    and private.room_rows_comparable(c.room_id, ps.session_id, sn.session_id)
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
declare

  v_def text;
  v_new text;
begin
  -- Đổi người giữa ca bằng file: số cộng dồn của ca khác cùng mã phòng.
  v_def := pg_get_functiondef('public.apply_segment_checkpoint_file(uuid,integer,text,jsonb)'::regprocedure);
  if v_def !~ 'room_rows_comparable' then
    v_new := replace(v_def,
      'where pr.room_id = c.room_id and ps.session_id <> s.id and ps.boundary_at <= v_boundary',
      'where pr.room_id = c.room_id and ps.session_id <> s.id and ps.boundary_at <= v_boundary
         and private.room_rows_comparable(c.room_id, ps.session_id, s.id)');
    if v_new = v_def then
      raise exception '0202: không thấy điều kiện room của ca khác trong apply_segment_checkpoint_file';
    end if;
    execute v_new;
  end if;

  -- Gõ GMV ca: so với số ca SAU đã up cho cùng room.
  v_def := pg_get_functiondef('public.set_session_snapshot_gmv(uuid, numeric)'::regprocedure);
  if v_def !~ 'room_rows_comparable' then
    v_new := replace(v_def,
      'where nr.room_id = r.room_id and ns.boundary_at > v_snap.boundary_at',
      'where nr.room_id = r.room_id and ns.boundary_at > v_snap.boundary_at
           and private.room_rows_comparable(r.room_id, ns.session_id, p_session_id)');
    if v_new = v_def then
      raise exception '0202: không thấy điều kiện ca sau trong set_session_snapshot_gmv';
    end if;
    execute v_new;
  end if;
end $$;

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
