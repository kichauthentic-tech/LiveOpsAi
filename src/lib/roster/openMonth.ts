import type { LiveSession, ShiftSlot } from "../../types";
import { addDays, isoWeekStart } from "../dateUtils";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { sessionDurationHours } from "../pnl";

// Điều Phối Lịch Live bản gọn — đợt 2 (25/10): "Mở lịch tháng sau" 3 bước ngay trong module (user chốt: tháng 11 lập lịch
// TRONG APP; giờ cam kết nhập tại chỗ, target vẫn ở Kế Hoạch Tháng). File này là phần tính thuần: lấy khung giờ một tuần mẫu
// của kênh, trải ra cả tháng, khớp vừa giờ cần mở; đọc lịch dán từ Google Sheet; chép khung giờ tuần trước sang tuần này.
//
// Đo 10/08–25/10 (884 ca): so với tuần liền trước, 44% ca giữ cùng thứ + giờ bắt đầu, 20% giữ y giờ, 5% giữ cùng host ⇒ chỉ
// chép KHUNG GIỜ, không chép người (người do talent đăng ký + Tự lấp).

export interface TimeFrame {
  date: string;
  startTime: string;
  endTime: string;
}

const hhmm = (t: string) => t.slice(0, 5);
const frameHours = (f: Pick<TimeFrame, "startTime" | "endTime">) => sessionDurationHours(f.startTime, f.endTime);
export const totalHours = (list: readonly TimeFrame[]) => list.reduce((a, f) => a + frameHours(f), 0);
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Phút kết thúc tính từ 00:00 ngày bắt đầu (ca qua nửa đêm > 1440). */
const endMin = (f: Pick<TimeFrame, "startTime" | "endTime">) => {
  const s = toMin(f.startTime), e = toMin(f.endTime);
  return e <= s ? e + 1440 : e;
};
export const overlaps = (a: TimeFrame, b: TimeFrame) => a.date === b.date && toMin(a.startTime) < endMin(b) && toMin(b.startTime) < endMin(a);
const byTime = (a: TimeFrame, b: TimeFrame) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime);
/** Thứ trong tuần, Thứ 2 = 0. */
const weekdayOf = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

export const daysOfMonth = (month: string): string[] => {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
};

const mine = (brandId: string, platform: ReportPlatform) => (r: { brandId?: string; platform?: string | null }) => r.brandId === brandId && platformOf(r) === platform;
const liveSession = (s: LiveSession) => s.status !== "Cancelled" && !s.excludedFromReports;

export interface WeekPattern {
  /** Thứ 2 của tuần mẫu; undefined = kênh chưa có ca nào trong 5 tuần qua. */
  weekStart?: string;
  frames: { weekday: number; startTime: string; endTime: string }[];
}

/**
 * Tuần mẫu của kênh: trong 5 tuần ĐỦ 7 ngày gần nhất trước hôm nay, tuần GẦN NHẤT có số ca ≥ 80% tuần đông nhất (thử 25/10:
 * lấy tuần đông nhất thì VERA TikTok rơi về tuần 14/09 — lịch đã khác). Khung giờ = mọi ca của tuần đó (ca thật chưa huỷ + ca
 * mở), bỏ trùng hệt (thứ, giờ bắt đầu, giờ kết thúc).
 */
export function weekPattern(sessions: readonly LiveSession[], slots: readonly ShiftSlot[], brandId: string, platform: ReportPlatform, today: string): WeekPattern {
  const isMine = mine(brandId, platform);
  const lastFull = addDays(isoWeekStart(today), -7);
  const weeks: { weekStart: string; frames: TimeFrame[] }[] = [];
  for (let i = 0; i < 5; i++) {
    const ws = addDays(lastFull, -7 * i), we = addDays(ws, 6);
    const frames: TimeFrame[] = [
      ...sessions.filter((s) => isMine(s) && liveSession(s) && s.date >= ws && s.date <= we).map((s) => ({ date: s.date, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) })),
      ...slots.filter((sl) => isMine(sl) && sl.status === "open" && !sl.sessionId && sl.date >= ws && sl.date <= we).map((sl) => ({ date: sl.date, startTime: hhmm(sl.startTime), endTime: hhmm(sl.endTime) }))
    ];
    weeks.push({ weekStart: ws, frames });
  }
  const max = Math.max(...weeks.map((w) => w.frames.length));
  const best = max > 0 ? weeks.find((w) => w.frames.length >= 0.8 * max) : undefined;
  if (!best) return { frames: [] };
  const seen = new Set<string>();
  const frames = best.frames
    .map((f) => ({ weekday: weekdayOf(f.date), startTime: f.startTime, endTime: f.endTime }))
    .filter((f) => {
      const k = `${f.weekday}|${f.startTime}|${f.endTime}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  return { weekStart: best.weekStart, frames };
}

/** Trải khung giờ tuần mẫu ra mọi ngày của tháng (ngày `from` trở đi), mỗi ngày theo đúng thứ của nó. */
export function expandPattern(p: WeekPattern, month: string, from = `${month}-01`): TimeFrame[] {
  const out: TimeFrame[] = [];
  for (const d of daysOfMonth(month)) {
    if (d < from) continue;
    const wd = weekdayOf(d);
    for (const f of p.frames) if (f.weekday === wd) out.push({ date: d, startTime: f.startTime, endTime: f.endTime });
  }
  return out.sort(byTime);
}

/** Khung giờ hay dùng nhất của mẫu (để thêm ca khi thiếu giờ), rồi vài khung mặc định. */
function addCandidates(p: WeekPattern): { startTime: string; endTime: string }[] {
  const count = new Map<string, number>();
  for (const f of p.frames) count.set(`${f.startTime}|${f.endTime}`, (count.get(`${f.startTime}|${f.endTime}`) ?? 0) + 1);
  const own = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => ({ startTime: k.split("|")[0], endTime: k.split("|")[1] }));
  const defaults = [
    { startTime: "19:00", endTime: "22:00" },
    { startTime: "10:00", endTime: "13:00" },
    { startTime: "14:00", endTime: "17:00" },
    { startTime: "20:00", endTime: "23:00" }
  ];
  const seen = new Set(own.map((c) => `${c.startTime}|${c.endTime}`));
  return [...own, ...defaults.filter((c) => !seen.has(`${c.startTime}|${c.endTime}`))];
}

/**
 * Khớp lịch vừa `need` giờ: dư ⇒ bỏ ca ở ngày đông ca nhất (ngày muộn trước) tới khi bỏ thêm sẽ thiếu; thiếu ⇒ thêm khung hay
 * dùng của kênh vào ngày ít ca nhất (ngày sớm trước) mà không đè ca khác. Dư tối đa < 1 ca.
 */
export function fitToHours(list: readonly TimeFrame[], need: number, p: WeekPattern, month: string, from = `${month}-01`): TimeFrame[] {
  const a = [...list].sort(byTime);
  if (!(need > 0)) return a;
  const days = daysOfMonth(month).filter((d) => d >= from);
  const countBy = () => {
    const m = new Map<string, number>(days.map((d) => [d, 0]));
    for (const f of a) m.set(f.date, (m.get(f.date) ?? 0) + 1);
    return m;
  };
  // dư
  for (let guard = 0; guard < 2000 && totalHours(a) > need; guard++) {
    const cnt = countBy();
    const day = [...cnt.entries()].filter(([, n]) => n > 0).sort((x, y) => y[1] - x[1] || y[0].localeCompare(x[0]))[0]?.[0];
    if (!day) break;
    let idx = -1;
    for (let i = a.length - 1; i >= 0; i--) if (a[i].date === day) { idx = i; break; }
    if (totalHours(a) - frameHours(a[idx]) < need) break;
    a.splice(idx, 1);
  }
  // thiếu
  const cands = addCandidates(p);
  for (let guard = 0; guard < 2000 && totalHours(a) < need - 0.01; guard++) {
    const cnt = countBy();
    const order = [...cnt.entries()].sort((x, y) => x[1] - y[1] || x[0].localeCompare(y[0])).map(([d]) => d);
    let placed = false;
    for (const d of order) {
      const c = cands.find((c) => !a.some((o) => overlaps(o, { date: d, ...c })));
      if (c) {
        a.push({ date: d, ...c });
        placed = true;
        break;
      }
    }
    if (!placed) break;
    a.sort(byTime);
  }
  return a.sort(byTime);
}

/**
 * Đọc lịch dán từ Google Sheet: mỗi dòng có "ngày/tháng[/năm]" rồi "giờ-giờ" (dấu "-", "–", "→" hoặc tab giữa hai giờ; "19h00"
 * cũng được). Chỉ nhận ngày thuộc `month`; bỏ dòng trùng hệt. Trả về ca + số dòng không đọc được (để báo).
 */
export function parsePastedSchedule(text: string, month: string): { frames: TimeFrame[]; skipped: number } {
  const [y, m] = month.split("-").map(Number);
  const re = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?[\s,;]+(\d{1,2})[:hH](\d{2})\s*(?:-|–|→|\t|đến|den)\s*(\d{1,2})[:hH](\d{2})/;
  const frames: TimeFrame[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const g = re.exec(line);
    if (!g) {
      skipped++;
      continue;
    }
    const day = Number(g[1]), mo = Number(g[2]), yr = g[3] ? (g[3].length === 2 ? 2000 + Number(g[3]) : Number(g[3])) : y;
    const pad = (h: string, mi: string) => `${String(Number(h)).padStart(2, "0")}:${mi}`;
    const startTime = pad(g[4], g[5]), endTime = pad(g[6], g[7]);
    const valid = mo === m && yr === y && day >= 1 && day <= daysOfMonth(month).length && toMin(startTime) < 1440 && toMin(endTime) <= 1440 && startTime !== endTime;
    if (!valid) {
      skipped++;
      continue;
    }
    const f = { date: `${month}-${String(day).padStart(2, "0")}`, startTime, endTime: endTime === "24:00" ? "00:00" : endTime };
    const k = `${f.date}|${f.startTime}|${f.endTime}`;
    if (seen.has(k)) continue;
    seen.add(k);
    frames.push(f);
  }
  return { frames: frames.sort(byTime), skipped };
}

/**
 * "Chép khung giờ tuần trước": mọi ca (thật + mở) của tuần trước ⇒ khung giờ cùng thứ ở tuần đang xem, chỉ ngày từ hôm nay,
 * bỏ khung đè lên ca đã có của cùng kênh. Không chép người.
 */
export function copyPrevWeekFrames(sessions: readonly LiveSession[], slots: readonly ShiftSlot[], weekStart: string, today: string): (TimeFrame & { brandId: string; platform: ReportPlatform; brandName: string })[] {
  const prevStart = addDays(weekStart, -7), prevEnd = addDays(weekStart, -1), end = addDays(weekStart, 6);
  type Row = TimeFrame & { brandId: string; platform: ReportPlatform; brandName: string };
  const rowOf = (x: { brandId: string; brandName: string; date: string; startTime: string; endTime: string; platform?: string | null }): Row => ({
    brandId: x.brandId,
    brandName: x.brandName,
    platform: platformOf(x),
    date: x.date,
    startTime: hhmm(x.startTime),
    endTime: hhmm(x.endTime)
  });
  const all = [
    ...sessions.filter((s) => s.status !== "Cancelled" && s.brandId).map(rowOf),
    ...slots.filter((sl) => sl.status === "open" && !sl.sessionId && sl.brandId).map((sl) => rowOf({ ...sl, brandId: sl.brandId!, brandName: sl.brandName ?? "" }))
  ];
  const prev = all.filter((r) => r.date >= prevStart && r.date <= prevEnd);
  const existing = all.filter((r) => r.date >= weekStart && r.date <= end);
  const out: Row[] = [];
  for (const p of prev) {
    const date = addDays(p.date, 7);
    if (date < today) continue;
    const f: Row = { ...p, date };
    const clash = [...existing, ...out].some((o) => o.brandId === f.brandId && o.platform === f.platform && overlaps(o, f));
    if (!clash) out.push(f);
  }
  return out.sort((a, b) => byTime(a, b) || a.brandName.localeCompare(b.brandName));
}
