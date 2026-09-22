-- Audit 2026-09-21 — 2 lỗi dữ liệu/quyền phát hiện khi rà soát toàn dự án.
--
-- (1) TALENT KHÔNG XEM ĐƯỢC RATE CỦA CHÍNH MÌNH
-- View `talents_secure` (0047 → 0089) chỉ mở cột lương khi `talents.profile_id = auth.uid()`.
-- Nhưng luồng tạo tài khoản thật (server /api/admin/users/invite) chỉ ghi
-- `profiles.assigned_talent_id` khi ops chọn một talent CÓ SẴN — chỉ nhánh "tạo hồ sơ mới cùng lúc
-- với tài khoản" mới ghi ngược `talents.profile_id`. Trên DB thật 2026-09-21: 33/33 talent có
-- `profile_id = null`, và tài khoản talent duy nhất đọc `talents_secure` ra rate_per_session = null
-- → UI hiện "0 đ/live" như thể lương bằng 0 (đã verify bằng đăng nhập thật).
-- Sửa gốc: chính chủ được xác định bằng ĐÚNG cái link mà toàn app đang dùng
-- (`profiles.assigned_talent_id`), không phụ thuộc cột `talents.profile_id` có được ghi hay không.
-- Vẫn backfill + vẫn giữ điều kiện cũ để dữ liệu 2 chiều nhất quán, không phá hành vi cũ.
--
-- (2) MA TRẬN QUYỀN HIỆN "13/12 PERMISSIONS"
-- `role_permissions.permissions` còn 2 key của module đã xoá (`generate_scripts` — module AI Script
-- Gen gỡ ở 0042; `view_executive_brief` — Dashboard gỡ 2026-09-13) và THIẾU `export_reports` vốn có
-- trong `PermissionKey` của app. Không key nào trong 3 key này còn được dùng để gate màn hình, nên
-- đây thuần tuý là dọn cho khớp định nghĩa — không đổi quyền thực tế của ai.

-- ---------------------------------------------------------------------------
-- 1) Talent xem được rate của chính mình
-- ---------------------------------------------------------------------------

-- Trả talent_id mà tài khoản đang đăng nhập được gán. Tự giới hạn theo auth.uid() nên không cần
-- guard role trong thân hàm: người gọi chỉ đọc được đúng dòng profiles của chính mình.
create or replace function current_user_talent_id() returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select assigned_talent_id from profiles where id = auth.uid()
$$;

revoke all on function current_user_talent_id() from public;
grant execute on function current_user_talent_id() to authenticated;

-- Đồng bộ chiều còn lại cho dữ liệu đang có (không ghi đè link đã đúng).
update talents t
   set profile_id = p.id
  from profiles p
 where p.assigned_talent_id = t.id
   and t.profile_id is distinct from p.id;

-- View: giữ NGUYÊN danh sách + thứ tự cột của 0089, chỉ đổi điều kiện "được xem lương".
create or replace view talents_secure as
select
  id, name, avatar, role, gender, niches, avg_gmv_per_session, total_gmv, ctr_avg, cvr_avg,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid() or id = current_user_talent_id()
    then rate_per_session else null end as rate_per_session,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid() or id = current_user_talent_id()
    then commission_rate else null end as commission_rate,
  overall_score, availability_status, brands_worked_with, phone, date_of_birth, profile_id,
  created_at, updated_at,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid() or id = current_user_talent_id()
    then rate_per_hour else null end as rate_per_hour,
  nickname,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid() or id = current_user_talent_id()
    then assistant_rate_per_hour else null end as assistant_rate_per_hour
from talents;

grant select on talents_secure to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Dọn key quyền chết, bổ sung key thiếu
-- ---------------------------------------------------------------------------

update role_permissions
   set permissions =
         (permissions - 'generate_scripts' - 'view_executive_brief')
         || jsonb_build_object(
              'export_reports',
              coalesce(
                permissions -> 'export_reports',
                to_jsonb(role::text in ('ceo', 'admin', 'operations', 'brand'))
              )
            );
