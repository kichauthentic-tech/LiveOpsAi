-- 0097 — Huỷ ca + xoá ca trả slot (audit N2, 2026-09-21).
--
-- Trước đây không có cách nào đặt live_sessions.status = 'Cancelled'; ops chỉ có "Xoá ca", mà
-- shift_slots.session_id là FK on delete set null (0014) nên slot vẫn 'finalized' với session_id
-- null — không mở lại được, không chốt lại được, talent không được báo (trigger 0083 chỉ bắt update).
--
-- (1) cancel_session(p_session_id, p_reason): ca -> 'Cancelled' (ghi lý do vào cancel_reason), slot
--     gắn với ca -> 'cancelled' — một transaction. Chặn nếu ca đã có số liệu (data_source khác
--     'manual' hoặc actual_gmv > 0): số đã ghi là bằng chứng, muốn bỏ thì ops sửa tay có chủ đích.
--     Trigger 0083 tự bắn "Ca của bạn đã bị huỷ" cho host/trợ nếu ca chưa diễn ra.
-- (2) Trigger AFTER DELETE trên live_sessions: slot đang 'finalized' trỏ tới ca bị xoá -> về 'open'
--     (giữ đăng ký rảnh, ops chốt người khác) thay vì kẹt.

alter table live_sessions add column if not exists cancel_reason text not null default '';
alter table live_sessions add column if not exists cancelled_at timestamptz;

create or replace function cancel_session(p_session_id uuid, p_reason text default '')
returns live_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_s live_sessions;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'Chỉ ceo/admin/operations được huỷ ca';
  end if;
  select * into v_s from live_sessions where id = p_session_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_session_id;
  end if;
  if v_s.status = 'Cancelled' then
    return v_s;
  end if;
  if coalesce(v_s.data_source, 'manual') <> 'manual' or coalesce(v_s.actual_gmv, 0) > 0 then
    raise exception 'Ca đã có số liệu (%), không huỷ được — sửa tay nếu thật sự cần', v_s.data_source;
  end if;
  update live_sessions
     set status = 'Cancelled', cancel_reason = coalesce(p_reason, ''), cancelled_at = now()
   where id = p_session_id
   returning * into v_s;
  update shift_slots set status = 'cancelled' where session_id = p_session_id and status = 'finalized';
  return v_s;
end;
$$;

revoke all on function cancel_session(uuid, text) from public;
grant execute on function cancel_session(uuid, text) to authenticated;

-- Xoá ca -> slot đã chốt trỏ tới ca đó về 'open'. Chạy AFTER DELETE: lúc này FK đã set session_id
-- null rồi, nên khớp theo old.id không còn — vì thế phải bắt BEFORE DELETE để còn thấy session_id.
create or replace function reopen_slot_on_session_delete() returns trigger
language plpgsql
as $$
begin
  update shift_slots set status = 'open', session_id = null
   where session_id = old.id and status = 'finalized';
  return old;
end;
$$;

drop trigger if exists trg_reopen_slot_on_session_delete on live_sessions;
create trigger trg_reopen_slot_on_session_delete
  before delete on live_sessions
  for each row execute function reopen_slot_on_session_delete();
