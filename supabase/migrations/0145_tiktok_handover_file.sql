-- 0145: GIAO CA ca TikTok = up file Creator-Live-Performance (user chốt 06/10 tối, giữ cách build ban đầu).
--
-- 0144 làm giao ca "dán link + gõ 3 số" cho cả hai sàn. User chốt lại: ca TikTok giao bằng FILE (số tách đúng ranh giới
-- ca nối), ca Shopee vẫn dán link + gõ số (Shopee không có file theo ca). Giao ca TikTok gồm hai bước:
--   1) up file Creator-Live-Performance — RPC apply_session_live_snapshot đã có (0078/0082);
--   2) khai sự cố/OT/ghi chú — RPC dưới đây, chỉ chạy được khi ca ĐÃ có file. Xong thì ca tính là "đã giao ca"
--      (handover_at), lời nhắc giao ca bị xoá.
-- Người giao giữ như 0144: trợ live của ca, ca không trợ thì OPS (private.can_handover).
-- submit_session_handover (0144) giữ nguyên trong DB; UI chỉ dùng nó cho ca Shopee.
--
-- Deploy: chạy migration TRƯỚC rồi deploy client.

create or replace function submit_tiktok_handover(
  p_session_id uuid,
  p_ot_minutes int default 0,
  p_early_leave_minutes int default 0,
  p_restart_count int default 0,
  p_host_late boolean default false,
  p_status_note text default ''
) returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  s live_sessions;
begin
  select * into s from live_sessions where id = p_session_id;
  if not found then
    raise exception 'Không thấy ca.' using errcode = 'P0001';
  end if;
  if not private.can_handover(s) then
    raise exception 'Chỉ trợ live của ca (hoặc OPS khi ca không có trợ) mới giao ca được.' using errcode = 'P0001';
  end if;
  if s.status = 'Cancelled' or s.is_backfill then
    raise exception 'Ca đã huỷ hoặc ca nạp từ file — không giao ca.' using errcode = 'P0001';
  end if;
  if s.platform::text <> 'TikTok' then
    raise exception 'Ca Shopee giao ca bằng link dashboard + số, không qua file.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from session_live_snapshots where session_id = s.id)
     and s.data_source::text not in ('live_snapshot', 'tiktok_reconciled') then
    raise exception 'Up file Creator-Live-Performance của ca trước (bước 1), rồi mới giao ca.' using errcode = 'P0001';
  end if;

  insert into live_session_reports (
    session_id, ot_minutes, early_leave_minutes, restart_count, host_late, status_note,
    handover_at, submitted_by_talent_id, submitted_by_role, submitted_at, updated_at
  ) values (
    s.id, greatest(coalesce(p_ot_minutes, 0), 0), greatest(coalesce(p_early_leave_minutes, 0), 0),
    greatest(coalesce(p_restart_count, 0), 0), coalesce(p_host_late, false), coalesce(p_status_note, ''),
    now(), current_user_talent_id(), current_user_role(), now(), now()
  )
  on conflict (session_id) do update set
    ot_minutes = excluded.ot_minutes,
    early_leave_minutes = excluded.early_leave_minutes,
    restart_count = excluded.restart_count,
    host_late = excluded.host_late,
    status_note = excluded.status_note,
    handover_at = excluded.handover_at,
    submitted_by_talent_id = excluded.submitted_by_talent_id,
    submitted_by_role = excluded.submitted_by_role,
    submitted_at = excluded.submitted_at,
    updated_at = now();

  delete from notifications where session_id = s.id and kind = 'handover_due';
  return s;
end;
$$;
revoke all on function submit_tiktok_handover(uuid, int, int, int, boolean, text) from public;
grant execute on function submit_tiktok_handover(uuid, int, int, int, boolean, text) to authenticated;

-- Lời nhắc ca TikTok nói đúng việc phải làm (0144 viết chung "dán link + gõ 3 số").
create or replace function private.sync_handover_reminder(p_session_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  s live_sessions;
  v_due timestamptz;
  v_title text;
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
  v_title := format('Giao ca %s %s %s–%s', coalesce(s.brand_name, ''), s.platform, to_char(s.start_time, 'HH24:MI'), to_char(s.end_time, 'HH24:MI'));
  insert into notifications (user_id, kind, title, body, session_id, brand_id, created_at)
  select p.id, 'handover_due', v_title,
         case when s.platform::text = 'TikTok'
              then 'Hết ca rồi — mở ca, up file Creator-Live-Performance rồi chọn sự cố để giao ca.'
              else 'Hết ca rồi — mở ca, dán link dashboard và gõ 3 số đang thấy để giao ca.' end,
         s.id, s.brand_id, v_due
    from profiles p
   where p.status = 'Active'
     and ((s.co_host_id is not null and p.assigned_talent_id = s.co_host_id)
          or (s.co_host_id is null and p.role in ('operations', 'admin')));
end;
$$;
revoke all on function private.sync_handover_reminder(uuid) from public;

update notifications n
   set body = 'Hết ca rồi — mở ca, up file Creator-Live-Performance rồi chọn sự cố để giao ca.'
  from live_sessions s
 where n.session_id = s.id and n.kind = 'handover_due' and n.read_at is null and s.platform::text = 'TikTok';
