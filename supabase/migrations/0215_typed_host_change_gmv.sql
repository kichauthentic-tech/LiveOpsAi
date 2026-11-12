-- 0215 — Gõ tay GMV của host xuống giữa ca khi file tải TRỄ (ca nối sau đã live):
-- file Creator-Live-Performance tải sau giờ đổi host chứa số cộng dồn tới lúc tải (vd 227M > GMV cả ca 113M) nên số "lúc đổi" sai.
-- Trợ/OPS gõ GMV đúng phần host trước (số trên dashboard lúc host xuống); đơn/lượt xem/ATC chia theo % GMV so với số file cũ.
-- source = 'typed' (không ghi đè dòng khác); tải lại file vẫn ghi đè như cũ.

alter table session_segment_checkpoints drop constraint if exists session_segment_checkpoints_source_check;
alter table session_segment_checkpoints add constraint session_segment_checkpoints_source_check check (source in ('link', 'file', 'typed'));

create or replace function set_segment_checkpoint_gmv(p_session_id uuid, p_at_min integer, p_gmv numeric)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_old session_segment_checkpoints;
  v_have boolean;
  v_ratio numeric;
  v_lo record;
  v_hi record;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới sửa số lúc đổi host được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không sửa số lúc đổi host.' using errcode = 'P0001';
  end if;
  if s.brand_id is not null and private.brand_month_published(s.brand_id, s.date) then
    raise exception 'Tháng %/% của % đã phát hành Report cho brand — số đã đóng sổ.',
      to_char(s.date, 'MM'), to_char(s.date, 'YYYY'), coalesce(nullif(s.brand_name, ''), 'brand') using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.to_min = p_at_min)
     or not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.from_min >= p_at_min) then
    raise exception 'Phút % không phải chỗ đổi host của ca này.', p_at_min using errcode = 'P0001';
  end if;
  if p_gmv is null or p_gmv < 0 then
    raise exception 'GMV phải là số không âm.' using errcode = 'P0001';
  end if;
  if coalesce(s.actual_gmv, 0) > 0 and p_gmv > s.actual_gmv then
    raise exception 'GMV lúc đổi host (%) không được lớn hơn GMV cả ca (%).', p_gmv, s.actual_gmv using errcode = 'P0001';
  end if;
  select cum_gmv, at_min into v_lo from session_segment_checkpoints where session_id = s.id and at_min < p_at_min order by at_min desc limit 1;
  if found and p_gmv < v_lo.cum_gmv then
    raise exception 'GMV nhỏ hơn số lúc đổi host trước đó (phút %: %).', v_lo.at_min, v_lo.cum_gmv using errcode = 'P0001';
  end if;
  select cum_gmv, at_min into v_hi from session_segment_checkpoints where session_id = s.id and at_min > p_at_min order by at_min asc limit 1;
  if found and p_gmv > v_hi.cum_gmv then
    raise exception 'GMV lớn hơn số lúc đổi host sau đó (phút %: %).', v_hi.at_min, v_hi.cum_gmv using errcode = 'P0001';
  end if;

  select * into v_old from session_segment_checkpoints where session_id = s.id and at_min = p_at_min;
  v_have := found;
  v_ratio := case when v_have and v_old.cum_gmv > 0 then p_gmv / v_old.cum_gmv end;

  insert into session_segment_checkpoints (
    session_id, at_min, dashboard_link, live_ref, cum_gmv, cum_views, cum_orders, cum_atc,
    base_gmv, base_views, base_orders, base_atc, source, file_name, reported_by_talent_id, reported_by_role, reported_at
  ) values (
    s.id, p_at_min, null, null, p_gmv,
    case when v_ratio is not null and v_old.cum_views is not null then round(v_old.cum_views * v_ratio)::int end,
    case when v_ratio is not null and v_old.cum_orders is not null then round(v_old.cum_orders * v_ratio)::int end,
    case when v_ratio is not null and v_old.cum_atc is not null then round(v_old.cum_atc * v_ratio)::int end,
    0, 0, 0, 0, 'typed', null, current_user_talent_id(), current_user_role(), now()
  )
  on conflict (session_id, at_min) do update set
    cum_gmv = excluded.cum_gmv, cum_views = excluded.cum_views, cum_orders = excluded.cum_orders, cum_atc = excluded.cum_atc,
    base_gmv = 0, base_views = 0, base_orders = 0, base_atc = 0, source = 'typed', file_name = null,
    reported_by_talent_id = excluded.reported_by_talent_id, reported_by_role = excluded.reported_by_role, reported_at = now();

  return jsonb_build_object('session_id', s.id, 'at_min', p_at_min, 'cum_gmv', p_gmv);
end;
$$;
revoke all on function set_segment_checkpoint_gmv(uuid, integer, numeric) from public;
grant execute on function set_segment_checkpoint_gmv(uuid, integer, numeric) to authenticated;
