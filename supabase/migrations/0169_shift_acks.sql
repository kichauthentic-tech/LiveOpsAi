-- 0169 — Talent bấm "Đã nhận" lịch ca (app talent T2, 11/10).
--
-- Vì sao: đo 11/10 — 0 lượt mở màn của role talent từ 26/09, 12 chỗ trùng người trên lịch mà người bị trùng không biết.
-- Thông báo `shift_assigned` / `shift_time_changed` (0083/0116) đã có nhưng OP không biết người đó ĐÃ XEM hay chưa: ca sát
-- giờ mà host chưa mở app thì chỉ biết lúc host không tới. Nghiên cứu (Harvard Shift Project, Deputy/Toast) ở
-- https://claude.ai/artifact/KjJ4fQ9pVqd7WYAkyJqudk — báo lịch sớm + người làm xác nhận là chuẩn của app xếp ca.
--
-- Một dòng = một người đã nhận MỘT phiên bản giờ của ca: ghi lại ngày/giờ lúc bấm. OP đổi ngày/giờ sau đó thì dòng còn
-- nhưng không còn khớp ⇒ app coi là "chưa nhận giờ mới" (so ở client, `lib/talent/acks.ts`). Không cần trigger theo dõi
-- đổi giờ, và màn talent hiện được "giờ cũ → giờ mới".
--
-- Ghi chỉ qua RPC `ack_my_shifts` (không policy insert/update/delete): talent chỉ nhận được ca mình đứng (Host, Trợ, hoặc
-- một đoạn khi đổi người giữa ca — 0138), không ghi hộ người khác.

create table if not exists shift_acks (
  session_id uuid not null references live_sessions(id) on delete cascade,
  talent_id uuid not null references talents(id) on delete cascade,
  acked_at timestamptz not null default now(),
  acked_date date not null,
  acked_start time not null,
  acked_end time not null,
  primary key (session_id, talent_id)
);

create index if not exists shift_acks_talent_idx on shift_acks (talent_id);
create index if not exists shift_acks_date_idx on shift_acks (acked_date);

alter table shift_acks enable row level security;
revoke all on shift_acks from anon;
revoke insert, update, delete on shift_acks from authenticated;
grant select on shift_acks to authenticated;

-- OP thấy mọi dòng (khối "Việc cần làm"); talent chỉ thấy dòng của mình; brand không thấy gì.
drop policy if exists "shift_acks_read" on shift_acks;
create policy "shift_acks_read" on shift_acks for select using (
  (select current_user_role()) in ('ceo', 'operations', 'admin')
  or ((select current_user_role()) = 'talent' and talent_id = (select current_user_talent_id()))
);

-- ---------------------------------------------------------------------------
-- RPC: nhận một loạt ca. Ca không phải của mình / đã huỷ thì bỏ qua (không lỗi) — client gửi cả loạt "Đã nhận N ca".
-- Trả về số dòng đã ghi.
-- ---------------------------------------------------------------------------
create or replace function ack_my_shifts(p_session_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid;
  v_n integer;
begin
  v_me := (select current_user_talent_id());
  if v_me is null then
    raise exception 'Tài khoản chưa gắn với hồ sơ host/trợ live nào' using errcode = '42501';
  end if;

  insert into shift_acks (session_id, talent_id, acked_at, acked_date, acked_start, acked_end)
  select s.id, v_me, now(), s.date, s.start_time, s.end_time
    from live_sessions s
   where s.id = any(coalesce(p_session_ids, '{}'))
     and s.status <> 'Cancelled'
     and (s.host_id = v_me or s.co_host_id = v_me
          or exists (select 1 from session_staff_segments g where g.session_id = s.id and g.talent_id = v_me))
  on conflict (session_id, talent_id) do update
    set acked_at = excluded.acked_at,
        acked_date = excluded.acked_date,
        acked_start = excluded.acked_start,
        acked_end = excluded.acked_end;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function ack_my_shifts(uuid[]) from public;
grant execute on function ack_my_shifts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Người bị rút khỏi ca thì xoá dòng nhận của họ — để lần sau được xếp lại vào CHÍNH ca đó, app hỏi lại "Đã nhận" thay vì
-- coi như đã nhận từ trước. Trigger HOÃN tới cuối giao dịch (constraint trigger deferred): `set_session_staff_segments`
-- (0138) xoá hết đoạn rồi chèn lại trong cùng một lệnh gọi — xoá ngay ở dòng delete thì người chỉ có tên ở đoạn bị mất dòng
-- nhận dù vẫn còn trong ca.
-- ---------------------------------------------------------------------------
create or replace function private.prune_shift_acks(p_session_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from shift_acks a
   where a.session_id = p_session_id
     and not exists (
       select 1 from live_sessions s
        where s.id = a.session_id
          and (s.host_id = a.talent_id or s.co_host_id = a.talent_id
               or exists (select 1 from session_staff_segments g where g.session_id = s.id and g.talent_id = a.talent_id))
     );
$$;

create or replace function private.trg_prune_shift_acks() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.prune_shift_acks(new.id);
  return null;
end;
$$;

-- Bảng đoạn giờ không có cột `id` của ca ⇒ hàm riêng đọc old.session_id.
create or replace function private.trg_prune_shift_acks_segments() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform private.prune_shift_acks(old.session_id);
  return null;
end;
$$;

drop trigger if exists trg_prune_shift_acks on live_sessions;
create constraint trigger trg_prune_shift_acks
  after update on live_sessions
  deferrable initially deferred
  for each row
  when (new.host_id is distinct from old.host_id or new.co_host_id is distinct from old.co_host_id)
  execute function private.trg_prune_shift_acks();

drop trigger if exists trg_prune_shift_acks_segments on session_staff_segments;
create constraint trigger trg_prune_shift_acks_segments
  after delete on session_staff_segments
  deferrable initially deferred
  for each row
  execute function private.trg_prune_shift_acks_segments();

revoke all on function private.prune_shift_acks(uuid) from public;
revoke all on function private.trg_prune_shift_acks() from public;
revoke all on function private.trg_prune_shift_acks_segments() from public;
