-- 0143: Chặn xếp MỘT người vào hai ca cùng giờ (host hoặc trợ live, mọi brand, mọi sàn).
--
-- User chốt 06/10: một người chỉ đứng một ca tại một thời điểm. Trước bản này chỉ UI kiểm (lúc sửa từng ca), nên lịch
-- nạp hàng loạt T10 (330 ca) đi qua với 24 cặp trùng người + 3 ca một người vừa host vừa trợ mà không ai biết.
--
-- Luật (giống lib/scheduling/conflicts.ts):
--   - khoảng một người đứng ca = cả ca nếu ca không chia đoạn; ca "đổi người giữa ca" (0138) = đúng đoạn của họ;
--   - giao nhau MỞ (chạm mép không tính), ca qua đêm tính sang ngày sau;
--   - bỏ ca đã huỷ và ca nạp bù (is_backfill: lịch sử đọc từ file, không phải lịch xếp).
-- Chỉ kiểm người mà lần ghi này ĐƯA VÀO ca (thêm ca, đổi host/trợ) hoặc mọi người của ca khi dời ngày/giờ/khôi phục
-- trạng thái. Ca đang trùng sẵn vẫn sửa được phần khác (đổi phòng, nhập số) — để ops gỡ từng chỗ trùng không bị kẹt.
--
-- Deploy: độc lập với client (client mới đã tự chặn trên UI; client cũ gặp lỗi P0001 sẽ hiện câu lỗi bằng toast).

-- ============================================================================
-- 1) Các khoảng thời gian từng người đứng ca
-- ============================================================================
create or replace function private.person_windows(
  p_session_id uuid, p_date date, p_start time, p_end time, p_host uuid, p_co uuid
) returns table (talent_id uuid, from_ts timestamp, to_ts timestamp)
language sql
stable
set search_path = public
as $$
  with base as (
    select (p_date + p_start)::timestamp as t0,
           (extract(epoch from (p_end - p_start)) / 60)::int
             + case when p_end <= p_start then 1440 else 0 end as dur
  ),
  segs as (
    select g.talent_id, g.role, g.from_min, g.to_min
      from session_staff_segments g
     where g.session_id = p_session_id
  ),
  eff as (
    select s.talent_id, s.from_min, s.to_min from segs s
    union all
    select p_host, 0, (select dur from base)
     where p_host is not null and not exists (select 1 from segs where role = 'host')
    union all
    select p_co, 0, (select dur from base)
     where p_co is not null and not exists (select 1 from segs where role = 'co_host')
  )
  select e.talent_id, b.t0 + make_interval(mins => e.from_min), b.t0 + make_interval(mins => e.to_min)
    from eff e cross join base b;
$$;

revoke all on function private.person_windows(uuid, date, time, time, uuid, uuid) from public;

-- Câu lỗi cho ca đầu tiên (khác p_session_id) mà người này đang đứng trong khoảng [p_from, p_to); null = rảnh.
create or replace function private.person_clash_message(
  p_session_id uuid, p_talent uuid, p_from timestamp, p_to timestamp
) returns text
language sql
stable
set search_path = public
as $$
  select format('Trùng người: %s đã có ca %s %s ngày %s %s–%s — một người chỉ đứng một ca tại một thời điểm.',
                coalesce(t.name, 'người này'), coalesce(o.brand_name, ''), o.platform,
                to_char(o.date, 'DD/MM'), to_char(o.start_time, 'HH24:MI'), to_char(o.end_time, 'HH24:MI'))
    from live_sessions o
    join lateral private.person_windows(o.id, o.date, o.start_time, o.end_time, o.host_id, o.co_host_id) w
      on w.talent_id = p_talent
    left join talents t on t.id = p_talent
   where o.id <> p_session_id
     and o.status <> 'Cancelled'
     and not o.is_backfill
     and o.date between (p_from::date - 1) and p_to::date
     and (o.host_id = p_talent or o.co_host_id = p_talent
          or exists (select 1 from session_staff_segments g where g.session_id = o.id and g.talent_id = p_talent))
     and w.from_ts < p_to and p_from < w.to_ts
   order by o.date, o.start_time
   limit 1;
$$;

revoke all on function private.person_clash_message(uuid, uuid, timestamp, timestamp) from public;

-- ============================================================================
-- 2) Trigger trên live_sessions: thêm ca, đổi người, dời giờ
-- ============================================================================
-- security definer: phải thấy MỌI ca (RLS của người ghi có thể che ca brand khác); chỉ đọc, không ghi gì.
create or replace function guard_person_clash() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check uuid[];
  v_msg text;
  w record;
begin
  if new.status = 'Cancelled' or new.is_backfill then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.date is distinct from old.date
     or new.start_time is distinct from old.start_time
     or new.end_time is distinct from old.end_time
     or new.status is distinct from old.status then
    v_check := array_remove(array[new.host_id, new.co_host_id], null)
               || array(select g.talent_id from session_staff_segments g where g.session_id = new.id);
  else
    v_check := array_remove(array[
      case when new.host_id is distinct from old.host_id then new.host_id end,
      case when new.co_host_id is distinct from old.co_host_id then new.co_host_id end
    ], null);
  end if;

  if coalesce(cardinality(v_check), 0) = 0 then
    return new;
  end if;

  if new.host_id is not null and new.host_id = new.co_host_id and new.host_id = any(v_check)
     and not exists (select 1 from session_staff_segments g where g.session_id = new.id) then
    raise exception 'Trùng người: % vừa là Host vừa là Trợ live của cùng một ca.',
      coalesce((select name from talents where id = new.host_id), 'người này')
      using errcode = 'P0001';
  end if;

  for w in
    select pw.talent_id, pw.from_ts, pw.to_ts
      from private.person_windows(new.id, new.date, new.start_time, new.end_time, new.host_id, new.co_host_id) pw
     where pw.talent_id = any(v_check)
  loop
    v_msg := private.person_clash_message(new.id, w.talent_id, w.from_ts, w.to_ts);
    if v_msg is not null then
      raise exception '%', v_msg using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_guard_person_clash on live_sessions;
create trigger trg_guard_person_clash
  before insert or update of date, start_time, end_time, status, host_id, co_host_id on live_sessions
  for each row execute function guard_person_clash();

-- ============================================================================
-- 3) Trigger trên session_staff_segments: đoạn "đổi người giữa ca" mới ghi
-- ============================================================================
-- set_session_staff_segments (0138) xoá rồi ghi lại các đoạn; người chính của ca không đổi thì trigger trên
-- live_sessions không chạy — nên kiểm ngay từng đoạn được ghi.
create or replace function guard_segment_person_clash() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  v_from timestamp;
  v_to timestamp;
  v_msg text;
begin
  select id, date, start_time, status, is_backfill into s from live_sessions where id = new.session_id;
  if not found or s.status = 'Cancelled' or s.is_backfill then
    return new;
  end if;
  v_from := (s.date + s.start_time)::timestamp + make_interval(mins => new.from_min);
  v_to := (s.date + s.start_time)::timestamp + make_interval(mins => new.to_min);
  v_msg := private.person_clash_message(new.session_id, new.talent_id, v_from, v_to);
  if v_msg is not null then
    raise exception '%', v_msg using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_segment_person_clash on session_staff_segments;
create trigger trg_guard_segment_person_clash
  after insert on session_staff_segments
  for each row execute function guard_segment_person_clash();

-- ============================================================================
-- 4) Chốt tự kiểm
-- ============================================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_person_clash')
     or not exists (select 1 from pg_trigger where tgname = 'trg_guard_segment_person_clash') then
    raise exception '0143: thiếu trigger chặn trùng người';
  end if;
end $$;
