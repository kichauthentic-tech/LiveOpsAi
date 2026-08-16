-- Bỏ followers_tiktok (không dùng tới trong thực tế vận hành), thêm total_gmv
-- (GMV tích lũy toàn thời gian của talent) trên bảng talents.
--
-- View talents_secure không thể sửa bằng CREATE OR REPLACE khi bớt cột, nên
-- phải drop rồi tạo lại (xem 0047/0048 cho bối cảnh vì sao view này tồn tại
-- và vì sao cần security_invoker = false + grant select(id) riêng).

alter table talents add column if not exists total_gmv numeric not null default 0;

drop view if exists talents_secure;

create view talents_secure
as
select
  id,
  name,
  avatar,
  role,
  gender,
  niches,
  avg_gmv_per_session,
  total_gmv,
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

alter view talents_secure set (security_invoker = false);
grant select on talents_secure to authenticated;

alter table talents drop column if exists followers_tiktok;
