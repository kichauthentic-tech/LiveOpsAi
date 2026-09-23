import * as XLSX from "xlsx";

// Xuất file — tiện ích DÙNG CHUNG cho mọi màn cần tải bảng đang xem ra Excel (Đợt C/4). Nhận đúng
// những gì đã hiện trên màn hình (rows đã lọc/đã che số theo role) — không tự đọc DB, không tự áp
// luật ẩn/hiện riêng, nên KHÔNG thể lộ thêm gì ngoài những gì người dùng đã thấy trên bảng.
export function downloadRowsAsXlsx(sheetName: string, rows: Record<string, string | number>[], filename: string): void {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  // Tên sheet của Excel giới hạn 31 ký tự, không nhận : \ / ? * [ ].
  const safeSheetName = sheetName.replace(/[:\\/?*[\]]/g, " ").slice(0, 31);
  XLSX.utils.book_append_sheet(wb, sheet, safeSheetName);
  XLSX.writeFile(wb, filename);
}
