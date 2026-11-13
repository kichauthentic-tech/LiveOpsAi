-- Gỡ giới hạn 'còn ≥ 24 giờ' của nhường/đổi ca (user 13/11): chỉ còn chặn đoạn đã bắt đầu. Định nghĩa lại private.swap_apply, chỉ đổi điều kiện giờ.
-- Áp dụng yêu cầu rồi kiểm "không phát sinh chồng giờ mới". Lỗi ⇒ raise (người gọi lui giao dịch). p_commit=false ⇒ áp thử rồi lui.
create or replace function private.swap_apply(p_req uuid, p_commit boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r shift_swap_requests%rowtype;
  s1 live_sessions%rowtype;
  s2 live_sessions%rowtype;
  v_lo date;
  v_hi date;
  v_before_a int; v_before_b int; v_after_a int; v_after_b int;
  v_orig1 boolean; v_orig2 boolean;
  v_role1 text; v_role2 text;
  v_msg text;
  w record;
begin
  select * into r from shift_swap_requests where id = p_req;

  -- Khoá các ca theo thứ tự id (tránh khoá chéo khi hai yêu cầu đụng nhau).
  perform 1 from live_sessions where id in (r.session_id, coalesce(r.swap_session_id, r.session_id)) order by id for update;
  select * into s1 from live_sessions where id = r.session_id;
  if r.kind = 'swap' then select * into s2 from live_sessions where id = r.swap_session_id; end if;

  if s1.status = 'Cancelled' or (r.kind = 'swap' and s2.status = 'Cancelled') then
    raise exception 'Ca đã huỷ.' using errcode = 'P0001';
  end if;
  if (s1.brand_id is not null and private.brand_month_published(s1.brand_id, s1.date))
     or (r.kind = 'swap' and s2.brand_id is not null and private.brand_month_published(s2.brand_id, s2.date)) then
    raise exception 'Tháng của ca này đã phát hành Report cho brand — lịch đã đóng sổ.' using errcode = 'P0001';
  end if;
  if private.swap_part_start(r.session_id, r.from_min) < now()
     or (r.kind = 'swap' and private.swap_part_start(r.swap_session_id, r.swap_from_min) < now()) then
    raise exception 'Đoạn này đã bắt đầu — không đổi/nhường được nữa.' using errcode = 'P0001';
  end if;

  v_lo := least(s1.date, coalesce(s2.date, s1.date)) - 1;
  v_hi := greatest(s1.date, coalesce(s2.date, s1.date)) + 1;
  v_before_a := private.swap_clash_count(r.from_talent, v_lo, v_hi);
  v_before_b := private.swap_clash_count(r.to_talent, v_lo, v_hi);

  -- Bật cờ allow_person_clash trong lúc ghi (hai bước ghi liên tiếp của đổi ca có thể tạm chồng nhau); kiểm tổng ở dưới mới là luật thật.
  v_orig1 := s1.allow_person_clash;
  update live_sessions set allow_person_clash = true where id = r.session_id;
  if r.kind = 'swap' then
    v_orig2 := s2.allow_person_clash;
    update live_sessions set allow_person_clash = true where id = r.swap_session_id;
  end if;

  v_role1 := private.swap_move_part(r.session_id, r.from_talent, r.to_talent, r.from_min, r.to_min);
  if r.kind = 'swap' then
    v_role2 := private.swap_move_part(r.swap_session_id, r.to_talent, r.from_talent, r.swap_from_min, r.swap_to_min);
  end if;

  update live_sessions set allow_person_clash = v_orig1 where id = r.session_id;
  if r.kind = 'swap' then
    update live_sessions set allow_person_clash = v_orig2 where id = r.swap_session_id;
  end if;

  v_after_a := private.swap_clash_count(r.from_talent, v_lo, v_hi);
  v_after_b := private.swap_clash_count(r.to_talent, v_lo, v_hi);
  if v_after_a > v_before_a or v_after_b > v_before_b then
    -- Tìm ca đang vướng để báo đúng tên (người nào tăng cặp chồng thì xét người đó).
    for w in
      select t.tid, pw.from_ts, pw.to_ts, o.id as sid
        from (values (r.from_talent, v_after_a > v_before_a), (r.to_talent, v_after_b > v_before_b)) as t(tid, bad)
        join live_sessions o on o.id in (r.session_id, coalesce(r.swap_session_id, r.session_id))
        cross join lateral private.person_windows(o.id, o.date, o.start_time, o.end_time, o.host_id, o.co_host_id) pw
       where t.bad and pw.talent_id = t.tid
    loop
      v_msg := private.person_clash_message(w.sid, w.tid, w.from_ts, w.to_ts);
      exit when v_msg is not null;
    end loop;
    raise exception '%', coalesce(v_msg, 'Sau khi đổi, có người bị trùng giờ với ca khác.') using errcode = 'P0001';
  end if;

  if p_commit then
    -- Trigger notify_session_changes (0116) vừa bắn "Bạn được xếp làm Host / không còn là Host" khi người chính của ca đổi —
    -- sai nghĩa với nhường MỘT đoạn và trùng với thông báo "Đã duyệt" của yêu cầu. Xoá đúng các dòng do chính giao dịch này sinh ra.
    delete from notifications
     where kind in ('shift_assigned', 'shift_unassigned')
       and created_at >= transaction_timestamp()
       and session_id in (r.session_id, coalesce(r.swap_session_id, r.session_id));

    insert into roster_changes (session_id, kind, reason, before, after, changed_by)
    values (r.session_id, 'reassign', 'Đổi/nhường ca giữa talent (yêu cầu ' || r.id || ')',
      jsonb_build_object('host_id', s1.host_id, 'host_name', s1.host_name, 'co_host_id', s1.co_host_id, 'co_host_name', s1.co_host_name),
      (select jsonb_build_object('host_id', x.host_id, 'host_name', x.host_name, 'co_host_id', x.co_host_id, 'co_host_name', x.co_host_name)
         from live_sessions x where x.id = r.session_id),
      auth.uid());
  end if;
end;
$$;
revoke all on function private.swap_apply(uuid, boolean) from public;
