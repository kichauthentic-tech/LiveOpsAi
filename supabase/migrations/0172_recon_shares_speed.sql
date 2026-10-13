-- 0172 — Sửa tốc độ phép chia đối soát của 0171 (user chạy 0171 ngày 13/10).
-- Đo trên DB thật ngay sau khi chạy 0171: preview_live_reconciliation lô 4 phiên 0,5 giây, 19 phiên 7,6 giây, lô CROCS T10
-- 27 phiên "statement timeout" — Áp dụng dùng CÙNG hàm nên cũng hỏng. Hai nguyên nhân, đo trên bản replay (lô giả 78 / 578 phiên):
--   1) planner gộp các CTE rồi chọn nested loop dựng lại hash join cho MỖI dòng: 78 phiên 4 phút 37 giây ⇒ mọi CTE MATERIALIZED,
--      bước cuối mang sẵn số theo dòng thay vì ghép lại 4 bảng: 78 phiên 30 ms;
--   2) khi bảng chưa có thống kê mới (vừa nạp lô / autovacuum chưa chạy) planner vẫn ghép kiểu nested loop: 578 phiên 8,3 giây
--      (có thống kê 0,2 giây) ⇒ bước cuối không ghép bảng nữa (số file + giờ bắt đầu mang theo điểm mốc) + `set enable_nestloop = off`
--      trong riêng hàm này; viết bằng plpgsql `return query` để mang được SET đó rõ ràng.
-- Kết quả chia KHÔNG đổi (cùng bộ test supabase/tests/0171_recon_split_by_checkpoints.sql). File 0171 đã sửa theo (1) để
-- replay từ đầu cũng nhanh; production chỉ cần chạy file này. Chạy lại nhiều lần không sao; không đổi chữ ký.

create or replace function private.recon_shares(p_batch_id uuid)
returns table (
  row_id uuid, session_id uuid, room_id text, started_at timestamptz, ended_at timestamptz, method text,
  gmv numeric, items_sold numeric, orders numeric, sku_orders numeric, views numeric, impressions numeric,
  product_impressions numeric, product_clicks numeric, new_followers numeric, comments numeric, shares numeric,
  likes numeric, duration_minutes numeric, watch_seconds numeric
)
language plpgsql
stable
set search_path = public
-- Chỉ trong hàm này: bảng tạm (CTE) không có thống kê nên planner hay chọn nested loop quét lại cả CTE cho mỗi dòng
-- (lô 578 phiên: ghép ca × đoạn 1.156 × 16.184 lần). Hash join ổn định ở mọi cỡ lô.
set enable_nestloop = off
as $$
#variable_conflict use_column
begin
  -- Mọi CTE MATERIALIZED: để planner tự gộp thì nó chọn nested loop dựng lại hash join mỗi dòng.
  return query
  with b as materialized (
    select brand_id, platform from live_reconciliation_batches where id = p_batch_id
  ),
  r as materialized (
    -- Room của phiên: room chính + room của các dòng đã gộp (0167, ca restart).
    select rr.*,
           array(
             select distinct x from unnest(
               array[rr.room_id] || array(
                 select m->>'roomId'
                   from jsonb_array_elements(case when jsonb_typeof(rr.raw->'merged_from') = 'array' then rr.raw->'merged_from' else '[]'::jsonb end) m
               )
             ) x
             where coalesce(x, '') <> ''
           ) as rooms
      from live_reconciliation_rows rr
     where rr.batch_id = p_batch_id and rr.bucket in ('agency', 'review')
       and rr.started_at is not null and rr.ended_at is not null
  ),
  pair as materialized (
    select r.id as row_id, ls.id as session_id, r.room_id, r.started_at, r.ended_at, r.rooms,
           count(*) over (partition by r.id) as n_sess,
           (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' as ss,
           session_boundary_at(ls.id) as se
      from r
      join unnest(r.matched_session_ids) as sid on true
      -- Chốt theo brand + sàn của lô: đây là đường GHI số.
      join live_sessions ls on ls.id = sid
      join b on ls.brand_id = b.brand_id and ls.platform::text = b.platform
  ),
  pair2 as materialized (
    select p.*,
           greatest(extract(epoch from (least(p.ended_at, p.se) - greatest(p.started_at, p.ss))), 1)::numeric as overlap_sec
      from pair p
  ),
  -- Mốc từ snapshot THẬT của ca khớp (ước lượng của estimate_handover_split không tính). Giờ của mốc = giờ TẢI file: room TikTok
  -- còn live lúc tải có giờ bắt đầu + thời lượng = đúng giờ tải (khớp timestamp trong tên file, đo 13/10), room đã tắt thì = giờ
  -- tắt (số đã chốt); Live List Shopee tải giữa phiên để thời lượng 0 ⇒ dùng giờ up (mảnh sau 0153 mang giờ up của mảnh).
  -- Không bao giờ muộn hơn giờ up. Kẹp vào khung phiên.
  cp as materialized (
    select p.row_id, p.session_id,
           least(greatest(max(case
             when sr.duration_minutes > 0 and sr.started_at is not null
               then least(sr.started_at + sr.duration_minutes * interval '1 minute', coalesce(pt.captured_at, s.captured_at))
             else coalesce(pt.captured_at, s.captured_at)
           end), min(p.started_at)), min(p.ended_at)) as t,
           sum(sr.gmv) as gmv, sum(sr.items_sold) as items_sold, sum(sr.orders) as orders, sum(sr.sku_orders) as sku_orders,
           sum(sr.views) as views, sum(sr.impressions) as impressions, sum(sr.product_impressions) as product_impressions,
           sum(sr.product_clicks) as product_clicks, sum(sr.new_followers) as new_followers, sum(sr.comments) as comments,
           sum(sr.shares) as shares, sum(sr.likes) as likes, sum(sr.duration_minutes) as duration_minutes,
           sum(sr.watch_seconds) as watch_seconds
      from pair p
      join session_live_snapshots s on s.session_id = p.session_id and not s.is_estimated
      join session_live_snapshot_rows sr on sr.snapshot_id = s.id and sr.room_id = any(p.rooms)
      left join session_snapshot_parts pt on pt.id = sr.part_id
     group by p.row_id, p.session_id
  ),
  fv as materialized (
    select r.id as row_id, v.k, v.f
      from r
      cross join lateral (values
        ('gmv', r.gmv::numeric), ('items_sold', r.items_sold::numeric), ('orders', r.orders::numeric),
        ('sku_orders', r.sku_orders::numeric), ('views', r.views::numeric), ('impressions', r.impressions::numeric),
        ('product_impressions', r.product_impressions::numeric), ('product_clicks', r.product_clicks::numeric),
        ('new_followers', r.new_followers::numeric), ('comments', r.comments::numeric), ('shares', r.shares::numeric),
        ('likes', r.likes::numeric), ('duration_minutes', r.duration_minutes::numeric), ('watch_seconds', r.watch_seconds::numeric)
      ) v(k, f)
  ),
  cpl as materialized (
    select c.row_id, c.t, v.k, max(v.c) as c
      from cp c
      cross join lateral (values
        ('gmv', c.gmv), ('items_sold', c.items_sold::numeric), ('orders', c.orders::numeric),
        ('sku_orders', c.sku_orders::numeric), ('views', c.views::numeric), ('impressions', c.impressions::numeric),
        ('product_impressions', c.product_impressions::numeric), ('product_clicks', c.product_clicks::numeric),
        ('new_followers', c.new_followers::numeric), ('comments', c.comments::numeric), ('shares', c.shares::numeric),
        ('likes', c.likes::numeric), ('duration_minutes', c.duration_minutes), ('watch_seconds', c.watch_seconds)
      ) v(k, c)
     group by c.row_id, c.t, v.k
  ),
  -- Điểm trên đường cộng dồn của phiên: các mốc trước giờ kết thúc + điểm cuối. Điểm cuối = mốc up sau khi phiên kết thúc nếu có
  -- (số file lệch mốc đó — đơn trễ/huỷ — thì chuẩn hoá ở dưới chia đều theo tỷ lệ cho mọi ca), không có thì = số file
  -- (phần lệch rơi vào đoạn sau mốc cuối — không có thông tin nào tốt hơn).
  cpe as materialized (
    select cpl.row_id, cpl.k, max(cpl.c) as c
      from cpl join r on r.id = cpl.row_id
     where cpl.t >= r.ended_at
     group by cpl.row_id, cpl.k
  ),
  -- Mỗi điểm mang sẵn giờ bắt đầu phiên + số file (f, chỉ ở điểm cuối) để bước sau không phải ghép bảng lại.
  pts as materialized (
    select cpl.row_id, cpl.t, cpl.k, cpl.c, r.started_at as rs, null::numeric as f
      from cpl join r on r.id = cpl.row_id
     where cpl.t < r.ended_at
    union all
    select fv.row_id, r.ended_at, fv.k, coalesce(e.c, fv.f), r.started_at, fv.f
      from fv
      join r on r.id = fv.row_id
      left join cpe e on e.row_id = fv.row_id and e.k = fv.k
  ),
  -- Nhãn từng ca (theo cặp phiên × ca, tính MỘT lần rồi mang theo — tránh ghép lại ở cuối).
  lbl as materialized (
    -- Ranh giới của ca nằm giữa phiên (cách mép phiên > 15 phút) phải có mốc trong vòng 15 phút thì mới gọi là "theo snapshot".
    select p.*,
           case when p.n_sess = 1 then 'whole'
                when not exists (select 1 from cp where cp.row_id = p.row_id) then 'time'
                when (p.ss <= p.started_at + interval '15 minutes'
                      or exists (select 1 from cp where cp.row_id = p.row_id and abs(extract(epoch from (cp.t - p.ss))) <= 900))
                 and (p.se >= p.ended_at - interval '15 minutes'
                      or exists (select 1 from cp where cp.row_id = p.row_id and abs(extract(epoch from (cp.t - p.se))) <= 900))
                then 'snapshot'
                else 'time' end as method
      from pair2 p
  ),
  seg as materialized (
    -- Đoạn (t0, t1]: phần = điểm này − điểm trước (cộng dồn tụt thì 0); mang theo số file f của chỉ số.
    select pts.row_id, pts.k, pts.t as t1,
           max(pts.f) over (partition by pts.row_id, pts.k) as f,
           coalesce(lag(pts.t) over w, pts.rs) as t0,
           greatest(pts.c - coalesce(lag(pts.c) over w, 0), 0) as val
      from pts
    window w as (partition by pts.row_id, pts.k order by pts.t)
  ),
  ov as materialized (
    select l.row_id, l.session_id, l.room_id, l.started_at, l.ended_at, l.overlap_sec, l.method, s.k, s.f, s.t1, s.val,
           greatest(extract(epoch from (least(l.se, s.t1, l.ended_at) - greatest(l.ss, s.t0, l.started_at))), 0)::numeric as sec
      from lbl l
      join seg s on s.row_id = l.row_id
  ),
  raw as materialized (
    select o.row_id, o.session_id, o.k,
           max(o.room_id) as room_id, max(o.started_at) as started_at, max(o.ended_at) as ended_at,
           max(o.overlap_sec) as overlap_sec, max(o.method) as method, max(o.f) as f,
           sum(case when o.tot > 0 then o.val * o.sec / o.tot else 0 end) as raw_val
      from (select ov.*, sum(ov.sec) over (partition by ov.row_id, ov.k, ov.t1) as tot from ov) o
     group by o.row_id, o.session_id, o.k
  ),
  fin as materialized (
    select x.*,
           sum(x.raw_val) over (partition by x.row_id, x.k) as raw_sum,
           sum(x.overlap_sec) over (partition by x.row_id, x.k) as row_overlap
      from raw x
  )
  select f.row_id, f.session_id, max(f.room_id), max(f.started_at), max(f.ended_at),
         case when max(f.raw_sum) filter (where f.k = 'gmv') > 0 or max(f.f) filter (where f.k = 'gmv') = 0 then max(f.method) else 'time' end,
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'gmv'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'items_sold'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'orders'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'sku_orders'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'views'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'impressions'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'product_impressions'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'product_clicks'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'new_followers'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'comments'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'shares'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'likes'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'duration_minutes'),
         max(case when f.raw_sum > 0 then f.f * f.raw_val / f.raw_sum else f.f * f.overlap_sec / f.row_overlap end) filter (where f.k = 'watch_seconds')
    from fin f
   group by f.row_id, f.session_id
;
end;
$$;
revoke all on function private.recon_shares(uuid) from public;

do $$
begin
  if (select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang
       where p.oid = 'private.recon_shares(uuid)'::regprocedure) <> 'plpgsql' then
    raise exception '0172: private.recon_shares chưa đổi sang plpgsql';
  end if;
  if pg_get_functiondef('private.recon_shares(uuid)'::regprocedure) !~ 'as materialized'
     or pg_get_functiondef('private.recon_shares(uuid)'::regprocedure) !~ 'enable_nestloop' then
    raise exception '0172: private.recon_shares chưa có CTE materialized';
  end if;
end $$;
