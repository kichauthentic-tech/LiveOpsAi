-- 0147 — Đổi HOST giữa ca: mỗi lần đổi host có MỘT báo cáo số riêng ("số lúc đổi host"), trợ live up ngay khi host xuống.
--
-- Vấn đề (06/10): 0138 chia GMV/view của ca cho từng host theo GIỜ đứng ca (host A 60p, host B 90p ⇒ 40%/60%). Đó là số
-- ước lượng — host A có thể bán 80% trong 60 phút đầu. Số thật chỉ biết được nếu ai đó chụp số TỔNG trên dashboard đúng
-- lúc host A xuống. Quy ước vận hành (user chốt 06/10): khi đổi host giữa ca thì có HAI chỗ nhập report riêng — (1) số
-- lúc host này xuống (bảng này), (2) giao ca cuối ca như thường (host sau = số cuối − số lúc đổi).
--
-- Cách làm: bảng session_segment_checkpoints, mỗi dòng = một lần đổi host, khoá theo (ca, phút đổi tính từ giờ bắt đầu
-- ca = to_min của đoạn host trước). Số là số TỔNG đang thấy trên dashboard (cùng cách nhập với giao ca, 0144) + link phòng
-- để app tìm ca nối cùng phòng và trừ ra "số nền" (base_*) — để số của host đầu không dính ca trước.
--   * Khoá theo phút đổi chứ không theo đoạn: sửa tên host/trợ ở "Đổi người giữa ca" (xoá-ghi lại cả đoạn, 0138) KHÔNG
--     làm mất số đã up, miễn phút đổi giữ nguyên. Dòng mồ côi (phút không còn là chỗ đổi host) bị client bỏ qua.
--   * Ghi CHỈ qua RPC submit_segment_checkpoint (quyền = quyền giao ca: trợ live của ca / OPS khi ca không trợ).
--   * Không đụng tiền: lương vẫn là rate giờ x giờ của từng người (không hoa hồng GMV). Số này chỉ để gán GMV/view/đơn cho
--     đúng host ở các thước hiệu suất (hostPortions).
-- Thứ tự deploy: chạy migration TRƯỚC khi deploy client mới (client cũ không đọc bảng này; client mới thiếu bảng thì coi như
-- chưa có số lúc đổi host và quay về chia theo giờ). Chạy lại nhiều lần không sao.

create table if not exists session_segment_checkpoints (
  session_id uuid not null references live_sessions(id) on delete cascade,
  at_min integer not null check (at_min > 0),
  dashboard_link text not null,
  live_ref text not null,
  cum_gmv numeric not null check (cum_gmv >= 0),
  cum_views integer check (cum_views >= 0),
  cum_orders integer check (cum_orders >= 0),
  cum_atc integer check (cum_atc >= 0),
  -- Số TỔNG của ca nối trước cùng phòng (0 nếu phòng mới): phần của ca = cum − base.
  base_gmv numeric not null default 0,
  base_views integer not null default 0,
  base_orders integer not null default 0,
  base_atc integer not null default 0,
  reported_by_talent_id uuid,
  reported_by_role text,
  reported_at timestamptz not null default now(),
  primary key (session_id, at_min)
);

-- Talent đang đứng ca này (cột host/trợ hoặc một đoạn). security definer để policy của session_staff_segments không đệ quy vào chính nó.
create or replace function private.talent_on_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select current_user_talent_id() is not null
     and (exists (select 1 from live_sessions ls where ls.id = p_session_id and current_user_talent_id() in (ls.host_id, ls.co_host_id))
          or exists (select 1 from session_staff_segments g where g.session_id = p_session_id and g.talent_id = current_user_talent_id()));
$$;
revoke all on function private.talent_on_session(uuid) from public;
grant execute on function private.talent_on_session(uuid) to authenticated;

alter table session_segment_checkpoints enable row level security;

drop policy if exists session_segment_checkpoints_read on session_segment_checkpoints;
create policy session_segment_checkpoints_read on session_segment_checkpoints
  for select to authenticated
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or ((select current_user_role()) = 'talent' and private.talent_on_session(session_id))
  );

revoke all on session_segment_checkpoints from anon;
revoke insert, update, delete on session_segment_checkpoints from authenticated;
grant select on session_segment_checkpoints to authenticated;

-- Trợ live phải thấy ĐỦ đoạn của ca mình trợ (kể cả đoạn host) để biết lúc nào host đổi — 0138 chỉ cho talent thấy đoạn của
-- chính họ nên trợ không thấy chỗ host đổi và không có chỗ nhập số.
drop policy if exists session_staff_segments_read on session_staff_segments;
create policy session_staff_segments_read on session_staff_segments
  for select to authenticated
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or ((select current_user_role()) = 'talent' and private.talent_on_session(session_id))
  );

-- ============================================================================
-- RPC: nhập / sửa số lúc đổi host
-- ============================================================================
create or replace function submit_segment_checkpoint(
  p_session_id uuid,
  p_at_min integer,
  p_link text,
  p_cum_gmv numeric,
  p_cum_views integer default null,
  p_cum_orders integer default null,
  p_cum_atc integer default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
  v_platform text;
  v_ref text;
  v_prev record;
  v_lo record;
  v_hi record;
  v_rep record;
  v_base_gmv numeric := 0;
  v_base_views int := 0;
  v_base_orders int := 0;
  v_base_atc int := 0;
begin
  select * into s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới nhập số lúc đổi host được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không nhập số lúc đổi host.' using errcode = 'P0001';
  end if;
  if s.brand_id is not null and private.brand_month_published(s.brand_id, s.date) then
    raise exception 'Tháng %/% của % đã phát hành Report cho brand — số đã đóng sổ.',
      to_char(s.date, 'MM'), to_char(s.date, 'YYYY'), coalesce(nullif(s.brand_name, ''), 'brand') using errcode = 'P0001';
  end if;

  -- Phút đổi phải đúng là chỗ host đổi: có đoạn host kết thúc đúng phút này và còn đoạn host sau đó.
  if not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.to_min = p_at_min)
     or not exists (select 1 from session_staff_segments g where g.session_id = s.id and g.role = 'host' and g.from_min >= p_at_min) then
    raise exception 'Phút % không phải chỗ đổi host của ca này. Khai báo người đứng ca ở "Đổi người giữa ca" trước.', p_at_min using errcode = 'P0001';
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

  -- Số nền: ca nối trước cùng phòng (cùng cách chọn với handover_previous).
  select rep.cum_gmv, rep.cum_views, rep.cum_orders, rep.cum_atc into v_prev
    from live_session_reports rep join live_sessions o on o.id = rep.session_id
   where rep.live_ref = v_ref and rep.handover_at is not null and o.id <> s.id and o.brand_id = s.brand_id
     and o.platform = s.platform and o.status <> 'Cancelled'
     and private.session_start_ts(o.date, o.start_time) < private.session_start_ts(s.date, s.start_time)
   order by private.session_start_ts(o.date, o.start_time) desc limit 1;
  if found then
    v_base_gmv := coalesce(v_prev.cum_gmv, 0);
    v_base_views := coalesce(v_prev.cum_views, 0);
    v_base_orders := coalesce(v_prev.cum_orders, 0);
    v_base_atc := coalesce(v_prev.cum_atc, 0);
  end if;
  if p_cum_gmv < v_base_gmv then
    raise exception 'GMV % nhỏ hơn số ca trước cùng phòng đã giao (%). Nhập đúng số TỔNG đang thấy trên dashboard.', p_cum_gmv, v_base_gmv using errcode = 'P0001';
  end if;

  -- Số phải tăng dần theo thời gian: lần đổi host sau ≥ lần trước, và ≤ số giao ca cuối (nếu đã giao).
  select cum_gmv, at_min into v_lo from session_segment_checkpoints where session_id = s.id and at_min < p_at_min order by at_min desc limit 1;
  if found and p_cum_gmv < v_lo.cum_gmv then
    raise exception 'GMV % nhỏ hơn số lúc đổi host trước đó (phút %: %). Số TỔNG chỉ tăng theo thời gian.', p_cum_gmv, v_lo.at_min, v_lo.cum_gmv using errcode = 'P0001';
  end if;
  select cum_gmv, at_min into v_hi from session_segment_checkpoints where session_id = s.id and at_min > p_at_min order by at_min asc limit 1;
  if found and p_cum_gmv > v_hi.cum_gmv then
    raise exception 'GMV % lớn hơn số lúc đổi host sau đó (phút %: %).', p_cum_gmv, v_hi.at_min, v_hi.cum_gmv using errcode = 'P0001';
  end if;
  select cum_gmv, live_ref, handover_at into v_rep from live_session_reports where session_id = s.id;
  if found and v_rep.handover_at is not null and v_rep.cum_gmv is not null and v_rep.live_ref = v_ref and p_cum_gmv > v_rep.cum_gmv then
    raise exception 'GMV % lớn hơn số giao ca cuối ca đã nhập (%). Kiểm lại số hoặc sửa giao ca.', p_cum_gmv, v_rep.cum_gmv using errcode = 'P0001';
  end if;

  insert into session_segment_checkpoints (
    session_id, at_min, dashboard_link, live_ref, cum_gmv, cum_views, cum_orders, cum_atc,
    base_gmv, base_views, base_orders, base_atc, reported_by_talent_id, reported_by_role, reported_at
  ) values (
    s.id, p_at_min, p_link, v_ref, p_cum_gmv, p_cum_views, p_cum_orders, p_cum_atc,
    v_base_gmv, v_base_views, v_base_orders, v_base_atc, current_user_talent_id(), current_user_role(), now()
  )
  on conflict (session_id, at_min) do update set
    dashboard_link = excluded.dashboard_link, live_ref = excluded.live_ref,
    cum_gmv = excluded.cum_gmv, cum_views = excluded.cum_views, cum_orders = excluded.cum_orders, cum_atc = excluded.cum_atc,
    base_gmv = excluded.base_gmv, base_views = excluded.base_views, base_orders = excluded.base_orders, base_atc = excluded.base_atc,
    reported_by_talent_id = excluded.reported_by_talent_id, reported_by_role = excluded.reported_by_role, reported_at = now();

  return jsonb_build_object('session_id', s.id, 'at_min', p_at_min, 'base_gmv', v_base_gmv);
end;
$$;

revoke all on function submit_segment_checkpoint(uuid, integer, text, numeric, integer, integer, integer) from public;
grant execute on function submit_segment_checkpoint(uuid, integer, text, numeric, integer, integer, integer) to authenticated;

do $$
begin
  if to_regclass('public.session_segment_checkpoints') is null then
    raise exception '0147: thiếu bảng session_segment_checkpoints';
  end if;
  if to_regprocedure('public.submit_segment_checkpoint(uuid,integer,text,numeric,integer,integer,integer)') is null then
    raise exception '0147: thiếu hàm submit_segment_checkpoint';
  end if;
end $$;
