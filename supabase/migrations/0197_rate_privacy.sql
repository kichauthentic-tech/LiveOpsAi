-- 0197 — Rate host/trợ: ops không đọc được qua bảng lịch sử, không ghi được rate (audit bảo mật trước launch 05/11).
--
-- Lỗ đo trên replay 0001→0196 (quyền mặc định Supabase): 0047 siết ĐỌC talent_rate_history về ceo/admin (+ trainer từ 0176)
-- + chính chủ, nhưng để lại policy `talent_rate_history_write_ceo_ops` dạng FOR ALL — FOR ALL gồm cả SELECT, nên role
-- operations đọc được TOÀN BỘ lịch sử rate mọi host/trợ. useWorkspaceData nạp bảng này lúc mở app với mọi role ⇒ rate nằm
-- trong network/state của mọi phiên ops; Điều Phối Lịch Live còn hiện "Chi phí người tuần này" từ đó (talents_secure che rate
-- với ops nhưng bảng lịch sử thì không). Ops cũng ghi được talents.rate_* (talents_write_ceo_ops) dù UI chỉ cho ceo/admin sửa.
--
-- Sửa:
--   1) talent_rate_history: bỏ policy FOR ALL; ghi tách INSERT/UPDATE/DELETE chỉ ceo/admin (client không ghi bảng này — trigger
--      trg_talent_rate_history là security definer, không qua RLS). ĐỌC giữ nguyên: ceo/admin/trainer + chính chủ.
--   2) talents: trigger chặn role khác ceo/admin đổi 4 cột rate (insert có rate ≠ 0 cũng chặn). service_role/postgres đi thẳng
--      (route tạo tài khoản ở server, SQL Editor) — cùng khuôn guard_profile_update (0136).
-- Chạy trước hay sau deploy đều được: client không ghi các cột/bảng này bằng role ops.

-- ============================================================================
-- 1) talent_rate_history — quyền ghi không được nới quyền đọc
-- ============================================================================
drop policy if exists talent_rate_history_write_ceo_ops on public.talent_rate_history;
drop policy if exists talent_rate_history_insert_ceo_admin on public.talent_rate_history;
drop policy if exists talent_rate_history_update_ceo_admin on public.talent_rate_history;
drop policy if exists talent_rate_history_delete_ceo_admin on public.talent_rate_history;

create policy talent_rate_history_insert_ceo_admin on public.talent_rate_history for insert
  with check ((select current_user_role()) in ('ceo', 'admin'));
create policy talent_rate_history_update_ceo_admin on public.talent_rate_history for update
  using ((select current_user_role()) in ('ceo', 'admin'))
  with check ((select current_user_role()) in ('ceo', 'admin'));
create policy talent_rate_history_delete_ceo_admin on public.talent_rate_history for delete
  using ((select current_user_role()) in ('ceo', 'admin'));

-- ============================================================================
-- 2) talents — chỉ ceo/admin đặt rate
-- ============================================================================
create or replace function guard_talent_rate_write() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- SECURITY INVOKER có chủ ý: chỉ lời gọi bằng JWT người dùng bị kiểm; service_role/postgres đi thẳng.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if coalesce((select current_user_role())::text, '') in ('ceo', 'admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if coalesce(new.rate_per_session, 0) <> 0 or coalesce(new.rate_per_hour, 0) <> 0
       or coalesce(new.assistant_rate_per_hour, 0) <> 0 or coalesce(new.commission_rate, 0) <> 0 then
      raise exception 'Chỉ CEO/Admin đặt được rate host/trợ.' using errcode = '42501';
    end if;
    return new;
  end if;
  if new.rate_per_session is distinct from old.rate_per_session
     or new.rate_per_hour is distinct from old.rate_per_hour
     or new.assistant_rate_per_hour is distinct from old.assistant_rate_per_hour
     or new.commission_rate is distinct from old.commission_rate then
    raise exception 'Chỉ CEO/Admin đổi được rate host/trợ.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function guard_talent_rate_write() from public;

drop trigger if exists trg_guard_talent_rate_write on public.talents;
create trigger trg_guard_talent_rate_write
  before insert or update on public.talents
  for each row execute function guard_talent_rate_write();

-- ============================================================================
-- Chốt tự kiểm
-- ============================================================================
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'talent_rate_history' and cmd in ('ALL', 'SELECT')
      and coalesce(qual, '') ~ '''operations'''
  ) then
    raise exception '0197: talent_rate_history vẫn có policy cho operations đọc';
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'trg_guard_talent_rate_write' and tgrelid = 'public.talents'::regclass) then
    raise exception '0197: thiếu trigger trg_guard_talent_rate_write';
  end if;
end $$;
