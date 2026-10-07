// Kế Hoạch Tháng — phần thuần cho lưới ngày × ca (giai đoạn A, 0090). Không gọi DB.
import { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, RecurringShiftTemplate, ShiftSlot } from "../../types";
import { sessionDurationHours } from "../pnl";
import { dateTimeRangesOverlap } from "../dateUtils";
import { planMonthSlots } from "./planMonthSlots";

export interface PlanDraftSlot {
  key: string; // khoá cục bộ cho React/diff — dòng đã có = id DB, dòng mới = "new-…"
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  targetGmv: number;
  note: string;
  slotId?: string;
  // Chỉ có khi ca đến từ engine gợi ý (giai đoạn B) — không lưu DB, chỉ để hiển thị/giải thích.
  expectedGmv?: number;
  reason?: string;
  highExpectation?: boolean;
}

let seq = 0;
export const newKey = () => `new-${Date.now()}-${seq++}`;

export const pad2 = (n: number) => `${n}`.padStart(2, "0");

export function daysOfMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  return Array.from({ length: n }, (_, i) => `${y}-${pad2(m)}-${pad2(i + 1)}`);
}

export function addHours(hhmm: string, h: number): string {
  const [hh, mm] = hhmm.split(":").map(Number);
  const total = Math.min(hh * 60 + mm + Math.round(h * 60), 23 * 60 + 59);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

export const slotHours = (s: Pick<PlanDraftSlot, "startTime" | "endTime">) =>
  Math.max(sessionDurationHours(s.startTime, s.endTime), 0);

export const draftKeyOf = (s: Pick<PlanDraftSlot, "date" | "startTime" | "endTime">) => `${s.date}|${s.startTime}|${s.endTime}`;

export function draftsFromSaved(slots: BrandMonthPlanSlot[]): PlanDraftSlot[] {
  return slots.map((s) => ({ key: s.id, id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, targetGmv: s.targetGmv, note: s.note, slotId: s.slotId, expectedGmv: s.expectedGmv > 0 ? s.expectedGmv : undefined }));
}

// Ca mới cho 1 ngày: nối sau ca cuối của ngày (hoặc đầu khung giờ), dài = mặc định, không vượt
// cuối khung. Trả null nếu đã đủ số ca tối đa hoặc hết chỗ trong khung.
export function nextSlotForDay(day: string, drafts: PlanDraftSlot[], plan: Pick<BrandMonthPlan, "defaultSlotHours" | "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay">): PlanDraftSlot | null {
  const sameDay = drafts.filter((d) => d.date === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
  if (sameDay.length >= plan.maxSlotsPerDay) return null;
  const start = sameDay.length > 0 ? sameDay[sameDay.length - 1].endTime : plan.liveWindowStart;
  if (start >= plan.liveWindowEnd) return null;
  const end = addHours(start, plan.defaultSlotHours) > plan.liveWindowEnd ? plan.liveWindowEnd : addHours(start, plan.defaultSlotHours);
  if (end <= start) return null;
  return { key: newKey(), date: day, startTime: start, endTime: end, targetGmv: 0, note: "" };
}

// Nạp từ quy tắc lặp của brand: thêm ca chưa có (theo khoá ngày|giờ), giữ nguyên ca đang có.
export function mergeFromTemplates(
  drafts: PlanDraftSlot[],
  templates: RecurringShiftTemplate[],
  month: string,
  brandId: string,
  today: string
): { next: PlanDraftSlot[]; added: number } {
  const have = new Set(drafts.map(draftKeyOf));
  const plan = planMonthSlots(templates, [], month, today, brandId);
  const added: PlanDraftSlot[] = [];
  for (const s of plan.toCreate) {
    const k = draftKeyOf(s);
    if (have.has(k)) continue;
    have.add(k);
    added.push({ key: newKey(), date: s.date, startTime: s.startTime, endTime: s.endTime, targetGmv: 0, note: s.notes });
  }
  return { next: [...drafts, ...added], added: added.length };
}

// Dựng lưới từ CA ĐÃ NHẬP (live_sessions nạp từ file/tạo tay trước khi có kế hoạch — 07/10: lịch T10 của 6 kênh). Mỗi ca chưa huỷ
// thành một ca kế hoạch theo (ngày, giờ bắt đầu, giờ kết thúc); khoá trùng (hai ca nhập hệt nhau) chỉ lấy một. Target ca = target đã
// ghi trên ca thật nếu có (file lịch có cột target), không thì 0 — để ops nhập target tháng rồi "Chia target". Ca đã có trong lưới giữ
// nguyên (id, target); `base` mặc định là lưới hiện tại, truyền [] để dựng lại từ đầu.
export function draftsFromSessions(
  sessions: Pick<LiveSession, "date" | "startTime" | "endTime" | "status" | "targetGmv">[],
  base: PlanDraftSlot[]
): { next: PlanDraftSlot[]; added: number; duplicates: number } {
  const have = new Set(base.map(draftKeyOf));
  const added: PlanDraftSlot[] = [];
  let duplicates = 0;
  const ordered = [...sessions].filter((x) => x.status !== "Cancelled").sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  for (const x of ordered) {
    const slot = { date: x.date, startTime: x.startTime.slice(0, 5), endTime: x.endTime.slice(0, 5) };
    const k = draftKeyOf(slot);
    if (have.has(k)) {
      duplicates++;
      continue;
    }
    have.add(k);
    added.push({ key: newKey(), ...slot, targetGmv: Math.max(0, Math.round(x.targetGmv || 0)), note: "" });
  }
  const next = [...base, ...added].sort((a, b) => draftKeyOf(a).localeCompare(draftKeyOf(b)));
  return { next, added: added.length, duplicates };
}

// Chia target tổng xuống từng ca theo trọng số — một công thức duy nhất cho cả lưới ops tự vẽ lẫn lưới
// engine gợi ý. Ca cuối nhận phần dư làm tròn. Trọng số từ 2026-09-28 (user chốt): giờ × GMV/giờ loại
// ngày × chỉ số khung giờ / vị trí ngày camp (`targetWeights`, slotInsights.ts) khi brand đủ 2 tháng
// lịch sử; chưa đủ thì dự báo engine; không có gì thì theo giờ. `forecasts` (dự báo engine) chỉ để
// ghi `expectedGmv` — cột "dự báo" và cờ "target cao" của từng ca vẫn là của engine.
export function allocateDraftTargets(drafts: PlanDraftSlot[], targetTotal: number, weights: number[], forecasts: number[] = weights): PlanDraftSlot[] {
  const w = weights.some((x) => x > 0) ? weights : drafts.map(slotHours);
  const sum = w.reduce((a, b) => a + b, 0);
  if (sum <= 0 || targetTotal <= 0) return drafts.map((d) => ({ ...d, targetGmv: 0 }));
  let assigned = 0;
  return drafts.map((d, i) => {
    const t = i === drafts.length - 1 ? Math.round(targetTotal - assigned) : Math.round((targetTotal * w[i]) / sum);
    assigned += t;
    return { ...d, targetGmv: t, expectedGmv: forecasts[i] > 0 ? Math.round(forecasts[i]) : d.expectedGmv };
  });
}

export interface PlanTotals {
  slots: number;
  days: number;
  hours: number;
  target: number;
}

export function totalsOf(drafts: PlanDraftSlot[]): PlanTotals {
  return {
    slots: drafts.length,
    days: new Set(drafts.map((d) => d.date)).size,
    hours: drafts.reduce((a, d) => a + slotHours(d), 0),
    target: drafts.reduce((a, d) => a + d.targetGmv, 0)
  };
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Ca kết thúc SAU nửa đêm (21:00–00:30, 22:03–00:03): giờ kết thúc nhỏ hơn giờ bắt đầu và rơi vào rạng sáng. Giờ kết thúc
 *  sớm hơn giờ bắt đầu mà KHÔNG rạng sáng (11:00–09:00) vẫn là nhập ngược. */
export const endsAfterMidnight = (s: Pick<PlanDraftSlot, "startTime" | "endTime">) => s.endTime < s.startTime && s.endTime <= "06:00";

// Lỗi chặn lưu: giờ kết thúc ≤ bắt đầu (trừ ca qua nửa đêm), ngoài khung, trùng/chồng giờ trong ngày, quá số ca/ngày.
export function validateDrafts(drafts: PlanDraftSlot[], plan: Pick<BrandMonthPlan, "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay">): string[] {
  const errors: string[] = [];
  const byDay = new Map<string, PlanDraftSlot[]>();
  for (const d of drafts) {
    const overnight = endsAfterMidnight(d);
    if (d.endTime <= d.startTime && !overnight) errors.push(`${d.date}: ca ${d.startTime}-${d.endTime} kết thúc trước khi bắt đầu`);
    // Ca qua nửa đêm: chỉ giờ BẮT ĐẦU phải nằm trong khung (giờ kết thúc ở ngày hôm sau).
    if (d.startTime < plan.liveWindowStart || (overnight ? d.startTime >= plan.liveWindowEnd : d.endTime > plan.liveWindowEnd)) errors.push(`${d.date}: ca ${d.startTime}-${d.endTime} ngoài khung ${plan.liveWindowStart}-${plan.liveWindowEnd}`);
    const list = byDay.get(d.date) ?? [];
    list.push(d);
    byDay.set(d.date, list);
  }
  for (const [day, list] of byDay) {
    if (list.length > plan.maxSlotsPerDay) errors.push(`${day}: ${list.length} ca, vượt tối đa ${plan.maxSlotsPerDay}`);
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const prevEnd = toMin(prev.endTime) + (endsAfterMidnight(prev) ? 24 * 60 : 0);
      if (toMin(sorted[i].startTime) < prevEnd) errors.push(`${day}: ca ${sorted[i].startTime} chồng giờ với ca ${prev.startTime}-${prev.endTime}`);
    }
  }
  return errors;
}

// Đổ kết quả engine vào lưới: ca cố định (ops đặt tay, engine giữ nguyên) khớp theo ngày|giờ với
// draft đang có để giữ id/slotId; ca mới sinh key mới.
export function draftsFromSuggestion(
  current: PlanDraftSlot[],
  suggested: { date: string; startTime: string; endTime: string; targetGmv: number; expectedGmv: number; reason: string; highExpectation: boolean }[]
): PlanDraftSlot[] {
  const byKey = new Map(current.map((d) => [draftKeyOf(d), d]));
  return suggested.map((s) => {
    const cur = byKey.get(draftKeyOf(s));
    return {
      key: cur?.key ?? newKey(),
      id: cur?.id,
      slotId: cur?.slotId,
      note: cur?.note ?? "",
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      targetGmv: s.targetGmv,
      expectedGmv: s.expectedGmv,
      reason: s.reason,
      highExpectation: s.highExpectation
    };
  });
}

// ---------------------------------------------------------------------------------------------------------
// Kiểm chéo với BRAND KHÁC (audit workflow 2026-10-04 #12). Kế hoạch lập riêng từng brand, chốt thì mọi ca gắn
// phòng mặc định của brand mà DB không kiểm phòng đó đang bị brand khác giữ, cũng không ai cộng nhu cầu cả
// agency so với số phòng/người. Hàm này chỉ ĐỀ XUẤT cảnh báo, không chặn — ops quyết.
// ---------------------------------------------------------------------------------------------------------

export interface CrossBrandClash {
  key: string; // PlanDraftSlot.key
  date: string;
  startTime: string;
  endTime: string;
  /** Ca của brand khác đang giữ đúng phòng mặc định của brand này trong khung giờ đó. */
  roomTakenBy?: string;
  /** Số ca chạy CÙNG LÚC toàn agency nếu thêm ca này (gồm chính nó). */
  concurrent: number;
}

export function crossBrandCheck(
  drafts: PlanDraftSlot[],
  opts: { brandId: string; studioId?: string; sessions: LiveSession[]; shiftSlots: ShiftSlot[]; today: string }
): { clashes: CrossBrandClash[]; peak: CrossBrandClash | null } {
  // Ca chưa huỷ của brand khác + ca chờ đăng ký còn mở của brand khác (ca chờ đã gắn ca thật thì ca thật đại diện).
  const others: { label: string; studioId?: string; date: string; startTime: string; endTime: string }[] = [
    ...opts.sessions
      .filter((s) => s.brandId !== opts.brandId && s.status !== "Cancelled" && s.date >= opts.today)
      .map((s) => ({ label: `${s.brandName} ${s.startTime}–${s.endTime}`, studioId: s.studioId, date: s.date, startTime: s.startTime, endTime: s.endTime })),
    ...opts.shiftSlots
      .filter((sl) => sl.brandId !== opts.brandId && sl.status === "open" && !sl.sessionId && sl.date >= opts.today)
      .map((sl) => ({ label: `${sl.brandName} ${sl.startTime}–${sl.endTime} (chờ đăng ký)`, studioId: sl.studioId, date: sl.date, startTime: sl.startTime, endTime: sl.endTime }))
  ];
  const clashes: CrossBrandClash[] = [];
  let peak: CrossBrandClash | null = null;
  for (const d of drafts) {
    if (d.date < opts.today) continue;
    const overlapping = others.filter((o) => dateTimeRangesOverlap(o, d));
    const room = opts.studioId ? overlapping.find((o) => o.studioId === opts.studioId) : undefined;
    const c: CrossBrandClash = { key: d.key, date: d.date, startTime: d.startTime, endTime: d.endTime, roomTakenBy: room?.label, concurrent: overlapping.length + 1 };
    if (room) clashes.push(c);
    if (!peak || c.concurrent > peak.concurrent) peak = c;
  }
  return { clashes, peak };
}
