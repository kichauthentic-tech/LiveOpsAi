import * as XLSX from "xlsx";

// Tên sheet của Excel giới hạn 31 ký tự, không nhận : \ / ? * [ ]. Tên trùng nhau (VD 2 sheet
// cùng bị cắt về 1 chữ) phải lệch đi, không thì book_append_sheet ghi đè mất sheet trước.
function safeSheetName(name: string, usedNames: Set<string>): string {
  const base = name.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  let candidate = base;
  let n = 2;
  while (usedNames.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
    n += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

// Xuất file — tiện ích DÙNG CHUNG cho mọi màn cần tải bảng đang xem ra Excel (Đợt C/4). Nhận đúng
// những gì đã hiện trên màn hình (rows đã lọc/đã che số theo role) — không tự đọc DB, không tự áp
// luật ẩn/hiện riêng, nên KHÔNG thể lộ thêm gì ngoài những gì người dùng đã thấy trên bảng.
export function downloadRowsAsXlsx(sheetName: string, rows: Record<string, string | number>[], filename: string): void {
  downloadSheetsAsXlsx([{ name: sheetName, rows }], filename);
}

// Xuất nhiều sheet trong 1 file — dùng cho "trung tâm report" (Report Tháng nhiều tab): mỗi bảng
// đang hiện trên 1 tab đi vào 1 sheet riêng, gộp lại thành 1 lần tải thay vì bắt người xem bấm
// từng tab. Sheet với rows rỗng vẫn được tạo (trống, không lỗi) để người xem biết tab đó chưa có
// dữ liệu chứ không phải thiếu sheet.
export function downloadSheetsAsXlsx(sheets: { name: string; rows: Record<string, string | number>[] }[], filename: string): void {
  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();
  for (const { name, rows } of sheets) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, safeSheetName(name, usedNames));
  }
  XLSX.writeFile(wb, filename);
}
