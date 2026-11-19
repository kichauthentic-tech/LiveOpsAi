-- 0226: hạn đăng ký chỉ KHOÁ SỬA/HUỶ đăng ký đã có; ca còn mở thiếu người thì talent vẫn đăng ký thêm được.
--
-- Trước (0176/0200): qua hạn ⇒ talent không thêm cũng không huỷ được (private.slot_open_for_registration chặn cả insert lẫn delete).
-- Nay (user 19/11): hạn = mốc chốt đăng ký của talent — đã đăng ký thì không đổi được nữa; ca còn mở (chưa chốt host, chưa có phiên,
-- chưa qua ngày) thì luôn đăng ký thêm được để lấp chỗ thiếu. Ca đã công bố (finalized) thì không còn mở.
--   * insert  : slot_open_for_registration(slot, true)  — chỉ xét ca mở + chưa qua ngày (BỎ hạn).
--   * delete  : slot_registration_editable(slot)         — ca mở VÀ chưa qua hạn (hạn riêng của ca → hạn đợt → hạn tuần cũ, như 0200).
-- Hệ quả: đăng ký thêm sau hạn rồi thì cũng bị khoá như đăng ký khác. open_slots_for_signup (0207) không còn cần (giữ để khỏi vỡ client cũ).

create or replace function private.slot_deadline_passed(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shift_slots s
     where s.id = p_slot_id
       and case
             when s.signup_deadline is not null then s.signup_deadline <= now()
             else exists (
                    select 1 from roster_months m
                     where m.month = date_trunc('month', s.date::timestamp)::date
                       and (case when extract(day from s.date) > 15 and m.signup_deadline_2 is not null
                                 then m.signup_deadline_2 else m.signup_deadline end) <= now()
                  )
               or exists (
                    select 1 from roster_weeks w
                     where w.week_start = s.date - (extract(isodow from s.date)::int - 1)
                       and w.signup_deadline is not null
                       and w.signup_deadline <= now()
                  )
           end
  )
$$;
revoke all on function private.slot_deadline_passed(uuid) from public;
grant execute on function private.slot_deadline_passed(uuid) to authenticated;

create or replace function private.slot_open_for_registration(p_slot_id uuid, p_require_future boolean default true)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from shift_slots s
     where s.id = p_slot_id
       and s.status = 'open'
       and s.session_id is null
       and (not p_require_future or s.date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date)
  )
$$;
revoke all on function private.slot_open_for_registration(uuid, boolean) from public;
grant execute on function private.slot_open_for_registration(uuid, boolean) to authenticated;

create or replace function private.slot_registration_editable(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select private.slot_open_for_registration(p_slot_id, false) and not private.slot_deadline_passed(p_slot_id)
$$;
revoke all on function private.slot_registration_editable(uuid) from public;
grant execute on function private.slot_registration_editable(uuid) to authenticated;

alter policy session_availability_delete_self_or_ceo_ops on public.session_availability using (
  ((select current_user_role()) = any (array['ceo'::user_role, 'operations'::user_role, 'trainer'::user_role, 'admin'::user_role]))
  or (talent_id = (select current_user_talent_id()) and (select private.slot_registration_editable(session_availability.slot_id)))
);

do $$
begin
  if position('slot_registration_editable' in pg_get_expr((select polqual from pg_policy where polname = 'session_availability_delete_self_or_ceo_ops'), 'public.session_availability'::regclass)) = 0 then
    raise exception '0226 tự kiểm: policy xoá đăng ký chưa dùng slot_registration_editable';
  end if;
  if position('signup_deadline' in pg_get_functiondef('private.slot_open_for_registration(uuid, boolean)'::regprocedure)) > 0 then
    raise exception '0226 tự kiểm: insert vẫn còn xét hạn';
  end if;
end $$;
