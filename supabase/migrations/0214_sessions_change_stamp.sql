-- 0214 — "Dấu thay đổi" của danh sách ca, để lượt làm mới nền KHÔNG tải lại cả bảng khi không có gì đổi.
--
-- Vì sao (11/11): egress Supabase Free 2,73/5 GB sau 2 tuần. App làm mới danh sách ca mỗi 5 phút + mỗi lần quay lại tab,
-- mỗi lượt đọc trọn live_sessions + live_session_reports + session_staff_segments + session_segment_checkpoints cho MỌI
-- người đang mở app. Hàm này trả một chuỗi ngắn (~150 byte); client so với lần nạp trước, giống thì bỏ lượt tải.
--
-- Chuỗi gồm số dòng + mốc mới nhất của mọi bảng mà danh sách ca (view live_sessions_secure + bảng con) phụ thuộc:
--   • live_sessions: count + max(updated_at) (trigger trg_sessions_updated_at) — thêm/sửa/xoá đều đổi.
--   • live_session_reports: count + max(updated_at).
--   • session_staff_segments / session_segment_checkpoints: md5 của toàn bộ dòng (hai bảng nhỏ, không có updated_at).
--   • brand_monthly_reports: max(updated_at) — cột month_published của view đổi khi phát hành/thu hồi.
--   • session_live_snapshots: count — cột live_evidence của view.
-- Hai phần đầu có dạng `<số dòng>@<mốc ISO UTC>`: client dùng mốc để chỉ tải các ca / report có updated_at mới hơn (trừ lùi 2 phút
-- cho giao dịch commit trễ) rồi đối chiếu số dòng — lệch (có xoá, hoặc role không thấy hết dòng như brand) thì tải lại cả bảng.
-- ĐỪNG đổi thứ tự/định dạng 6 phần mà không sửa `parseStamp` (src/lib/db/sessions.ts).
-- SECURITY DEFINER: chỉ lộ số đếm + mốc thời gian toàn cục, không lộ dòng nào; cần vượt RLS để dấu giống nhau cho mọi role
-- (dấu "thừa nhạy" chỉ làm tải lại thừa, không làm sai số). Client chưa có hàm này (PGRST202) thì tải lại như cũ.
-- Chạy lại an toàn.

create or replace function public.sessions_change_stamp()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select concat_ws('|',
    (select count(*)::text || '@' || coalesce(to_char(max(updated_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '') from live_sessions),
    (select count(*)::text || '@' || coalesce(to_char(max(updated_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'), '') from live_session_reports),
    (select md5(coalesce(string_agg(t::text, ',' order by t::text), '')) from session_staff_segments t),
    (select md5(coalesce(string_agg(t::text, ',' order by t::text), '')) from session_segment_checkpoints t),
    (select coalesce(max(updated_at)::text, '') from brand_monthly_reports),
    (select count(*)::text from session_live_snapshots)
  );
$$;

revoke all on function public.sessions_change_stamp() from public, anon;
grant execute on function public.sessions_change_stamp() to authenticated;
