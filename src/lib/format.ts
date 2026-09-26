// Định dạng số hiển thị — một kiểu cho cả app (audit UX 2026-09-26). Trước đây mỗi component tự viết
// hàm riêng (71 hàm format* ở 31 file), khoảng 50 chỗ dùng `toFixed` nên hiện "2.18%" kiểu Mỹ ngay
// cạnh "2,18%" kiểu Việt, và tiền lúc "₫" lúc "đ" lúc "M đ". Quy ước:
//   - dấu thập phân phẩy, nghìn chấm (vi-VN) — không dùng toFixed cho chữ hiển thị;
//   - tiền đầy đủ hậu tố "đ", tiền rút gọn dùng formatCurrencyAdaptive (tỷ / triệu);
//   - thiếu số thì "—".
// `toFixed` vẫn đúng cho dữ liệu máy đọc: toạ độ SVG, giá trị ô input, cột số trong file Excel.
// tests/uiReadability.test.ts chặn toFixed quay lại chữ hiển thị.

/** Số với đúng `digits` chữ số thập phân (thay `n.toFixed(digits)` trong chữ hiển thị). */
export function fmtFixed(n: number, digits = 0): string {
  return n.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** Số với tối đa `digits` chữ số thập phân, bỏ số 0 thừa (1,5 chứ không 1,50). */
export function fmtNum(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString("vi-VN", { maximumFractionDigits: digits });
}

/** Giá trị đã là phần trăm (2.18 → "2,18%"). */
export function fmtPctValue(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${fmtFixed(n, digits)}%`;
}

/** Tiền đầy đủ: 53733488 → "53.733.488đ". */
export function fmtVndFull(n: number): string {
  return `${Math.round(n).toLocaleString("vi-VN")}đ`;
}
