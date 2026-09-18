-- Hồ sơ talent: 2 nhãn Host / Assistant + biệt danh hiển thị trên lịch (user chốt 2026-09-19).
--
-- 1) Nhãn vai trò: thực tế agency chỉ có Host và Trợ live (Assistant); KOC/KOL/MC là nhãn demo
--    không dùng. Nhãn CHỈ để phân loại hồ sơ — không chặn gì: mọi ô chọn host/trợ trong app vẫn
--    liệt kê toàn bộ talent, cùng một người hôm nay host mai trợ là bình thường (xem 0014).
--    Giữ 3 giá trị cũ trong enum cho khỏi vỡ dòng cũ nếu có; UI chỉ còn đưa ra 2.
-- 2) `nickname`: tên ngắn hiển thị ở ô lịch/lưới. Trước đây ô lịch tự cắt 2 từ cuối của họ tên
--    ("Nguyễn Thị Kim Vân" → "Kim Vân") — agency có 3 người trùng "Kim Vân" nên phải có tên riêng
--    do ops đặt. Rỗng thì UI rơi về cách cắt cũ.
--
-- LƯU Ý khi chạy trong SQL Editor: `alter type ... add value` không được dùng giá trị mới trong cùng
-- transaction. File này không dùng 'Assistant' ở đâu sau đó nên chạy nguyên file là được; nếu
-- vẫn báo "unsafe use of new value", chạy riêng dòng alter type trước rồi chạy phần còn lại.

alter type talent_role add value if not exists 'Assistant';

alter table talents add column if not exists nickname text not null default '';

-- View đọc (0047/0048/0049/0055): thêm nickname, giữ nguyên mask rate/commission/rate_per_hour.
-- `create or replace view` chỉ cho THÊM cột ở cuối — chèn giữa là lỗi "cannot change name of view column".
create or replace view talents_secure as
select
  id, name, avatar, role, gender, niches, avg_gmv_per_session, total_gmv, ctr_avg, cvr_avg,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then rate_per_session else null end as rate_per_session,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then commission_rate else null end as commission_rate,
  overall_score, availability_status, brands_worked_with, phone, date_of_birth, profile_id,
  created_at, updated_at,
  case when current_user_role() in ('ceo', 'admin') or profile_id = auth.uid()
    then rate_per_hour else null end as rate_per_hour,
  nickname
from talents;

grant select on talents_secure to authenticated;
