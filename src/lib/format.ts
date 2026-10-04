// Định dạng số hiển thị — một kiểu cho cả app (audit UX 2026-09-26). Trước đây mỗi component tự viết
// hàm riêng (71 hàm format* ở 31 file), khoảng 50 chỗ dùng `toFixed` nên hiện "2.18%" kiểu Mỹ ngay
// cạnh "2,18%" kiểu Việt, và tiền lúc "₫" lúc "đ" lúc "M đ". Quy ước:
//   - dấu thập phân phẩy, nghìn chấm (vi-VN) — không dùng toFixed cho chữ hiển thị;
//   - tiền KHÔNG có "đ"/"VNĐ" (user chốt 2026-09-27): chỗ chật (thẻ KPI, bảng, trục biểu đồ, badge) dùng
//     fmtVndShort → "50M", "1,2B", "500K"; chỗ cần con số chính xác (bảng lương, P&L từng ca, giá SKU,
//     tooltip) dùng fmtVndFull → "53.733.488". Không tự viết "tr"/"triệu"/"tỷ"/"k" ở component;
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

/** Tiền đầy đủ, không đơn vị: 53733488 → "53.733.488". */
export function fmtVndFull(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return Math.round(n).toLocaleString("vi-VN");
}

const SHORT_STEPS = [
  { at: 1e9, suffix: "B", digits: 2 },
  { at: 1e6, suffix: "M", digits: 1 },
  { at: 1e3, suffix: "K", digits: 0 }
] as const;

/** Tiền rút gọn, không đơn vị: 50_000_000 → "50M", 1_234_000_000 → "1,23B", 500_000 → "500K", 850 → "850". */
export function fmtVndShort(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  for (let i = 0; i < SHORT_STEPS.length; i++) {
    const { at, suffix, digits } = SHORT_STEPS[i];
    if (abs < at) continue;
    const scaled = n / at;
    const factor = 10 ** digits;
    // 999.960.000 làm tròn ra "1.000M" — đẩy lên bậc trên cho gọn ("1B").
    if (i > 0 && Math.round(Math.abs(scaled) * factor) / factor >= 1000) {
      const up = SHORT_STEPS[i - 1];
      return `${(n / up.at).toLocaleString("vi-VN", { maximumFractionDigits: up.digits })}${up.suffix}`;
    }
    return `${scaled.toLocaleString("vi-VN", { maximumFractionDigits: digits })}${suffix}`;
  }
  return Math.round(n).toLocaleString("vi-VN");
}

/**
 * "2026-10" → "10/2026". Tháng/ngày hiển thị luôn kiểu Việt — không in chuỗi máy "2026-10" ra màn hình (audit
 * người mới 2026-10-04: Nhân sự ca, Finance, Đối Soát còn in "Tháng 2026-10", "2026-06-01 ~ 2026-09-22").
 */
export function fmtMonth(month: string): string {
  const [y, m] = month.split("-");
  return y && m ? `${Number(m)}/${y}` : month;
}

/** "2026-06-01" → "01/06/2026"; `withYear: false` → "01/06". */
export function fmtDateVn(date: string, withYear = true): string {
  const [y, m, d] = date.slice(0, 10).split("-");
  if (!y || !m || !d) return date;
  return withYear ? `${d}/${m}/${y}` : `${d}/${m}`;
}

/** Nhãn kỳ copy nguyên từ file TikTok ("2026-06-01 ~ 2026-09-22") → "01/06/2026 – 22/09/2026". */
export function fmtPeriodLabel(label: string): string {
  return label.replace(/(\d{4})-(\d{2})-(\d{2})/g, "$3/$2/$1").replace(/\s*~\s*/g, " – ");
}
