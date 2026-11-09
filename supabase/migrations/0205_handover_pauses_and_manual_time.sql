-- 0205 — MOC GIAO CA: TINH CA PHUT NGHI GIUA CAC ROOM + GIO GIAO CA THUC DO OPS NHAP (09/11).
--
-- Bo sung 0204 (user chot 09/11): moi ca phai du do dai ke hoach. Host vao tre 9' roi giua ca tat bat lai nghi 6' thi gio giao ca thuc
-- la 13:15 chu khong phai 13:00 — truoc 0205 ca 10-13 (room 10:09-12:10 + 12:16-13:xx) hien 165' va bi gan "off som 15p" du host live tron ca.
--
--  1) private.session_lateness = luong tre vao ca (0204) + tong cac khoang NGHI giua hai room lien tiep cua ca (tat bat lai), moi khoang
--     > 1' va <= 30'; chi tinh khoang nam sau gio bat dau room dau tien cua ca. Van kep 0..90'. Ca ke thua tre tu ca truoc thi cong them
--     phut nghi cua CHINH ca nay.
--  2) Gio giao ca thuc do ops nhap: public.set_session_handover_time(ca, gio) ghi session_live_snapshots.boundary_at + boundary_manual = true.
--     Moc nhap tay duoc uu tien hon so tu tinh (snapshot_refresh_boundary bo qua), cho phep som hon gio ke hoach toi da 90'.
--     Truyen null = xoa moc nhap tay, ve so tu tinh. Dung cho truong hop file khong cho biet gio giao that (room chay lien tuc, chi doi nguoi).
-- Phu thuoc 0204. Chay lai duoc.

do $$
begin
  if to_regprocedure('private.snapshot_refresh_boundary(uuid)') is null then
    raise exception '0205: chay 0204 truoc.';
  end if;
end $$;

alter table session_live_snapshots add column if not exists boundary_manual boolean not null default false;
comment on column session_live_snapshots.boundary_manual is
  '0205: moc giao ca (boundary_at) do ops nhap tay — khong bi tu tinh lai theo gio vao tre / phut nghi.';

-- Tong phut nghi giua cac room lien tiep cua ca (tat bat lai): moi khoang 1'..30', chi sau gio bat dau room dau tien trong ca.
create or replace function private.session_pause_interval(p_session_id uuid) returns interval
language sql
stable
security definer
set search_path = public
as $$
  with r as (
    select d.started_at, d.ended_at,
           lag(d.ended_at) over (order by d.started_at) as prev_end
      from session_room_deltas d
      join live_sessions ls on ls.id = d.session_id
     where d.session_id = p_session_id
       and d.started_at is not null
       and coalesce(d.ended_at, d.started_at) > (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh'
  )
  select coalesce(sum(r.started_at - r.prev_end), interval '0')
    from r
   where r.prev_end is not null
     and r.started_at - r.prev_end > interval '1 minute'
     and r.started_at - r.prev_end <= interval '30 minutes'
$$;
revoke all on function private.session_pause_interval(uuid) from public, anon, authenticated;

-- Luong tre (0..90') = tre vao ca (nhu 0204) + phut nghi giua room cua chinh ca nay.
create or replace function private.session_lateness(p_session_id uuid, p_depth int default 0) returns interval
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_first timestamptz;
  v_prev uuid;
  v_base interval;
begin
  if p_depth > 8 then
    return interval '0';
  end if;
  select (ls.date + ls.start_time) at time zone 'Asia/Ho_Chi_Minh' into v_start from live_sessions ls where ls.id = p_session_id;
  if v_start is null then
    return interval '0';
  end if;
  select min(d.started_at) into v_first from session_room_deltas d where d.session_id = p_session_id and d.started_at is not null;
  if v_first is null then
    return interval '0';
  end if;
  if v_first < v_start - interval '5 minutes' then
    v_prev := private.session_prev_shift(p_session_id);
    if v_prev is null then
      return interval '0'; -- host bat som, khong co ca truoc
    end if;
    -- Ke thua tre cua ca truoc (khong cong phut nghi cua ca truoc nua: luong da nam trong tre do), cong phut nghi cua ca nay.
    v_base := private.session_lateness(v_prev, p_depth + 1);
  elsif v_first - v_start <= interval '5 minutes' then
    v_base := interval '0'; -- tre <= 5' coi nhu dung gio
  else
    v_base := least(v_first - v_start, interval '90 minutes');
  end if;
  return least(v_base + private.session_pause_interval(p_session_id), interval '90 minutes');
end;
$$;
revoke all on function private.session_lateness(uuid, int) from public, anon, authenticated;

-- Moc nhap tay khong bi tinh lai.
create or replace function private.snapshot_refresh_boundary(p_session_id uuid) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new timestamptz;
  v_n int;
begin
  v_new := private.session_flex_boundary_at(p_session_id);
  if v_new is null then
    return false;
  end if;
  update session_live_snapshots set boundary_at = v_new
   where session_id = p_session_id and not is_estimated and not boundary_manual and boundary_at is distinct from v_new;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function private.snapshot_refresh_boundary(uuid) from public, anon, authenticated;

-- Ops nhap gio giao ca thuc (null = bo, ve so tu tinh). Som/tre toi da 90' so voi gio ket thuc ke hoach.
create or replace function set_session_handover_time(p_session_id uuid, p_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap session_live_snapshots;
  v_plan timestamptz;
begin
  if not can_edit_session_snapshot(p_session_id) then
    raise exception 'Chỉ Host/Trợ live của ca này hoặc ceo/admin/operations mới sửa được giờ giao ca.';
  end if;
  select * into v_snap from session_live_snapshots where session_id = p_session_id for update;
  if not found then
    raise exception 'Ca này chưa có file số liệu — tải file lên trước rồi mới nhập giờ giao ca.';
  end if;
  if v_snap.is_estimated then
    raise exception 'Ca này đang dùng số ước lượng của OPS — chưa có file thật để cắt theo giờ giao ca.';
  end if;
  if p_at is null then
    update session_live_snapshots set boundary_manual = false where id = v_snap.id;
    perform private.snapshot_refresh_boundary(p_session_id);
  else
    v_plan := session_boundary_at(p_session_id);
    if abs(extract(epoch from (p_at - v_plan))) > 90 * 60 then
      raise exception 'Giờ giao ca lệch quá 90 phút so với giờ kết thúc kế hoạch.';
    end if;
    update session_live_snapshots set boundary_at = p_at, boundary_manual = true where id = v_snap.id;
  end if;
  perform private.snapshot_auto_split(p_session_id);
  perform private.snapshot_recompute_after(p_session_id);
end;
$$;
revoke all on function set_session_handover_time(uuid, timestamptz) from public;
grant execute on function set_session_handover_time(uuid, timestamptz) to authenticated;

-- Ca cu: chi ca dang lay so tu snapshot va co moc doi (ca doi soat khong dung toi, nhu 0204). Theo thu tu moc.
do $$
declare
  r record;
begin
  for r in
    select s.session_id
      from session_live_snapshots s
      join live_sessions ls on ls.id = s.session_id
     where ls.data_source::text = 'live_snapshot'
       and not s.is_estimated
       and not s.boundary_manual
       and s.boundary_at is distinct from private.session_flex_boundary_at(s.session_id)
     order by s.boundary_at
  loop
    perform private.snapshot_refresh_boundary(r.session_id);
    perform private.snapshot_auto_split(r.session_id);
    perform private.snapshot_recompute_after(r.session_id);
  end loop;
end $$;

do $$
begin
  if to_regprocedure('private.session_pause_interval(uuid)') is null
     or to_regprocedure('public.set_session_handover_time(uuid,timestamptz)') is null then
    raise exception '0205 DUNG: thieu ham';
  end if;
  raise notice '0205 OK';
end $$;
