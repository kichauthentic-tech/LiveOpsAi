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

// Bảng màu cố định theo category (hash tên → index) — mỗi hạng mục khuyến mãi (Voucher,
// Combo Deal, Free Gift...) luôn ra cùng 1 màu ở mọi tuần/tháng, giúp mắt nhận diện nhanh
// khối nào thuộc scheme nào khi nhiều ô kéo dài (colSpan) nằm cạnh nhau. Không dùng
// var(--accent) vì đây là nhóm màu phân biệt nhiều hạng mục cùng lúc (giống role badge/category
// filter đã ghi trong WORKSPACE_DESIGN.md), không phải 1 CTA đơn lẻ.
const SCHEME_COLOR_PALETTE = [
  { bg: "bg-amber-100 dark:bg-amber-950/40", border: "border-amber-300 dark:border-amber-800", text: "text-amber-900 dark:text-amber-200", dot: "bg-amber-500" },
  { bg: "bg-sky-100 dark:bg-sky-950/40", border: "border-sky-300 dark:border-sky-800", text: "text-sky-900 dark:text-sky-200", dot: "bg-sky-500" },
  { bg: "bg-emerald-100 dark:bg-emerald-950/40", border: "border-emerald-300 dark:border-emerald-800", text: "text-emerald-900 dark:text-emerald-200", dot: "bg-emerald-500" },
  { bg: "bg-rose-100 dark:bg-rose-950/40", border: "border-rose-300 dark:border-rose-800", text: "text-rose-900 dark:text-rose-200", dot: "bg-rose-500" },
  { bg: "bg-violet-100 dark:bg-violet-950/40", border: "border-violet-300 dark:border-violet-800", text: "text-violet-900 dark:text-violet-200", dot: "bg-violet-500" },
  { bg: "bg-cyan-100 dark:bg-cyan-950/40", border: "border-cyan-300 dark:border-cyan-800", text: "text-cyan-900 dark:text-cyan-200", dot: "bg-cyan-500" },
  { bg: "bg-fuchsia-100 dark:bg-fuchsia-950/40", border: "border-fuchsia-300 dark:border-fuchsia-800", text: "text-fuchsia-900 dark:text-fuchsia-200", dot: "bg-fuchsia-500" },
  { bg: "bg-lime-100 dark:bg-lime-950/40", border: "border-lime-300 dark:border-lime-800", text: "text-lime-900 dark:text-lime-200", dot: "bg-lime-500" }
];

export function schemeCategoryColor(category: string) {
  let hash = 0;
  for (let i = 0; i < category.length; i++) hash = (hash * 31 + category.charCodeAt(i)) >>> 0;
  return SCHEME_COLOR_PALETTE[hash % SCHEME_COLOR_PALETTE.length];
}
