-- 0082 — Vá lỗ phân quyền: 7 RPC `security definer` của tầng snapshot/đối soát đang mở cho MỌI
-- user đã đăng nhập.
--
-- Vì sao RLS không cứu được: hàm `security definer` chạy dưới quyền OWNER của bảng, mà owner thì
-- bỏ qua RLS (không bảng nào trong repo này bật `force row level security`). Nên policy
-- "chỉ ceo/admin/operations" trên `live_reconciliation_batches`/`_rows` (0080) chỉ chặn được
-- đường đọc/ghi thẳng qua PostgREST — gọi RPC là đi vòng qua hết.
--
-- Hậu quả trước khi vá: bất kỳ tài khoản talent/brand nào cũng có thể gọi thẳng
-- `import_live_reconciliation` + `apply_live_reconciliation` với số bịa và GHI ĐÈ `actual_gmv`,
-- `total_orders`, `live_duration_minutes`... của bất kỳ ca nào — tức là ghi đè đúng những con số
-- P&L và lương talent đọc vào. UI có ẩn tab đi cũng không chặn được, RPC gọi thẳng bằng JWT thường.
--
-- Cách vá: guard đặt TRONG THÂN HÀM (không phải RLS, không phải grant), vì chỉ ở đó mới biết được
-- ca nào đang bị đụng để xét "người này có phải Host/Trợ live của đúng ca đó không".
--
-- Thân 5 hàm dưới đây được TRÍCH NGUYÊN VĂN từ 0078/0080, chỉ chèn thêm khối guard ngay sau
-- `begin` — đã diff lại từng dòng với bản gốc để chắc chắn không lệch logic.
--
-- BẪY phải nhớ khi viết guard kiểu này: `current_user_role()` trả NULL khi người gọi không có
-- dòng `profiles` (chưa đăng nhập, hoặc profile bị xoá). `NULL not in ('ceo', ...)` ra NULL chứ
-- không ra true, mà `if NULL then raise` thì KHÔNG chạy — guard im lặng cho đi qua đúng cái
-- trường hợp đáng chặn nhất. Bản viết đầu của migration này dính đúng lỗi đó, test bắt được.
-- Vì vậy mọi guard ở đây bọc `coalesce(...::text, '')` trước khi so. Mẫu cũ trong
-- `generate_contract_commitments` (0081) còn dính bẫy này — đã vá ở cuối file.

-- Quyền sửa số liệu snapshot của MỘT ca cụ thể. Bằng đúng điều kiện UI đang dùng ở
-- ShiftScheduling.tsx: admin, hoặc chính Host/Trợ live của ca đó (trợ live là người up file lúc
-- giao ca, nên không thể siết về admin-only).
create or replace function can_edit_session_snapshot(p_session_id uuid) returns boolean as $$
  select coalesce(current_user_role()::text, '') in ('ceo', 'admin', 'operations')
      or exists (
           select 1 from live_sessions ls
           where ls.id = p_session_id
             and current_user_talent_id() is not null
             and current_user_talent_id() in (ls.host_id, ls.co_host_id)
         );
$$ language sql stable security definer set search_path = public;

-- ← nguyên văn từ 0078_session_live_snapshots.sql, chỉ thêm guard ở đầu thân hàm.
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
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới được nạp số liệu cho ca.';
  end if;
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

-- ← nguyên văn từ 0078_session_live_snapshots.sql, chỉ thêm guard ở đầu thân hàm.
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

-- ← nguyên văn từ 0080_live_reconciliation.sql, chỉ thêm guard ở đầu thân hàm.
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
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền nạp file đối soát';
  end if;
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

-- ← nguyên văn từ 0080_live_reconciliation.sql, chỉ thêm guard ở đầu thân hàm.
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
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền đổi nhãn rổ đối soát';
  end if;
  if p_to_bucket not in ('agency', 'review', 'unassigned', 'inhouse') then
    raise exception 'Nhãn không hợp lệ: %', p_to_bucket;
  end if;
  update live_reconciliation_rows set bucket = p_to_bucket
  where batch_id = p_batch_id and bucket = p_from_bucket;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ← nguyên văn từ 0080_live_reconciliation.sql, chỉ thêm guard ở đầu thân hàm.
create or replace function apply_live_reconciliation(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền áp dụng đối soát';
  end if;
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


-- `recompute_session_from_snapshot` không có call site nào phía client (chỉ được gọi từ trong
-- thân 3 hàm trên, lúc đó đang chạy dưới quyền owner nên không cần grant). Mở nó cho
-- `authenticated` là mở thêm một đường ghi thẳng vào live_sessions không vì lý do gì.
--
-- Phải revoke cả `public`, không chỉ `authenticated`: Postgres MẶC ĐỊNH cấp execute cho PUBLIC
-- trên mọi function mới, nên revoke riêng `authenticated` không đổi gì cả (test chạy xong vẫn gọi
-- được — đó là cách phát hiện). Hệ quả rộng hơn, đáng nhớ cho mọi RPC sau này: những dòng
-- `grant execute ... to authenticated` rải khắp repo KHÔNG phải là hàng rào — `anon` cũng gọi được
-- tuốt. Hàng rào thật chỉ có thể là guard trong thân hàm, đúng như các hàm ở trên.
revoke execute on function recompute_session_from_snapshot(uuid) from public, authenticated, anon;

-- `session_boundary_at(uuid)` cố ý GIỮ NGUYÊN quyền: chỉ đọc, trả về 1 mốc thời gian suy ra từ
-- giờ ca đã có trên lịch, không ghi gì.

grant execute on function can_edit_session_snapshot(uuid) to authenticated;

-- Cùng bẫy NULL như trên, vá luôn cho hàm của 0081 (nguyên văn từ 0081, chỉ đổi đúng dòng guard).
create or replace function generate_contract_commitments(
  p_contract_id uuid,
  p_through_month date default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contract brand_contracts;
  v_last date;
  v_month date;
  v_inserted int := 0;
  v_updated int := 0;
  v_skipped_override int := 0;
  v_skipped_other int := 0;
  v_owner uuid;
  v_override boolean;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền sinh cam kết hợp đồng';
  end if;

  select * into v_contract from brand_contracts where id = p_contract_id;
  if not found then
    raise exception 'Không tìm thấy hợp đồng %', p_contract_id;
  end if;

  v_last := coalesce(v_contract.end_month, date_trunc('month', p_through_month)::date);
  if v_last is null then
    raise exception 'Hợp đồng chưa có tháng kết thúc — phải chọn mốc sinh tới tháng nào';
  end if;
  if v_last < v_contract.start_month then
    raise exception 'Mốc sinh (%) nằm trước tháng bắt đầu hợp đồng (%)', v_last, v_contract.start_month;
  end if;

  v_month := v_contract.start_month;
  while v_month <= v_last loop
    select contract_id, is_override into v_owner, v_override
    from brand_monthly_commitments
    where brand_id = v_contract.brand_id and period_month = v_month;

    if not found then
      insert into brand_monthly_commitments (brand_id, contract_id, period_month, committed_hours, committed_gmv)
      values (v_contract.brand_id, v_contract.id, v_month, v_contract.monthly_hours, v_contract.monthly_gmv);
      v_inserted := v_inserted + 1;
    elsif v_override then
      -- Ops đã chốt tay tháng này, hợp đồng không được đè lên.
      v_skipped_override := v_skipped_override + 1;
    elsif v_owner is not null and v_owner <> v_contract.id then
      -- Tháng này đang thuộc hợp đồng khác (2 hợp đồng chồng khung). Không tự giành — để ops tự
      -- xử, vì im lặng chuyển chủ sở hữu là cách êm nhất để mất dấu một cam kết.
      v_skipped_other := v_skipped_other + 1;
    else
      update brand_monthly_commitments
      set contract_id = v_contract.id,
          committed_hours = v_contract.monthly_hours,
          committed_gmv = v_contract.monthly_gmv
      where brand_id = v_contract.brand_id and period_month = v_month;
      v_updated := v_updated + 1;
    end if;

    v_month := (v_month + interval '1 month')::date;
  end loop;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped_override', v_skipped_override,
    'skipped_other_contract', v_skipped_other
  );
end;
$$;

grant execute on function generate_contract_commitments(uuid, date) to authenticated;
