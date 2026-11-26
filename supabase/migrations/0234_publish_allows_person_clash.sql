-- 0234: CÔNG BỐ LỊCH không còn bị chặn vì trùng giờ người — chốt trước, sửa sau (user 26/11).
--
-- Trước bản này chỉ MỘT ca nháp trùng người (0143) là publish_roster_week / publish_roster_range huỷ cả giao dịch: tuần
-- 21–27/12 còn nguyên 86 ca chưa công bố vì 4 chỗ trùng ngày 25/12, đúng lúc tới hạn gửi lịch.
--
-- Luật mới: đang công bố (biến giao dịch app.roster_publish = '1', publish_roster_week đặt từ 0176) mà gặp trùng người thì
-- vẫn ghi ca và bật cờ allow_person_clash (0160) trên CHÍNH ca đó — lịch tiếp tục tô đỏ để chị Trainer đổi người sau.
-- Mọi cửa khác (chốt lẻ, đổi người, dời giờ, đổi ca, xếp theo đoạn) VẪN chặn như cũ. Host trùng trợ trong cùng một ca vẫn chặn.
--
-- Lưu ý: cờ không tự tắt (0160) — ca đã mang cờ thì lần đổi người sau của ca đó không bị kiểm trùng nữa (lịch vẫn tô đỏ).
--
-- Thân hàm = bản 0178 (đổi status chỉ kiểm khi khôi phục ca đã huỷ) + nhánh công bố. Chạy lại được; không phụ thuộc client.

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
     or (old.status = 'Cancelled' and new.status is distinct from old.status) then
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
      -- 0234: công bố lịch thì giữ ca, đánh dấu để sửa sau.
      if coalesce(current_setting('app.roster_publish', true), '') = '1' then
        new.allow_person_clash := true;
        return new;
      end if;
      raise exception '%', v_msg using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

-- ===== Chốt tự kiểm =====
do $$
begin
  if pg_get_functiondef('public.guard_person_clash()'::regprocedure) !~ 'app\.roster_publish' then
    raise exception '0234: guard_person_clash chưa có nhánh công bố';
  end if;
  if pg_get_functiondef('public.publish_roster_week(date)'::regprocedure) !~ 'app\.roster_publish' then
    raise exception '0234: publish_roster_week không đặt app.roster_publish — kiểm 0176';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_person_clash') then
    raise exception '0234: thiếu trigger chặn trùng người';
  end if;
end $$;
