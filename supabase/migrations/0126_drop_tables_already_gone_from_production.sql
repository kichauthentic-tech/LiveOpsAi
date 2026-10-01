-- 0126 — ĐỒNG BỘ CHUỖI MIGRATION VỚI PRODUCTION: bỏ 5 bảng production đã không còn.
-- (Phát hiện 2026-10-01 khi đối chiếu schema thật qua PostgREST với chuỗi migration — xem P2a-11.)
--
-- ⚠️ CHƯA CHẠY — cần user chạy tay như mọi migration khác.
--
-- ============================================================================
-- VẤN ĐỀ
-- ============================================================================
-- 5 bảng dưới đây được migration tạo ra nhưng KHÔNG migration nào drop, mà production thì không còn:
--
--     live_stream_incidents   (tạo ở 0026)
--     product_samples         (tạo ở 0025)
--     script_library          (tạo ở 0027)
--     sku_platform_prices     (tạo ở 0031)
--     strategic_directives    (tạo ở 0001)
--
-- `strategic_directives` đã có trong "Sự cố vận hành đáng nhớ: bảng bị xoá tay khỏi production không
-- qua migration" (23/09). Bốn cái còn lại chưa từng được ghi lại ở đâu — nhiều khả năng cùng một đợt
-- dọn tay đó.
--
-- Hệ quả: **chuỗi migration không replay ra được production nữa.** Dựng môi trường mới (staging, hay
-- harness Postgres cô lập như đã dùng để verify 0110) sẽ thừa 5 bảng so với thật. Chính vì vậy lần
-- verify 0110 đã phải "xoá `strategic_directives` trước 0105 để mô phỏng đúng production" — một thao
-- tác tay lẽ ra không ai phải nhớ.
--
-- Đây là migration DỌN SỔ SÁCH, không phải quyết định bỏ tính năng: việc bỏ đã xảy ra rồi, file này
-- chỉ chép lại cho đúng.
--
-- ĐÃ KIỂM TRƯỚC KHI VIẾT (2026-10-01):
--   • 0 khoá ngoại từ bảng khác trỏ tới 5 bảng này;
--   • 0 hàm còn sống có thân đọc/ghi chúng (nếu có thì nó đã hỏng sẵn trên production từ lâu);
--   • 0 view đọc chúng;
--   • 0 call site trong `src/`, 0 file trong `supabase/seed` và `supabase/tests`;
--   • policy của chúng (tạo qua vòng lặp ở 0001/0059/0105) tự rụng theo bảng, không cần dọn riêng.
--
-- CỐ Ý KHÔNG DÙNG `CASCADE`: nếu còn một thứ gì đó phụ thuộc mà 5 phép kiểm trên bỏ sót, tôi muốn
-- migration VỠ TO ở đây hơn là lặng lẽ kéo theo thứ khác xuống.
--
-- ============================================================================
-- CHỐT AN TOÀN: KHÔNG XOÁ BẢNG CÒN DỮ LIỆU
-- ============================================================================
-- Bằng chứng "production không còn 5 bảng này" là chúng vắng mặt trong OpenAPI của PostgREST khi gọi
-- bằng service role. Đó là suy luận mạnh nhưng KHÔNG phải đọc thẳng `pg_catalog` (chỉ có JWT, không
-- có connection string tới Postgres). Nếu suy luận đó sai ở dù chỉ một bảng, một lệnh `drop` thẳng
-- tay sẽ xoá dữ liệu thật.
--
-- Nên vòng lặp dưới đây:
--   • bảng không tồn tại  → bỏ qua, ghi notice  (đường đi mong đợi trên production);
--   • bảng tồn tại, rỗng  → drop                (đường đi trên môi trường dựng mới từ chuỗi migration);
--   • bảng tồn tại, CÓ DÒNG → `raise exception`, DỪNG CẢ MIGRATION, không xoá gì.
-- Nhánh thứ ba mà chạy nghĩa là giả định của tôi sai — lúc đó phải đọc lại chứ không phải ép xoá.
-- ============================================================================

do $$
declare
  t text;
  n bigint;
  dropped int := 0;
  skipped int := 0;
begin
  foreach t in array array[
    'live_stream_incidents',
    'product_samples',
    'script_library',
    'sku_platform_prices',
    'strategic_directives'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is null then
      raise notice '0126: %  — không tồn tại, bỏ qua (đúng như production)', t;
      skipped := skipped + 1;
      continue;
    end if;

    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then
      raise exception
        '0126 DỪNG: bảng public.% còn % dòng dữ liệu. Giả định "production đã không còn bảng này" SAI — '
        'đọc lại trước khi xoá, đừng ép chạy.', t, n
        using errcode = 'data_exception';
    end if;

    execute format('drop table public.%I', t);
    raise notice '0126: %  — rỗng, đã drop', t;
    dropped := dropped + 1;
  end loop;

  raise notice '0126 xong: drop % bảng, bỏ qua % bảng (đã không còn).', dropped, skipped;
end $$;
