-- 0133 — Vá vòng đời vận hành (audit workflow 2026-10-04: hợp đồng → kế hoạch → ca → vận hành → report).
--
-- Mỗi mục dưới đây vá một chỗ mà luồng chuẩn chạy được nhưng một ngã rẽ làm gãy số liệu KHÔNG báo lỗi:
--   1) update_session_with_children ghi đè cả cột SỐ LIỆU bằng bản client đang giữ ⇒ ops mở app từ
--      sáng, trợ live up file 14h, ops đổi trợ live 15h là GMV về 0 (data_source vẫn "live_snapshot").
--      Nay chỉ ghi cột LỊCH + NGƯỜI; trạng thái do DB tự suy; ca đã có số thì không dời ngày/giờ.
--   2) finalize_shift_slot: chốt người = 1 transaction, khoá dòng slot. Trước đây client ghi 2 bước
--      (tạo ca rồi cập nhật slot) không kiểm slot còn mở ⇒ 2 người bấm cùng lúc sinh 2 ca.
--   3) Đối soát khớp room với ca CHỈ theo giờ, không theo brand ⇒ file CROCS chia GMV sang ca JOCKEY
--      cùng giờ. Nay lô đối soát gắn brand; dòng thiếu giờ không khớp ca nào (trước: khớp MỌI ca).
--   4) Ca kế hoạch của kế hoạch ĐÃ CHỐT: không bỏ/dời ca đã chốt người (trước: "Chốt lại" giữ ca cũ +
--      mở thêm ca mới ⇒ ca trùng), không sửa/xoá ca ngày đã qua (target ban đầu là mẫu số run-rate).
--   5) generate_contract_commitments: không sinh từ hợp đồng nháp; tháng nằm ngoài khung hợp đồng (sau
--      khi rút ngắn) bị dọn nếu chưa sửa tay.
--   6) Chỉ phát hành Report Tháng khi tháng đã hết.
--   7) Tháng đã phát hành = ĐÓNG SỔ: số và lịch của ca không đổi được nữa cho tới khi thu hồi report.
--   8) Talent chỉ đăng ký/huỷ đăng ký ca còn mở (trước: đăng ký được cả ca đã huỷ/đã chốt/đã qua).
--
-- Thứ tự với deploy: CHẠY MIGRATION TRƯỚC, deploy client sau. Client cũ vẫn chạy được trừ 2 chỗ báo lỗi rõ
-- ràng cho tới khi deploy: up file đối soát ("Chọn brand của file") và nút chốt người vẫn đi đường cũ.

-- ============================================================================
-- 1) Sửa ca: chỉ cột lịch + người
-- ============================================================================
create or replace function update_session_with_children(
  p_session_id uuid,
  p_session jsonb,
  p_skus jsonb default null,
  p_checklist jsonb default null,
  p_metrics jsonb default null
) returns live_sessions as $$
declare
  v_old live_sessions;
  v_row live_sessions;
  v_date date := (p_session->>'date')::date;
  v_start time := (p_session->>'start_time')::time;
  v_end time := (p_session->>'end_time')::time;
  v_moved boolean;
  v_has_data boolean;
  v_status session_status;
begin
  -- Hàm chạy dưới quyền người gọi (không definer): RLS lọc như cũ, đọc không thấy = không được sửa.
  select * into v_old from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;
  if v_old.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không sửa được.';
  end if;
  v_date := coalesce(v_date, v_old.date);
  v_start := coalesce(v_start, v_old.start_time);
  v_end := coalesce(v_end, v_old.end_time);

  v_moved := v_date <> v_old.date or v_start <> v_old.start_time or v_end <> v_old.end_time;
  v_has_data := coalesce(v_old.data_source, 'manual') <> 'manual'
             or coalesce(v_old.actual_gmv, 0) > 0
             or coalesce(v_old.total_views, 0) > 0
             or exists (select 1 from session_live_snapshots s where s.session_id = p_session_id);
  if v_moved and v_has_data then
    raise exception 'Ca % %–% đã có số liệu — không dời ngày/giờ được (ranh giới snapshot và đối soát tính theo giờ ca). Xoá snapshot của ca trước nếu thật sự cần dời.',
      to_char(v_old.date, 'DD/MM'), to_char(v_old.start_time, 'HH24:MI'), to_char(v_old.end_time, 'HH24:MI');
  end if;

  -- Trạng thái KHÔNG lấy từ client (client gửi trạng thái suy theo giờ, kéo ca quá khứ sang tương lai từng
  -- mang theo "Completed"). Ca đã có số giữ nguyên; ca chưa có số suy lại theo giờ kết thúc mới.
  v_status := case
    when v_has_data then v_old.status
    when session_end_at(v_date, v_start, v_end) <= now() then 'Completed'::session_status
    else 'Upcoming'::session_status
  end;

  update live_sessions set
    date = v_date,
    start_time = v_start,
    end_time = v_end,
    studio_id = (p_session->>'studio_id')::uuid,
    studio_name = coalesce(p_session->>'studio_name', ''),
    host_id = (p_session->>'host_id')::uuid,
    host_name = coalesce(p_session->>'host_name', ''),
    assistant_id = (p_session->>'assistant_id')::uuid,
    assistant_name = coalesce(p_session->>'assistant_name', ''),
    co_host_id = (p_session->>'co_host_id')::uuid,
    co_host_name = coalesce(p_session->>'co_host_name', ''),
    status = v_status
  where id = p_session_id
  returning * into v_row;

  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;
  return v_row;
end;
$$ language plpgsql;

-- ============================================================================
-- 2) Chốt người cho ca chờ đăng ký — một transaction
-- ============================================================================
create or replace function finalize_shift_slot(
  p_slot_id uuid,
  p_host_id uuid,
  p_co_host_id uuid default null
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot shift_slots;
  v_brand text;
  v_studio text;
  v_host text;
  v_co text := '';
  v_row live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được chốt người cho ca' using errcode = '42501';
  end if;
  if p_host_id is null then
    raise exception 'Chọn Host trước khi chốt.';
  end if;
  if p_co_host_id is not null and p_co_host_id = p_host_id then
    raise exception 'Host và Trợ live phải là hai người khác nhau.';
  end if;

  select * into v_slot from shift_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Không thấy ca chờ đăng ký %', p_slot_id;
  end if;
  if v_slot.status <> 'open' or v_slot.session_id is not null then
    raise exception 'Ca % %–% không còn mở (đã được chốt hoặc huỷ) — tải lại trang để thấy trạng thái mới.',
      to_char(v_slot.date, 'DD/MM'), to_char(v_slot.start_time, 'HH24:MI'), to_char(v_slot.end_time, 'HH24:MI');
  end if;

  select name into v_host from talents where id = p_host_id;
  if v_host is null then
    raise exception 'Không thấy host %', p_host_id;
  end if;
  if p_co_host_id is not null then
    select name into v_co from talents where id = p_co_host_id;
    if v_co is null then
      raise exception 'Không thấy trợ live %', p_co_host_id;
    end if;
  end if;
  select coalesce(name, v_slot.brand_name) into v_brand from brands where id = v_slot.brand_id;
  v_brand := coalesce(v_brand, v_slot.brand_name, '');
  select name into v_studio from studios where id = v_slot.studio_id;

  -- Cùng hình dạng ca mà client tạo trước 0133 (App.tsx handleFinalizeShiftSlot): target 0 — target đổ từ
  -- Kế Hoạch Tháng lúc đọc, không gán theo host.
  insert into live_sessions (
    title, brand_id, brand_name, shop_tiktok_handle, studio_id, studio_name,
    host_id, host_name, co_host_id, co_host_name, assistant_name,
    platform, date, start_time, end_time, status, target_gmv
  ) values (
    v_brand || ' - ' || v_slot.date::text || ' ' || to_char(v_slot.start_time, 'HH24:MI'),
    v_slot.brand_id, v_brand,
    '@' || coalesce(nullif(lower(regexp_replace(v_brand, '\s+', '', 'g')), ''), 'shop') || '_official',
    v_slot.studio_id, coalesce(v_studio, v_slot.studio_name, ''),
    p_host_id, v_host, p_co_host_id, coalesce(v_co, ''), '',
    v_slot.platform, v_slot.date, v_slot.start_time, v_slot.end_time, 'Upcoming', 0
  ) returning * into v_row;

  update shift_slots set status = 'finalized', session_id = v_row.id where id = p_slot_id;
  return v_row;
end;
$$;
revoke all on function finalize_shift_slot(uuid, uuid, uuid) from public;
grant execute on function finalize_shift_slot(uuid, uuid, uuid) to authenticated;

-- ============================================================================
-- 3) Đối soát gắn brand
-- ============================================================================
alter table live_reconciliation_batches
  add column if not exists brand_id uuid references brands(id) on delete set null;

drop function if exists import_live_reconciliation(text, text, date, date, jsonb);
create or replace function import_live_reconciliation(
  p_file_name text,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb,
  -- default null CHỈ để client cũ (5 tham số) nhận câu lỗi rõ ràng thay vì "function not found".
  p_brand_id uuid default null
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
  if p_brand_id is null then
    raise exception 'Chọn brand của file trước khi up — file Creator-Live-Performance là của MỘT tài khoản, khớp theo giờ với ca của brand khác sẽ chia nhầm GMV.';
  end if;
  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by, brand_id)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid(), p_brand_id)
  returning id into v_batch_id;

  insert into live_reconciliation_rows (
    batch_id, room_id, room_title, started_at, ended_at, raw,
    duration_minutes, gmv, items_sold, orders, sku_orders, views, impressions,
    product_impressions, product_clicks, new_followers, comments, shares, likes, watch_seconds
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
    coalesce((r->>'comments')::int, 0), coalesce((r->>'shares')::int, 0), coalesce((r->>'likes')::int, 0),
    coalesce((r->>'watchSeconds')::numeric, 0)
  from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
  where coalesce(r->>'roomId', '') <> '';

  -- Khớp theo GIAO NHAU khung thời gian với ca CỦA ĐÚNG BRAND. Dòng thiếu giờ bắt đầu/kết thúc không khớp
  -- ca nào (để ở rổ "chưa gán" cho ops xem) — bản 0124 coi NULL là khớp mọi thời điểm, tức khớp MỌI ca.
  with m as (
    select rr.id as row_id,
           array_agg(ls.id order by ls.date, ls.start_time) as sess,
           count(*) as n_sess,
           count(*) filter (where exists (select 1 from session_live_snapshots s where s.session_id = ls.id)) as n_snap
    from live_reconciliation_rows rr
    join live_sessions ls
      on ls.status <> 'Cancelled'
     and ls.brand_id = p_brand_id
     and rr.started_at is not null and rr.ended_at is not null
     and rr.started_at <= session_boundary_at(ls.id)
     and rr.ended_at >= (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
    where rr.batch_id = v_batch_id
    group by rr.id
  )
  update live_reconciliation_rows rr set
    matched_session_ids = m.sess,
    bucket = case when m.n_sess > 1 and m.n_snap < m.n_sess then 'review' else 'agency' end
  from m where rr.id = m.row_id;

  return v_batch_id;
end;
$$;
revoke all on function import_live_reconciliation(text, text, date, date, jsonb, uuid) from public;
grant execute on function import_live_reconciliation(text, text, date, date, jsonb, uuid) to authenticated;

create or replace function apply_live_reconciliation(p_batch_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sessions int;
  v_brand uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Không có quyền áp dụng đối soát';
  end if;
  select brand_id into v_brand from live_reconciliation_batches where id = p_batch_id;
  if not found then
    raise exception 'Không thấy lô đối soát %', p_batch_id;
  end if;
  if v_brand is null then
    raise exception 'Lô này nạp trước khi đối soát gắn brand (0133) — xoá lô và up lại file, chọn đúng brand.';
  end if;
  create temporary table tmp_share on commit drop as
  with pair as (
    select rr.id as row_id, rr.room_id, rr.started_at, rr.ended_at,
           rr.gmv as f_gmv, rr.items_sold as f_items, rr.orders as f_orders,
           rr.sku_orders as f_sku, rr.views as f_views, rr.impressions as f_impr,
           rr.product_impressions as f_pimpr, rr.product_clicks as f_clicks,
           rr.new_followers as f_follow, rr.comments as f_cmt, rr.shares as f_share,
           rr.likes as f_like, rr.duration_minutes as f_dur, rr.watch_seconds as f_watch,
           rr.bucket = 'agency' as use_contrib,
           ls.id as session_id,
           greatest(extract(epoch from (
             least(rr.ended_at, session_boundary_at(ls.id))
             - greatest(rr.started_at, (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh')
           )), 1) as overlap_sec
    from live_reconciliation_rows rr
    join unnest(rr.matched_session_ids) as sid on true
    -- Chốt thêm theo brand của lô: matched_session_ids do import đã lọc, nhưng đây là đường GHI số.
    join live_sessions ls on ls.id = sid and ls.brand_id = v_brand
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
           coalesce(d.duration_minutes, 0) as c_dur, coalesce(d.watch_seconds, 0) as c_watch
    from pair p
    left join session_room_deltas d on d.session_id = p.session_id and d.room_id = p.room_id
  ),
  tot as (
    select row_id,
           sum(c_gmv) as t_gmv, sum(c_items) as t_items, sum(c_orders) as t_orders,
           sum(c_sku) as t_sku, sum(c_views) as t_views, sum(c_impr) as t_impr,
           sum(c_pimpr) as t_pimpr, sum(c_clicks) as t_clicks, sum(c_follow) as t_follow,
           sum(c_cmt) as t_cmt, sum(c_share) as t_share, sum(c_like) as t_like,
           sum(c_dur) as t_dur, sum(c_watch) as t_watch, sum(overlap_sec) as t_ov
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
    case when w.use_contrib and t.t_dur > 0 then w.f_dur * w.c_dur / t.t_dur else w.f_dur * w.overlap_sec / t.t_ov end as duration_minutes,
    case when w.use_contrib and t.t_watch > 0 then w.f_watch * w.c_watch / t.t_watch else w.f_watch * w.overlap_sec / t.t_ov end as watch_seconds
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
    avg_watch_time_seconds = case
      when a.watch_seconds > 0 and a.views > 0 then round(a.watch_seconds / a.views)
      else ls.avg_watch_time_seconds
    end,
    data_source = 'tiktok_reconciled',
    reconciled_at = now()
  from (
    select session_id,
      sum(gmv) as gmv, round(sum(items_sold))::int as items_sold, round(sum(orders))::int as orders,
      round(sum(sku_orders))::int as sku_orders, round(sum(views))::bigint as views,
      round(sum(impressions))::bigint as impressions, round(sum(product_impressions))::bigint as product_impressions,
      round(sum(product_clicks))::bigint as product_clicks, round(sum(new_followers))::int as new_followers,
      round(sum(comments))::int as comments, round(sum(shares))::int as shares, round(sum(likes))::int as likes,
      sum(duration_minutes) as duration_minutes, sum(watch_seconds) as watch_seconds,
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

-- ============================================================================
-- 4) Ca kế hoạch của kế hoạch ĐÃ CHỐT
-- ============================================================================
-- Trigger chứ không phải kiểm ở lock_month_plan: client lưu lưới (xoá dòng cũ) TRƯỚC rồi mới gọi chốt, nên
-- chặn lúc chốt thì target đã mất rồi. Xoá CẢ kế hoạch (delete_month_plan, 0115 tự chặn khi có ca chốt
-- người) cascade xuống đây — dòng kế hoạch cha đã biến mất ⇒ cho qua.
create or replace function guard_locked_plan_slot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  v_status text;
  v_moved boolean;
begin
  if tg_op = 'INSERT' then
    select status into v_status from brand_month_plans where id = new.plan_id;
    if v_status = 'locked' and new.date < v_today then
      raise exception 'Kế hoạch đã chốt: không thêm ca vào ngày đã qua (%) — target các ngày đã qua giữ như lúc chốt.', to_char(new.date, 'DD/MM');
    end if;
    return new;
  end if;

  select status into v_status from brand_month_plans where id = old.plan_id;
  if not found or v_status is distinct from 'locked' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  v_moved := tg_op = 'DELETE' or new.date <> old.date or new.start_time <> old.start_time or new.end_time <> old.end_time;

  if v_moved and old.slot_id is not null and exists (
    select 1 from shift_slots s join live_sessions ls on ls.id = s.session_id
     where s.id = old.slot_id and s.status = 'finalized' and ls.status <> 'Cancelled'
  ) then
    raise exception 'Ca kế hoạch % %–% đã chốt người — không bỏ/dời trong lưới được (chốt lại sẽ giữ ca cũ và mở thêm ca mới). Huỷ ca ở Cửa sổ Ca Live trước.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if old.date < v_today and (v_moved or new.target_gmv <> old.target_gmv) then
    raise exception 'Kế hoạch đã chốt: ca ngày đã qua (% %–%) giữ nguyên giờ và target như lúc chốt — đó là mẫu số run-rate.',
      to_char(old.date, 'DD/MM'), to_char(old.start_time, 'HH24:MI'), to_char(old.end_time, 'HH24:MI');
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function guard_locked_plan_slot() from public;

drop trigger if exists trg_guard_locked_plan_slot on brand_month_plan_slots;
create trigger trg_guard_locked_plan_slot
  before insert or update or delete on brand_month_plan_slots
  for each row execute function guard_locked_plan_slot();

-- ============================================================================
-- 5) Hợp đồng → cam kết tháng
-- ============================================================================
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
  v_removed int := 0;
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
  if v_contract.status = 'draft' then
    raise exception 'Hợp đồng đang là nháp — chuyển sang "Đang hiệu lực" rồi mới sinh cam kết (cam kết là mẫu số của run-rate, không lấy từ bản nháp).';
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
      v_skipped_override := v_skipped_override + 1;
    elsif v_owner is not null and v_owner <> v_contract.id then
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

  -- Hợp đồng bị dời tháng bắt đầu / rút tháng kết thúc: tháng cũ sinh từ CHÍNH hợp đồng này mà nay nằm
  -- ngoài khung thì dọn — trừ tháng ops đã sửa tay. Hợp đồng không có tháng kết thúc thì chỉ dọn phía
  -- trước (mốc p_through_month là mốc SINH, không phải ngày hết hạn).
  delete from brand_monthly_commitments
   where contract_id = v_contract.id
     and not is_override
     and (period_month < v_contract.start_month
          or (v_contract.end_month is not null and period_month > v_contract.end_month));
  get diagnostics v_removed = row_count;

  return jsonb_build_object(
    'inserted', v_inserted,
    'updated', v_updated,
    'skipped_override', v_skipped_override,
    'skipped_other_contract', v_skipped_other,
    'removed', v_removed
  );
end;
$$;
revoke all on function generate_contract_commitments(uuid, date) from public;
grant execute on function generate_contract_commitments(uuid, date) to authenticated;

-- ============================================================================
-- 6) Phát hành chỉ khi tháng đã hết
-- ============================================================================
create or replace function publish_brand_monthly_report(p_report_id uuid, p_force boolean default false)
returns brand_monthly_reports as $$
declare
  v_report brand_monthly_reports;
  v_period_start date;
  v_period_end date;
  v_unreconciled_count int;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to publish monthly report';
  end if;

  select * into v_report from brand_monthly_reports where id = p_report_id;
  if not found then
    raise exception 'brand_monthly_reports row % not found', p_report_id;
  end if;

  v_period_start := date_trunc('month', v_report.period_month)::date;
  v_period_end := (v_period_start + interval '1 month' - interval '1 day')::date;

  -- Phát hành = đóng sổ tháng (mục 7). Đóng sổ tháng đang chạy là khoá luôn vận hành của chính tháng đó.
  if v_period_end >= (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Tháng %/% chưa kết thúc — Report Tháng chỉ phát hành sau khi hết tháng (phát hành là đóng sổ số của tháng).',
      to_char(v_period_start, 'MM'), to_char(v_period_start, 'YYYY');
  end if;

  select count(*) into v_unreconciled_count
  from live_sessions
  where brand_id = v_report.brand_id
    and date >= v_period_start and date <= v_period_end
    and status = 'Completed'
    and data_source = 'manual'
    and not excluded_from_reports;

  if v_unreconciled_count > 0 and not p_force then
    raise exception 'unreconciled_sessions:%', v_unreconciled_count;
  end if;

  update brand_monthly_reports set
    status = 'published',
    published_at = now(),
    published_by = auth.uid()
  where id = p_report_id
  returning * into v_report;

  return v_report;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- 7) Tháng đã phát hành = đóng sổ
-- ============================================================================
-- Trước đây phát hành xong vẫn đối soát/sửa/loại ca được ⇒ brand đọc Report (bản chụp) một số, mở Sổ Ca
-- (số sống) thấy số khác. Nay muốn sửa thì thu hồi report (unpublish), sửa, cập nhật bản chụp, phát hành lại.
-- Ngoại lệ duy nhất: vòng đời tự động Upcoming/Live Now → Completed (complete_past_sessions, pg_cron) —
-- chặn nó thì một ca sót cũng làm hỏng cả câu lệnh quét của mọi brand.
create or replace function guard_published_month_sessions() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pub boolean := false;
  v_ref live_sessions;
begin
  if tg_op in ('UPDATE', 'DELETE') and old.brand_id is not null then
    v_pub := private.brand_month_published(old.brand_id, old.date);
    v_ref := old;
  end if;
  if not v_pub and tg_op in ('UPDATE', 'INSERT') and new.brand_id is not null then
    v_pub := private.brand_month_published(new.brand_id, new.date);
    v_ref := new;
  end if;
  if not v_pub then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and row(old.brand_id, old.date, old.start_time, old.end_time, old.host_id, old.co_host_id,
             old.actual_gmv, old.total_orders, old.total_views, old.avg_watch_time_seconds, old.peak_viewers,
             old.ctr_avg, old.cvr_avg, old.data_source, old.live_duration_minutes, old.actual_start_at,
             old.actual_end_at, old.attributed_items_sold, old.attributed_sku_orders, old.impressions,
             old.product_impressions, old.product_clicks, old.new_followers, old.comments_count,
             old.shares_count, old.likes_count, old.live_room_ids, old.excluded_from_reports, old.is_backfill)
         is not distinct from
         row(new.brand_id, new.date, new.start_time, new.end_time, new.host_id, new.co_host_id,
             new.actual_gmv, new.total_orders, new.total_views, new.avg_watch_time_seconds, new.peak_viewers,
             new.ctr_avg, new.cvr_avg, new.data_source, new.live_duration_minutes, new.actual_start_at,
             new.actual_end_at, new.attributed_items_sold, new.attributed_sku_orders, new.impressions,
             new.product_impressions, new.product_clicks, new.new_followers, new.comments_count,
             new.shares_count, new.likes_count, new.live_room_ids, new.excluded_from_reports, new.is_backfill)
     and (new.status = old.status or (old.status in ('Upcoming', 'Live Now') and new.status = 'Completed')) then
    return new;
  end if;

  raise exception 'Tháng %/% của % đã phát hành Report cho brand — số và lịch của tháng đó đã đóng sổ. Thu hồi report ở Điều Phối Phát Hành trước khi sửa (ca % %).',
    to_char(v_ref.date, 'MM'), to_char(v_ref.date, 'YYYY'), coalesce(nullif(v_ref.brand_name, ''), 'brand'),
    to_char(v_ref.date, 'DD/MM'), to_char(v_ref.start_time, 'HH24:MI')
    using errcode = 'P0001';
end;
$$;
revoke all on function guard_published_month_sessions() from public;

drop trigger if exists trg_guard_published_month_sessions on live_sessions;
create trigger trg_guard_published_month_sessions
  before insert or update or delete on live_sessions
  for each row execute function guard_published_month_sessions();

-- ============================================================================
-- 8) Đăng ký rảnh chỉ trên ca còn mở
-- ============================================================================
create or replace function private.slot_open_for_registration(p_slot_id uuid, p_require_future boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shift_slots s
     where s.id = p_slot_id
       and s.status = 'open'
       and s.session_id is null
       and (not p_require_future or s.date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  )
$$;
revoke all on function private.slot_open_for_registration(uuid, boolean) from public;
grant execute on function private.slot_open_for_registration(uuid, boolean) to authenticated;

drop policy if exists "session_availability_insert_self_or_ceo_ops" on session_availability;
create policy "session_availability_insert_self_or_ceo_ops" on session_availability for insert
  with check (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or (talent_id = (select current_user_talent_id()) and (select private.slot_open_for_registration(slot_id, true)))
  );

drop policy if exists "session_availability_delete_self_or_ceo_ops" on session_availability;
create policy "session_availability_delete_self_or_ceo_ops" on session_availability for delete
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or (talent_id = (select current_user_talent_id()) and (select private.slot_open_for_registration(slot_id, false)))
  );

-- ============================================================================
-- 9) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if to_regprocedure('public.import_live_reconciliation(text, text, date, date, jsonb)') is not null then
    raise exception '0133 chốt 1: còn bản import_live_reconciliation 5 tham số (không lọc brand)';
  end if;
  if to_regprocedure('public.finalize_shift_slot(uuid, uuid, uuid)') is null then
    raise exception '0133 chốt 2: thiếu finalize_shift_slot';
  end if;
  if pg_get_functiondef('public.update_session_with_children(uuid, jsonb, jsonb, jsonb, jsonb)'::regprocedure)
       ~ 'actual_gmv\s*=' then
    raise exception '0133 chốt 3: update_session_with_children vẫn ghi cột số liệu';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_published_month_sessions')
     or not exists (select 1 from pg_trigger where tgname = 'trg_guard_locked_plan_slot') then
    raise exception '0133 chốt 4: thiếu trigger đóng sổ / khoá ca kế hoạch';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_name = 'live_reconciliation_batches' and column_name = 'brand_id') then
    raise exception '0133 chốt 5: lô đối soát chưa có cột brand_id';
  end if;
end $$;
