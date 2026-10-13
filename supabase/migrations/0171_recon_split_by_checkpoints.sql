-- 0171 — Đối soát: chia số phiên theo MỐC snapshot đã có, chỉ ước lượng phần thật sự thiếu mốc + snapshot không đè số đã đối soát.
-- (User chốt 13/10.) Chạy tay trên Supabase SQL Editor; chạy lại nhiều lần không sao. Thứ tự: migration trước, client sau
-- (client cũ không gọi preview_live_reconciliation, vẫn chạy được; client mới gặp DB chưa có 0171 thì ẩn cột số chia).
--
-- VÌ SAO:
--   1) Trước: một phiên khớp nhiều ca mà CHỈ CẦN một ca thiếu snapshot ⇒ cả phiên vào rổ "cần xem lại" và chia TOÀN BỘ theo giờ,
--      bỏ luôn số snapshot của các ca đã up. Vd phiên 18:00 -> 00:00 có snapshot lúc giao ca 21:00 nhưng ca 21–00 không up:
--      số lúc 21:00 đã biết chính xác mà vẫn chia 50/50 theo giờ.
--      Nay: mỗi snapshot THẬT (không phải ước lượng) của một ca chứa room của phiên = một MỐC (giờ tải file, số cộng dồn lúc đó).
--      Phần giữa hai mốc rải theo giờ cho các ca có mặt trong khoảng đó; phần sau mốc cuối = số file − mốc cuối. Up đúng giờ giao
--      ca ⇒ chia đúng từng ca; up trễ ⇒ chỉ phần trễ bị ước lượng (xem mục 1). Tổng các ca luôn = số file.
--   2) Trước: up/up lại/xoá snapshot của ca ĐÃ đối soát (hoặc up snapshot ca trước làm ca nối sau tính lại) ghi đè số file sàn
--      bằng số snapshot / số trước snapshot, nhãn "Đã đối soát" mất mà không ai biết. Nay ca 'tiktok_reconciled' giữ nguyên số;
--      snapshot vẫn được lưu và dùng làm mốc chia ở lần Áp dụng lại (màn đối soát báo ca nào đang lệch bản chia mới).
--
-- Gồm: private.recon_shares (phép chia, dùng chung cho Áp dụng + xem trước), apply_live_reconciliation viết lại trên nó
-- (giữ ATC Shopee của 0150 + bỏ dòng excluded của 0166), RPC preview_live_reconciliation, vá recompute_session_from_snapshot +
-- delete_session_live_snapshot.

-- ---------------------------------------------------------------------------
-- 1) Phép chia
-- ---------------------------------------------------------------------------
-- Mốc = (giờ TẢI file snapshot, số cộng dồn của phiên trong file đó). KHÔNG lấy giờ hết ca: đo 13/10 trên DB thật 23 snapshot
-- up trễ trung vị 54 phút, 11/23 trễ hơn 1 giờ (6 cái hơn 3 giờ) — vd CROCS 11/10 ca 18–21 tải file lúc 22:07, ca 09–12 tải lúc
-- 13:35 sau khi room tắt 13:08: coi đó là số lúc hết ca thì ca trước ôm luôn GMV của ca sau. Các mốc chia phiên thành đoạn thời gian; phần của mỗi đoạn (= mốc sau − mốc trước, đoạn cuối = số file − mốc
-- cuối) rải đều theo giờ cho các ca có mặt trong đoạn. Up đúng giờ giao ca ⇒ mỗi đoạn nằm gọn trong một ca ⇒ chia đúng;
-- up trễ ⇒ chỉ phần trễ bị rải theo giờ. Không mốc nào ⇒ như cũ: cả phiên chia theo giờ. Tổng các ca luôn = số file.
-- method (nhãn cho màn): 'whole' phiên chỉ khớp 1 ca | 'snapshot' mỗi ranh giới của ca nằm giữa phiên đều có mốc trong
-- vòng 15 phút | 'time' còn lại (có phần ước lượng theo giờ).
create or replace function private.recon_shares(p_batch_id uuid)
returns table (
  row_id uuid, session_id uuid, room_id text, started_at timestamptz, ended_at timestamptz, method text,
  gmv numeric, items_sold numeric, orders numeric, sku_orders numeric, views numeric, impressions numeric,
  product_impressions numeric, product_clicks numeric, new_followers numeric, comments numeric, shares numeric,
  likes numeric, duration_minutes numeric, watch_seconds numeric
)
language sql
stable
set search_path = public
as $$
  -- Mọi CTE MATERIALIZED: để planner tự gộp thì nó chọn nested loop dựng lại hash join mỗi dòng — lô 27 phiên quá
  -- statement timeout trên DB thật (13/10), 78 phiên mất 4 phút 37 giây trên bản replay.
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
$$;
revoke all on function private.recon_shares(uuid) from public;

-- ---------------------------------------------------------------------------
-- 2) Áp dụng — thân như 0139 (+ ATC 0150, + bỏ dòng excluded 0166), phần chia thay bằng private.recon_shares.
-- ---------------------------------------------------------------------------
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
    raise exception 'Lô này nạp trước khi đối soát gắn brand (0133) — xoá lô và up lại file, chọn đúng brand.';
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
revoke all on function apply_live_reconciliation(uuid) from public;
grant execute on function apply_live_reconciliation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Xem trước: mỗi phiên chia cho ca nào bao nhiêu, bằng cách nào; kèm số đang ghi trên ca để màn báo "lệch bản chia mới".
-- ---------------------------------------------------------------------------
create or replace function preview_live_reconciliation(p_batch_id uuid)
returns table (row_id uuid, session_id uuid, method text, gmv numeric, orders numeric, current_gmv numeric, current_source text)
language plpgsql
stable
security definer
set search_path = public
as $$
#variable_conflict use_column
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền xem đối soát';
  end if;
  return query
    select sh.row_id, sh.session_id, sh.method, sh.gmv, sh.orders, ls.actual_gmv::numeric, ls.data_source::text
      from private.recon_shares(p_batch_id) sh
      join live_sessions ls on ls.id = sh.session_id;
end;
$$;
revoke all on function preview_live_reconciliation(uuid) from public;
grant execute on function preview_live_reconciliation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Snapshot không đè số đã đối soát (bọc định nghĩa đang chạy, khuôn 0150/0166).
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
begin
  -- Up / up lại snapshot, up snapshot ca trước làm ca nối sau tính lại, thêm/xoá mảnh: đều đi qua hàm này.
  v_def := pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure);
  if v_def !~ 'tiktok_reconciled' then
    v_new := replace(
      v_def,
      '  if private.session_waits_for_prev(p_session_id) then
    return;
  end if;',
      '  if private.session_waits_for_prev(p_session_id) then
    return;
  end if;
  -- 0171: ca đã đối soát giữ số file sàn; snapshot chỉ làm mốc chia cho lần Áp dụng lại.
  if exists (select 1 from live_sessions where id = p_session_id and data_source::text = ''tiktok_reconciled'') then
    return;
  end if;'
    );
    if v_new = v_def then
      raise exception '0171: không thấy chỗ chèn chốt đối soát trong recompute_session_from_snapshot';
    end if;
    execute v_new;
  end if;

  -- Xoá snapshot: ca đã đối soát không bị trả về số trước snapshot.
  v_def := pg_get_functiondef('public.delete_session_live_snapshot(uuid)'::regprocedure);
  if v_def !~ 'tiktok_reconciled' then
    v_new := replace(
      v_def,
      '    reconciled_at = nullif(v_previous->>''reconciled_at'', '''')::timestamptz
  where id = p_session_id;',
      '    reconciled_at = nullif(v_previous->>''reconciled_at'', '''')::timestamptz
  where id = p_session_id and data_source::text <> ''tiktok_reconciled'';'
    );
    if v_new = v_def then
      raise exception '0171: không thấy chỗ khôi phục số trong delete_session_live_snapshot';
    end if;
    execute v_new;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5) Chốt tự kiểm
-- ---------------------------------------------------------------------------
do $$
declare
  v_def text := pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure);
begin
  if v_def !~ 'private\.recon_shares' then
    raise exception '0171: apply_live_reconciliation chưa dùng private.recon_shares';
  end if;
  if v_def !~ 'live_session_reports \(session_id, atc_count\)' then
    raise exception '0171: apply_live_reconciliation mất phần ATC Shopee (0150)';
  end if;
  if v_def !~ 'not rr\.excluded' then
    raise exception '0171: apply_live_reconciliation mất điều kiện bỏ dòng excluded (0166)';
  end if;
  if pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure) !~ 'tiktok_reconciled' then
    raise exception '0171: recompute_session_from_snapshot chưa giữ số ca đã đối soát';
  end if;
  if pg_get_functiondef('public.delete_session_live_snapshot(uuid)'::regprocedure) !~ 'tiktok_reconciled' then
    raise exception '0171: delete_session_live_snapshot chưa giữ số ca đã đối soát';
  end if;
  if to_regprocedure('public.preview_live_reconciliation(uuid)') is null then
    raise exception '0171: thiếu preview_live_reconciliation';
  end if;
end $$;
