-- 0168 — Phòng/phiên trợ ĐÃ TICK ở bước chọn phòng thì DB tính cho ca, không lọc lại theo giờ ca (user 11/10).
--
-- Trước: picker chỉ cho tick phòng giao với cửa sổ ca, và DB (view session_room_deltas + apply_segment_checkpoint_file) lọc lại
-- đúng luật đó. Hỏng ở Live List Shopee: file tải lúc phiên còn chạy (ca nối giao ca giữa phiên) để Duration 0 ⇒ giờ kết thúc =
-- giờ bắt đầu (vd phiên 09:59 của ca 10:00–13:00 thành "09:59→09:59") ⇒ bị coi là ngoài ca, không tick được gì. Client nay đọc
-- Duration 0 là "chưa kết thúc" và picker chỉ GỢI Ý (vẫn tick được dòng ngoài giờ). Dòng gửi từ picker mang raw.picked = true:
-- DB tin lựa chọn của trợ, chỉ còn áp luật cửa sổ cho dòng KHÔNG có cờ (snapshot cũ trước picker gửi cả file cả ngày — giữ nguyên số).
--
-- Thân hàm/view = nguyên văn 0154, chỉ đổi điều kiện cửa sổ. Thứ tự deploy: migration trước, client sau (client cũ không gửi cờ ⇒
-- hành vi cũ). Chạy lại nhiều lần không sao.

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
  c.duration_minutes - coalesce(p.duration_minutes, 0) as duration_minutes,
  c.watch_seconds - coalesce(p.watch_seconds, 0) as watch_seconds,
  -- Cột MỚI nằm cuối (create or replace view không cho chèn giữa). null = file không có ATC (file TikTok).
  case when c.raw ? 'atc'
       then coalesce((c.raw->>'atc')::numeric, 0) - coalesce((p.raw->>'atc')::numeric, 0)
  end as atc
from snap sn
join session_live_snapshot_rows c on c.snapshot_id = sn.snapshot_id
left join lateral (
  select pr.*
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
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới up số lúc đổi host được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không up số lúc đổi host.' using errcode = 'P0001';
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

revoke all on function apply_segment_checkpoint_file(uuid, integer, text, jsonb) from public;
grant execute on function apply_segment_checkpoint_file(uuid, integer, text, jsonb) to authenticated;
