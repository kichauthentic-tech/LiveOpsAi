-- 0148 — Số lúc đổi host của ca TIKTOK lấy từ FILE Creator-Live-Performance, không gõ tay (user chốt 06/10).
--
-- 0147 cho trợ gõ số TỔNG trên dashboard — đúng với Shopee (không có file lúc giao ca) nhưng sai nguyên tắc của TikTok: toàn
-- bộ snapshot TikTok phải up từ file (0078). Nay lúc host xuống, trợ up file Creator-Live-Performance như lúc giao ca; số của
-- host trước = Σ(số phòng trong file − số lần up trước cùng phòng) — CÙNG phép trừ với recompute_session_from_snapshot, nên
-- cum_* ghi vào session_segment_checkpoints là phần của ca TÍNH TỚI LÚC ĐÓ (base = 0), và số cuối ca (file giao ca) trừ ra phần
-- host sau. Phòng nào thuộc ca: cùng luật với session_room_deltas (kết thúc sau giờ vào ca, bắt đầu trước giờ đổi host).
--   * File chỉ cần lấy GMV / đơn / lượt xem; dòng gốc không lưu thêm (không đụng chuỗi snapshot của ca nối).
--   * submit_segment_checkpoint (gõ tay) từ nay CHỈ cho ca Shopee; ca TikTok bị từ chối.
-- Chạy lại nhiều lần không sao.

alter table session_segment_checkpoints alter column dashboard_link drop not null;
alter table session_segment_checkpoints alter column live_ref drop not null;
alter table session_segment_checkpoints add column if not exists source text not null default 'link' check (source in ('link', 'file'));
alter table session_segment_checkpoints add column if not exists file_name text;

-- Gõ tay chỉ còn cho Shopee: thêm vế chặn TikTok vào đầu hàm 0147 bằng cách bọc lại.
create or replace function private.reject_manual_tiktok_checkpoint() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'link' and exists (select 1 from live_sessions where id = new.session_id and platform::text = 'TikTok') then
    raise exception 'Ca TikTok: up file Creator-Live-Performance lúc host xuống, không nhập tay.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_reject_manual_tiktok_checkpoint on session_segment_checkpoints;
create trigger trg_reject_manual_tiktok_checkpoint
  before insert or update on session_segment_checkpoints
  for each row execute function private.reject_manual_tiktok_checkpoint();

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
  v_rooms int;
  v_lo record;
  v_hi record;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if s.platform::text <> 'TikTok' then
    raise exception 'Ca Shopee nhập số lúc đổi host bằng link dashboard, không dùng file TikTok.' using errcode = 'P0001';
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

  -- Mỗi phòng trong file: số cộng dồn − số lần up trước của cùng phòng (ranh giới = giờ hết ca trước đó).
  select coalesce(sum(greatest(d.gmv, 0)), 0), coalesce(sum(greatest(d.orders, 0)), 0)::int,
         coalesce(sum(greatest(d.views, 0)), 0)::bigint, count(*)::int
    into v_gmv, v_orders, v_views, v_rooms
  from (
    select c.gmv - coalesce(p.gmv, 0) as gmv, c.orders - coalesce(p.orders, 0) as orders, c.views - coalesce(p.views, 0) as views,
           c.started_at, c.ended_at
    from (
      select r->>'roomId' as room_id,
             nullif(r->>'startedAt', '')::timestamptz as started_at,
             nullif(r->>'endedAt', '')::timestamptz as ended_at,
             coalesce((r->>'gmv')::numeric, 0) as gmv,
             coalesce((r->>'orders')::int, 0) as orders,
             coalesce((r->>'views')::bigint, 0) as views
        from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r
       where coalesce(r->>'roomId', '') <> ''
    ) c
    left join lateral (
      select pr.gmv, pr.orders, pr.views
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
    s.id, p_at_min, null, null, v_gmv, v_views, v_orders, null, 0, 0, 0, 0, 'file', p_file_name,
    current_user_talent_id(), current_user_role(), now()
  )
  on conflict (session_id, at_min) do update set
    dashboard_link = null, live_ref = null, cum_gmv = excluded.cum_gmv, cum_views = excluded.cum_views, cum_orders = excluded.cum_orders,
    cum_atc = null, base_gmv = 0, base_views = 0, base_orders = 0, base_atc = 0, source = 'file', file_name = excluded.file_name,
    reported_by_talent_id = excluded.reported_by_talent_id, reported_by_role = excluded.reported_by_role, reported_at = now();

  return jsonb_build_object('session_id', s.id, 'at_min', p_at_min, 'cum_gmv', v_gmv, 'cum_orders', v_orders, 'cum_views', v_views, 'rooms', v_rooms);
end;
$$;

revoke all on function apply_segment_checkpoint_file(uuid, integer, text, jsonb) from public;
grant execute on function apply_segment_checkpoint_file(uuid, integer, text, jsonb) to authenticated;

do $$
begin
  if to_regprocedure('public.apply_segment_checkpoint_file(uuid,integer,text,jsonb)') is null then
    raise exception '0148: thiếu hàm apply_segment_checkpoint_file';
  end if;
end $$;
