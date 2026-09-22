-- SỬA REGRESSION CỦA 0100 (phát hiện ngay sau khi chạy 0100 trên Supabase thật, 2026-09-21).
--
-- Triệu chứng: đăng nhập bằng tài khoản talent thì app đứng ở "Đang tải hồ sơ người dùng…".
-- Đo trên DB thật: `GET /rest/v1/talents_secure?select=*` với role talent mất 19–40s rồi Cloudflare
-- trả 522; cũng query đó với role admin: 0,28s; talent mà chỉ chọn cột không mask (`select=id,name`):
-- 0,25s.
--
-- Nguyên nhân: điều kiện mask nằm trong CASE của view nên được tính LẠI TỪNG DÒNG, và mỗi cột lương
-- là một CASE riêng ⇒ 4 cột × N talent lần gọi hàm. Role ceo/admin thoát ngay ở vế đầu
-- (`current_user_role() in ('ceo','admin')`) nên không thấy chậm; role talent phải chạy hết cả 3 vế,
-- trong đó 2 vế là hàm security definer tự query bảng `profiles`. Với 33 talent = 132 lượt gọi
-- `current_user_role()` + 132 lượt `current_user_talent_id()` trong một câu query. Trước 0100 chỉ có
-- vế `current_user_role()` nên còn lết được; 0100 thêm vế thứ hai là vượt ngưỡng timeout.
--
-- Cách sửa: bọc mỗi vế trong scalar subquery `(select …)`. Postgres nâng nó thành InitPlan — tính
-- MỘT lần cho cả câu query thay vì mỗi dòng (đúng pattern Supabase khuyến nghị cho RLS/`auth.uid()`).
-- Logic mask không đổi một chữ, chỉ đổi số lần tính.
--
-- Quy ước từ nay: mọi điều kiện dùng `auth.uid()` / `current_user_role()` / `current_user_talent_id()`
-- trong THÂN VIEW hoặc POLICY đều phải viết dạng `(select …)`.

create or replace view talents_secure as
select
  id, name, avatar, role, gender, niches, avg_gmv_per_session, total_gmv, ctr_avg, cvr_avg,
  case when (select current_user_role()) in ('ceo', 'admin')
         or profile_id = (select auth.uid())
         or id = (select current_user_talent_id())
    then rate_per_session else null end as rate_per_session,
  case when (select current_user_role()) in ('ceo', 'admin')
         or profile_id = (select auth.uid())
         or id = (select current_user_talent_id())
    then commission_rate else null end as commission_rate,
  overall_score, availability_status, brands_worked_with, phone, date_of_birth, profile_id,
  created_at, updated_at,
  case when (select current_user_role()) in ('ceo', 'admin')
         or profile_id = (select auth.uid())
         or id = (select current_user_talent_id())
    then rate_per_hour else null end as rate_per_hour,
  nickname,
  case when (select current_user_role()) in ('ceo', 'admin')
         or profile_id = (select auth.uid())
         or id = (select current_user_talent_id())
    then assistant_rate_per_hour else null end as assistant_rate_per_hour
from talents;

grant select on talents_secure to authenticated;
