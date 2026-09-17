-- FIX (audit data model 2026-09-08): brand_dataraw_imports không có ràng buộc DB nào chặn 2 batch
-- trùng brand_id + report_type + cùng tháng (period_start). Dedup hiện tại chỉ ở tầng app
-- (findExistingImportForMonth() trong lib/db/brandDataRaw.ts) — đọc danh sách import hiện có, tìm
-- bản cùng tháng rồi quyết định update-đè hay insert-mới. Đây là race điển hình: 2 request upload
-- gần như đồng thời (double-click nút xác nhận, hoặc 2 ops cùng brand upload cùng lúc) đều đọc
-- thấy "chưa có batch tháng này", đều insert mới → 2 batch trùng brand+loại+tháng, brand_dataraw_rows
-- nhân đôi, mọi số liệu Report Tháng đọc từ Dataraw cộng dồn sai mà không có gì báo lỗi.
--
-- Sửa: unique index trên (brand_id, report_type, tháng của period_start) — đúng khoá gộp mà app
-- đang dùng (monthKey() cắt period_start về "YYYY-MM"). Dùng date_trunc('month', period_start) để
-- không phụ thuộc period_start luôn là ngày 01 (dù thực tế TikTok export luôn vậy). Loại trừ
-- period_start null (file không parse được ngày — parseDataRawExcel để null, không gộp được theo
-- tháng nên không nên bị ràng buộc, khớp hành vi app hiện tại: monthKey() trả undefined thì
-- findExistingImportForMonth() luôn trả undefined, tức luôn insert mới, không giới hạn số lượng).
--
-- An toàn với data cũ: kiểm tra trước, nếu đã có duplicate thật (không nên có vì app luôn gộp
-- đúng trong luồng bình thường, nhưng chưa chắc chắn 100% vì đây chính là race đang sửa) thì raise
-- lỗi rõ ràng kèm danh sách thay vì để Postgres báo lỗi tạo index chung chung — dọn tay (giữ bản
-- imported_at mới nhất, xoá brand_dataraw_rows + brand_dataraw_imports của các bản cũ hơn) rồi
-- chạy lại migration này.
do $$
declare
  dup record;
  dup_count int := 0;
begin
  for dup in
    select brand_id, report_type, date_trunc('month', period_start) as period_month, count(*) as n
    from brand_dataraw_imports
    where period_start is not null
    group by 1, 2, 3
    having count(*) > 1
  loop
    dup_count := dup_count + 1;
    raise notice 'Trùng batch: brand_id=%, report_type=%, tháng=%, số batch=%',
      dup.brand_id, dup.report_type, dup.period_month, dup.n;
  end loop;

  if dup_count > 0 then
    raise exception 'Có % nhóm (brand_id, report_type, tháng) đang có nhiều hơn 1 batch — xem NOTICE ở trên, dọn tay rồi chạy lại migration này.', dup_count;
  end if;
end $$;

-- SỬA 2026-09-18: bản trước viết `date_trunc('month', period_start)` không ép kiểu, và câu đó
-- KHÔNG chạy được trên bất kỳ Postgres nào — `period_start` kiểu `date`, mà trong họ kiểu ngày
-- giờ thì `timestamptz` là kiểu ƯU TIÊN, nên Postgres chọn `date_trunc(text, timestamptz)` (STABLE
-- vì phụ thuộc TimeZone của session) thay vì bản `timestamp` (IMMUTABLE) — và index expression thì
-- bắt buộc IMMUTABLE: `ERROR: functions in index expression must be marked IMMUTABLE`.
-- Ép thẳng `::timestamp` để chốt đúng bản IMMUTABLE. Kết quả không đổi: period_start là `date`,
-- không mang múi giờ, cắt về đầu tháng cho ra cùng một giá trị.
create unique index if not exists idx_brand_dataraw_imports_brand_type_month
  on brand_dataraw_imports (brand_id, report_type, (date_trunc('month', period_start::timestamp)))
  where period_start is not null;
