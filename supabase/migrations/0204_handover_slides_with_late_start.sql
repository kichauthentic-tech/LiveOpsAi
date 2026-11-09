-- 0204 — MOC GIAO CA TRUOT THEO GIO VAO TRE CUA CHUOI CA NOI (09/11).
--
-- Quy tac user chot: host vao tre 10-15' roi tu bu cho du gio ke hoach; ca noi thi CA CHUOI TRUOT CUNG LUONG TRE, moi ca
-- giu nguyen do dai ke hoach. Vi du ca 18-21 + 21-00: host 1 live 18:10 -> 21:10 (du 3h), host 2 live 21:10 -> 00:10 (du 3h).
-- Truoc 0204 moc giao ca luon la gio ket thuc KE HOACH (21:00): file giao ca tai luc 21:10 bi cat 10' sang ca sau (0203), ca 1 hien
-- 2,8h, ca 2 nhan them 10' cua host 1.
--
-- Sua: gia tri luu o session_live_snapshots.boundary_at (moc gioi han cua moi phep cat/chia o 0174, 0195, 0203) = gio ket thuc
-- ke hoach + luong tre.
--  * Luong tre cua mot ca (private.session_lateness) = gio room dau tien bat dau trong file tru gio vao ca ke hoach, kep 0..90' (tre <= 5' coi nhu dung gio).
--  * Ca co room bat dau TRUOC gio vao ca (> 5') la room chay tiep tu ca truoc => ke thua luong tre cua ca truoc (ca truoc =
--    lien ket room, hoac ca cung brand + san ket thuc dung luc ca nay bat dau +-5').
--  * recompute_session_from_snapshot tu lam moi boundary_at truoc khi tinh (ca da doi soat khong dung toi).
--  * Ca cu da chay: tinh lai theo thu tu moc, CHI nhung ca co moc doi (ca doi soat khong dung toi, nhu 0203).
-- Khong doi: nhung gi dung gio ket thuc ke hoach ma KHONG phai moc cat (kiem lien ket ca noi, doi soat theo file san, tien cong).
-- Phu thuoc 0203. Chay lai duoc.

do $$
begin
  if to_regprocedure('private.snapshot_recompute_after(uuid)') is null then
    raise exception '0204: chay 0203 truoc.';
  end if;
end $$;

-- Ca truoc cua mot ca: lien ket room tuong minh, khong thi ca cung brand + san ket thuc dung luc ca nay bat dau (+-5').
create or replace function private.session_prev_shift(p_session_id uuid) returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select l.prev_session_id from session_room_links l where l.next_session_id = p_session_id limit 1),
    (select a.id
       from live_sessions b
       join live_sessions a on a.brand_id = b.brand_id and a.platform = b.platform and a.id <> b.id
        and a.date between b.date - 1 and b.date
      where b.id = p_session_id
        and a.status::text <> 'Cancelled'
        and not coalesce(a.excluded_from_reports, false)
        and abs(extract(epoch from (((b.date + b.start_time) at time zone 'Asia/Ho_Chi_Minh') - session_boundary_at(a.id)))) <= 300
      order by a.date desc, a.start_time desc
      limit 1)
  )
$$;
revoke all on function private.session_prev_shift(uuid) from public, anon, authenticated;

-- Luong tre (0..90') cua ca; ca co room chay tiep tu ca truoc ke thua luong tre cua ca truoc.
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
    return private.session_lateness(v_prev, p_depth + 1);
  end if;
  if v_first - v_start <= interval '5 minutes' then
    return interval '0'; -- tre <= 5' coi nhu dung gio (cung dung sai 0203)
  end if;
  return least(v_first - v_start, interval '90 minutes');
end;
$$;
revoke all on function private.session_lateness(uuid, int) from public, anon, authenticated;

create or replace function private.session_flex_boundary_at(p_session_id uuid) returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select session_boundary_at(p_session_id) + private.session_lateness(p_session_id)
$$;
revoke all on function private.session_flex_boundary_at(uuid) from public, anon, authenticated;

-- Lam moi moc luu cua snapshot (khong dung toi snapshot uoc luong cua OPS). Tra true neu moc doi.
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
   where session_id = p_session_id and not is_estimated and boundary_at is distinct from v_new;
  get diagnostics v_n = row_count;
  return v_n > 0;
end;
$$;
revoke all on function private.snapshot_refresh_boundary(uuid) from public, anon, authenticated;

-- Vá recompute_session_from_snapshot từ định nghĩa ĐANG CÓ trong DB (không lùi bản vá của migration khác).
do $$
declare
  v_def text;
  v_new text;
begin
  v_def := pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure);
  if v_def !~ 'snapshot_refresh_boundary' then
    v_new := replace(v_def,
      '  update live_sessions ls set
    actual_gmv = d.gmv,',
      '  perform private.snapshot_refresh_boundary(p_session_id); -- 0204: moc giao ca truot theo gio vao tre
  update live_sessions ls set
    actual_gmv = d.gmv,');
    if v_new = v_def then
      raise exception '0204: khong thay dong update live_sessions trong recompute_session_from_snapshot';
    end if;
    execute v_new;
  end if;
end $$;

-- Ca cu: chi ca dang lay so tu snapshot va co moc doi. Theo thu tu moc de chuoi ca noi tinh dung.
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
       and s.boundary_at is distinct from private.session_flex_boundary_at(s.session_id)
     order by s.boundary_at
  loop
    perform private.snapshot_refresh_boundary(r.session_id);
    perform private.snapshot_auto_split(r.session_id);
    perform private.snapshot_recompute_after(r.session_id);
  end loop;
end $$;

-- Chot tu kiem.
do $$
begin
  if pg_get_functiondef('public.recompute_session_from_snapshot(uuid)'::regprocedure) !~ 'snapshot_refresh_boundary' then
    raise exception '0204 DUNG: recompute_session_from_snapshot chua lam moi moc giao ca';
  end if;
  raise notice '0204 OK';
end $$;
