-- Bảo mật Rate Card/Hoa hồng của Talent + khoá cứng Finance & HR về ceo/admin.
--
-- Bối cảnh: RLS trước đây cho MỌI authenticated user đọc full cột `talents`
-- (kể cả rate_per_session/commission_rate) và full `talent_rate_history` +
-- `session_finance`. Postgres RLS chỉ lọc theo HÀNG, không lọc theo CỘT, và mọi
-- role trong app dùng chung 1 Postgres role `authenticated` (phân biệt qua
-- auth.uid() trong policy) — nên cách đúng duy nhất để ẩn 2 cột nhạy cảm khỏi
-- một số role là 1 VIEW mask theo điều kiện, kết hợp revoke SELECT trực tiếp
-- trên bảng gốc. Đây là lần đầu tiên codebase dùng view cho RLS.

-- ============================================================
-- Cột mới: ngày sinh Talent (dùng cho trang "Hồ Sơ Của Tôi" tự sửa)
-- ============================================================
alter table talents add column if not exists date_of_birth date;

-- ============================================================
-- View talents_secure — mask rate_per_session/commission_rate trừ ceo/admin
-- hoặc chính talent đó (talents.profile_id = auth.uid()).
-- ============================================================
create or replace view talents_secure
with (security_invoker = true)
as
select
  id,
  name,
  avatar,
  role,
  gender,
  niches,
  followers_tiktok,
  avg_gmv_per_session,
  ctr_avg,
  cvr_avg,
  case
    when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then rate_per_session
    else null
  end as rate_per_session,
  case
    when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then commission_rate
    else null
  end as commission_rate,
  overall_score,
  availability_status,
  brands_worked_with,
  phone,
  date_of_birth,
  profile_id,
  created_at,
  updated_at
from talents;

grant select on talents_secure to authenticated;

-- Chặn đọc trực tiếp bảng gốc (bỏ qua view sẽ lộ rate/commission) — app đọc qua
-- talents_secure; ghi (insert/update/delete) vẫn qua bảng gốc, không đổi
-- (RLS ghi `talents_write_ceo_ops` sẵn có đã giới hạn ceo/operations/admin).
revoke select on talents from authenticated;

-- ============================================================
-- talent_rate_history — cùng mức nhạy cảm như rate/commission hiện tại, siết
-- read xuống ceo/admin + chính talent đó (current_user_talent_id() có sẵn từ
-- 0014_host_scheduling.sql).
-- ============================================================
drop policy if exists "talent_rate_history_read_all" on talent_rate_history;
create policy "talent_rate_history_read_ceo_admin_self" on talent_rate_history for select
  using (current_user_role() in ('ceo', 'admin') or talent_id = current_user_talent_id());

-- ============================================================
-- session_finance — khoá cứng Finance & HR về ceo/admin (trước đây mọi
-- authenticated đọc được), khớp quyết định "toàn bộ finance chỉ admin/ceo".
-- ============================================================
drop policy if exists "session_finance_read_all" on session_finance;
create policy "session_finance_read_ceo_admin" on session_finance for select
  using (current_user_role() in ('ceo', 'admin'));

-- ============================================================
-- Đồng bộ profiles.email khi talent tự đổi email đăng nhập qua Supabase Auth
-- (trước đây chỉ có trigger cho INSERT — handle_new_user — không có cho UPDATE,
-- nên profiles.email sẽ bị stale sau khi auth.users.email đổi và được xác nhận).
-- ============================================================
create or replace function sync_profile_email() returns trigger as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function sync_profile_email();
