-- 0139 — Report Tháng TÁCH THEO SÀN (TikTok / Shopee) + đối soát theo sàn + 4 loại file Shopee.
--
-- Yêu cầu user (06/10): report Shopee và TikTok khác nhau, độc lập — mỗi brand mỗi tháng có thể có MỘT report TikTok và MỘT
-- report Shopee, phát hành / thu hồi / đóng sổ riêng, brand chỉ thấy số của sàn đã phát hành. Trước 0139 khoá report là
-- (brand, tháng): ca Shopee của VERA/JOCKEY không có report nào nhưng vẫn bị tính vào "ca chưa đối soát" của lần phát hành.
--
--   1) brand_monthly_reports + brand_monthly_report_snapshots: cột platform ('TikTok' mặc định — mọi dòng cũ là TikTok);
--      khoá (brand, tháng, sàn).
--   2) private.brand_month_published(brand, date) giữ nguyên NGHĨA = "TikTok đã phát hành" (policy cũ của SKU/dữ liệu shop đều
--      là dữ liệu TikTok Shop); thêm bản 3 tham số (brand, date, sàn) cho ca và bản chụp.
--   3) View live_sessions_secure: số liệu của ca chỉ hiện cho brand khi tháng của ĐÚNG SÀN đã phát hành (bọc định nghĩa đang
--      chạy bằng regex, khuôn 0130 — không chép tay để khỏi lùi mất vế bảo mật của 0107/0109/0114/0129/0130).
--   4) guard_published_month_sessions: đóng sổ theo sàn của ca; đổi sàn của ca cũng bị chặn.
--   5) publish_brand_monthly_report: chỉ đếm ca chưa đối soát CỦA SÀN ĐÓ.
--   6) Đối soát: lô gắn sàn; import khớp ca đúng sàn, apply ghi ca đúng sàn. Dòng file Shopee Live List đi qua cùng đường
--      (room_id = mã tổng hợp, GMV = doanh số đặt hàng).
--   7) brand_dataraw_imports nhận 4 loại file Shopee: shopee_live_list, shopee_product_list, shopee_daily, shopee_overview.
--
-- Thứ tự với deploy: DEPLOY client mới TRƯỚC, rồi chạy migration NGAY SAU KHI deploy xong (cách nhau vài phút).
--   * Client mới + DB cũ: đọc/ghi report lỗi (chưa có cột platform) — chỉ trong khoảng chờ migration.
--   * Client cũ + DB mới: lưu report/bản chụp lỗi ("no unique or exclusion constraint matching the ON CONFLICT") vì khoá đã
--     đổi thành (brand, tháng, sàn); đọc vẫn chạy. Cũng chỉ trong khoảng giữa hai bước.
--   Hai trạng thái đều không mất dữ liệu — chỉ là thao tác lưu báo lỗi cho tới khi bước còn lại xong.
-- Chạy lại nhiều lần không sao.

-- ============================================================================
-- 1) Cột sàn + khoá
-- ============================================================================
alter table brand_monthly_reports add column if not exists platform text not null default 'TikTok';
alter table brand_monthly_report_snapshots add column if not exists platform text not null default 'TikTok';
alter table live_reconciliation_batches add column if not exists platform text not null default 'TikTok';

do $$
declare
  c record;
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_monthly_reports_platform_check') then
    alter table brand_monthly_reports add constraint brand_monthly_reports_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_monthly_report_snapshots_platform_check') then
    alter table brand_monthly_report_snapshots add constraint brand_monthly_report_snapshots_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'live_reconciliation_batches_platform_check') then
    alter table live_reconciliation_batches add constraint live_reconciliation_batches_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;

  -- Bỏ unique (brand_id, period_month) cũ của brand_monthly_reports (tên do Postgres tự đặt nên tìm theo định nghĩa).
  for c in
    select conname from pg_constraint
     where conrelid = 'brand_monthly_reports'::regclass and contype = 'u'
       and pg_get_constraintdef(oid) = 'UNIQUE (brand_id, period_month)'
  loop
    execute format('alter table brand_monthly_reports drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'brand_monthly_reports_brand_month_platform_key') then
    alter table brand_monthly_reports add constraint brand_monthly_reports_brand_month_platform_key unique (brand_id, period_month, platform);
  end if;

  -- Khoá chính của bản chụp: (brand_id, period_month) -> thêm platform.
  if (select pg_get_constraintdef(oid) from pg_constraint where conname = 'brand_monthly_report_snapshots_pkey') = 'PRIMARY KEY (brand_id, period_month)' then
    alter table brand_monthly_report_snapshots drop constraint brand_monthly_report_snapshots_pkey;
    alter table brand_monthly_report_snapshots add primary key (brand_id, period_month, platform);
  end if;
end $$;

-- ============================================================================
-- 2) Helper "tháng đã phát hành" theo sàn
-- ============================================================================
create or replace function private.brand_month_published(p_brand_id uuid, p_date date) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from brand_monthly_reports r
     where r.brand_id = p_brand_id
       and r.period_month = date_trunc('month', p_date)::date
       and r.platform = 'TikTok'
       and r.status = 'published'
  )
$$;

create or replace function private.brand_month_published(p_brand_id uuid, p_date date, p_platform text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from brand_monthly_reports r
     where r.brand_id = p_brand_id
       and r.period_month = date_trunc('month', p_date)::date
       and r.platform = coalesce(p_platform, 'TikTok')
       and r.status = 'published'
  )
$$;

-- Bản chụp: brand đọc được khi tháng của ĐÚNG SÀN đã phát hành.
drop policy if exists brand_monthly_report_snapshots_brand_read_published on brand_monthly_report_snapshots;
create policy brand_monthly_report_snapshots_brand_read_published on brand_monthly_report_snapshots
  for select to authenticated
  using (
    (select current_user_role()) = 'brand'
    and brand_id = (select current_user_brand_id())
    and private.brand_month_published(brand_id, period_month, platform)
  );

-- ============================================================================
-- 3) View live_sessions_secure: số liệu hiện theo sàn của ca
-- ============================================================================
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := regexp_replace(pg_get_viewdef('public.live_sessions_secure'::regclass, true), ';\s*$', '');
  if v_def ~* 'brand_month_published\(\s*(\w+\.)?brand_id\s*,\s*(\w+\.)?date\s*,' then
    raise notice '0139: live_sessions_secure đã theo sàn, không đụng.';
    return;
  end if;
  v_new := regexp_replace(
    v_def,
    'brand_month_published\(\s*((?:\w+\.)?)brand_id\s*,\s*((?:\w+\.)?)date\s*\)',
    'brand_month_published(\1brand_id, \2date, \1platform::text)',
    'g'
  );
  if v_new = v_def then
    raise exception '0139 DỪNG: không tìm thấy lời gọi brand_month_published(brand_id, date) trong live_sessions_secure để đổi sang theo sàn';
  end if;
  execute format('create or replace view public.live_sessions_secure as %s', v_new);
end $$;

-- ============================================================================
-- 4) Đóng sổ theo sàn
-- ============================================================================
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
    v_pub := private.brand_month_published(old.brand_id, old.date, old.platform::text);
    v_ref := old;
  end if;
  if not v_pub and tg_op in ('UPDATE', 'INSERT') and new.brand_id is not null then
    v_pub := private.brand_month_published(new.brand_id, new.date, new.platform::text);
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
             old.actual_end_at, old.platform, old.attributed_items_sold, old.attributed_sku_orders, old.impressions,
             old.product_impressions, old.product_clicks, old.new_followers, old.comments_count,
             old.shares_count, old.likes_count, old.live_room_ids, old.excluded_from_reports, old.is_backfill)
         is not distinct from
         row(new.brand_id, new.date, new.start_time, new.end_time, new.host_id, new.co_host_id,
             new.actual_gmv, new.total_orders, new.total_views, new.avg_watch_time_seconds, new.peak_viewers,
             new.ctr_avg, new.cvr_avg, new.data_source, new.live_duration_minutes, new.actual_start_at,
             new.actual_end_at, new.platform, new.attributed_items_sold, new.attributed_sku_orders, new.impressions,
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

-- ============================================================================
-- 5) Phát hành chỉ đếm ca chưa đối soát của sàn đó
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
    and platform::text = v_report.platform
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
-- 6) Đối soát theo sàn
-- ============================================================================
drop function if exists import_live_reconciliation(text, text, date, date, jsonb, uuid);
create or replace function import_live_reconciliation(
  p_file_name text,
  p_period_label text,
  p_period_start date,
  p_period_end date,
  p_rows jsonb,
  -- default null CHỈ để client cũ (5 tham số) nhận câu lỗi rõ ràng thay vì "function not found".
  p_brand_id uuid default null,
  -- Sàn của file (0139): file Creator-Live-Performance là TikTok, file Live List của Shopee là Shopee. Chỉ khớp ca ĐÚNG SÀN —
  -- VERA/JOCKEY chạy cả hai sàn, có giờ chồng nhau, khớp lẫn sàn là chia nhầm GMV.
  p_platform text default 'TikTok'
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
  if p_platform is null or p_platform not in ('TikTok', 'Shopee') then
    raise exception 'Sàn của file phải là TikTok hoặc Shopee';
  end if;
  if p_brand_id is null then
    raise exception 'Chọn brand của file trước khi up — file Creator-Live-Performance là của MỘT tài khoản, khớp theo giờ với ca của brand khác sẽ chia nhầm GMV.';
  end if;
  insert into live_reconciliation_batches (file_name, period_label, period_start, period_end, row_count, uploaded_by, brand_id, platform)
  values (p_file_name, p_period_label, p_period_start, p_period_end, coalesce(jsonb_array_length(p_rows), 0), auth.uid(), p_brand_id, p_platform)
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
     and ls.platform::text = p_platform
     and rr.started_at is not null and rr.ended_at is not null
     -- 0136: giao nhau THẬT (< và >), không tính chạm mép. Phiên 15:07→19:17 và ca kế tiếp bắt đầu đúng 19:17
     -- trước đây "khớp" cả hai ca (chung 1 điểm) ⇒ phiên bị đẩy sang rổ "cần xem lại" và chia ước lượng.
     and rr.started_at < session_boundary_at(ls.id)
     and rr.ended_at > (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
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
revoke all on function import_live_reconciliation(text, text, date, date, jsonb, uuid, text) from public;
grant execute on function import_live_reconciliation(text, text, date, date, jsonb, uuid, text) to authenticated;

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
    join live_sessions ls on ls.id = sid and ls.brand_id = v_brand and ls.platform::text = v_platform
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
-- 7) 4 loại file Shopee trong kho Dữ Liệu Gốc
-- ============================================================================
do $$
begin
  alter table brand_dataraw_imports drop constraint if exists brand_dataraw_imports_report_type_check;
  alter table brand_dataraw_imports add constraint brand_dataraw_imports_report_type_check check (report_type = any (array[
    'shop_promotion', 'product_list', 'live_analysis', 'shop_analytics', 'live_performance_core_stats',
    'product_card_traffic_stats', 'creator_live_performance', 'transaction_analysis_creator_list', 'ads_campaign_overview',
    'shopee_live_list', 'shopee_product_list', 'shopee_daily', 'shopee_overview'
  ]));
end $$;

-- ============================================================================
-- 8) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if (select count(*) from brand_monthly_reports where platform <> 'TikTok') > 0 then
    raise notice '0139: có report khác TikTok (bình thường nếu migration chạy lại sau khi đã dùng Shopee).';
  end if;
  if to_regprocedure('private.brand_month_published(uuid,date,text)') is null then
    raise exception '0139: thiếu private.brand_month_published(uuid,date,text)';
  end if;
  if to_regprocedure('public.import_live_reconciliation(text,text,date,date,jsonb,uuid,text)') is null then
    raise exception '0139: thiếu import_live_reconciliation bản có p_platform';
  end if;
  if to_regprocedure('public.import_live_reconciliation(text,text,date,date,jsonb,uuid)') is not null then
    raise exception '0139: còn bản import_live_reconciliation 6 tham số (sẽ gây function is not unique)';
  end if;
  if pg_get_viewdef('public.live_sessions_secure'::regclass, true) !~* 'brand_month_published\(\s*(\w+\.)?brand_id\s*,\s*(\w+\.)?date\s*,\s*(\w+\.)?platform(::text)?' then
    raise exception '0139: live_sessions_secure chưa theo sàn';
  end if;
  if pg_get_viewdef('public.live_sessions_secure'::regclass, true) !~* 'current_user_role\(\)[^;]*is\s+not\s+null' then
    raise exception '0139: live_sessions_secure mất vế is-not-null của 0109';
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_monthly_reports_brand_month_platform_key') then
    raise exception '0139: thiếu khoá (brand, tháng, sàn) của brand_monthly_reports';
  end if;
end $$;
