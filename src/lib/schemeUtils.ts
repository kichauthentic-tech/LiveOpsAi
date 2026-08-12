import { PromoScheme } from "../types";

// Scheme áp dụng cho 1 ngày nếu ngày đó nằm trong [startDate, endDate] (inclusive) —
// so sánh string "YYYY-MM-DD" trực tiếp, cùng cách LiveSession.date đang được so sánh
// ở các nơi khác trong codebase.
export function schemesForDate(schemes: PromoScheme[], dateStr: string): PromoScheme[] {
  return schemes.filter((s) => dateStr >= s.startDate && dateStr <= s.endDate);
}

export function schemesByDate(schemes: PromoScheme[], month: string): Map<string, PromoScheme[]> {
  const map = new Map<string, PromoScheme[]>();
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${month}-${`${day}`.padStart(2, "0")}`;
    const active = schemesForDate(schemes, dateStr);
    if (active.length > 0) map.set(dateStr, active);
  }
  return map;
}

/** Danh sách category (thứ tự xuất hiện đầu tiên) trong 1 tập scheme — dùng làm hàng của
 * bảng SchemeWeekStrip. Không sort alphabet để giữ đúng thứ tự người dùng nhập trước sau. */
export function schemeCategoriesInOrder(schemes: PromoScheme[]): string[] {
  const seen: string[] = [];
  for (const s of schemes) {
    if (!seen.includes(s.category)) seen.push(s.category);
  }
  return seen;
}
