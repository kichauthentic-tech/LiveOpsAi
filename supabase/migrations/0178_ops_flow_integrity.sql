-- 0178: vá các chỗ làm GÃY quy trình vận hành (audit toàn app 17/10; B1–B4 của audit 15/10).
--
-- 1) Sửa ca ghi theo TRƯỜNG ĐÃ ĐỔI (B1, B4). `update_session_with_children` ghi đè cả ngày/giờ/phòng/host/trợ bằng bản
--    client đang giữ. Hai hệ quả đã xảy ra thật: (a) 14/10 CROCS 12–15: ops "Đổi người giữa ca" rồi lưu form Sửa ca (form
--    vẫn giữ trợ cũ) ⇒ trợ bị trả về người cũ, audit_logs cách nhau 2 giây; (b) app không tự nạp lại ca, máy thứ hai kéo
--    thẻ đổi phòng là ghi đè luôn người mà máy thứ nhất vừa đổi. Hàm mới `update_session_fields` chỉ ghi KHOÁ CÓ TRONG
--    p_patch; khoá vắng giữ nguyên giá trị đang có trong DB. Client mới gọi hàm này (chưa chạy migration ⇒ PGRST202 ⇒
--    client tự quay về hàm cũ), nên chạy trước hay sau deploy đều được.
--
-- 2) Đóng ca không còn vấp chỗ trùng người cũ (B3). `guard_person_clash` (0143/0160) kiểm lại mọi người của ca mỗi khi
--    `status` đổi ⇒ `complete_past_sessions()` (một câu UPDATE cho mọi ca đã qua giờ) gặp MỘT cặp trùng chưa gắn cờ là
--    lỗi cả câu ⇒ không ca nào được đóng (client nuốt lỗi 400). Đối soát / up file (trigger 0096 đổi status sang
--    Completed) cũng vấp như vậy. Đổi status chỉ kiểm lại người khi ca được KHÔI PHỤC từ Cancelled (đưa người trở lại
--    lịch); Upcoming → Live/Completed không đưa ai vào chỗ mới nên không kiểm.
--
-- 3) Người đứng ca theo ĐOẠN (đổi người giữa ca, 0138) được up file / báo bận như host/trợ chính (B2).
--    `can_edit_session_snapshot` và `request_shift_dropout` chỉ đọc host_id/co_host_id, trong khi `private.can_handover`
--    (0144) đã đọc cả `session_staff_segments` ⇒ trợ vào giữa ca được giao ca nhưng không up được file.
--
--    Lời nhắc giao ca (`private.sync_handover_reminder`) cũng chỉ đọc co_host_id ⇒ 14/10 nhắc người đã về lúc 13:00; nay gửi trợ
--    đứng ĐOẠN CUỐI ca, và đặt lại lời nhắc khi đoạn người đổi.
--
-- 4) Cờ `live_evidence` trên view `live_sessions_secure` (đo 16/10): role brand ở tháng chưa phát hành bị che số nên client không
--    phân biệt được ca đã live với ca "chờ xác nhận" (quá giờ nhưng không số, không report, không giờ live) ⇒ tab Hợp Đồng của
--    brand Franklin ghi 81h·29 ca đã chạy trong khi ops thấy 68h·24 ca. Cờ chỉ là true/false — không lộ số nào. Cùng luật
--    `hasLiveEvidence` ở client (có số / có report / có giờ live / nạp bù). Client mới tự bỏ cột khi view chưa có (42703).
--
-- Không đổi dữ liệu nào. Chạy lại được.

-- ============================================================================
-- 1) update_session_fields — chỉ ghi khoá có trong patch
-- ============================================================================
create or replace function update_session_fields(p_session_id uuid, p_patch jsonb)
returns live_sessions
language plpgsql
as $$
declare
  v_old live_sessions;
  v_row live_sessions;
  v_date date;
  v_start time;
  v_end time;
  v_moved boolean;
  v_has_data boolean;
  v_status session_status;
begin
  -- Chạy dưới quyền người gọi (như update_session_with_children): RLS lọc, đọc không thấy = không được sửa.
  select * into v_old from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;
  if v_old.status = 'Cancelled' then
    raise exception 'Ca đã huỷ — không sửa được.';
  end if;
  v_date := case when p_patch ? 'date' then (p_patch->>'date')::date else v_old.date end;
  v_start := case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else v_old.start_time end;
  v_end := case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else v_old.end_time end;

  v_moved := v_date <> v_old.date or v_start <> v_old.start_time or v_end <> v_old.end_time;
  v_has_data := coalesce(v_old.data_source, 'manual') <> 'manual'
             or coalesce(v_old.actual_gmv, 0) > 0
             or coalesce(v_old.total_views, 0) > 0
             or exists (select 1 from session_live_snapshots s where s.session_id = p_session_id);
  if v_moved and v_has_data then
    raise exception 'Ca % %–% đã có số liệu — không dời ngày/giờ được (ranh giới snapshot và đối soát tính theo giờ ca). Xoá snapshot của ca trước nếu thật sự cần dời.',
      to_char(v_old.date, 'DD/MM'), to_char(v_old.start_time, 'HH24:MI'), to_char(v_old.end_time, 'HH24:MI');
  end if;
  -- 0138: ca đã chia người theo đoạn giờ thì không dời giờ (offset phút của đoạn sẽ lệch) — cùng luật client.
  if v_moved and exists (select 1 from session_staff_segments g where g.session_id = p_session_id) then
    raise exception 'Ca % %–% đã chia người theo đoạn giờ — bỏ chia đoạn trước khi dời ngày/giờ.',
      to_char(v_old.date, 'DD/MM'), to_char(v_old.start_time, 'HH24:MI'), to_char(v_old.end_time, 'HH24:MI');
  end if;

  -- Trạng thái như update_session_with_children (0133): ca có số giữ nguyên; ca chưa có số suy theo giờ kết thúc.
  v_status := case
    when v_has_data then v_old.status
    when session_end_at(v_date, v_start, v_end) <= now() then 'Completed'::session_status
    else 'Upcoming'::session_status
  end;

  update live_sessions set
    date = v_date,
    start_time = v_start,
    end_time = v_end,
    studio_id = case when p_patch ? 'studio_id' then nullif(p_patch->>'studio_id', '')::uuid else v_old.studio_id end,
    studio_name = case when p_patch ? 'studio_name' then coalesce(p_patch->>'studio_name', '') else v_old.studio_name end,
    host_id = case when p_patch ? 'host_id' then nullif(p_patch->>'host_id', '')::uuid else v_old.host_id end,
    host_name = case when p_patch ? 'host_name' then coalesce(p_patch->>'host_name', '') else v_old.host_name end,
    co_host_id = case when p_patch ? 'co_host_id' then nullif(p_patch->>'co_host_id', '')::uuid else v_old.co_host_id end,
    co_host_name = case when p_patch ? 'co_host_name' then coalesce(p_patch->>'co_host_name', '') else v_old.co_host_name end,
    status = v_status
  where id = p_session_id
  returning * into v_row;

  if not found then
    raise exception 'live_sessions row % not found', p_session_id;
  end if;
  return v_row;
end;
$$;

revoke all on function update_session_fields(uuid, jsonb) from public;
revoke all on function update_session_fields(uuid, jsonb) from anon;
grant execute on function update_session_fields(uuid, jsonb) to authenticated;

-- ============================================================================
-- 2) guard_person_clash — đổi status chỉ kiểm khi khôi phục ca đã huỷ
-- ============================================================================
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
      raise exception '%', v_msg using errcode = 'P0001';
    end if;
  end loop;

  return new;
end;
$$;

-- ============================================================================
-- 3) Người đứng ca theo đoạn được up file / báo bận
-- ============================================================================
create or replace function can_edit_session_snapshot(p_session_id uuid) returns boolean as $$
  select coalesce(current_user_role()::text, '') in ('ceo', 'admin', 'operations')
      or (current_user_talent_id() is not null
          and (exists (
                 select 1 from live_sessions ls
                 where ls.id = p_session_id
                   and current_user_talent_id() in (ls.host_id, ls.co_host_id)
               )
               or exists (
                 select 1 from session_staff_segments g
                 where g.session_id = p_session_id
                   and g.talent_id = current_user_talent_id()
               )));
$$ language sql stable security definer set search_path = public;

grant execute on function can_edit_session_snapshot(uuid) to authenticated;

create or replace function request_shift_dropout(p_session_id uuid, p_reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
  v_me uuid;
  v_role text;
  v_name text;
begin
  v_me := (select assigned_talent_id from profiles where id = auth.uid());
  if v_me is null then
    raise exception 'Tài khoản chưa gắn với talent nào' using errcode = '42501';
  end if;

  select * into v_s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;

  -- Chỉ người ĐANG giữ ca (cả ca hoặc một đoạn giờ, 0138) được báo bận ca đó.
  if v_s.host_id = v_me then
    v_role := 'Host';
  elsif v_s.co_host_id = v_me then
    v_role := 'Trợ live';
  elsif exists (select 1 from session_staff_segments g where g.session_id = v_s.id and g.talent_id = v_me and g.role = 'host') then
    v_role := 'Host (một đoạn giờ)';
  elsif exists (select 1 from session_staff_segments g where g.session_id = v_s.id and g.talent_id = v_me) then
    v_role := 'Trợ live (một đoạn giờ)';
  else
    raise exception 'Bạn không phải Host/Trợ live của ca này' using errcode = '42501';
  end if;

  if v_s.status = 'Cancelled' then
    raise exception 'Ca này đã huỷ' using errcode = 'P0001';
  end if;
  if v_s.date < (now() at time zone 'Asia/Ho_Chi_Minh')::date then
    raise exception 'Ca đã diễn ra, không báo bận được' using errcode = 'P0001';
  end if;

  select name into v_name from talents where id = v_me;
  perform notify_ops('shift_dropout_request',
    coalesce(v_name, 'Talent') || ' báo không đi được ca (' || v_role || ')',
    session_label(v_s) || case when coalesce(btrim(p_reason), '') <> '' then ' — lý do: ' || btrim(p_reason) else '' end
      || '. Ca CHƯA đổi gì — vào Cửa sổ Ca Live để thay người hoặc huỷ.',
    v_s.id, v_s.brand_id);
end;
$$;
revoke all on function request_shift_dropout(uuid, text) from public;
grant execute on function request_shift_dropout(uuid, text) to authenticated;

-- Lời nhắc giao ca: gửi trợ đứng đoạn CUỐI ca (đoạn co_host có to_min lớn nhất), ca không chia đoạn thì co_host_id như cũ.
-- Nguyên văn 0154, chỉ đổi người nhận.
create or replace function private.sync_handover_reminder(p_session_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  s live_sessions;
  v_due timestamptz;
  v_title text;
  v_assist uuid;
begin
  delete from notifications where session_id = p_session_id and kind = 'handover_due' and read_at is null;
  select * into s from live_sessions where id = p_session_id;
  if not found or s.status = 'Cancelled' or s.is_backfill
     or exists (select 1 from live_session_reports r where r.session_id = s.id and r.handover_at is not null) then
    return;
  end if;
  v_due := ((s.date + s.end_time)::timestamp
            + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end
            + interval '15 minutes') at time zone 'Asia/Ho_Chi_Minh';
  if v_due <= now() then
    return;
  end if;
  select g.talent_id into v_assist
    from session_staff_segments g
   where g.session_id = s.id and g.role = 'co_host'
   order by g.to_min desc
   limit 1;
  v_assist := coalesce(v_assist, s.co_host_id);
  v_title := format('Giao ca %s %s %s–%s', coalesce(s.brand_name, ''), s.platform, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'));
  insert into notifications (user_id, kind, title, body, session_id, brand_id, created_at)
  select p.id, 'handover_due', v_title,
         case when s.platform::text = 'TikTok'
              then 'Hết ca rồi — mở ca, up file Creator-Live-Performance rồi chọn sự cố để giao ca.'
              else 'Hết ca rồi — mở ca, up file Live List rồi chọn sự cố để giao ca.' end,
         s.id, s.brand_id, v_due
    from profiles p
   where p.status = 'Active'
     and ((v_assist is not null and p.assigned_talent_id = v_assist)
          or (v_assist is null and p.role in ('operations', 'admin')));
end;
$$;
revoke all on function private.sync_handover_reminder(uuid) from public;

create or replace function trg_segment_handover_reminder() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.sync_handover_reminder(coalesce(new.session_id, old.session_id));
  return null;
end;
$$;

drop trigger if exists trg_segment_handover_reminder on session_staff_segments;
create trigger trg_segment_handover_reminder
  after insert or update or delete on session_staff_segments
  for each row execute function trg_segment_handover_reminder();

-- ============================================================================
-- 4) live_sessions_secure.live_evidence
-- ============================================================================
do $$
declare
  v_def text;
  v_new text;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'live_sessions_secure' and column_name = 'live_evidence') then
    return;
  end if;
  v_def := regexp_replace(pg_get_viewdef('public.live_sessions_secure'::regclass, true), ';\s*$', '');
  -- Lớp trong: tính cờ cạnh month_published (đọc bảng gốc, view chạy quyền chủ sở hữu như các cột khác).
  v_new := regexp_replace(v_def,
    '(\s+v\.month_published)(\s+FROM live_sessions ls)',
    E'\\1,\n            (COALESCE(ls.data_source, ''manual'') <> ''manual'' OR COALESCE(ls.actual_gmv, 0) > 0 OR COALESCE(ls.total_views, 0) > 0'
    || E' OR COALESCE(ls.live_duration_minutes, 0) > 0 OR ls.is_backfill'
    || E' OR EXISTS (SELECT 1 FROM live_session_reports r WHERE r.session_id = ls.id)'
    || E' OR EXISTS (SELECT 1 FROM session_live_snapshots sn WHERE sn.session_id = ls.id)) AS live_evidence\\2');
  -- Lớp ngoài: thêm cột vào CUỐI danh sách (create or replace view chỉ cho thêm cột ở cuối).
  v_new := regexp_replace(v_new, '(\n\s+month_published)(\n\s+FROM \()', E'\\1,\n    live_evidence\\2');
  if v_new = v_def or v_new !~ 'AS live_evidence' or v_new !~ 'month_published,\s+live_evidence\s+FROM \(' then
    raise exception '0178: không chèn được cột live_evidence vào live_sessions_secure — định nghĩa view đã khác dự kiến, kiểm tay.';
  end if;
  execute format('create or replace view public.live_sessions_secure as %s', v_new);
end $$;

notify pgrst, 'reload schema';
