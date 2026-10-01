-- 0125 — VÁ NỐT HÀM ANH EM BỊ BỎ SÓT: `unpublish_brand_monthly_report`.
-- (Phát hiện 2026-10-01 khi đọc lại toàn bộ SQL + đối chiếu schema thật qua PostgREST.)
--
-- ⚠️ CHƯA CHẠY — cần user chạy tay trên Supabase Dashboard như mọi migration khác.
--
-- ============================================================================
-- VÌ SAO
-- ============================================================================
-- `publish_brand_monthly_report` và `unpublish_brand_monthly_report` sinh ra cùng lúc trong
-- 0051, cùng một khuôn. 0114 đã vá khuôn đó cho hàm PUBLISH và ghi rõ trong chính file nó:
--
--     "(1) guard thiếu `coalesce` nên role NULL cho `NULL not in (...)` = NULL = `if` không chạy
--      (2) thiếu `set search_path = public` — đúng lỗ 0063"
--
-- Nhưng hàm UNPUBLISH thì không ai đụng: 0111, 0112 và 0114 đều không nhắc tới nó (grep = 0),
-- và tới hôm nay định nghĩa đang chạy vẫn là bản 0051 — còn nguyên CẢ HAI lỗi.
--
-- Cụ thể, bản 0051:
--     if current_user_role() not in ('ceo', 'admin', 'operations') then raise ...
-- `current_user_role()` là `select role from profiles where id = auth.uid()` — KHÔNG có dòng nào
-- khớp thì trả NULL (cột `profiles.role` là `not null`, nên NULL ở đây nghĩa là KHÔNG CÓ HỒ SƠ,
-- không phải role rỗng). Khi đó `NULL not in (...)` = NULL, `if NULL then` không chạy, nhánh raise
-- bị bỏ qua, và vì hàm là `security definer` nên lệnh UPDATE phía sau chạy luôn, vượt cả RLS.
--
-- PHẠM VI THỰC TẾ (đã kiểm, không thổi phồng):
--   • Khách VÔ DANH không khai thác được — 0109 đã `revoke all on all functions in schema public
--     from anon` kèm `alter default privileges`. Đường này đã kín.
--   • Vector còn lại: một phiên ĐÃ ĐĂNG NHẬP mà `profiles` không còn dòng tương ứng (hồ sơ bị xoá
--     trong lúc JWT còn hạn). Hẹp, nhưng đúng bằng lớp "NULL-role" mà 0111/0112 đã bỏ công đóng ở
--     11 policy khác — không có lý do gì để riêng hàm này hở.
--   • Role `brand`/`talent` KHÔNG lọt: `'brand' not in (...)` = true nên vẫn raise như thiết kế.
--
-- Vá bằng đúng khuôn 0114, không đổi gì khác về hành vi.
-- ============================================================================

create or replace function unpublish_brand_monthly_report(p_report_id uuid)
returns brand_monthly_reports as $$
declare
  v_report brand_monthly_reports;
begin
  if coalesce(current_user_role()::text, '') not in ('ceo', 'admin', 'operations') then
    raise exception 'not authorized to unpublish monthly report';
  end if;

  update brand_monthly_reports set
    status = 'draft',
    published_at = null,
    published_by = null
  where id = p_report_id
  returning * into v_report;

  if not found then
    raise exception 'brand_monthly_reports row % not found', p_report_id;
  end if;

  return v_report;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- `update_my_talent_profile` — chỉ pin search_path, KHÔNG đụng thân hàm
-- ============================================================================
-- Cũng là `security definer` thiếu `set search_path` (0063 chỉ pin đúng 4 hàm, chưa bao giờ là một
-- đợt quét toàn bộ). Guard của nó không dính lớp NULL-role vì nó lọc theo `current_user_talent_id()`
-- chứ không theo role, nên ở đây chỉ cần pin. Dùng ALTER thay vì chép lại thân hàm: ít rủi ro hơn
-- hẳn, và không phải đồng bộ lại whitelist cột của 0058.
alter function update_my_talent_profile(text, text, date) set search_path = public;

-- `trg_brand_platform_rate_history` (0118) — cũng là definer thiếu search_path. Là hàm trigger, chạy
-- khi `brand_platform_rates` bị ghi, và nó tự ghi sang `brand_platform_rate_history` bằng tên không
-- schema-qualify. Pin ở đây KHÔNG có đánh đổi nào: plpgsql vốn không được inline, nên không dính
-- chuyện mất inline như 3 hàm `language sql` nói ở cuối file.
alter function trg_brand_platform_rate_history() set search_path = public;

-- ============================================================================
-- CỐ Ý KHÔNG ĐỤNG Ở ĐỢT NÀY: current_user_role / current_user_brand_id / session_brand_id
-- ============================================================================
-- Ba hàm này cũng là `security definer` thiếu `set search_path`. KHÔNG pin ở đây vì có đánh đổi
-- thật chưa đo được: cả ba là `language sql`, và Postgres KHÔNG INLINE được hàm SQL có mệnh đề SET.
-- Ba hàm này bị gọi trong hàng chục policy RLS của gần như mọi bảng, nên mất inline là rủi ro hiệu
-- năng trên toàn app — đúng thứ phải đo trước khi làm, mà đo thì cần đọc dữ liệu production.
--
-- Mức độ nguy hiểm của việc thiếu search_path ở đây cũng thấp hơn vẻ ngoài: để khai thác, kẻ tấn
-- công phải tạo được object che tên `profiles` trong một schema nằm trước `public` trên search_path
-- của chính phiên đó — mà `authenticated` trên Supabase không có quyền CREATE schema, cũng không có
-- CREATE trên `public`. Nên đây là phòng thủ theo chiều sâu, không phải lỗ đang hở.
--
-- Ghi lại để ai làm tiếp biết đây là quyết định có chủ ý, không phải bỏ sót:
-- muốn pin thì pin kèm một lần đo thời gian truy vấn trước/sau trên các màn nặng RLS (Sổ Ca,
-- Report Tháng), và cân nhắc bọc `(select current_user_role())` ở các policy còn chưa bọc.
