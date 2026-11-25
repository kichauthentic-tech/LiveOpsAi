-- 0233 — Điều Phối Lịch Live: MỞ LẠI CA ĐÃ HUỶ + XẾP NGƯỜI THEO ĐOẠN (25/11)
--
-- User: "cho logic mở lại ca đã huỷ đi", "thay đổi nhân sự tại ca đã chốt tại Điều Phối", "xếp người theo đoạn ở Điều Phối luôn".
-- Trước 0233: ca huỷ (0097/0113) chỉ vẽ gạch ngang trên lưới, không đường nào đưa về; ca chia đoạn (0138) chỉ sửa ở Cửa sổ Ca Live
-- (không lý do bắt buộc, không vào sổ roster_changes, người chỉ có tên ở một đoạn không nhận tin).
--
-- 1) roster_changes.kind thêm 'restore' (mở lại ca huỷ) và 'segments' (xếp người theo đoạn).
-- 2) roster_reopen_cancelled(ca, lý do, host, trợ):
--    · có host  ⇒ KHÔI PHỤC chính ca đó: status Upcoming, xoá lý do huỷ, gắn host/trợ (giữ người cũ hoặc người khác), slot của ca về
--      'finalized' (slot vẫn trỏ ca — huỷ thường) hoặc nhận lại ca mở cùng khung (huỷ kiểu "mở lại ca chờ đăng ký" 0113). Trùng người do
--      guard_person_clash (0178: khôi phục ca huỷ kiểm lại cả host/trợ/đoạn) chặn. Người giữ nguyên nhận tin "Ca được mở lại" (trigger 0083
--      chỉ báo khi host_id đổi); tin "không còn là Host" sinh ra trong lúc khôi phục bị xoá — họ đã nhận tin huỷ ca rồi.
--    · không host ⇒ MỞ LẠI THÀNH CA MỞ để xếp người: slot của ca về 'open' (nhả session_id), không có slot (ca nhập từ sheet) thì tạo ca
--      mở mới đúng khung/phòng. Ca huỷ giữ làm lịch sử; client ẩn gạch ngang khi đã có ca sống cùng khung (buildCancelledShifts).
--      0219 tự nối lại dòng Kế Hoạch Tháng mồ côi nên target không mất.
--    Chỉ ca từ hôm nay trở đi; tháng đã phát hành report do guard_published_month_sessions chặn như mọi lần sửa ca.
-- 3) roster_set_segments(ca, đoạn, lý do): vỏ của set_session_staff_segments (0138, đã nhận trainer từ 0176) cho Điều Phối — lý do bắt
--    buộc, chỉ ca chưa qua, ghi roster_changes, và báo đúng người: vào ca / ra khỏi ca / đổi giờ đoạn của mình (tin của trigger 0083
--    theo "người chính" bị thay bằng tin theo từng người, vì người chính đổi khi đoạn dài hơn không có nghĩa người cũ bị rút).

-- ============================================================================
-- 1) Loại thay đổi trong nhật ký
-- ============================================================================
alter table public.roster_changes drop constraint if exists roster_changes_kind_check;
alter table public.roster_changes add constraint roster_changes_kind_check
  check (kind in ('reassign', 'move', 'restore', 'segments'));

-- ============================================================================
-- 2) Mở lại ca đã huỷ
-- ============================================================================
create or replace function public.roster_reopen_cancelled(p_session_id uuid, p_reason text, p_host_id uuid default null, p_co_host_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_row live_sessions;
  v_slot_id uuid;
  v_open_id uuid;
  v_new_slot uuid;
  v_host text;
  v_co text := '';
  v_label text;
begin
  perform private.roster_staff_guard();
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Ghi lý do mở lại ca.';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status <> 'Cancelled' then
    raise exception 'Ca này không ở trạng thái huỷ.';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca ngày đã qua — không mở lại được.';
  end if;
  if exists (
    select 1 from live_sessions x
     where x.id <> p_session_id and x.status <> 'Cancelled'
       and x.brand_id is not distinct from v_s.brand_id and x.platform = v_s.platform
       and x.date = v_s.date and x.start_time = v_s.start_time and x.end_time = v_s.end_time
  ) then
    raise exception 'Đã có ca % % % cùng khung giờ đang chạy — sửa ở ca đó.', v_s.brand_name, to_char(v_s.date, 'DD/MM'), to_char(v_s.start_time, 'HH24:MI');
  end if;

  -- Slot của ca: vẫn trỏ ca (huỷ thường, status 'cancelled') hoặc đã nhả thành ca mở cùng khung (0113 / OP tạo lại).
  select id into v_slot_id from shift_slots where session_id = p_session_id order by updated_at desc limit 1 for update;
  if v_slot_id is null then
    select id into v_open_id from shift_slots
     where status = 'open' and session_id is null
       and brand_id is not distinct from v_s.brand_id and platform = v_s.platform
       and date = v_s.date and start_time = v_s.start_time and end_time = v_s.end_time
     order by created_at limit 1 for update;
  end if;

  if p_host_id is null then
    -- ===== Mở lại thành ca mở =====
    if v_open_id is not null then
      raise exception 'Đã có ca mở cùng khung giờ — xếp người ở ca mở đó.';
    end if;
    if v_slot_id is not null then
      update shift_slots set status = 'open', session_id = null where id = v_slot_id;
      v_new_slot := v_slot_id;
    else
      insert into shift_slots (date, start_time, end_time, brand_id, brand_name, platform, studio_id, studio_name, status, created_by)
      values (v_s.date, v_s.start_time, v_s.end_time, v_s.brand_id, coalesce(v_s.brand_name, ''), v_s.platform, v_s.studio_id,
              coalesce(v_s.studio_name, ''), 'open', auth.uid())
      returning id into v_new_slot;
    end if;
    insert into roster_changes (session_id, kind, reason, before, after, changed_by)
    values (p_session_id, 'restore', btrim(p_reason),
      jsonb_build_object('status', 'Cancelled', 'cancel_reason', v_s.cancel_reason, 'host_id', v_s.host_id, 'host_name', v_s.host_name,
                         'co_host_id', v_s.co_host_id, 'co_host_name', v_s.co_host_name),
      jsonb_build_object('mode', 'open', 'slot_id', v_new_slot),
      auth.uid());
    return jsonb_build_object('mode', 'open', 'session_id', p_session_id, 'slot_id', v_new_slot);
  end if;

  -- ===== Khôi phục chính ca =====
  if p_co_host_id is not null and p_co_host_id = p_host_id then
    raise exception 'Host và Trợ live phải là hai người khác nhau.';
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

  update live_sessions
     set status = 'Upcoming', cancel_reason = '', cancelled_at = null,
         host_id = p_host_id, host_name = v_host, co_host_id = p_co_host_id, co_host_name = coalesce(v_co, '')
   where id = p_session_id
  returning * into v_row;

  if v_slot_id is not null then
    update shift_slots set status = 'finalized' where id = v_slot_id;
  elsif v_open_id is not null then
    update shift_slots set status = 'finalized', session_id = p_session_id where id = v_open_id;
    delete from roster_drafts where slot_id = v_open_id;
    v_slot_id := v_open_id;
  end if;

  -- Người cũ bị thay đã nhận tin "ca bị huỷ" — bỏ tin "không còn là Host/Trợ" trigger vừa sinh. Người giữ nguyên: trigger không báo
  -- (host_id không đổi) ⇒ báo "ca được mở lại".
  delete from notifications
   where kind = 'shift_unassigned' and session_id = p_session_id and created_at >= transaction_timestamp();
  v_label := session_label(v_row);
  if p_host_id is not distinct from v_s.host_id then
    perform notify_talent(p_host_id, 'shift_assigned', 'Ca của bạn được mở lại (Host)', v_label, p_session_id, v_row.brand_id);
  end if;
  if p_co_host_id is not null and p_co_host_id is not distinct from v_s.co_host_id then
    perform notify_talent(p_co_host_id, 'shift_assigned', 'Ca của bạn được mở lại (Trợ live)', v_label, p_session_id, v_row.brand_id);
  end if;

  insert into roster_changes (session_id, kind, reason, before, after, changed_by)
  values (p_session_id, 'restore', btrim(p_reason),
    jsonb_build_object('status', 'Cancelled', 'cancel_reason', v_s.cancel_reason, 'host_id', v_s.host_id, 'host_name', v_s.host_name,
                       'co_host_id', v_s.co_host_id, 'co_host_name', v_s.co_host_name),
    jsonb_build_object('mode', 'session', 'slot_id', v_slot_id, 'host_id', p_host_id, 'host_name', v_host,
                       'co_host_id', p_co_host_id, 'co_host_name', coalesce(v_co, '')),
    auth.uid());
  return jsonb_build_object('mode', 'session', 'session_id', p_session_id, 'slot_id', v_slot_id);
end;
$$;
revoke all on function public.roster_reopen_cancelled(uuid, text, uuid, uuid) from public;
grant execute on function public.roster_reopen_cancelled(uuid, text, uuid, uuid) to authenticated;

-- ============================================================================
-- 3) Xếp người theo đoạn ở Điều Phối
-- ============================================================================
-- Giờ đứng của từng người trong ca, dạng chữ ("Host 18:00–20:00, Trợ cả ca"). Vai không có đoạn ⇒ người chính làm cả ca (như client
-- effectiveSegments).
create or replace function private.roster_people_ranges(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with s as (select * from live_sessions where id = p_session_id),
  segs as (select g.talent_id, g.role, g.from_min, g.to_min from session_staff_segments g where g.session_id = p_session_id),
  base as (
    select talent_id, role, from_min, to_min from segs
    union all
    select s.host_id, 'host', 0, null::int from s
     where s.host_id is not null and not exists (select 1 from segs where role = 'host')
    union all
    select s.co_host_id, 'co_host', 0, null::int from s
     where s.co_host_id is not null and not exists (select 1 from segs where role = 'co_host')
  ),
  per as (
    select b.talent_id,
           string_agg(
             case when b.role = 'host' then 'Host ' else 'Trợ ' end
               || case when b.to_min is null then 'cả ca'
                       else to_char(s.start_time + make_interval(mins => b.from_min), 'HH24:MI') || '–'
                         || to_char(s.start_time + make_interval(mins => b.to_min), 'HH24:MI') end,
             ', ' order by b.role desc, b.from_min) as ranges
      from base b cross join s
     group by b.talent_id
  )
  select coalesce(jsonb_object_agg(talent_id::text, ranges), '{}'::jsonb) from per;
$$;
revoke all on function private.roster_people_ranges(uuid) from public;

create or replace function public.roster_set_segments(p_session_id uuid, p_segments jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_row live_sessions;
  v_before jsonb;
  v_after jsonb;
  v_before_segs jsonb;
  v_res jsonb;
  v_label text;
  v_key text;
  v_b text;
  v_a text;
begin
  perform private.roster_staff_guard();
  if p_reason is null or length(btrim(p_reason)) = 0 then
    raise exception 'Ghi lý do xếp người theo đoạn.';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status = 'Cancelled' then
    raise exception 'Ca đã huỷ.';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca ngày đã qua — sửa người theo đoạn ở Cửa sổ Ca Live.';
  end if;

  v_before := private.roster_people_ranges(p_session_id);
  select coalesce(jsonb_agg(jsonb_build_object('talent_id', g.talent_id, 'talent_name', g.talent_name, 'role', g.role,
                                               'from_min', g.from_min, 'to_min', g.to_min) order by g.role, g.from_min), '[]'::jsonb)
    into v_before_segs
    from session_staff_segments g where g.session_id = p_session_id;

  v_res := set_session_staff_segments(p_session_id, p_segments);

  select * into v_row from live_sessions where id = p_session_id;
  v_after := private.roster_people_ranges(p_session_id);

  -- Tin theo từng người thay cho tin "người chính" của trigger 0083.
  delete from notifications
   where kind in ('shift_assigned', 'shift_unassigned') and session_id = p_session_id and created_at >= transaction_timestamp();
  v_label := session_label(v_row);
  for v_key in select k from jsonb_object_keys(v_before) k union select k from jsonb_object_keys(v_after) k loop
    v_b := v_before ->> v_key;
    v_a := v_after ->> v_key;
    if v_b is null then
      perform notify_talent(v_key::uuid, 'shift_assigned', 'Bạn được xếp vào ca', v_label || ' · ' || v_a, p_session_id, v_row.brand_id);
    elsif v_a is null then
      perform notify_talent(v_key::uuid, 'shift_unassigned', 'Bạn không còn trong ca này', v_label, p_session_id, v_row.brand_id);
    elsif v_a <> v_b then
      perform notify_talent(v_key::uuid, 'shift_time_changed', 'Giờ của bạn trong ca đổi', v_label || ' · ' || v_a, p_session_id, v_row.brand_id);
    end if;
  end loop;

  insert into roster_changes (session_id, kind, reason, before, after, changed_by)
  values (p_session_id, 'segments', btrim(p_reason),
    jsonb_build_object('segments', v_before_segs, 'people', v_before, 'host_id', v_s.host_id, 'host_name', v_s.host_name,
                       'co_host_id', v_s.co_host_id, 'co_host_name', v_s.co_host_name),
    jsonb_build_object('segments', coalesce(p_segments, '[]'::jsonb), 'people', v_after, 'host_id', v_row.host_id, 'host_name', v_row.host_name,
                       'co_host_id', v_row.co_host_id, 'co_host_name', v_row.co_host_name),
    auth.uid());
  return v_res;
end;
$$;
revoke all on function public.roster_set_segments(uuid, jsonb, text) from public;
grant execute on function public.roster_set_segments(uuid, jsonb, text) to authenticated;

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if to_regprocedure('public.roster_reopen_cancelled(uuid,text,uuid,uuid)') is null
     or to_regprocedure('public.roster_set_segments(uuid,jsonb,text)') is null
     or to_regprocedure('private.roster_people_ranges(uuid)') is null then
    raise exception '0233 tự kiểm: thiếu hàm';
  end if;
  if position('restore' in pg_get_constraintdef((select oid from pg_constraint where conname = 'roster_changes_kind_check'))) = 0 then
    raise exception '0233 tự kiểm: roster_changes.kind chưa nhận restore';
  end if;
end $$;

notify pgrst, 'reload schema';
