-- 0160: cho phép GIỮ một ca trùng người có chủ đích (cờ `allow_person_clash`).
--
-- 0143 chặn cứng "một người một ca một lúc". Thực tế lịch sheet T10 vẫn có vài chỗ sheet tự xếp một người hai ca chồng
-- giờ (vd. M.Phú JOCKEY 11–13 + CROCS 12–15). User chốt 09/10: cứ ghi đúng như sheet, ca trùng được TÔ ĐỎ trên lịch
-- (`findPersonClashes` ở client quét theo dữ liệu, không phụ thuộc cờ này) rồi user rà lại sau.
--
-- Cờ nằm trên chính ca bị ghi (ca "đưa người vào"). Cờ bật ⇒ trigger bỏ qua kiểm trùng cho ca đó; ca KHÁC không cờ vẫn
-- bị kiểm như cũ (một ca không cờ không thể đưa người vào chỗ đang bận). Mặc định false ⇒ hành vi 0143 giữ nguyên.
-- Cờ không tự tắt: gỡ trùng xong thì để nguyên cũng vô hại (lần sau sửa người ca này không bị chặn) — muốn chặt lại thì
-- `update live_sessions set allow_person_clash = false where id = ...`.

alter table live_sessions add column if not exists allow_person_clash boolean not null default false;

comment on column live_sessions.allow_person_clash is
  'true = ca này được giữ dù người đứng ca trùng giờ với ca khác (0160). Lịch vẫn tô đỏ ca trùng.';

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
  if new.status = 'Cancelled' or new.is_backfill or new.allow_person_clash then
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

-- Trigger đã gắn `update of ... status, host_id, co_host_id` — thêm cột cờ để bật cờ CÙNG LÚC với đổi người vẫn đi qua
-- hàm (cờ nằm trong `new`), và để một lần bật cờ riêng cũng không bị bỏ sót.
drop trigger if exists trg_guard_person_clash on live_sessions;
create trigger trg_guard_person_clash
  before insert or update of date, start_time, end_time, status, host_id, co_host_id, allow_person_clash on live_sessions
  for each row execute function guard_person_clash();

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
  select id, date, start_time, status, is_backfill, allow_person_clash into s from live_sessions where id = new.session_id;
  if not found or s.status = 'Cancelled' or s.is_backfill or s.allow_person_clash then
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

-- Tự kiểm: hai hàm phải đã nhận cờ.
do $$
begin
  if pg_get_functiondef('public.guard_person_clash()'::regprocedure) !~ 'allow_person_clash' then
    raise exception '0160: guard_person_clash chưa nhận cờ allow_person_clash';
  end if;
  if pg_get_functiondef('public.guard_segment_person_clash()'::regprocedure) !~ 'allow_person_clash' then
    raise exception '0160: guard_segment_person_clash chưa nhận cờ allow_person_clash';
  end if;
end $$;
