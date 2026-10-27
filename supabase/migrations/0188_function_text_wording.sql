-- 0188 — Chữ hiển thị còn sót trong hàm SQL (audit thuật ngữ 27/10, vòng 3b).
-- Quét chuỗi trong bản định nghĩa mới nhất của MỌI hàm (không chỉ raise exception) theo bảng từ
-- của tests/uiWording.test.ts; còn 4 hàm: nhắc giao ca (thông báo), câu lỗi đổi host, câu lỗi quyền
-- xem dự báo của brand, câu lỗi giao ca tay. Chép NGUYÊN VĂN, chỉ đổi chữ: up file → tải lên file,
-- up nhầm ca → tải nhầm file của ca khác, khả năng về đích → xác suất đạt target, cộng dồn → luỹ kế.
-- Kèm sửa chữ của các thông báo nhắc giao ca đã gửi trước đó.

-- apply_segment_checkpoint_file — nguyên văn từ 0187, chỉ đổi chữ hiển thị.
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
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới cập nhật số liệu lúc đổi host được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không cập nhật số liệu lúc đổi host.' using errcode = 'P0001';
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
    raise exception 'File không có phiên live nào thuộc ca này tính tới lúc đổi host. Có thể tải nhầm file của ca khác, hoặc file tải trước khi host xuống.' using errcode = 'P0001';
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

-- brand_landing_series — nguyên văn từ 0170, chỉ đổi chữ hiển thị.
create or replace function brand_landing_series(p_brand_id uuid, p_month date)
returns table (as_of date, platform text, p_hit numeric, target numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin')
     and not (coalesce(current_user_role()::text, '') = 'brand' and p_brand_id is not distinct from current_user_brand_id()) then
    raise exception 'Không có quyền xem xác suất đạt target của brand này' using errcode = '42501';
  end if;
  return query
    select f.as_of, f.platform,
      round((case
        when f.actual is not null and f.actual >= f.target then 1
        when coalesce(f.hi, f.p50) - f.p50 <= 0 then case when f.p50 >= f.target then 1 else 0 end
        else 1 - private.normal_cdf(((f.target - f.p50) / ((f.hi - f.p50) / 1.2816))::double precision)
      end)::numeric, 4) as p_hit,
      f.target
    from forecast_snapshots f
    where f.brand_id = p_brand_id
      and f.month = date_trunc('month', p_month)::date
      and f.kind = 'daily'
      and f.target is not null and f.target > 0
    order by f.platform, f.as_of;
end;
$$;

-- private.sync_handover_reminder — nguyên văn từ 0178, chỉ đổi chữ hiển thị.
create or replace function private.sync_handover_reminder(p_session_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  s live_sessions;
  v_due timestamptz;
  v_title text;
  v_assist uuid;
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
  select g.talent_id into v_assist
    from session_staff_segments g
   where g.session_id = s.id and g.role = 'co_host'
   order by g.to_min desc
   limit 1;
  v_assist := coalesce(v_assist, s.co_host_id);
  v_title := format('Giao ca %s %s %s–%s', coalesce(s.brand_name, ''), s.platform, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'));
  insert into notifications (user_id, kind, title, body, session_id, brand_id, created_at)
  select p.id, 'handover_due', v_title,
         case when s.platform::text = 'TikTok'
              then 'Hết ca rồi — mở ca, tải lên file Creator-Live-Performance rồi chọn sự cố để giao ca.'
              else 'Hết ca rồi — mở ca, tải lên file Live List rồi chọn sự cố để giao ca.' end,
         s.id, s.brand_id, v_due
    from profiles p
   where p.status = 'Active'
     and ((v_assist is not null and p.assigned_talent_id = v_assist)
          or (v_assist is null and p.role in ('operations', 'admin')));
end;
$$;

-- submit_session_handover — nguyên văn từ 0144, chỉ đổi chữ hiển thị.
create or replace function submit_session_handover(
  p_session_id uuid,
  p_link text,
  p_cum_gmv numeric,
  p_cum_views int,
  p_cum_orders int default null,
  p_cum_atc int default null,
  p_coin_spent numeric default null,
  p_ot_minutes int default 0,
  p_early_leave_minutes int default 0,
  p_restart_count int default 0,
  p_host_late boolean default false,
  p_status_note text default ''
) returns setof live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_platform text;
  v_ref text;
  v_prev record;
  v_next record;
  v_ids uuid[];
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

  select l.platform, l.live_ref into v_platform, v_ref from private.parse_dashboard_link(p_link) l;
  if v_ref is null then
    raise exception 'Link dashboard chưa đúng: ca TikTok dán link TikTok Shop có "room_id=…", ca Shopee dán link ".../dashboard/live/<số>".'
      using errcode = 'P0001';
  end if;
  if v_platform <> s.platform::text then
    raise exception 'Đây là link %, nhưng ca này là ca %.', v_platform, s.platform using errcode = 'P0001';
  end if;
  if p_cum_gmv is null or p_cum_gmv < 0 or coalesce(p_cum_views, 0) < 0 or coalesce(p_cum_orders, 0) < 0 or coalesce(p_cum_atc, 0) < 0 then
    raise exception 'Số không được âm, GMV bắt buộc.' using errcode = 'P0001';
  end if;
  if s.platform::text = 'TikTok' and p_cum_orders is null then
    raise exception 'Ca TikTok cần số đơn.' using errcode = 'P0001';
  end if;

  -- Số cộng dồn phải nằm giữa ca trước và ca sau cùng phòng (đã giao).
  select o.start_time, o.end_time, rep.cum_gmv into v_prev
    from live_session_reports rep join live_sessions o on o.id = rep.session_id
   where rep.live_ref = v_ref and rep.handover_at is not null and o.id <> s.id and o.brand_id = s.brand_id
     and o.platform = s.platform and o.status <> 'Cancelled'
     and private.session_start_ts(o.date, o.start_time) < private.session_start_ts(s.date, s.start_time)
   order by private.session_start_ts(o.date, o.start_time) desc limit 1;
  if found and p_cum_gmv < v_prev.cum_gmv then
    raise exception 'GMV luỹ kế % nhỏ hơn số ca trước cùng phòng (ca %–% đã giao %). Ca nối: nhập đúng số TỔNG đang thấy trên dashboard.',
      p_cum_gmv, to_char(v_prev.start_time, 'HH24:MI'), to_char(v_prev.end_time, 'HH24:MI'), v_prev.cum_gmv using errcode = 'P0001';
  end if;
  select o.start_time, o.end_time, rep.cum_gmv into v_next
    from live_session_reports rep join live_sessions o on o.id = rep.session_id
   where rep.live_ref = v_ref and rep.handover_at is not null and o.id <> s.id and o.brand_id = s.brand_id
     and o.platform = s.platform and o.status <> 'Cancelled'
     and private.session_start_ts(o.date, o.start_time) > private.session_start_ts(s.date, s.start_time)
   order by private.session_start_ts(o.date, o.start_time) asc limit 1;
  if found and p_cum_gmv > v_next.cum_gmv then
    raise exception 'GMV luỹ kế % lớn hơn số ca sau cùng phòng (ca %–% đã giao %).',
      p_cum_gmv, to_char(v_next.start_time, 'HH24:MI'), to_char(v_next.end_time, 'HH24:MI'), v_next.cum_gmv using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, dashboard_link_1, live_ref, cum_gmv, cum_orders, cum_views, cum_atc, coin_spent,
    ot_minutes, early_leave_minutes, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, p_link, v_ref, p_cum_gmv, p_cum_orders, p_cum_views, p_cum_atc, p_coin_spent,
    greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    dashboard_link_1 = excluded.dashboard_link_1,
    live_ref = excluded.live_ref,
    cum_gmv = excluded.cum_gmv,
    cum_orders = excluded.cum_orders,
    cum_views = excluded.cum_views,
    cum_atc = excluded.cum_atc,
    coin_spent = excluded.coin_spent,
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

  -- Đổi link sang phòng khác: chuỗi cũ cũng phải tính lại (ca sau của chuỗi cũ mất ca trước).
  select array_agg(x) into v_ids from (
    select private.apply_handover_chain(s.brand_id, s.platform::text, v_ref) as x
    union
    select private.apply_handover_chain(s.brand_id, s.platform::text, o.live_ref)
      from (select distinct rep.live_ref from live_session_reports rep
             where rep.handover_prev_session_id = s.id and rep.live_ref is distinct from v_ref and rep.live_ref is not null) o
  ) t;

  delete from notifications where session_id = s.id and kind = 'handover_due';

  return query select * from live_sessions where id = any(v_ids) or id = s.id;
end;
$$;

update notifications
   set body = replace(body, 'mở ca, up file', 'mở ca, tải lên file')
 where kind = 'handover_due' and body like '%mở ca, up file%';
