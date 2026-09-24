// Ngày/tháng "hôm nay" theo giờ LOCAL của máy người dùng (VN = UTC+7).
//
// Không dùng `new Date().toISOString().slice(0, 10)`: `toISOString()` trả giờ UTC, nên từ 00:00
// đến 07:00 giờ VN nó trả về NGÀY HÔM TRƯỚC — lịch sẽ highlight nhầm ô "Hôm nay" và mọi so sánh
// `dateStr <= todayDate` (đã live / chưa live) lệch một ngày. Mọi cột ngày trong DB
// (`live_sessions.date`, `shift_slots.date`...) đều là ngày local dạng "YYYY-MM-DD".
export const getTodayDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
};

export const getTodayMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}`;
};

// So 2 khoảng "HH:MM"–"HH:MM" có chồng nhau không. Coi khoảng kết thúc <= bắt đầu là ca qua
// nửa đêm (end sang ngày hôm sau, +1440 phút) — khớp với sessionDurationHours ở lib/pnl.ts.
// So sánh chuỗi thô kiểu `aStart < bEnd && bStart < aEnd` sai với ca qua đêm vì "02:00" luôn
// nhỏ hơn mọi giờ khác trong ngày, nên ca 22:00–02:00 không bao giờ bị coi là trùng lịch.
export const timeRangesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string): boolean => {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const aStartM = toMinutes(aStart);
  let aEndM = toMinutes(aEnd);
  if (aEndM <= aStartM) aEndM += 24 * 60;
  const bStartM = toMinutes(bStart);
  let bEndM = toMinutes(bEnd);
  if (bEndM <= bStartM) bEndM += 24 * 60;
  return aStartM < bEndM && bStartM < aEndM;
};

// Q6 (audit 2026-09-21): trùng lịch xét THEO NGÀY + GIỜ, kể cả ca qua đêm của ngày trước — ca
// 21:00–00:30 hôm qua phải chặn ca 00:00–01:00 hôm nay. Lọc `date === date` rồi mới
// timeRangesOverlap bỏ sót trường hợp đó. Quy mọi ca về phút tuyệt đối kể từ epoch ngày.
export interface DateTimeRange {
  date: string; // YYYY-MM-DD
  startTime: string;
  endTime: string;
}
const dayIndex = (date: string) => Math.round(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10))) / 86400000);
const absRange = (r: DateTimeRange): [number, number] => {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const base = dayIndex(r.date) * 24 * 60;
  const start = base + toMinutes(r.startTime);
  let end = base + toMinutes(r.endTime);
  if (end <= start) end += 24 * 60;
  return [start, end];
};
export const dateTimeRangesOverlap = (a: DateTimeRange, b: DateTimeRange): boolean => {
  // Cách nhau ≥ 2 ngày thì không thể chạm (ca dài nhất < 24h) — tránh tính cho cả kho ca.
  if (Math.abs(dayIndex(a.date) - dayIndex(b.date)) > 1) return false;
  const [as, ae] = absRange(a);
  const [bs, be] = absRange(b);
  return as < be && bs < ae;
};

// ---------------------------------------------------------------------------
// Tuần ISO (tuần bắt đầu THỨ HAI). Chuyển từ lib/dataraw/weeklySlice.ts về đây 2026-09-24 để
// module thuần (không đụng Supabase) dùng được — weeklySlice import supabaseClient, mà file đó
// đọc `import.meta.env` nên kéo theo là không chạy được dưới `tsx` khi verify. weeklySlice vẫn
// re-export y nguyên 4 hàm này nên mọi nơi đang import từ đó không phải đổi.
// ---------------------------------------------------------------------------

/** Thứ Hai của tuần chứa `date`. */
export function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = CN
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Số tuần ISO — dùng cho nhãn "Tuần 34/2026". Thuật toán chuẩn ISO-8601: tuần chứa thứ Năm
// quyết định năm của tuần đó.
export function isoWeekNumber(date: string): { week: number; year: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year };
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
