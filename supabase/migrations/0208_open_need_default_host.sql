-- 0208 — Ca mở CHƯA có nháp nào cũng hiện thẻ "Cần host" cho talent (09/11).
--
-- Vì sao: 0207 chỉ gán shift_slots.open_need khi có nháp (trigger trên roster_drafts), nên ca mở còn nguyên (chưa ai xếp) để open_need = null
-- ⇒ talent không thấy thẻ dù ca đang thiếu host. Luật mới:
--   · ca mở (status = 'open', chưa có phiên) + KHÔNG có nháp          ⇒ 'host'
--   · ca mở + có nháp                                                 ⇒ theo nháp (private.slot_open_need, như 0207)
--   · ca không còn mở (đã công bố / có phiên / đóng)                  ⇒ null
-- Xoá nháp của ca mở ⇒ trả về 'host' (không còn null).
-- Chạy SAU 0207. Không đụng client, không đụng RLS.

-- ===== 1) trigger trên shift_slots: tự tính open_need khi ca được tạo / đổi trạng thái / gắn-bỏ phiên =====
create or replace function private.shift_slot_open_need_default()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d record;
begin
  if new.status = 'open' and new.session_id is null then
    select host_id, co_host_id, no_assistant into d from roster_drafts where slot_id = new.id limit 1;
    if found then
      new.open_need := private.slot_open_need(d.host_id, d.co_host_id, d.no_assistant);
    else
      new.open_need := 'host';
    end if;
  else
    new.open_need := null;
  end if;
  return new;
end;
$$;
revoke all on function private.shift_slot_open_need_default() from public;

drop trigger if exists trg_shift_slots_open_need on public.shift_slots;
create trigger trg_shift_slots_open_need
  before insert or update of status, session_id on public.shift_slots
  for each row execute function private.shift_slot_open_need_default();

-- ===== 2) xoá nháp của ca mở ⇒ 'host' thay vì null =====
create or replace function private.sync_slot_open_need()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update shift_slots
       set open_need = 'host'
     where id = old.slot_id and status = 'open' and session_id is null
       and open_need is distinct from 'host';
    return old;
  end if;
  update shift_slots
     set open_need = private.slot_open_need(new.host_id, new.co_host_id, new.no_assistant)
   where id = new.slot_id
     and status = 'open' and session_id is null
     and open_need is distinct from private.slot_open_need(new.host_id, new.co_host_id, new.no_assistant);
  return new;
end;
$$;
revoke all on function private.sync_slot_open_need() from public;

-- ===== 3) backfill ca mở hiện có =====
update public.shift_slots s
   set open_need = coalesce(
         (select private.slot_open_need(d.host_id, d.co_host_id, d.no_assistant) from public.roster_drafts d where d.slot_id = s.id limit 1),
         case when exists (select 1 from public.roster_drafts d where d.slot_id = s.id) then null else 'host' end)
 where s.status = 'open' and s.session_id is null
   and s.open_need is distinct from coalesce(
         (select private.slot_open_need(d.host_id, d.co_host_id, d.no_assistant) from public.roster_drafts d where d.slot_id = s.id limit 1),
         case when exists (select 1 from public.roster_drafts d where d.slot_id = s.id) then null else 'host' end);

-- Dọn open_need cũ ở ca không còn mở.
update public.shift_slots set open_need = null where open_need is not null and (status <> 'open' or session_id is not null);

-- Kiểm: ca mở T11 không còn null (trừ ca có nháp đủ host + trợ/No Asst).
-- select open_need, count(*) from shift_slots where status = 'open' and session_id is null and date >= current_date group by 1;
