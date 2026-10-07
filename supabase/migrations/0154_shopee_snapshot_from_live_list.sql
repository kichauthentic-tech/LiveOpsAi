-- 0154 — Ca SHOPEE giao ca / đổi host bằng FILE Live List, cùng cơ chế snapshot của TikTok (user chốt 08/10).
--
-- Trước: ca Shopee giao ca bằng dán link dashboard + gõ số (0144), số lúc đổi host gõ tay (0147). Nay Shopee dùng đúng đường của
-- TikTok: up file (Live List của Shopee Seller Centre, mỗi dòng một PHIÊN) vào ca ⇒ apply_session_live_snapshot (0078/0124/0153) —
-- một phiên Shopee đóng vai "room" với mã tổng hợp SHP-<ngày>-<giờ bắt đầu> (client tạo, cùng mã với đường đối soát), số trong
-- file là số CỘNG DỒN của phiên nên ca nối cùng phiên trừ lần up trước y hệt TikTok. Phần dùng lại nguyên: bảng snapshot, view
-- session_room_deltas, ca nối tường minh + ca bị ngắt room (0153), apply_segment_checkpoint_file (0148).
--
-- Cái cần thêm cho Shopee:
--   1) ATC. Live List có ATC theo phiên, bảng snapshot không có cột này ⇒ KHÔNG thêm cột: ATC nằm sẵn trong raw->>'atc' của
--      dòng (client ghi), view session_room_deltas trừ ATC giữa hai lần up (null khi file không có ATC — file TikTok), recompute
--      ghi tổng vào live_session_reports.atc_count cho ca Shopee (cùng cột mà đối soát 0150 ghi). Xoá snapshot ⇒ gỡ ATC đã ghi.
--      estimate_handover_split (chia ước lượng theo thời gian) chia luôn ATC trong raw.
--   2) apply_segment_checkpoint_file và ca nối tường minh (room_link_error, 0153) không còn chỉ TikTok; checkpoint ghi thêm cum_atc.
--   3) submit_file_handover thay submit_tiktok_handover cho cả hai sàn (hàm cũ giữ nguyên trong DB, client không gọi nữa).
--   4) Số lúc đổi host gõ tay ('link') bị chặn ở mọi sàn (trước chỉ TikTok); lời nhắc giao ca Shopee nói đúng việc.
-- KHÔNG đụng: submit_session_handover / submit_segment_checkpoint (đường gõ tay 0144/0147) — client không còn gọi; còn nằm trong DB.
-- Thứ tự deploy: chạy migration TRƯỚC rồi deploy client. Chạy lại nhiều lần không sao.

-- ---------------------------------------------------------------------------
-- 1) ATC: view trừ số + recompute + xoá snapshot
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
  and (c.ended_at is null or c.ended_at >= sn.session_start)
  and (c.started_at is null or c.started_at <= sn.boundary_at)
  and (sn.prev_session_id is null or exists (select 1 from session_live_snapshots x where x.session_id = sn.prev_session_id));

-- Nguyên văn 0153, thêm đoạn ghi ATC cho ca Shopee ở cuối.
create or replace function recompute_session_from_snapshot(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_atc numeric;
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

  -- Ca Shopee: ATC của phiên (Live List) vào báo cáo ca — cùng chỗ với đối soát (0150). File không có ATC ⇒ không đụng.
  select sum(atc) into v_atc from session_room_deltas where session_id = p_session_id;
  if v_atc is not null and exists (select 1 from live_sessions where id = p_session_id and platform::text = 'Shopee') then
    insert into live_session_reports (session_id, atc_count) values (p_session_id, greatest(round(v_atc), 0)::int)
    on conflict (session_id) do update set atc_count = excluded.atc_count;
  end if;
end;
$$;
revoke execute on function recompute_session_from_snapshot(uuid) from public, authenticated, anon;

-- Xoá snapshot của ca Shopee ⇒ gỡ ATC do nó ghi (ca đã đối soát Live List giữ ATC của đối soát).
-- Up lại file = xoá snapshot cũ rồi recompute ghi lại, nên trigger này không làm mất ATC của lần up mới.
create or replace function private.clear_atc_with_snapshot() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update live_session_reports r set atc_count = null
   where r.session_id = old.session_id
     and exists (select 1 from live_sessions s where s.id = old.session_id and s.platform::text = 'Shopee' and s.data_source::text <> 'tiktok_reconciled');
  return old;
end;
$$;
revoke all on function private.clear_atc_with_snapshot() from public;
drop trigger if exists trg_clear_atc_with_snapshot on session_live_snapshots;
create trigger trg_clear_atc_with_snapshot
  after delete on session_live_snapshots
  for each row execute function private.clear_atc_with_snapshot();

-- Chia ước lượng theo thời gian (ca trước quên up file): chia luôn ATC trong raw của dòng (bọc định nghĩa đang chạy, khuôn 0150).
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.estimate_handover_split(uuid)'::regprocedure);
  if v_def !~ 'raw \? ''atc''' then
    v_new := replace(
      v_def,
      'jsonb_build_object(''estimated'', true, ''fraction'', round(f.f::numeric, 4))',
      'jsonb_build_object(''estimated'', true, ''fraction'', round(f.f::numeric, 4)) || case when r.raw ? ''atc'' then jsonb_build_object(''atc'', round((r.raw->>''atc'')::numeric * f.f)) else ''{}''::jsonb end'
    );
    if v_new = v_def then
      raise exception '0154: không thấy đoạn jsonb_build_object(''estimated''…) trong estimate_handover_split';
    end if;
    execute v_new;
  end if;
end $$;

-- Ca nối tường minh (0153) cho cả hai sàn: một phiên Shopee kéo qua hai ca cũng cần mốc trừ như room TikTok. Chỉ còn chặn nối
-- ca KHÁC sàn (bọc định nghĩa đang chạy, khuôn 0150).
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('private.room_link_error(uuid, uuid)'::regprocedure);
  if v_def !~ 'khác sàn' then
    v_new := replace(
      v_def,
      'if a.platform::text <> ''TikTok'' or b.platform::text <> ''TikTok'' then
    return ''Chỉ ca TikTok mới nối room (Shopee giao ca bằng link dashboard).'';',
      'if a.platform is distinct from b.platform then
    return ''Hai ca khác sàn — không thể cùng một phiên live.'';'
    );
    if v_new = v_def then
      raise exception '0154: không thấy vế chặn TikTok trong private.room_link_error';
    end if;
    execute v_new;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Số lúc đổi host từ file — cho cả hai sàn, kèm ATC. Nguyên văn 0148, bỏ vế chỉ-TikTok.
-- ---------------------------------------------------------------------------
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
           c.started_at, c.ended_at
    from (
      select r->>'roomId' as room_id,
             nullif(r->>'startedAt', '')::timestamptz as started_at,
             nullif(r->>'endedAt', '')::timestamptz as ended_at,
             coalesce((r->>'gmv')::numeric, 0) as gmv,
             coalesce((r->>'orders')::int, 0) as orders,
             coalesce((r->>'views')::bigint, 0) as views,
             (r->'raw'->>'atc')::numeric as atc
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
    and (d.ended_at is null or d.ended_at >= v_start)
    and (d.started_at is null or d.started_at <= v_cp_time);

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

-- Số lúc đổi host gõ tay chỉ còn là dòng cũ: chặn ghi mới ở mọi sàn (trước 0154 chỉ TikTok bị chặn).
create or replace function private.reject_manual_tiktok_checkpoint() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'link' then
    raise exception 'Số lúc đổi host lấy từ file (TikTok: Creator-Live-Performance, Shopee: Live List) tải đúng lúc host xuống, không nhập tay.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Giao ca bằng file cho cả hai sàn. Nguyên văn submit_tiktok_handover (0145), bỏ vế chỉ-TikTok.
-- ---------------------------------------------------------------------------
create or replace function submit_file_handover(
  p_session_id uuid,
  p_ot_minutes int default 0,
  p_early_leave_minutes int default 0,
  p_restart_count int default 0,
  p_host_late boolean default false,
  p_status_note text default ''
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Up file số liệu của ca (%) trước, rồi mới giao ca.',
      case when s.platform::text = 'Shopee' then 'Live List của Shopee' else 'Creator-Live-Performance của TikTok' end using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  return s;
end;
$$;
revoke all on function submit_file_handover(uuid, int, int, int, boolean, text) from public;
grant execute on function submit_file_handover(uuid, int, int, int, boolean, text) to authenticated;

-- Lời nhắc giao ca: cả hai sàn đều "up file". Nguyên văn 0145, thay câu của Shopee.
create or replace function private.sync_handover_reminder(p_session_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  s live_sessions;
  v_due timestamptz;
  v_title text;
begin
  delete from notifications where session_id = p_session_id and kind = 'handover_due' and read_at is null;
  select * into s from live_sessions where id = p_session_id;
  if not found or s.status = 'Cancelled' or s.is_backfill
     or exists (select 1 from live_session_reports r where r.session_id = s.id and r.handover_at is not null) then
    return;
  end if;
  v_due := ((s.date + s.end_time)::timestamp
            + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end
            + interval '15 minutes') at time zone 'Asia/Ho_Chi_Minh';
  if v_due <= now() then
    return;
  end if;
  v_title := format('Giao ca %s %s %s–%s', coalesce(s.brand_name, ''), s.platform, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'));
  insert into notifications (user_id, kind, title, body, session_id, brand_id, created_at)
  select p.id, 'handover_due', v_title,
         case when s.platform::text = 'TikTok'
              then 'Hết ca rồi — mở ca, up file Creator-Live-Performance rồi chọn sự cố để giao ca.'
              else 'Hết ca rồi — mở ca, up file Live List rồi chọn sự cố để giao ca.' end,
         s.id, s.brand_id, v_due
    from profiles p
   where p.status = 'Active'
     and ((s.co_host_id is not null and p.assigned_talent_id = s.co_host_id)
          or (s.co_host_id is null and p.role in ('operations', 'admin')));
end;
$$;
revoke all on function private.sync_handover_reminder(uuid) from public;

update notifications n
   set body = 'Hết ca rồi — mở ca, up file Live List rồi chọn sự cố để giao ca.'
  from live_sessions s
 where n.session_id = s.id and n.kind = 'handover_due' and n.read_at is null and s.platform::text = 'Shopee';

-- Chốt tự kiểm
do $$
begin
  if to_regprocedure('public.submit_file_handover(uuid,integer,integer,integer,boolean,text)') is null then
    raise exception '0154: thiếu hàm submit_file_handover';
  end if;
  if pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure) !~ 'atc_count' then
    raise exception '0154: recompute_session_from_snapshot chưa ghi ATC';
  end if;
  if pg_get_functiondef('public.estimate_handover_split(uuid)'::regprocedure) !~ 'raw \? ''atc''' then
    raise exception '0154: estimate_handover_split chưa chia ATC';
  end if;
  if pg_get_functiondef('private.room_link_error(uuid, uuid)'::regprocedure) ~ 'Chỉ ca TikTok' then
    raise exception '0154: room_link_error còn chặn ca Shopee';
  end if;
  if pg_get_functiondef('public.apply_segment_checkpoint_file(uuid,integer,text,jsonb)'::regprocedure) ~ 'Ca Shopee nhập số' then
    raise exception '0154: apply_segment_checkpoint_file còn chặn Shopee';
  end if;
end $$;
