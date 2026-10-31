import type { ReserveSlot } from "../../types";
import { checkpointAdvice, type Checkpoint, type CheckpointAdvice } from "../performance/monthForecast";
import { sessionDurationHours } from "../pnl";

// Ca dự phòng (31/10/2026): kế hoạch tháng lập TRƯỚC một nhóm ca "sẵn sàng" ngoài lưới chính. Đến mỗi mốc kiểm (sau D-Day, sau
// Mid-Month, ngày 20), nếu dự báo hụt target thì engine (checkpointAdvice) cho biết cần thêm bao nhiêu giờ — ở đây đổi số giờ đó
// thành những ca dự phòng CỤ THỂ nên mở. Ca dự phòng KHÔNG cộng vào target tháng, không sinh shift_slots khi Chốt; chỉ khi OP mở thật
// (ca tăng cường, 0165) thì mới thành ca. Hàm thuần: engine dự báo và DB nằm ở MonthPlan.tsx / lib/db/monthPlans.ts.

export const reserveKey = (r: Pick<ReserveSlot, "date" | "startTime" | "endTime">) => `${r.date}|${r.startTime}|${r.endTime}`;

export const reserveHours = (r: Pick<ReserveSlot, "startTime" | "endTime">) => sessionDurationHours(r.startTime, r.endTime);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Chỉ giữ ca hợp lệ, bỏ trùng khoá, sắp theo ngày–giờ. Dùng khi đọc/ghi DB. */
export function cleanReserve(list: unknown): ReserveSlot[] {
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const out: ReserveSlot[] = [];
  for (const raw of list) {
    const r = raw as Partial<ReserveSlot> | null;
    if (!r || !DATE.test(String(r.date)) || !HHMM.test(String(r.startTime)) || !HHMM.test(String(r.endTime))) continue;
    const item: ReserveSlot = { date: String(r.date), startTime: String(r.startTime), endTime: String(r.endTime), expectedGmv: Math.max(0, Math.round(Number(r.expectedGmv) || 0)) };
    const k = reserveKey(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

export interface PoolInput {
  month: string;
  /** Ngày sớm nhất được đặt ca dự phòng (thường = ngày mốc kiểm đầu tiên: trước đó chưa có số để kích hoạt). */
  fromDate: string;
  /** Ca của lưới chính (để không đè giờ và đếm số ca/ngày). */
  planned: { date: string; startTime: string; endTime: string }[];
  /** Khung giờ live của kênh ("09:00"–"23:00") và độ dài một ca. */
  windowStart: string;
  windowEnd: string;
  slotHours: number;
  maxSlotsPerDay: number;
  blackoutDates: string[];
  /** Tổng giờ dự phòng tối đa muốn có. */
  budgetHours: number;
  /** Dự báo GMV từng ca ứng viên (cùng thứ tự). */
  forecast: (slots: { date: string; startTime: string; endTime: string }[]) => number[];
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fromMin = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;

/** Mọi ngày YYYY-MM-DD của tháng. */
function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Gợi ý nhóm ca dự phòng: mọi cửa sổ `slotHours` bắt đầu tròn giờ trong khung live, không đè ca chính cùng ngày, ngày còn chỗ
 * (< maxSlotsPerDay), không trong ngày cấm → xếp theo GMV dự báo giảm dần → lấy tham lam cho tới khi đủ `budgetHours`. Mỗi ngày
 * tối đa một ca dự phòng để dự phòng rải đều, không dồn vào một ngày (giờ thêm ở cùng ngày trả ít hơn — co giãn < 1).
 */
export function suggestReservePool(x: PoolInput): ReserveSlot[] {
  const len = Math.round(x.slotHours * 60);
  if (!(len > 0) || !(x.budgetHours > 0)) return [];
  const ws = toMin(x.windowStart);
  let we = toMin(x.windowEnd);
  if (we <= ws) we = 24 * 60 - 1;
  const blocked = new Set(x.blackoutDates);
  const byDay = new Map<string, { s: number; e: number }[]>();
  for (const p of x.planned) {
    let e = toMin(p.endTime);
    const s = toMin(p.startTime);
    if (e <= s) e = 24 * 60;
    const arr = byDay.get(p.date) ?? [];
    arr.push({ s, e });
    byDay.set(p.date, arr);
  }
  const cands: { date: string; startTime: string; endTime: string }[] = [];
  for (const d of daysOfMonth(x.month)) {
    if (d < x.fromDate || blocked.has(d)) continue;
    const used = byDay.get(d) ?? [];
    if (used.length >= x.maxSlotsPerDay) continue;
    for (let s = Math.ceil(ws / 60) * 60; s + len <= we + 1; s += 60) {
      if (used.some((u) => overlaps(s, s + len, u.s, u.e))) continue;
      cands.push({ date: d, startTime: fromMin(s), endTime: fromMin(Math.min(s + len, 24 * 60 - 1)) });
    }
  }
  if (cands.length === 0) return [];
  const f = x.forecast(cands);
  const ranked = cands.map((c, i) => ({ ...c, expectedGmv: Math.max(0, Math.round(f[i] ?? 0)) })).sort((a, b) => b.expectedGmv - a.expectedGmv || a.date.localeCompare(b.date));
  const days = new Set<string>();
  const out: ReserveSlot[] = [];
  let hours = 0;
  for (const c of ranked) {
    if (hours + 1e-9 >= x.budgetHours) break;
    if (days.has(c.date) || c.expectedGmv <= 0) continue;
    days.add(c.date);
    out.push(c);
    hours += reserveHours(c);
  }
  return cleanReserve(out);
}

export interface ReservePick {
  /** Ca dự phòng nên mở, theo thứ tự ưu tiên (GMV dự báo cao trước). */
  picked: ReserveSlot[];
  hours: number;
  /** Số giờ cần mà nhóm dự phòng không đủ (0 = đủ). */
  shortHours: number;
  /** GMV dự báo thêm nếu mở đủ các ca đã chọn (cộng thẳng dự báo từng ca; chưa trừ co giãn). */
  expectedGmv: number;
}

/**
 * Chọn ca dự phòng để bù `needHours` giờ ở một mốc: chỉ ca từ ngày mốc (và không trước hôm nay) trở đi, chưa mở (`used` = khoá ca
 * đã kích hoạt), ưu tiên GMV dự báo cao. Chọn đủ giờ thì dừng — không mở dư.
 */
export function pickReserve(pool: ReserveSlot[], needHours: number, notBefore: string, used: Set<string> = new Set()): ReservePick {
  const eligible = pool.filter((r) => r.date >= notBefore && !used.has(reserveKey(r))).sort((a, b) => b.expectedGmv - a.expectedGmv || a.date.localeCompare(b.date));
  const picked: ReserveSlot[] = [];
  let hours = 0;
  for (const r of eligible) {
    if (hours + 1e-9 >= needHours) break;
    picked.push(r);
    hours += reserveHours(r);
  }
  return {
    picked: picked.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime)),
    hours,
    shortHours: Math.max(0, needHours - hours),
    expectedGmv: picked.reduce((a, r) => a + r.expectedGmv, 0)
  };
}

export interface LadderRow {
  checkpoint: Checkpoint;
  /** Giả định: đến mốc này dự báo cả tháng thấp hơn target bao nhiêu (0,05 = 5%). */
  shortfall: number;
  advice: CheckpointAdvice | null;
  pick: ReservePick | null;
}

export interface LadderInput {
  checkpoints: Checkpoint[];
  target: number;
  /** Ca của lưới chính: dự báo và giờ để biết phần "còn lại" sau mỗi mốc. */
  slots: { date: string; hours: number; forecast: number }[];
  pool: ReserveSlot[];
  shortfalls: number[];
  elasticity: number;
  cap: number;
}

/**
 * Bảng "nếu … thì …" lúc lập kế hoạch: tại mỗi mốc, giả sử dự báo hụt target `shortfall`% → engine bù bao nhiêu giờ → mở những ca
 * dự phòng nào, còn thiếu giờ không. Giả định hụt đều cho tất cả các mốc (đường đi thật chỉ biết khi tháng chạy).
 */
export function reserveLadder(x: LadderInput): LadderRow[] {
  const rows: LadderRow[] = [];
  for (const cp of x.checkpoints) {
    const rem = x.slots.filter((s) => s.date >= cp.date);
    const remF = rem.reduce((a, s) => a + s.forecast, 0);
    const remH = rem.reduce((a, s) => a + s.hours, 0);
    for (const sf of x.shortfalls) {
      const projected = x.target * (1 - sf);
      const advice = checkpointAdvice(cp, x.target, projected, remF, remH, x.elasticity, x.cap);
      const pick = advice && advice.extraHours > 0 ? pickReserve(x.pool, advice.extraHours, cp.date) : null;
      rows.push({ checkpoint: cp, shortfall: sf, advice, pick });
    }
  }
  return rows;
}

/** Giờ dự phòng đang có sau mốc (để hiện "đủ cho bao nhiêu % hụt"). */
export const reservePoolHours = (pool: ReserveSlot[], notBefore = "") => pool.filter((r) => r.date >= notBefore).reduce((a, r) => a + reserveHours(r), 0);
