// Kế Hoạch Tháng — phần thuần cho lưới ngày × ca (giai đoạn A, 0090). Không gọi DB.
import { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, RecurringShiftTemplate } from "../../types";
import { sessionDurationHours } from "../pnl";
import { MonthTargetPlan, allocateSessionTargets } from "../performance/targetAllocation";
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
  return slots.map((s) => ({ key: s.id, id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, targetGmv: s.targetGmv, note: s.note, slotId: s.slotId }));
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

// Chia target tổng xuống từng ca theo đúng quy tắc đang dùng cho ca thật (targetAllocation):
// theo giờ trong từng khung camp, khung không có ca thì dồn sang ca còn lại.
export function allocateDraftTargets(drafts: PlanDraftSlot[], plan: MonthTargetPlan): PlanDraftSlot[] {
  const pseudo = drafts.map(
    (d) => ({ id: d.key, brandId: plan.brandId, date: d.date, startTime: d.startTime, endTime: d.endTime, status: "Upcoming" }) as unknown as LiveSession
  );
  const alloc = allocateSessionTargets(pseudo, plan);
  return drafts.map((d) => ({ ...d, targetGmv: Math.round(alloc.get(d.key) ?? 0) }));
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

// Lỗi chặn lưu: giờ kết thúc ≤ bắt đầu, ngoài khung, trùng/chồng giờ trong ngày, quá số ca/ngày.
export function validateDrafts(drafts: PlanDraftSlot[], plan: Pick<BrandMonthPlan, "liveWindowStart" | "liveWindowEnd" | "maxSlotsPerDay">): string[] {
  const errors: string[] = [];
  const byDay = new Map<string, PlanDraftSlot[]>();
  for (const d of drafts) {
    if (d.endTime <= d.startTime) errors.push(`${d.date}: ca ${d.startTime}-${d.endTime} kết thúc trước khi bắt đầu`);
    if (d.startTime < plan.liveWindowStart || d.endTime > plan.liveWindowEnd) errors.push(`${d.date}: ca ${d.startTime}-${d.endTime} ngoài khung ${plan.liveWindowStart}-${plan.liveWindowEnd}`);
    const list = byDay.get(d.date) ?? [];
    list.push(d);
    byDay.set(d.date, list);
  }
  for (const [day, list] of byDay) {
    if (list.length > plan.maxSlotsPerDay) errors.push(`${day}: ${list.length} ca, vượt tối đa ${plan.maxSlotsPerDay}`);
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].startTime < sorted[i - 1].endTime) errors.push(`${day}: ca ${sorted[i].startTime} chồng giờ với ca ${sorted[i - 1].startTime}-${sorted[i - 1].endTime}`);
    }
  }
  return errors;
}
