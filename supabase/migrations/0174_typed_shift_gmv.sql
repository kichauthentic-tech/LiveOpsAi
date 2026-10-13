-- 0174 — Sửa GMV ĐÚNG của ca bằng tay: lúc up snapshot (trợ live) và ở màn Đối soát (OPS). Chỉ số khác chia theo % GMV.
-- (User chốt 13/10.) Chạy tay trên Supabase SQL Editor; chạy lại nhiều lần không sao.
--
-- VÌ SAO: file snapshot thường tải TRỄ (đo 13/10: trung vị 54 phút sau giờ hết ca, 11/23 file trễ hơn 1 giờ). Room còn live lúc tải
-- ⇒ số cộng dồn trong file đã gồm phần của ca sau: ca đúng 10M, file tải lúc ca sau live được 1 giờ ra 12M. App không biết 2M nào
-- của ca sau — trợ live thì biết (dashboard lúc giao ca). User: "up file snapshot là gõ luôn" — app gợi ý số, trợ sửa thành số đúng.
--
-- 1) SNAPSHOT — `set_session_snapshot_gmv(ca, gmv)` (cùng quyền với up file): quy số cộng dồn của các room CÒN LIVE lúc hết ca về
--    đúng giờ hết ca. Mỗi room: số mới = mốc trước + k × (số file − mốc trước), k = (GMV gõ − phần các room đã tắt trước giờ hết ca)
--    ÷ phần các room còn live — mọi chỉ số đếm được (đơn, lượt xem, click, ATC Shopee…) nhân CÙNG k = chia theo % GMV; thời lượng
--    = giờ hết ca − giờ room bắt đầu (là thời gian, không chia theo GMV). Không room nào còn live ⇒ k áp cho mọi room của ca.
--    Số gốc của file giữ trong raw.orig từng dòng; gõ lại / bỏ số gõ = khôi phục số file rồi tính lại. Vì số cộng dồn đã quy về giờ
--    hết ca nên: ca sau trừ đúng mốc (2M dư tự sang ca sau), ca đang chờ ca nối trước cũng vậy, và đối soát dùng mốc này tại giờ hết
--    ca (snapshot ước lượng của OPS mà đã gõ GMV cũng thành mốc thật). Up lại file khác / thêm-xoá lượt restart ⇒ số gõ bị bỏ.
-- 2) ĐỐI SOÁT — bảng `recon_gmv_overrides(ca, room)` + `set_recon_gmv_override(dòng, ca, gmv)` (ceo/admin/ops): phiên khớp nhiều ca
--    thì gõ GMV của ca nào ca đó giữ đúng số; phần còn lại (GMV file − tổng số gõ) chia cho các ca kia theo tỷ lệ của bản chia tự động
--    (mốc/giờ); mọi chỉ số đếm được của phiên chia theo % GMV đó; thời lượng giữ cách chia theo giờ. Tổng vẫn = file. Khoá theo
--    (ca, room) nên lô file mới hơn của cùng kỳ (01–10 → 01–13) giữ số đã gõ. `private.recon_shares` = bản chia 0172 (đổi tên
--    `recon_shares_base`, thêm mốc gõ tay) + lớp số gõ; Áp dụng / xem trước không đổi chữ ký, nhãn mới 'manual'.

-- ---------------------------------------------------------------------------
-- 0) Cột / bảng
-- ---------------------------------------------------------------------------
alter table session_live_snapshots
  add column if not exists typed_gmv numeric,
  add column if not exists typed_by uuid references profiles(id) on delete set null,
  add column if not exists typed_at timestamptz;

create table if not exists recon_gmv_overrides (
  session_id uuid not null references live_sessions(id) on delete cascade,
  room_id text not null,
  gmv numeric not null check (gmv >= 0),
  set_by uuid references profiles(id) on delete set null,
  set_at timestamptz not null default now(),
  primary key (session_id, room_id)
);
alter table recon_gmv_overrides enable row level security;
drop policy if exists recon_gmv_overrides_read on recon_gmv_overrides;
create policy recon_gmv_overrides_read on recon_gmv_overrides for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
);
revoke all on recon_gmv_overrides from anon;
revoke insert, update, delete on recon_gmv_overrides from authenticated;
grant select on recon_gmv_overrides to authenticated;

-- ---------------------------------------------------------------------------
-- 1) Snapshot: khôi phục số file / gõ GMV đúng của ca
-- ---------------------------------------------------------------------------
create or replace function private.snapshot_restore_file_numbers(p_snapshot_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update session_live_snapshot_rows r set
    gmv = (x.o->>'gmv')::numeric,
    items_sold = (x.o->>'items_sold')::int,
    orders = (x.o->>'orders')::int,
    sku_orders = (x.o->>'sku_orders')::int,
    views = (x.o->>'views')::bigint,
    impressions = (x.o->>'impressions')::bigint,
    product_impressions = (x.o->>'product_impressions')::bigint,
    product_clicks = (x.o->>'product_clicks')::bigint,
    new_followers = (x.o->>'new_followers')::int,
    comments = (x.o->>'comments')::int,
    shares = (x.o->>'shares')::int,
    likes = (x.o->>'likes')::int,
    duration_minutes = (x.o->>'duration_minutes')::numeric,
    watch_seconds = (x.o->>'watch_seconds')::numeric,
    raw = case when x.o ? 'atc' then (r.raw - 'orig') || jsonb_build_object('atc', x.o->'atc') else r.raw - 'orig' end
  from (select id, raw->'orig' as o from session_live_snapshot_rows where snapshot_id = p_snapshot_id and raw ? 'orig') x
  where r.id = x.id;
  update session_live_snapshots set typed_gmv = null, typed_by = null, typed_at = null
   where id = p_snapshot_id and typed_gmv is not null;
end;
$$;
revoke all on function private.snapshot_restore_file_numbers(uuid) from public;

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
    raise exception 'Ca này chưa up file số liệu — up file trước rồi mới sửa GMV.';
  end if;
  if p_gmv is not null and p_gmv < 0 then
    raise exception 'GMV không được âm.';
  end if;

  -- Luôn tính từ số GỐC của file (gõ lại nhiều lần không cộng dồn sai số).
  perform private.snapshot_restore_file_numbers(v_snap.id);

  if p_gmv is not null then
    if private.session_waits_for_prev(p_session_id) then
      raise exception 'Ca này nối từ ca trước mà ca trước chưa up file — chưa có mốc để tính GMV ca này. Up file ca trước (hoặc OPS chia ước lượng) trước.';
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
revoke all on function set_session_snapshot_gmv(uuid, numeric) from public;
grant execute on function set_session_snapshot_gmv(uuid, numeric) to authenticated;

-- Thêm / xoá lượt restart đổi tập room của ca ⇒ số gõ cũ hết nghĩa: trả về số file (hàm thêm/xoá mảnh tự tính lại số ca sau đó).
create or replace function private.reset_typed_gmv_on_parts() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap uuid;
begin
  select id into v_snap from session_live_snapshots
   where session_id = coalesce(new.session_id, old.session_id) and typed_gmv is not null;
  if v_snap is not null then
    perform private.snapshot_restore_file_numbers(v_snap);
  end if;
  return null;
end;
$$;
revoke all on function private.reset_typed_gmv_on_parts() from public;
drop trigger if exists trg_reset_typed_gmv_on_parts on session_snapshot_parts;
create trigger trg_reset_typed_gmv_on_parts
  after insert or delete on session_snapshot_parts
  for each row execute function private.reset_typed_gmv_on_parts();

-- ---------------------------------------------------------------------------
-- 2) Đối soát: gõ GMV của một ca trong phiên khớp nhiều ca
-- ---------------------------------------------------------------------------
create or replace function set_recon_gmv_override(p_row_id uuid, p_session_id uuid, p_gmv numeric)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rr live_reconciliation_rows;
  v_n int;
  v_other numeric;
  v_n_typed int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations mới sửa được số đối soát.';
  end if;
  select * into rr from live_reconciliation_rows where id = p_row_id;
  if not found then
    raise exception 'Không thấy dòng đối soát.';
  end if;
  if not (coalesce(rr.matched_session_ids, '{}') @> array[p_session_id]) then
    raise exception 'Ca này không khớp với phiên này.';
  end if;
  if p_gmv is null then
    delete from recon_gmv_overrides where session_id = p_session_id and room_id = rr.room_id;
    return;
  end if;
  if p_gmv < 0 then
    raise exception 'GMV không được âm.';
  end if;
  select count(distinct x) into v_n from unnest(rr.matched_session_ids) x;
  if v_n < 2 then
    raise exception 'Phiên chỉ khớp một ca — ca đó nhận trọn số file, không cần nhập tay.';
  end if;
  select coalesce(sum(o.gmv), 0), count(*) into v_other, v_n_typed
    from recon_gmv_overrides o
   where o.room_id = rr.room_id and o.session_id = any(rr.matched_session_ids) and o.session_id <> p_session_id;
  if v_other + p_gmv > rr.gmv + 0.5 then
    raise exception 'Tổng GMV nhập tay (%) vượt GMV của phiên trong file (%).', round(v_other + p_gmv), round(rr.gmv);
  end if;
  if v_n_typed + 1 >= v_n and abs(v_other + p_gmv - rr.gmv) > 0.5 then
    raise exception 'Mọi ca của phiên đều nhập tay thì tổng phải bằng GMV file (%). Để trống một ca để nhận phần còn lại.', round(rr.gmv);
  end if;
  insert into recon_gmv_overrides (session_id, room_id, gmv, set_by, set_at)
  values (p_session_id, rr.room_id, p_gmv, auth.uid(), now())
  on conflict (session_id, room_id) do update set gmv = excluded.gmv, set_by = excluded.set_by, set_at = now();
end;
$$;
revoke all on function set_recon_gmv_override(uuid, uuid, numeric) from public;
grant execute on function set_recon_gmv_override(uuid, uuid, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Bản chia tự động (0172 nguyên văn, đổi tên) + mốc gõ tay của snapshot
-- ---------------------------------------------------------------------------
create or replace function private.recon_shares_base(p_batch_id uuid)
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
             -- 0174: trợ gõ GMV đúng của ca lúc up ⇒ số cộng dồn đã quy về đúng giờ hết ca.
             when s.typed_gmv is not null then s.boundary_at
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
      -- 0174: snapshot ước lượng mà OPS đã gõ GMV đúng thì là mốc thật.
      join session_live_snapshots s on s.session_id = p.session_id and (not s.is_estimated or s.typed_gmv is not null)
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
revoke all on function private.recon_shares_base(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4) private.recon_shares = bản chia tự động + số gõ tay ở đối soát (cùng chữ ký 0171 ⇒ Áp dụng / xem trước không đổi)
-- ---------------------------------------------------------------------------
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
set enable_nestloop = off
as $$
#variable_conflict use_column
begin
  return query
  with b as materialized (
    select * from private.recon_shares_base(p_batch_id)
  ),
  o as materialized (
    select b.row_id, b.session_id, ov.gmv as typed
      from b
      join live_reconciliation_rows rr on rr.id = b.row_id
      join recon_gmv_overrides ov on ov.session_id = b.session_id and ov.room_id = rr.room_id
  ),
  -- Tổng của phiên (= số file, bản chia tự động đã chuẩn hoá) — chỉ phiên có ca gõ tay và GMV file > 0.
  t as materialized (
    select b.row_id,
           sum(b.gmv) as f_gmv, sum(b.items_sold) as f_items_sold, sum(b.orders) as f_orders, sum(b.sku_orders) as f_sku_orders,
           sum(b.views) as f_views, sum(b.impressions) as f_impressions, sum(b.product_impressions) as f_product_impressions,
           sum(b.product_clicks) as f_product_clicks, sum(b.new_followers) as f_new_followers, sum(b.comments) as f_comments,
           sum(b.shares) as f_shares, sum(b.likes) as f_likes, sum(b.watch_seconds) as f_watch_seconds,
           coalesce(sum(o.typed), 0) as typed_sum,
           count(*) filter (where o.typed is null) as n_free,
           coalesce(sum(b.gmv) filter (where o.typed is null), 0) as free_gmv,
           coalesce(sum(b.duration_minutes) filter (where o.typed is null), 0) as free_dur
      from b
      left join o on o.row_id = b.row_id and o.session_id = b.session_id
     group by b.row_id
    having count(o.typed) > 0 and sum(b.gmv) > 0
  ),
  -- Ca gõ tay giữ số gõ; phần còn lại chia cho ca không gõ theo tỷ lệ bản chia tự động (không có thì theo giờ, rồi chia đều).
  -- Số gõ vượt file (file mới nhỏ hơn) hoặc mọi ca đều gõ ⇒ co các số gõ cho vừa file.
  g as materialized (
    select b.*, t.f_gmv, t.f_items_sold, t.f_orders, t.f_sku_orders, t.f_views, t.f_impressions, t.f_product_impressions,
           t.f_product_clicks, t.f_new_followers, t.f_comments, t.f_shares, t.f_likes, t.f_watch_seconds,
           o.typed is not null as is_typed,
           case
             when o.typed is not null then
               case when t.n_free = 0 or t.typed_sum > t.f_gmv
                      then case when t.typed_sum > 0 then t.f_gmv * o.typed / t.typed_sum else b.gmv end
                    else o.typed end
             when t.typed_sum >= t.f_gmv then 0
             when t.free_gmv > 0 then (t.f_gmv - t.typed_sum) * b.gmv / t.free_gmv
             when t.free_dur > 0 then (t.f_gmv - t.typed_sum) * b.duration_minutes / t.free_dur
             else (t.f_gmv - t.typed_sum) / t.n_free
           end as new_gmv
      from b
      join t on t.row_id = b.row_id
      left join o on o.row_id = b.row_id and o.session_id = b.session_id
  )
  select g.row_id, g.session_id, g.room_id, g.started_at, g.ended_at,
         case when g.is_typed then 'manual' else g.method end,
         g.new_gmv,
         g.f_items_sold * g.new_gmv / g.f_gmv, g.f_orders * g.new_gmv / g.f_gmv, g.f_sku_orders * g.new_gmv / g.f_gmv,
         g.f_views * g.new_gmv / g.f_gmv, g.f_impressions * g.new_gmv / g.f_gmv, g.f_product_impressions * g.new_gmv / g.f_gmv,
         g.f_product_clicks * g.new_gmv / g.f_gmv, g.f_new_followers * g.new_gmv / g.f_gmv, g.f_comments * g.new_gmv / g.f_gmv,
         g.f_shares * g.new_gmv / g.f_gmv, g.f_likes * g.new_gmv / g.f_gmv,
         g.duration_minutes, g.f_watch_seconds * g.new_gmv / g.f_gmv
    from g
  union all
  select b.row_id, b.session_id, b.room_id, b.started_at, b.ended_at, b.method, b.gmv, b.items_sold, b.orders, b.sku_orders,
         b.views, b.impressions, b.product_impressions, b.product_clicks, b.new_followers, b.comments, b.shares, b.likes,
         b.duration_minutes, b.watch_seconds
    from b
   where not exists (select 1 from t where t.row_id = b.row_id);
end;
$$;
revoke all on function private.recon_shares(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5) Chốt tự kiểm
-- ---------------------------------------------------------------------------
do $$
begin
  if pg_get_functiondef('private.recon_shares(uuid)'::regprocedure) !~ 'recon_shares_base' then
    raise exception '0174: private.recon_shares chưa bọc recon_shares_base';
  end if;
  if pg_get_functiondef('private.recon_shares_base(uuid)'::regprocedure) !~ 'typed_gmv' then
    raise exception '0174: recon_shares_base chưa dùng mốc gõ tay';
  end if;
  if pg_get_functiondef('public.apply_live_reconciliation(uuid)'::regprocedure) !~ 'private\.recon_shares\(' then
    raise exception '0174: apply_live_reconciliation không còn dùng private.recon_shares';
  end if;
  if to_regprocedure('public.set_session_snapshot_gmv(uuid, numeric)') is null
     or to_regprocedure('public.set_recon_gmv_override(uuid, uuid, numeric)') is null then
    raise exception '0174: thiếu RPC sửa GMV';
  end if;
end $$;
