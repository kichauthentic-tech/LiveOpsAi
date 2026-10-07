-- 0153 — Ca NỐI (1 room → nhiều ca) xác nhận tường minh + ca BỊ NGẮT (1 ca → nhiều room) ghi nhận theo mảnh.
-- (User chốt 08/10.) Chạy tay trên Supabase SQL Editor; chạy lại nhiều lần không sao.
--
-- VÌ SAO: tới 0124 việc "room này thuộc ca nào" hoàn toàn NGẦM — số ca sau = số room cộng dồn − snapshot gần nhất trước đó
-- của CÙNG Room ID (bất kể ca nào, brand nào), room thuộc ca nếu giờ giao nhau. Không ai xác nhận "ca A nối sang đúng ca B
-- đã plan", và một ca tắt/bật lại stream chỉ để lại vài Room ID liền nhau, không ghi vì sao.
--
-- 1) CA NỐI — bảng `session_room_links` (ca trước A → ca sau B, mỗi ca tối đa 1 ca sau và 1 ca trước ⇒ chuỗi A→B→C).
--    Trợ/host của A (hoặc OPS) chọn B từ danh sách ca đã plan (`room_link_candidates`), DB kiểm lại (cùng brand, cùng sàn TikTok,
--    ca sau bắt đầu sau ca trước và không quá 2 giờ sau khi A kết thúc, không huỷ/không loại khỏi báo cáo).
--    Khi có liên kết, mốc trừ của B = snapshot của CHÍNH A (không còn "snapshot gần nhất của bất kỳ ca nào"). Ca B nối mà A CHƯA có
--    snapshot ⇒ số của B bị KHOÁ (không ghi đè; view không trả dòng nào) cho tới khi A up file, hoặc OPS bấm
--    `estimate_handover_split` = tạo snapshot ƯỚC LƯỢNG cho A bằng cách chia số cộng dồn của room theo thời gian
--    (is_estimated = true; trợ A up file thật sau đó thì thay thế).
--    Ca KHÔNG có liên kết giữ nguyên cách tính cũ (dữ liệu T6–T9 không đụng).
-- 2) CA BỊ NGẮT ROOM — bảng `session_snapshot_parts`: mảnh 1 = lần up đầu (không có dòng ở bảng này), mỗi mảnh sau (≥ 2) = một lần
--    TẮT/BẬT LẠI room, kèm lý do. Dòng room của mảnh gắn `part_id`. Số của ca vẫn = Σ delta mọi room trong snapshot (view không
--    đổi) nên tổng hợp tự đúng: giờ live = Σ thời lượng từng room (khoảng nghỉ KHÔNG tính), khoảng nghỉ là số hiển thị riêng.
--    Hai cơ chế độc lập, dùng chung được (ca nối vừa bị ngắt room).

-- ---------------------------------------------------------------------------
-- 0) Cột / bảng mới
-- ---------------------------------------------------------------------------
alter table session_live_snapshots add column if not exists is_estimated boolean not null default false;

create table if not exists session_snapshot_parts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references live_sessions(id) on delete cascade,
  part_no int not null check (part_no >= 2),
  -- Vì sao mảnh này BẮT ĐẦU bằng room mới (room trước bị ngắt).
  reason text not null check (reason in ('network', 'manual_restart', 'device_change', 'platform_cut', 'test_room', 'other')),
  note text,
  file_name text,
  period_label text,
  room_ids text[] not null default '{}'::text[],
  uploaded_by uuid references profiles(id) on delete set null,
  captured_at timestamptz not null default now(),
  unique (session_id, part_no)
);

alter table session_live_snapshot_rows
  add column if not exists part_id uuid references session_snapshot_parts(id) on delete cascade;
create index if not exists idx_session_live_snapshot_rows_part on session_live_snapshot_rows(part_id) where part_id is not null;

create table if not exists session_room_links (
  id uuid primary key default gen_random_uuid(),
  prev_session_id uuid not null references live_sessions(id) on delete cascade,
  next_session_id uuid not null references live_sessions(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (prev_session_id <> next_session_id)
);
create unique index if not exists idx_session_room_links_prev on session_room_links(prev_session_id);
create unique index if not exists idx_session_room_links_next on session_room_links(next_session_id);

-- Xoá snapshot (up lại thay thế / xoá up nhầm) = các mảnh cũ hết nghĩa, dọn theo.
create or replace function private.drop_parts_with_snapshot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from session_snapshot_parts where session_id = old.session_id;
  return old;
end;
$$;
revoke all on function private.drop_parts_with_snapshot() from public;
drop trigger if exists trg_drop_parts_with_snapshot on session_live_snapshots;
create trigger trg_drop_parts_with_snapshot
  after delete on session_live_snapshots
  for each row execute function private.drop_parts_with_snapshot();

-- ---------------------------------------------------------------------------
-- 1) RLS: chỉ ĐỌC trực tiếp (ops hoặc Host/Trợ live của ca); ghi đi qua RPC bên dưới.
-- ---------------------------------------------------------------------------
alter table session_snapshot_parts enable row level security;
alter table session_room_links enable row level security;

drop policy if exists session_snapshot_parts_read on session_snapshot_parts;
create policy session_snapshot_parts_read on session_snapshot_parts for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or can_edit_session_snapshot(session_id)
);
drop policy if exists session_room_links_read on session_room_links;
create policy session_room_links_read on session_room_links for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or can_edit_session_snapshot(prev_session_id)
  or can_edit_session_snapshot(next_session_id)
);

revoke all on session_snapshot_parts from anon;
revoke all on session_room_links from anon;
revoke insert, update, delete on session_snapshot_parts from authenticated;
revoke insert, update, delete on session_room_links from authenticated;
grant select on session_snapshot_parts to authenticated;
grant select on session_room_links to authenticated;

-- ---------------------------------------------------------------------------
-- 2) View trừ số: ca có liên kết trừ đúng snapshot của ca trước; ca nối chờ ca trước thì không có dòng nào.
--    Nguyên văn 0124, thêm (a) link prev vào CTE snap, (b) điều kiện ps.session_id = prev, (c) chặn ca chờ.
-- ---------------------------------------------------------------------------
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
  c.watch_seconds - coalesce(p.watch_seconds, 0) as watch_seconds
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
  and (c.ended_at is null or c.ended_at >= sn.session_start)
  and (c.started_at is null or c.started_at <= sn.boundary_at)
  -- Ca nối mà ca trước chưa có mốc: KHÔNG có số (không trừ vào khoảng trống rồi nhận cả phòng).
  and (sn.prev_session_id is null or exists (select 1 from session_live_snapshots x where x.session_id = sn.prev_session_id));

-- Ca đang chờ mốc của ca trước (có liên kết prev mà ca trước chưa có snapshot).
create or replace function private.session_waits_for_prev(p_session_id uuid) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from session_room_links l
    where l.next_session_id = p_session_id
      and not exists (select 1 from session_live_snapshots x where x.session_id = l.prev_session_id)
  )
$$;
revoke all on function private.session_waits_for_prev(uuid) from public;
grant execute on function private.session_waits_for_prev(uuid) to authenticated;

-- Ca A vừa có snapshot ⇒ ca nối sau A hết "chờ mốc": tính lại nó (nếu hai ca có chung Room ID thì vòng lặp của
-- apply_session_live_snapshot tính lại LẦN NỮA sau khi dòng room đã vào, nên số cuối đúng; trường hợp không chung room
-- thì lần này là lần duy nhất và cũng đúng — ca sau không có mốc nào để trừ).
create or replace function private.unblock_next_after_snapshot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  select next_session_id into v_next from session_room_links where prev_session_id = new.session_id;
  if v_next is not null then
    perform private.recompute_chain_from(v_next);
  end if;
  return new;
end;
$$;
revoke all on function private.unblock_next_after_snapshot() from public;

-- ---------------------------------------------------------------------------
-- 3) Tính lại ca từ snapshot — nguyên văn 0124, thêm: ca đang chờ mốc ca trước thì KHÔNG ghi đè số.
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
  if private.session_waits_for_prev(p_session_id) then
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

-- Tính lại ca B và mọi ca nối sau B (chuỗi A→B→C: đổi mốc của A kéo theo cả B lẫn C).
create or replace function private.recompute_chain_from(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cur uuid := p_session_id;
  v_guard int := 0;
begin
  while v_cur is not null and v_guard < 50 loop
    perform recompute_session_from_snapshot(v_cur);
    select next_session_id into v_cur from session_room_links where prev_session_id = v_cur;
    v_guard := v_guard + 1;
  end loop;
end;
$$;
revoke all on function private.recompute_chain_from(uuid) from public;

drop trigger if exists trg_unblock_next_after_snapshot on session_live_snapshots;
create trigger trg_unblock_next_after_snapshot
  after insert on session_live_snapshots
  for each row execute function private.unblock_next_after_snapshot();

-- ---------------------------------------------------------------------------
-- 4) Ứng viên ca sau + kiểm tra liên kết (một nguồn luật cho cả danh sách lẫn RPC ghi).
--    Trả null nếu hợp lệ, ngược lại là câu báo lỗi tiếng Việt.
-- ---------------------------------------------------------------------------
create or replace function private.room_link_error(p_prev uuid, p_next uuid) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  a live_sessions;
  b live_sessions;
  v_a_start timestamptz;
  v_a_end timestamptz;
  v_b_start timestamptz;
begin
  select * into a from live_sessions where id = p_prev;
  select * into b from live_sessions where id = p_next;
  if a.id is null or b.id is null then return 'Không tìm thấy ca.'; end if;
  if a.id = b.id then return 'Một ca không thể nối với chính nó.'; end if;
  if a.platform::text <> 'TikTok' or b.platform::text <> 'TikTok' then
    return 'Chỉ ca TikTok mới nối room (Shopee giao ca bằng link dashboard).';
  end if;
  if a.brand_id is distinct from b.brand_id then return 'Hai ca khác brand — không thể cùng một room.'; end if;
  if a.status::text = 'Cancelled' or b.status::text = 'Cancelled' then return 'Ca đã huỷ không nối được.'; end if;
  if a.excluded_from_reports or b.excluded_from_reports then return 'Ca đã bị loại khỏi báo cáo không nối được.'; end if;
  v_a_start := (a.date + a.start_time) at time zone 'Asia/Ho_Chi_Minh';
  v_a_end := session_boundary_at(a.id);
  v_b_start := (b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh';
  if v_b_start <= v_a_start then return 'Ca sau phải bắt đầu sau ca trước.'; end if;
  if v_b_start > v_a_end + interval '2 hours' then return 'Ca sau bắt đầu cách hết ca trước hơn 2 giờ — không phải ca nối.'; end if;
  return null;
end;
$$;
revoke all on function private.room_link_error(uuid, uuid) from public;

create or replace function room_link_candidates(p_session_id uuid)
returns table (
  session_id uuid, date date, start_time time, end_time time,
  host_name text, co_host_name text, studio_name text, status text,
  taken_by uuid, is_linked boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  me live_sessions; -- cột kết quả (date, status…) trùng tên cột bảng nên mọi tham chiếu phải qua alias/record
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới xem được ca có thể nối.';
  end if;
  select * into me from live_sessions ls where ls.id = p_session_id;
  return query
  select b.id, b.date, b.start_time, b.end_time, b.host_name, b.co_host_name, b.studio_name, b.status::text,
         l.prev_session_id,
         exists (select 1 from session_room_links x where x.prev_session_id = p_session_id and x.next_session_id = b.id)
  from live_sessions b
  left join session_room_links l on l.next_session_id = b.id
  where b.brand_id = me.brand_id
    and b.id <> p_session_id
    and b.date between me.date and me.date + 1
    and private.room_link_error(p_session_id, b.id) is null
  order by b.date, b.start_time;
end;
$$;
revoke all on function room_link_candidates(uuid) from public;
grant execute on function room_link_candidates(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Tạo / gỡ liên kết ca nối
-- ---------------------------------------------------------------------------
create or replace function link_session_room(p_prev uuid, p_next uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_err text;
  v_old_next uuid;
  v_taken uuid;
begin
  if not can_edit_session_snapshot(p_prev) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới đánh dấu ca nối.';
  end if;
  v_err := private.room_link_error(p_prev, p_next);
  if v_err is not null then raise exception '%', v_err; end if;

  select prev_session_id into v_taken from session_room_links where next_session_id = p_next and prev_session_id <> p_prev;
  if v_taken is not null then
    raise exception 'Ca sau này đã được nối từ một ca khác. Gỡ liên kết đó trước.';
  end if;

  select next_session_id into v_old_next from session_room_links where prev_session_id = p_prev;
  if v_old_next = p_next then
    return jsonb_build_object('prev', p_prev, 'next', p_next, 'changed', false);
  end if;
  if v_old_next is not null then
    delete from session_room_links where prev_session_id = p_prev;
    perform private.recompute_chain_from(v_old_next);
  end if;

  insert into session_room_links (prev_session_id, next_session_id, created_by) values (p_prev, p_next, auth.uid());
  -- Mốc trừ của ca sau đổi (và cả chuỗi sau nó): tính lại ngay trong cùng transaction.
  perform private.recompute_chain_from(p_next);
  return jsonb_build_object('prev', p_prev, 'next', p_next, 'changed', true);
end;
$$;
revoke all on function link_session_room(uuid, uuid) from public;
grant execute on function link_session_room(uuid, uuid) to authenticated;

create or replace function unlink_session_room(p_prev uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  if not can_edit_session_snapshot(p_prev) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới gỡ ca nối.';
  end if;
  select next_session_id into v_next from session_room_links where prev_session_id = p_prev;
  if v_next is null then return; end if;
  delete from session_room_links where prev_session_id = p_prev;
  perform private.recompute_chain_from(v_next);
end;
$$;
revoke all on function unlink_session_room(uuid) from public;
grant execute on function unlink_session_room(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Lối thoát cuối cùng (chỉ OPS): ca A đã đánh dấu nối nhưng KHÔNG up file lúc giao ca ⇒ chia số cộng dồn của room cho A
--    theo thời gian (tuyến tính từ lúc room bắt đầu tới giờ hết ca A). Snapshot của A gắn is_estimated.
-- ---------------------------------------------------------------------------
create or replace function estimate_handover_split(p_prev uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
  v_next_snap uuid;
  v_snap uuid;
  v_boundary timestamptz;
  v_previous jsonb;
  v_rows int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations mới chia ước lượng theo thời gian.';
  end if;
  select next_session_id into v_next from session_room_links where prev_session_id = p_prev;
  if v_next is null then raise exception 'Ca này chưa được đánh dấu nối với ca nào.'; end if;
  if exists (select 1 from session_live_snapshots where session_id = p_prev) then
    raise exception 'Ca trước đã có file số liệu — không cần ước lượng.';
  end if;
  select id into v_next_snap from session_live_snapshots where session_id = v_next;
  if v_next_snap is null then raise exception 'Ca sau chưa up file — chưa có số để chia.'; end if;
  v_boundary := session_boundary_at(p_prev);

  select to_jsonb(x) into v_previous from (
    select actual_gmv, total_orders, total_views, ctr_avg, avg_watch_time_seconds,
           attributed_items_sold, attributed_sku_orders, impressions, product_impressions,
           product_clicks, new_followers, comments_count, shares_count, likes_count,
           live_duration_minutes, actual_start_at, actual_end_at, live_room_ids,
           data_source, reconciled_at
    from live_sessions where id = p_prev
  ) x;

  insert into session_live_snapshots (session_id, file_name, period_label, boundary_at, row_count, previous_values, uploaded_by, is_estimated)
  values (p_prev, '(ước lượng chia theo thời gian)', null, v_boundary, 0, v_previous, auth.uid(), true)
  returning id into v_snap;

  -- f = phần room đã chạy tới giờ hết ca A (0..1). Mọi cột ĐẾM được nhân f; tỷ lệ tính lại sau từ số đã chia.
  insert into session_live_snapshot_rows (
    snapshot_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
  )
  select v_snap, r.room_id, r.room_title, r.started_at, least(coalesce(r.ended_at, v_boundary), v_boundary),
         jsonb_build_object('estimated', true, 'fraction', round(f.f::numeric, 4)),
         round(r.duration_minutes * f.f, 2), round(r.gmv * f.f), round(r.items_sold * f.f), round(r.orders * f.f),
         round(r.sku_orders * f.f), round(r.views * f.f), round(r.impressions * f.f),
         round(r.product_impressions * f.f), round(r.product_clicks * f.f), round(r.new_followers * f.f),
         round(r.comments * f.f), round(r.shares * f.f), round(r.likes * f.f), round(r.watch_seconds * f.f)
  from session_live_snapshot_rows r
  cross join lateral (
    select least(greatest(
      extract(epoch from (v_boundary - r.started_at)) /
      nullif(extract(epoch from (coalesce(r.ended_at, now()) - r.started_at)), 0), 0), 1) as f
  ) f
  where r.snapshot_id = v_next_snap and r.started_at is not null and r.started_at < v_boundary and f.f > 0;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    delete from session_live_snapshots where id = v_snap;
    raise exception 'Không có phòng nào của ca sau bắt đầu trước giờ hết ca này — không có gì để chia.';
  end if;

  update session_live_snapshots set row_count = v_rows where id = v_snap;
  perform private.recompute_chain_from(p_prev);
  return jsonb_build_object('prev', p_prev, 'next', v_next, 'rooms', v_rows);
end;
$$;
revoke all on function estimate_handover_split(uuid) from public;
grant execute on function estimate_handover_split(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Xoá file số liệu của ca — nguyên văn 0124, thêm: ca A đang là mốc của ca B (đã up file) thì KHÔNG xoá được.
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
  if exists (
    select 1 from session_room_links l
    join session_live_snapshots n on n.session_id = l.next_session_id
    where l.prev_session_id = p_session_id
  ) then
    raise exception 'Ca nối phía sau đã up file và đang dùng file này làm mốc trừ. Gỡ liên kết nối ca (hoặc xoá file của ca sau) trước.';
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
grant execute on function delete_session_live_snapshot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) Ca BỊ NGẮT ROOM: thêm mảnh sau (≥ 2) vào snapshot của ca. p_rows rỗng = chỉ ghi nhận lý do (lần tắt/bật lại đã nằm sẵn trong
--    file đã up). Phòng trùng Room ID với mảnh trước được THAY bằng bản mới (số cộng dồn của file mới hơn).
-- ---------------------------------------------------------------------------
create or replace function apply_session_snapshot_part(
  p_session_id uuid,
  p_reason text,
  p_note text,
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
  v_snapshot_id uuid;
  v_estimated boolean;
  v_boundary_at timestamptz;
  v_part_id uuid;
  v_part_no int;
  v_rooms text[];
  v_affected uuid;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được thêm mảnh số liệu cho ca.';
  end if;
  if p_reason not in ('network', 'manual_restart', 'device_change', 'platform_cut', 'test_room', 'other') then
    raise exception 'Lý do ngắt room không hợp lệ.';
  end if;
  select id, is_estimated, boundary_at into v_snapshot_id, v_estimated, v_boundary_at
  from session_live_snapshots where session_id = p_session_id;
  if v_snapshot_id is null then
    raise exception 'Up file của ca (mảnh đầu) trước, rồi mới thêm mảnh sau.';
  end if;
  if v_estimated then
    raise exception 'Số của ca này đang là ước lượng theo thời gian — up file thật trước khi thêm mảnh.';
  end if;

  select coalesce(array_agg(distinct r->>'roomId'), '{}'::text[]) into v_rooms
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r where coalesce(r->>'roomId', '') <> '';

  select coalesce(max(part_no), 1) + 1 into v_part_no from session_snapshot_parts where session_id = p_session_id;
  insert into session_snapshot_parts (session_id, part_no, reason, note, file_name, period_label, room_ids, uploaded_by)
  values (p_session_id, v_part_no, p_reason, nullif(btrim(coalesce(p_note, '')), ''), p_file_name, p_period_label, v_rooms, auth.uid())
  returning id into v_part_id;

  if array_length(v_rooms, 1) is not null then
    delete from session_live_snapshot_rows where snapshot_id = v_snapshot_id and room_id = any(v_rooms);
    insert into session_live_snapshot_rows (
      snapshot_id, part_id, room_id, room_title, started_at, ended_at, raw,
      duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
      product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
    )
    select
      v_snapshot_id, v_part_id,
      r->>'roomId', r->>'roomTitle',
      nullif(r->>'startedAt', '')::timestamptz, nullif(r->>'endedAt', '')::timestamptz,
      coalesce(r->'raw', '{}'::jsonb),
      coalesce((r->>'durationMinutes')::numeric, 0), coalesce((r->>'gmv')::numeric, 0),
      coalesce((r->>'itemsSold')::int, 0), coalesce((r->>'orders')::int, 0), coalesce((r->>'skuOrders')::int, 0),
      coalesce((r->>'views')::bigint, 0), coalesce((r->>'impressions')::bigint, 0),
      coalesce((r->>'productImpressions')::bigint, 0), coalesce((r->>'productClicks')::bigint, 0),
      coalesce((r->>'newFollowers')::int, 0), coalesce((r->>'comments')::int, 0),
      coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0), coalesce((r->>'watchSeconds')::numeric, 0)
    from jsonb_array_elements(p_rows) r
    where coalesce(r->>'roomId', '') <> '';
    update session_live_snapshots set row_count = (select count(*) from session_live_snapshot_rows where snapshot_id = v_snapshot_id) where id = v_snapshot_id;
  end if;

  perform private.recompute_chain_from(p_session_id);

  -- Ca khác (không nối tường minh) dùng chung room với mảnh mới: tính lại như apply_session_live_snapshot.
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
revoke all on function apply_session_snapshot_part(uuid, text, text, text, text, jsonb) from public;
grant execute on function apply_session_snapshot_part(uuid, text, text, text, text, jsonb) to authenticated;

-- Xoá một mảnh (≥ 2): bỏ dòng room của mảnh đó + ghi nhận ngắt room, tính lại số ca.
create or replace function delete_session_snapshot_part(p_part_id uuid)
returns setof live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
begin
  select session_id into v_session from session_snapshot_parts where id = p_part_id;
  if v_session is null then raise exception 'Không tìm thấy mảnh.'; end if;
  if not can_edit_session_snapshot(v_session) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được xoá mảnh số liệu.';
  end if;
  delete from session_snapshot_parts where id = p_part_id; -- cascade xoá dòng room gắn part_id
  update session_live_snapshots s set row_count = (select count(*) from session_live_snapshot_rows r where r.snapshot_id = s.id) where s.session_id = v_session;
  perform private.recompute_chain_from(v_session);
  return query select * from live_sessions where id = v_session;
end;
$$;
revoke all on function delete_session_snapshot_part(uuid) from public;
grant execute on function delete_session_snapshot_part(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9) Trạng thái nối của MỘT ca (cho Cửa sổ Ca Live): ca trước/ca sau là ai, đã up file chưa, có phải ước lượng không.
--    Đọc qua hàm vì trợ của ca B không đọc được snapshot của ca A (policy bảng chỉ cho người của đúng ca).
-- ---------------------------------------------------------------------------
create or replace function room_link_state(p_session_id uuid)
returns table (
  prev_session_id uuid, prev_date date, prev_start_time time, prev_end_time time, prev_host_name text,
  prev_has_snapshot boolean, prev_is_estimated boolean, prev_boundary_at timestamptz, prev_room_ids text[],
  next_session_id uuid, next_date date, next_start_time time, next_end_time time, next_host_name text,
  next_has_snapshot boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới xem được trạng thái ca nối.';
  end if;
  return query
  select
    p.id, p.date, p.start_time, p.end_time, p.host_name,
    exists (select 1 from session_live_snapshots x where x.session_id = p.id),
    coalesce((select x.is_estimated from session_live_snapshots x where x.session_id = p.id), false),
    case when p.id is not null then session_boundary_at(p.id) end,
    coalesce((select array_agg(distinct r.room_id) from session_live_snapshot_rows r
              join session_live_snapshots x on x.id = r.snapshot_id where x.session_id = p.id), '{}'::text[]),
    n.id, n.date, n.start_time, n.end_time, n.host_name,
    exists (select 1 from session_live_snapshots y where y.session_id = n.id)
  from (select 1) one
  left join session_room_links lp on lp.next_session_id = p_session_id
  left join live_sessions p on p.id = lp.prev_session_id
  left join session_room_links ln on ln.prev_session_id = p_session_id
  left join live_sessions n on n.id = ln.next_session_id;
end;
$$;
revoke all on function room_link_state(uuid) from public;
grant execute on function room_link_state(uuid) to authenticated;

do $$
begin
  if to_regprocedure('public.link_session_room(uuid,uuid)') is null
     or to_regprocedure('public.apply_session_snapshot_part(uuid,text,text,text,text,jsonb)') is null
     or to_regprocedure('public.estimate_handover_split(uuid)') is null then
    raise exception '0153: thiếu hàm';
  end if;
end $$;
