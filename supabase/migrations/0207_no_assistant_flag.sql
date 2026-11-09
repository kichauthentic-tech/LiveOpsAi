-- 0207 — Thẻ "No Asst" (ca chủ ý không có trợ live) + ca thiếu trợ chưa gắn thẻ thì CHƯA công bố, vẫn là ca mở để talent đăng ký (09/11).
--
-- Vì sao: ca không trợ là hợp lệ (OPS giao ca thay trợ) nhưng DB/UI không phân biệt được "chủ ý không trợ" với "quên xếp trợ" ⇒
-- cảnh báo "chưa có trợ" lẫn cả hai loại, và sau ngày chốt lịch talent không biết ca còn thiếu vai nào để đăng ký thêm.
-- User chốt: "nếu không chọn thẻ No Asst thì ca đó không chốt được" — áp cùng luật ca thiếu host đã chạy (ca không có host vẫn là ca mở):
--   · nháp có host + có trợ              ⇒ công bố như cũ;
--   · nháp có host + gắn No Asst         ⇒ công bố, ca không trợ (OPS giao ca);
--   · nháp có host, CHƯA trợ, CHƯA No Asst ⇒ KHÔNG công bố, giữ nguyên là ca mở + nháp host, talent vẫn đăng ký được (RLS 0176 chỉ xét
--                                          shift_slots.status = 'open' & chưa có phiên) và thấy thẻ "Cần trợ live";
--   · nháp chỉ có trợ (không host)       ⇒ vẫn chặn công bố như cũ (thông báo 'Ca nháp chưa có host').
--
-- Thay đổi:
--   1) roster_drafts.no_assistant   — thẻ khi xếp nháp (CHECK: không vừa có trợ vừa No Asst).
--   2) shift_slots.no_assistant     — công bố sao chép thẻ sang ca; ca đã công bố dùng cột này (live_sessions_secure là view, không đụng).
--   3) shift_slots.open_need        — 'host' | 'co_host' = ca mở đã có người nháp nhưng còn thiếu đúng vai đó. Talent KHÔNG đọc được
--                                     roster_drafts (cố ý) nên trigger lộ riêng vai còn thiếu, không lộ tên người.
--   4) publish_roster_week          — vá bằng replace() trên định nghĩa hiện hành (như 0206, không chép lại cả thân hàm).
--   5) set_slot_no_assistant        — bật/tắt thẻ cho ca ĐÃ công bố (ca chưa có trợ).
--   6) open_slots_for_signup        — đặt hạn riêng cho ca còn thiếu người khi hạn tháng/đợt đã qua (DB chặn đăng ký sau hạn, 0200).
-- Chạy sau 0206 hoặc trước đều được (hai bản vá chạm hai đoạn khác nhau của publish_roster_week).

alter table public.roster_drafts add column if not exists no_assistant boolean not null default false;
alter table public.roster_drafts drop constraint if exists roster_drafts_no_assistant_chk;
alter table public.roster_drafts add constraint roster_drafts_no_assistant_chk check (not (no_assistant and co_host_id is not null));

alter table public.shift_slots add column if not exists no_assistant boolean not null default false;
alter table public.shift_slots add column if not exists open_need text;
alter table public.shift_slots drop constraint if exists shift_slots_open_need_chk;
alter table public.shift_slots add constraint shift_slots_open_need_chk check (open_need is null or open_need in ('host', 'co_host'));

-- ===== 3) trigger lộ vai còn thiếu của ca mở =====
create or replace function private.slot_open_need(p_host uuid, p_co uuid, p_no_asst boolean)
returns text
language sql
immutable
as $$
  select case
    when p_host is null then 'host'
    when p_co is null and not coalesce(p_no_asst, false) then 'co_host'
    else null
  end
$$;
revoke all on function private.slot_open_need(uuid, uuid, boolean) from public;

create or replace function private.sync_slot_open_need()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update shift_slots set open_need = null where id = old.slot_id and open_need is not null;
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

drop trigger if exists trg_roster_drafts_open_need on public.roster_drafts;
create trigger trg_roster_drafts_open_need
  after insert or update or delete on public.roster_drafts
  for each row execute function private.sync_slot_open_need();

-- Nháp đang có sẵn: gắn vai thiếu ngay (nháp host-only đang có sẽ thành "Cần trợ live" và KHÔNG được công bố nếu chưa gắn No Asst).
update public.shift_slots s
   set open_need = private.slot_open_need(d.host_id, d.co_host_id, d.no_assistant)
  from public.roster_drafts d
 where d.slot_id = s.id and s.status = 'open' and s.session_id is null
   and s.open_need is distinct from private.slot_open_need(d.host_id, d.co_host_id, d.no_assistant);

-- ===== 4) publish_roster_week =====
do $$
declare
  def text;
  new_def text;
  sel_old constant text := E'where s.date between p_week_start and v_end and s.status = ''open'' and s.session_id is null;';
  sel_new constant text := E'where s.date between p_week_start and v_end and s.status = ''open'' and s.session_id is null\n' ||
    E'     -- 0207: nháp có host mà chưa trợ, chưa No Asst thì chưa công bố (giữ là ca mở, talent đăng ký trợ).\n' ||
    E'     and (d.host_id is null or d.co_host_id is not null or d.no_assistant);';
  loop_old constant text := E'select d.slot_id, d.host_id, d.co_host_id\n';
  loop_new constant text := E'select d.slot_id, d.host_id, d.co_host_id, d.no_assistant\n';
  fin_old constant text := E'perform finalize_shift_slot(r.slot_id, r.host_id, r.co_host_id);\n';
  fin_new constant text := E'perform finalize_shift_slot(r.slot_id, r.host_id, r.co_host_id);\n' ||
    E'    if r.no_assistant then\n' ||
    E'      update shift_slots set no_assistant = true where id = r.slot_id;\n' ||
    E'    end if;\n';
begin
  select pg_get_functiondef('public.publish_roster_week(date)'::regprocedure) into def;
  if position('d.no_assistant' in def) > 0 then
    return; -- đã vá
  end if;
  if position(sel_old in def) = 0 or position(loop_old in def) = 0 or position(fin_old in def) = 0 then
    raise exception '0207: không tìm thấy đoạn cần vá trong publish_roster_week — kiểm tay';
  end if;
  new_def := replace(def, sel_old, sel_new);
  new_def := replace(new_def, loop_old, loop_new);
  new_def := replace(new_def, fin_old, fin_new);
  execute new_def;
end $$;

-- ===== 5) bật/tắt thẻ cho ca đã công bố =====
create or replace function public.set_slot_no_assistant(p_slot_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slot shift_slots;
  v_co uuid;
begin
  perform private.roster_staff_guard();
  select * into v_slot from shift_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Không thấy ca %', p_slot_id;
  end if;
  if v_slot.status <> 'finalized' or v_slot.session_id is null then
    raise exception 'Chỉ gắn No Asst cho ca đã công bố; ca nháp gắn ngay trong bảng xếp người.';
  end if;
  if p_value then
    select co_host_id into v_co from live_sessions where id = v_slot.session_id;
    if v_co is not null then
      raise exception 'Ca này đã có trợ live — gỡ trợ (đổi người, ghi lý do) trước khi gắn No Asst.';
    end if;
  end if;
  update shift_slots set no_assistant = p_value where id = p_slot_id;
end;
$$;
revoke all on function public.set_slot_no_assistant(uuid, boolean) from public;
grant execute on function public.set_slot_no_assistant(uuid, boolean) to authenticated;

-- ===== Chốt tự kiểm =====
do $$
declare
  def text := pg_get_functiondef('public.publish_roster_week(date)'::regprocedure);
begin
  if position('d.no_assistant' in def) = 0 or position('update shift_slots set no_assistant = true' in def) = 0 then
    raise exception '0207 tự kiểm: publish_roster_week chưa được vá';
  end if;
  if position('chưa có host' in def) = 0 then
    raise exception '0207 tự kiểm: mất luật bắt buộc host khi công bố';
  end if;
end $$;

-- ===== 6) mở lại đăng ký cho ca còn thiếu người sau khi hạn tháng/đợt đã qua =====
-- Ca hết hạn đăng ký mà vẫn thiếu host / trợ: trainer đặt HẠN RIÊNG của ca (shift_slots.signup_deadline, 0200 — thay mọi hạn khác) để talent
-- đăng ký thêm. Chỉ ca còn mở, chưa có phiên, chưa qua ngày. Không gửi thông báo hàng loạt: talent thấy ca trong tab Đăng ký ca (thẻ "Cần trợ live").
create or replace function public.open_slots_for_signup(p_slot_ids uuid[], p_deadline timestamptz)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n int;
begin
  perform private.roster_staff_guard();
  if p_deadline is null or p_deadline <= now() then
    raise exception 'Hạn đăng ký phải ở tương lai.';
  end if;
  update shift_slots
     set signup_deadline = p_deadline
   where id = any (coalesce(p_slot_ids, '{}'))
     and status = 'open' and session_id is null
     and date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.open_slots_for_signup(uuid[], timestamptz) from public;
grant execute on function public.open_slots_for_signup(uuid[], timestamptz) to authenticated;
