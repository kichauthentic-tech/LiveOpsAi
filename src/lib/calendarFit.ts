// Lịch Tháng/Tuần vừa màn (26/11). Trước đây lưới 7 cột bị ép `min-w-[1080px]` dưới xl ⇒ màn < 1280px phải vuốt ngang.
// Nay đo bề rộng thật của lưới: Lịch Tuần hiện ít ngày hơn (thẻ ca giữ nguyên cỡ), Lịch Tháng giữ 7 cột nhưng ô gọn
// (giờ bắt đầu theo màu brand), bấm ngày ⇒ thẻ đầy đủ ở danh sách dưới lưới như cũ.

/** Bề rộng tối thiểu một cột Lịch Tuần — ở 1280px (xl) production đang chạy ~126px/cột nên giữ ≤ mức đó để PC y như cũ. */
export const WEEK_COL_MIN = 120;
export const WEEK_GAP = 12;
/** Dưới bề rộng này ô Lịch Tháng (7 cột) không đủ chỗ cho thẻ ca đầy đủ ⇒ ô gọn. */
export const MONTH_FULL_MIN = 900;

/** Số ngày Lịch Tuần hiện vừa bề rộng `width` (0 = chưa đo ⇒ 7, như cũ). */
export function visibleDayCount(width: number, colMin = WEEK_COL_MIN, gap = WEEK_GAP): number {
  if (!width || width <= 0) return 7;
  return Math.max(1, Math.min(7, Math.floor((width + gap) / (colMin + gap))));
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Thứ Hai của tuần chứa `dateStr`. */
export function mondayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow);
}

/** Các ngày Lịch Tuần đang hiện: đủ 7 ⇒ T2–CN của tuần; ít hơn ⇒ `n` ngày liền nhau bắt đầu từ `start`. */
export function windowDays(start: string, n: number): string[] {
  const from = n >= 7 ? mondayOf(start) : start;
  return Array.from({ length: Math.min(n, 7) }, (_, i) => addDays(from, i));
}

/** Giờ gọn trên ô Lịch Tháng hẹp: "18:00" → "18h", "18:30" → "18h30". */
export function shortTime(t: string): string {
  const [h, m] = t.split(":");
  return `${Number(h)}h${m && m !== "00" ? m : ""}`;
}
