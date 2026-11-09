-- 0211 — Nhãn "Cần host / Cần trợ live" tính THEO TỪNG CA, không mặc định cho mọi ca mở (10/11). Sửa 0208.
--
-- Vì sao: 0208 gán 'host' cho MỌI ca mở chưa có nháp ⇒ T12 (473 ca chưa ai xếp, chưa chốt) cũng hiện "Cần host". Luật user chốt: ca chỉ có nhãn khi
-- chính ca đó đã được trainer xử lý (nháp thiếu vai) — không suy từ ca khác trong tháng. 12 ca T11 còn mở sau khi chốt là ngoại lệ: giữ 'host'.
--   · ca mở + CÓ nháp                ⇒ theo nháp (private.slot_open_need, như 0207);
--   · ca mở + KHÔNG có nháp          ⇒ giữ nguyên giá trị hiện có (không tự gán 'host'; ca mới = null);
--   · ca không còn mở                ⇒ null;
--   · xoá nháp của ca mở             ⇒ null (không còn là "ca trainer đã xử lý").
-- Chạy SAU 0208. Client bỏ luật "tháng đã chốt", hiện thẳng slot.openNeed.

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
    end if;  -- không có nháp: giữ nguyên open_need hiện có
  else
    new.open_need := null;
  end if;
  return new;
end;
$$;
revoke all on function private.shift_slot_open_need_default() from public;

create or replace function private.sync_slot_open_need()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update shift_slots
       set open_need = null
     where id = old.slot_id and open_need is not null;
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

-- Bỏ nhãn mặc định 0208 ở ca mở chưa có nháp, TRỪ T11 (ngoại lệ: ca sót sau khi đã chốt).
update public.shift_slots s
   set open_need = null
 where s.status = 'open' and s.session_id is null and s.open_need = 'host'
   and not exists (select 1 from public.roster_drafts d where d.slot_id = s.id)
   and s.date >= date '2026-12-01';

-- Kiểm: T11 = 12 ca 'host'; T12 = null.
-- select to_char(date, 'YYYY-MM') m, open_need, count(*) from shift_slots where status = 'open' and session_id is null and date >= current_date group by 1, 2 order by 1;
