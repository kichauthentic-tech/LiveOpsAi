-- 0144: GIAO CA trên điện thoại (Đợt 2 lịch 2 sàn, 06/10).
--
-- Thay dòng Google Sheet "Working File" mà trợ live đang gõ mỗi ca (user chốt 06/10: chuyển thẳng sang app, không chạy
-- song song). Người giao ca = TRỢ LIVE của ca; ca không có trợ thì OPS giao (user chốt). Một lần giao ca gồm:
--   - link dashboard (đúng thứ đang dán vào Sheet): TikTok Shop `...room_id=<số>`, Shopee `.../dashboard/live/<số>`
--     ⇒ app biết sàn, mã phòng/phiên, và ca nào là CA NỐI (cùng mã với ca trước của cùng brand + sàn);
--   - 3 số ĐANG THẤY trên dashboard (cộng dồn từ lúc bật phòng): GMV, lượt xem, đơn (TikTok) hoặc ATC (Shopee);
--     app tự trừ số của ca trước cùng phòng — trước đây trợ live tự làm phép trừ, ca 20–21 của VERA Shopee 26/09 bị bỏ trống;
--   - OT / off sớm / restart / host trễ / ghi chú / xu đã tung.
-- Số của ca ghi vào live_sessions (actual_gmv, total_views, total_orders) ở bậc 'manual' như report cũ — đối soát cuối
-- kỳ vẫn ghi đè. Không chạm số của ca đã có snapshot/đối soát (luật 0084).
--
-- Nhắc giao ca: thông báo kind 'handover_due' tạo sẵn khi ca được xếp, created_at = giờ hết ca + 15 phút; client chỉ
-- đọc thông báo có created_at <= now() ⇒ chuông "nổ" đúng lúc mà không cần máy chủ hẹn giờ. Giao ca xong thì xoá.
--
-- Deploy: chạy migration TRƯỚC rồi deploy client (client mới gọi RPC này; client cũ không đụng gì mới).

-- ============================================================================
-- 1) Cột giao ca trên live_session_reports (1-1 với ca)
-- ============================================================================
alter table live_session_reports add column if not exists live_ref text;
alter table live_session_reports add column if not exists cum_gmv numeric;
alter table live_session_reports add column if not exists cum_orders int;
alter table live_session_reports add column if not exists cum_views int;
alter table live_session_reports add column if not exists cum_atc int;
alter table live_session_reports add column if not exists handover_at timestamptz;
alter table live_session_reports add column if not exists handover_prev_session_id uuid references live_sessions(id) on delete set null;
create index if not exists idx_live_session_reports_live_ref on live_session_reports (live_ref) where live_ref is not null;

-- ============================================================================
-- 2) Đọc link dashboard ⇒ sàn + mã phòng/phiên (client có bản giống hệt: lib/handover.ts)
-- ============================================================================
create or replace function private.parse_dashboard_link(p_link text)
returns table (platform text, live_ref text)
language sql
immutable
as $$
  select case
           when p_link ~* 'shopee\.' and substring(p_link from '(?i)/live/([0-9]+)') is not null then 'Shopee'
           when p_link ~* 'tiktok' and substring(p_link from '(?i)room_id=([0-9]+)') is not null then 'TikTok'
         end,
         case
           when p_link ~* 'shopee\.' then substring(p_link from '(?i)/live/([0-9]+)')
           when p_link ~* 'tiktok' then substring(p_link from '(?i)room_id=([0-9]+)')
         end;
$$;
revoke all on function private.parse_dashboard_link(text) from public;

-- Giờ bắt đầu tuyệt đối của ca (để xếp thứ tự ca nối).
create or replace function private.session_start_ts(p_date date, p_start time)
returns timestamp language sql immutable as $$ select (p_date + p_start)::timestamp $$;
revoke all on function private.session_start_ts(date, time) from public;

-- ============================================================================
-- 3) Tính lại cả chuỗi ca nối cùng phòng: số của ca = cộng dồn − cộng dồn ca trước
-- ============================================================================
create or replace function private.apply_handover_chain(p_brand_id uuid, p_platform text, p_live_ref text)
returns setof uuid
language plpgsql
set search_path = public
as $$
declare
  r record;
  v_prev_id uuid := null;   -- null = đang ở ca đầu chuỗi
  v_pg numeric := 0;
  v_po int := 0;
  v_pv int := 0;
  v_pa int := 0;
  v_gmv numeric;
  v_orders int;
  v_views int;
begin
  for r in
    select s.id, s.data_source::text as data_source, rep.cum_gmv, rep.cum_orders, rep.cum_views, rep.cum_atc
      from live_session_reports rep
      join live_sessions s on s.id = rep.session_id
     where rep.live_ref = p_live_ref
       and rep.handover_at is not null
       and s.brand_id = p_brand_id
       and s.platform::text = p_platform
       and s.status <> 'Cancelled'
     order by private.session_start_ts(s.date, s.start_time), s.id
  loop
    v_gmv := greatest(r.cum_gmv - v_pg, 0);
    v_views := greatest(coalesce(r.cum_views, 0) - v_pv, 0);
    v_orders := greatest(coalesce(r.cum_orders, 0) - v_po, 0);

    update live_session_reports set
      handover_prev_session_id = v_prev_id,
      atc_count = case when p_platform = 'Shopee' and r.cum_atc is not null then greatest(r.cum_atc - v_pa, 0) else atc_count end,
      updated_at = now()
     where session_id = r.id;

    -- Ca đã có số từ file (snapshot lúc giao ca / đối soát) giữ số của file (0084).
    if r.data_source not in ('live_snapshot', 'tiktok_reconciled') then
      update live_sessions set
        actual_gmv = v_gmv,
        total_views = v_views,
        total_orders = case when p_platform = 'TikTok' then v_orders else total_orders end,
        data_source = 'manual',
        reconciled_at = null
       where id = r.id
         and (actual_gmv is distinct from v_gmv
              or total_views is distinct from v_views
              or (p_platform = 'TikTok' and total_orders is distinct from v_orders));
    end if;

    v_prev_id := r.id;
    v_pg := coalesce(r.cum_gmv, 0);
    v_po := coalesce(r.cum_orders, 0);
    v_pv := coalesce(r.cum_views, 0);
    v_pa := coalesce(r.cum_atc, 0);
    return next r.id;
  end loop;
end;
$$;
revoke all on function private.apply_handover_chain(uuid, text, text) from public;

-- Quyền giao ca: ops/admin/ceo, hoặc trợ live của ca (cột co_host_id hoặc một đoạn trợ của "đổi người giữa ca").
create or replace function private.can_handover(p_session live_sessions)
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(current_user_role()::text, '') in ('ceo', 'operations', 'admin')
      or (current_user_role()::text = 'talent'
          and current_user_talent_id() is not null
          and (p_session.co_host_id = current_user_talent_id()
               or exists (select 1 from session_staff_segments g
                           where g.session_id = p_session.id and g.role = 'co_host' and g.talent_id = current_user_talent_id())));
$$;
revoke all on function private.can_handover(live_sessions) from public;

-- ============================================================================
-- 4) Ca trước cùng phòng (để màn Giao ca nói "ca nối với ca 18:00–20:00, đã giao X")
-- ============================================================================
create or replace function handover_previous(p_session_id uuid, p_link text)
returns table (session_id uuid, start_time time, end_time time, cum_gmv numeric, cum_orders int, cum_views int, cum_atc int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_ref text;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found or not private.can_handover(s) then
    raise exception 'Không có quyền giao ca này.' using errcode = 'P0001';
  end if;
  select l.live_ref into v_ref from private.parse_dashboard_link(p_link) l;
  if v_ref is null then return; end if;
  return query
    select o.id, o.start_time, o.end_time, rep.cum_gmv, rep.cum_orders, rep.cum_views, rep.cum_atc
      from live_session_reports rep
      join live_sessions o on o.id = rep.session_id
     where rep.live_ref = v_ref
       and rep.handover_at is not null
       and o.id <> s.id
       and o.brand_id = s.brand_id
       and o.platform = s.platform
       and o.status <> 'Cancelled'
       and private.session_start_ts(o.date, o.start_time) < private.session_start_ts(s.date, s.start_time)
     order by private.session_start_ts(o.date, o.start_time) desc
     limit 1;
end;
$$;
revoke all on function handover_previous(uuid, text) from public;
grant execute on function handover_previous(uuid, text) to authenticated;

-- ============================================================================
-- 5) Giao ca
-- ============================================================================
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
    raise exception 'GMV cộng dồn % nhỏ hơn số ca trước cùng phòng (ca %–% đã giao %). Ca nối: nhập đúng số TỔNG đang thấy trên dashboard.',
      p_cum_gmv, to_char(v_prev.start_time, 'HH24:MI'), to_char(v_prev.end_time, 'HH24:MI'), v_prev.cum_gmv using errcode = 'P0001';
  end if;
  select o.start_time, o.end_time, rep.cum_gmv into v_next
    from live_session_reports rep join live_sessions o on o.id = rep.session_id
   where rep.live_ref = v_ref and rep.handover_at is not null and o.id <> s.id and o.brand_id = s.brand_id
     and o.platform = s.platform and o.status <> 'Cancelled'
     and private.session_start_ts(o.date, o.start_time) > private.session_start_ts(s.date, s.start_time)
   order by private.session_start_ts(o.date, o.start_time) asc limit 1;
  if found and p_cum_gmv > v_next.cum_gmv then
    raise exception 'GMV cộng dồn % lớn hơn số ca sau cùng phòng (ca %–% đã giao %).',
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
revoke all on function submit_session_handover(uuid, text, numeric, int, int, int, numeric, int, int, int, boolean, text) from public;
grant execute on function submit_session_handover(uuid, text, numeric, int, int, int, numeric, int, int, int, boolean, text) to authenticated;

-- ============================================================================
-- 6) Nhắc giao ca: thông báo hẹn giờ
-- ============================================================================
do $$
declare c record;
begin
  for c in
    select con.conname from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace ns on ns.oid = rel.relnamespace
     where ns.nspname = 'public' and rel.relname = 'notifications' and con.contype = 'c'
       and pg_get_constraintdef(con.oid) ilike '%kind%'
  loop
    execute format('alter table notifications drop constraint %I', c.conname);
  end loop;
end $$;

alter table notifications add constraint notifications_kind_check check (kind in (
  'shift_assigned', 'shift_unassigned', 'shift_time_changed', 'shift_cancelled', 'report_reconciled',
  'shift_open', 'shift_dropout_request',
  'handover_due'            -- 0144: hết ca 15 phút mà chưa giao ca (created_at = lúc đến hạn)
));

-- Đặt lại lời nhắc của MỘT ca: xoá lời nhắc chưa đọc, tạo lại theo người + giờ hiện tại của ca.
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
    return; -- ca đã qua: không nhắc lùi (Bảng Vận Hành / Ca Của Tôi vẫn ghi "chưa giao ca")
  end if;
  v_title := format('Giao ca %s %s %s–%s', coalesce(s.brand_name, ''), s.platform, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'));
  insert into notifications (user_id, kind, title, body, session_id, brand_id, created_at)
  select p.id, 'handover_due', v_title,
         'Hết ca rồi — mở ca, dán link dashboard và gõ 3 số đang thấy để giao ca.', s.id, s.brand_id, v_due
    from profiles p
   where p.status = 'Active'
     and ((s.co_host_id is not null and p.assigned_talent_id = s.co_host_id)
          or (s.co_host_id is null and p.role in ('operations', 'admin')));
end;
$$;
revoke all on function private.sync_handover_reminder(uuid) from public;

create or replace function trg_handover_reminder() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.sync_handover_reminder(new.id);
  return new;
end;
$$;

drop trigger if exists trg_handover_reminder on live_sessions;
create trigger trg_handover_reminder
  after insert or update of date, start_time, end_time, status, co_host_id on live_sessions
  for each row execute function trg_handover_reminder();

-- "Đánh dấu tất cả đã đọc" không được nuốt lời nhắc CHƯA đến hạn.
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'Chưa đăng nhập';
  end if;
  update notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and created_at <= now()
     and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function mark_notifications_read(uuid[]) from public;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- Lời nhắc cho các ca sắp tới đã có trên lịch.
do $$
declare r record;
begin
  for r in select id from live_sessions where date >= current_date - 1 and status <> 'Cancelled' and not is_backfill loop
    perform private.sync_handover_reminder(r.id);
  end loop;
end $$;

-- ============================================================================
-- 7) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_handover_reminder') then
    raise exception '0144: thiếu trigger nhắc giao ca';
  end if;
  if (select platform from private.parse_dashboard_link('https://banhang.shopee.vn/creator-center/dashboard/live/41439111')) is distinct from 'Shopee'
     or (select live_ref from private.parse_dashboard_link('https://shop.tiktok.com/workbench/live/overview?room_id=7533461903122287366&region=vn')) is distinct from '7533461903122287366' then
    raise exception '0144: đọc link dashboard sai';
  end if;
end $$;
