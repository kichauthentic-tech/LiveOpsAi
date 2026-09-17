-- Giai đoạn 1 của việc đổi nguồn dữ liệu gốc cho toàn app: thay vì talent gõ tay số liệu sau ca,
-- trợ live tải file "Creator-Live-Performance" (TikTok Creator Center, 1 dòng/Room ID) rồi up
-- thẳng vào đúng ca đang trực. Ca đã biết host/brand nên file không cần cột định danh nào.
--
-- VÌ SAO PHẢI LƯU TỪNG LẦN UP THÀNH "SNAPSHOT" RIÊNG:
-- File là số CỘNG DỒN từ lúc mở room. Khi 2 ca nối nhau mà host không tắt stream, cả 2 ca dùng
-- chung một Room ID, nên số của ca sau = số lần up này TRỪ số lần up trước của cùng room đó.
-- Snapshot lúc giao ca là thứ DUY NHẤT ghi lại được ranh giới giữa 2 ca trong cùng một room —
-- file đối soát cuối ngày (giai đoạn 2) chỉ có tổng của cả room, không tách ngược lại được.
-- Hệ quả vận hành: trợ quên up lúc giao ca thì mất ranh giới vĩnh viễn, phải chia tay ước lượng.

create table session_live_snapshots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,

  file_name text,
  period_label text, -- chuỗi khoảng ngày gốc trong file, vd "2026-07-01 ~ 2026-09-17"

  -- MỐC CHIA RANH GIỚI giữa các ca dùng chung room = giờ KẾT THÚC CA, không phải giờ bấm up.
  -- Lấy theo giờ up sẽ sai ngay khi trợ up bù/up lại một ca cũ: mốc của ca đó nhảy ra sau ca kế
  -- tiếp, nên nó đi trừ nhầm số của ca sau và ra số âm.
  boundary_at timestamptz not null,
  captured_at timestamptz not null default now(), -- giờ bấm up, chỉ để hiển thị/truy vết

  row_count int not null default 0,
  -- Số liệu của ca TRƯỚC khi snapshot đầu tiên ghi đè (kể cả bản host tự khai tay). Giữ lại để
  -- khôi phục nguyên trạng khi trợ up nhầm ca rồi xoá đi — up lại lần 2+ cho cùng ca KHÔNG ghi
  -- đè trường này, vì đích khôi phục luôn phải là trạng thái gốc chứ không phải bản up hỏng.
  previous_values jsonb,

  uploaded_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Mỗi ca chỉ giữ đúng 1 snapshot hiện hành: up lần 2 cho cùng ca là THAY THẾ, không cộng dồn.
create unique index idx_session_live_snapshots_session on session_live_snapshots(session_id);
create index idx_session_live_snapshots_boundary on session_live_snapshots(boundary_at);

create table session_live_snapshot_rows (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid not null references session_live_snapshots(id) on delete cascade,

  room_id text not null,
  room_title text,
  started_at timestamptz,
  ended_at timestamptz,

  -- Giữ nguyên trạng cả 35 cột của file (kể cả các cột tỷ lệ) làm bằng chứng gốc: tính sai thì
  -- tính lại được mà không cần trợ up lại, và các cột tỷ lệ do TikTok tự ghi còn dùng để KIỂM
  -- CHỨNG công thức mình tính lại (room chỉ thuộc đúng 1 ca thì 2 số phải khớp nhau).
  raw jsonb not null default '{}'::jsonb,

  -- 13 cột ĐẾM ĐƯỢC tách sẵn ra để trừ/cộng. Tuyệt đối không tách các cột tỷ lệ (AOV, GPM, CTR,
  -- CTOR, *_rate) ra đây: hiệu của 2 tỷ lệ cộng dồn là số vô nghĩa. Tỷ lệ phải tính LẠI từ các
  -- cột đếm được sau khi đã trừ (xem src/lib/liveSnapshot/metrics.ts).
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
  likes int not null default 0
);

create index idx_session_live_snapshot_rows_snapshot on session_live_snapshot_rows(snapshot_id);
-- Tra ngược "các lần up trước của cùng room này" để tính hiệu — đường nóng của toàn bộ cơ chế.
create index idx_session_live_snapshot_rows_room on session_live_snapshot_rows(room_id);

-- Giờ live THỰC TẾ đọc từ file, tách hẳn khỏi start_time/end_time (giờ KẾ HOẠCH copy từ
-- shift_slots lúc chốt ca). Nguyên tắc có từ 0054 giữ nguyên: không bao giờ ghi đè giờ kế hoạch
-- bằng giờ thực tế, lệch giờ chỉ để cảnh báo.
alter table live_sessions
  add column if not exists actual_start_at timestamptz,
  add column if not exists actual_end_at timestamptz,
  add column if not exists live_duration_minutes numeric,
  add column if not exists attributed_items_sold int not null default 0,
  add column if not exists attributed_sku_orders int not null default 0,
  add column if not exists impressions bigint not null default 0,
  add column if not exists product_impressions bigint not null default 0,
  add column if not exists product_clicks bigint not null default 0,
  add column if not exists new_followers int not null default 0,
  add column if not exists comments_count int not null default 0,
  add column if not exists shares_count int not null default 0,
  add column if not exists likes_count int not null default 0,
  add column if not exists live_room_ids text[] not null default '{}'::text[];

-- Bậc tin cậy thứ 3, nằm giữa 2 bậc đã có của mô hình 0050/0057:
--   manual            — host tự khai tay, chưa có gì bảo chứng
--   live_snapshot     — số thật từ TikTok nhưng chốt tại thời điểm giao ca, TikTok còn cập nhật trễ
--   tiktok_reconciled — đã qua đối soát cuối ngày/tháng (giai đoạn 2)
alter table live_sessions drop constraint if exists live_sessions_data_source_check;
alter table live_sessions add constraint live_sessions_data_source_check
  check (data_source in ('manual', 'live_snapshot', 'tiktok_reconciled'));

alter table session_live_snapshots enable row level security;
alter table session_live_snapshot_rows enable row level security;

-- Trợ live (moderator) và talent đều phải up được snapshot cho ca của mình, nên write không bó
-- hẹp ở ceo/admin/operations như Dataraw. Vẫn chặn role 'brand' (brand không nhìn vào tầng thô).
create policy "session_live_snapshots_rw" on session_live_snapshots for all
  using (current_user_role() is distinct from 'brand')
  with check (current_user_role() is distinct from 'brand');

create policy "session_live_snapshot_rows_rw" on session_live_snapshot_rows for all
  using (current_user_role() is distinct from 'brand')
  with check (current_user_role() is distinct from 'brand');

-- ---------------------------------------------------------------------------
-- Tính lại số liệu của 1 ca từ snapshot của chính nó.
--
-- 2 bộ lọc chọn room nào được tính vào ca:
--   (a) hiệu > 0 — room không đổi gì so với lần up trước thì không thuộc ca này. Đây là bộ lọc
--       chính, và cũng là thứ xử lý đúng ca nối dùng chung room mà không cần biết room bắt đầu
--       lúc nào.
--   (b) room kết thúc sau khi ca bắt đầu — chặn trường hợp room của ca inhouse chạy xong TRƯỚC
--       ca agency mà chưa từng có snapshot nào (không có gì để trừ) nên lọt qua bộ lọc (a).
-- ---------------------------------------------------------------------------
-- Giờ kết thúc ca quy về instant thật. Ca vắt qua nửa đêm (vd 22:00→01:00) có end_time <=
-- start_time nên phải cộng sang ngày hôm sau, nếu không mốc ranh giới sẽ lùi về trước cả giờ mở ca.
create or replace function session_boundary_at(p_session_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select ((ls.date + case when ls.end_time <= ls.start_time then interval '1 day' else interval '0 day' end) + ls.end_time)
         at time zone 'Asia/Ho_Chi_Minh'
  from live_sessions ls where ls.id = p_session_id
$$;

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
    and (d.ended_at is null or v_session_start is null or d.ended_at >= v_session_start);

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
    -- CTR ở đây là LIVE CTR quy ước của hệ thống (click sản phẩm / lượt xem), tính lại từ số đã
    -- trừ chứ không lấy cột tỷ lệ cộng dồn trong file.
    ctr_avg = case when v_views > 0 then round((v_prod_clicks::numeric / v_views) * 100, 4) else 0 end,
    data_source = 'live_snapshot',
    reconciled_at = now()
  where id = p_session_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Nạp 1 lần up của trợ live vào đúng ca. Idempotent: up lại cho cùng ca là thay thế snapshot cũ.
-- p_rows: mảng jsonb, mỗi phần tử là 1 room đã chuẩn hoá sẵn ở client
--         (src/lib/liveSnapshot/extractRooms.ts).
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
  v_boundary_at := session_boundary_at(p_session_id);
  if v_boundary_at is null then
    raise exception 'Không tìm thấy ca cần nạp số liệu.';
  end if;

  select id, previous_values into v_existing_id, v_previous
  from session_live_snapshots where session_id = p_session_id;

  if v_existing_id is null then
    -- Lần up đầu tiên cho ca này: chụp lại nguyên trạng để còn khôi phục nếu up nhầm ca.
    select to_jsonb(x) into v_previous from (
      select actual_gmv, total_orders, total_views, ctr_avg, attributed_items_sold,
             attributed_sku_orders, impressions, product_impressions, product_clicks,
             new_followers, comments_count, shares_count, likes_count, live_duration_minutes,
             actual_start_at, actual_end_at, live_room_ids, data_source, reconciled_at
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
    product_impressions, product_clicks, new_followers, comments, shares, likes
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
    coalesce((r->>'likes')::int, 0)
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

-- Xoá snapshot up nhầm ca: khôi phục ca về đúng nguyên trạng trước lần up đầu tiên.
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

grant execute on function session_boundary_at(uuid) to authenticated;
grant execute on function recompute_session_from_snapshot(uuid) to authenticated;
grant execute on function apply_session_live_snapshot(uuid, text, text, jsonb) to authenticated;
grant execute on function delete_session_live_snapshot(uuid) to authenticated;
