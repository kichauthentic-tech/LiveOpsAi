-- 0179 — Cổng brand (21/10/2026, đề xuất "một thẻ kênh" https://claude.ai/artifact/8tca7KBXNqqdyMAqzTWcTG — user chốt cả 4 điểm).
--
-- Hai việc, theo đúng thứ tự đề xuất "vá quyền trước, mở cổng sau":
--
-- Phần 1–3 — ĐÓNG 3 CHỖ ROLE BRAND ĐỌC/GHI QUÁ QUYỀN (đo 16/10 bằng replay 0001→0178, đăng nhập vai brand A; production đã có một tài
--   khoản role brand gắn Franklin, tạo 27/07):
--   1) `profiles` — policy "profiles_read_all" của 0001 cho MỌI phiên đăng nhập đọc hết bảng ⇒ brand đọc được email + role của mọi
--      tài khoản, cả brand khác. Mới: brand (và phiên chưa có dòng profiles) chỉ đọc dòng của chính mình; ceo/admin/operations/
--      trainer/talent giữ nguyên như cũ (màn Phân Quyền, cấp tài khoản host, Bàn Trainer đọc danh sách).
--   2) `talents_secure` — brand đọc được SĐT, ngày sinh, tổng GMV, GMV/ca, CTR/CVR, điểm, `brands_worked_with`, `profile_id` của
--      mọi host. Mới: các cột đó chỉ hiện cho ceo/admin/operations/trainer/talent hoặc chính chủ; brand còn tên, ảnh, vai, biệt danh
--      (đủ cho lịch). Cột rate giữ luật 0176 (ceo/admin/trainer/chính chủ). So role bằng `::text` để chạy được cả khi DB CHƯA có giá
--      trị enum 'trainer' (0175 chưa chạy).
--   3) Bốn policy GHI cũ cho brand ở `recurring_shift_templates` (0037) và `promo_schemes` (0038) — brand không còn màn nào ghi hai
--      bảng này (chỉ ops tạo ca, 01/10) ⇒ bỏ.
--
-- Phần 4 — BẢN TIN (`brand_bulletins`): số trong tháng brand được thấy. Số của tháng chưa phát hành vẫn bị che ở `live_sessions_secure`
--   (0107) — cổng brand KHÔNG lách luật đó; thay vào đó ops bấm "Gửi bản tin" ở Chi tiết kênh, app chụp lại thẻ kênh lúc đó
--   (tới nay, nhịp so kế hoạch, dự kiến cuối tháng, giờ đã chạy so cam kết, lời nhắn). Không có nhãn/xác suất trong bản tin (luật 4).
--   Ghi chỉ qua RPC `publish_brand_bulletin` (ceo/operations/admin); đọc: ops mọi kênh, brand chỉ kênh của mình. Mỗi lần gửi một dòng
--   mới (giữ lịch sử đã gửi gì cho khách) — cổng đọc dòng mới nhất của tháng.
--
-- Thứ tự deploy: trước hay sau client đều được. Client cũ không đọc bảng mới; client mới gặp DB chưa có bảng thì cổng brand ghi
-- "chưa có bản tin" và nút gửi báo "chưa chạy 0179". Với 0175/0176 (Bàn Trainer): chạy trước hay sau 0179 đều ra cùng định nghĩa
-- `talents_secure` (0176 đã sửa cùng luật che cột cho brand). Chạy lại nhiều lần không sao.

-- ===== Phần 1 — profiles: brand chỉ đọc dòng của mình =====
drop policy if exists "profiles_read_all" on profiles;
drop policy if exists "profiles_read_scoped" on profiles;
create policy "profiles_read_scoped" on profiles for select
  using (
    coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent')
    or id = (select auth.uid())
  );

-- ===== Phần 2 — talents_secure: che cột cá nhân / hiệu suất với brand =====
create or replace view public.talents_secure as
select
  id,
  name,
  avatar,
  role,
  gender,
  niches,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then avg_gmv_per_session end as avg_gmv_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then total_gmv end as total_gmv,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then ctr_avg end as ctr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then cvr_avg end as cvr_avg,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then rate_per_session end as rate_per_session,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then commission_rate end as commission_rate,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then overall_score end as overall_score,
  availability_status,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then brands_worked_with end as brands_worked_with,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then phone end as phone,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then date_of_birth end as date_of_birth,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'operations', 'trainer', 'talent') or profile_id = (select auth.uid()) then profile_id end as profile_id,
  created_at,
  updated_at,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then rate_per_hour end as rate_per_hour,
  nickname,
  case when coalesce((select current_user_role())::text, '') in ('ceo', 'admin', 'trainer') or profile_id = (select auth.uid()) or id = (select current_user_talent_id()) then assistant_rate_per_hour end as assistant_rate_per_hour
from talents;

-- ===== Phần 3 — bỏ quyền ghi cũ của brand =====
drop policy if exists "recurring_shift_templates_write_brand_own" on recurring_shift_templates;
drop policy if exists "promo_schemes_insert_brand_own" on promo_schemes;
drop policy if exists "promo_schemes_update_brand_own" on promo_schemes;
drop policy if exists "promo_schemes_delete_brand_own" on promo_schemes;

-- ===== Phần 4 — bản tin cho brand =====
create table if not exists brand_bulletins (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  platform text not null default 'TikTok',
  month date not null,
  as_of date,
  payload jsonb not null,
  note text not null default '',
  published_by uuid,
  published_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'brand_bulletins_platform_check') then
    alter table brand_bulletins add constraint brand_bulletins_platform_check check (platform in ('TikTok', 'Shopee'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_bulletins_month_check') then
    alter table brand_bulletins add constraint brand_bulletins_month_check check (extract(day from month) = 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_bulletins_payload_check') then
    alter table brand_bulletins add constraint brand_bulletins_payload_check check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 20000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'brand_bulletins_note_check') then
    alter table brand_bulletins add constraint brand_bulletins_note_check check (char_length(note) <= 2000);
  end if;
end $$;

create index if not exists idx_brand_bulletins_channel on brand_bulletins(brand_id, platform, month, published_at desc);

-- Kênh phải tồn tại (0149) — cùng luật với các bảng có cột sàn.
drop trigger if exists trg_guard_channel_exists on brand_bulletins;
create trigger trg_guard_channel_exists before insert or update of brand_id, platform on brand_bulletins
  for each row execute function private.guard_channel_exists();

create or replace function publish_brand_bulletin(
  p_brand_id uuid,
  p_platform text,
  p_month date,
  p_as_of date,
  p_payload jsonb,
  p_note text default ''
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'operations', 'admin') then
    raise exception 'Chỉ ceo/operations/admin gửi bản tin cho brand' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Bản tin phải là một object';
  end if;
  insert into brand_bulletins (brand_id, platform, month, as_of, payload, note, published_by, published_at)
  values (p_brand_id, coalesce(p_platform, 'TikTok'), date_trunc('month', p_month::timestamp)::date, p_as_of, p_payload, coalesce(p_note, ''), auth.uid(), now())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function publish_brand_bulletin(uuid, text, date, date, jsonb, text) from public;
grant execute on function publish_brand_bulletin(uuid, text, date, date, jsonb, text) to authenticated;

-- RLS ở cuối file: tests/sqlGuards quét 1200 ký tự sau mỗi `create policy`, đặt trước hàm thì dính lời gọi current_user_role() trong thân hàm.
alter table brand_bulletins enable row level security;
revoke all on brand_bulletins from anon;
grant select on brand_bulletins to authenticated;
drop policy if exists "brand_bulletins_read" on brand_bulletins;
create policy "brand_bulletins_read" on brand_bulletins for select
  using (
    (select current_user_role()) in ('ceo', 'operations', 'admin')
    or ((select current_user_role()) = 'brand' and brand_id = (select current_user_brand_id()))
  );
-- Không có policy insert/update/delete: chỉ publish_brand_bulletin (security definer) ghi được; bản tin đã gửi không sửa.

-- ===== Chốt tự kiểm =====
do $$
begin
  if exists (select 1 from pg_policies where tablename = 'profiles' and policyname = 'profiles_read_all') then
    raise exception '0179 tự kiểm: profiles_read_all vẫn còn';
  end if;
  if position('phone' in pg_get_viewdef('public.talents_secure')) = 0 or pg_get_viewdef('public.talents_secure') !~* 'case\s+when[^;]*phone' then
    raise exception '0179 tự kiểm: talents_secure chưa che SĐT';
  end if;
  if exists (select 1 from pg_policies where policyname in ('recurring_shift_templates_write_brand_own', 'promo_schemes_insert_brand_own', 'promo_schemes_update_brand_own', 'promo_schemes_delete_brand_own')) then
    raise exception '0179 tự kiểm: còn policy ghi cũ của brand';
  end if;
  if to_regclass('public.brand_bulletins') is null then
    raise exception '0179 tự kiểm: thiếu bảng brand_bulletins';
  end if;
end $$;
