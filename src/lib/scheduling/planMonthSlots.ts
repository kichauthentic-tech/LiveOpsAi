// P1 module tạo ca (2026-09-19, migration 0088): lập kế hoạch sinh ca tháng từ quy tắc lặp — THUẦN,
// không gọi DB, để màn Đăng Ký & Chốt Lịch xem trước ("tháng này sẽ mở N ca / X giờ cho brand A,
// so cam kết thừa/thiếu bao nhiêu") rồi mới bấm sinh thật qua RPC generate_shift_slots.
//
// Khoá chống trùng là khoá tự nhiên của ca: brand|ngày|giờ bắt đầu|giờ kết thúc|nền tảng — KHÔNG
// phải template_id như bản cũ (xoá quy tắc rồi tạo lại → id mới → sinh trùng). Server dedupe lại
// lần nữa bằng cùng khoá nên bản xem trước ở đây chỉ để hiển thị, sai lệch (ai đó vừa tạo tay) cũng
// không sinh trùng được.
import { RecurringShiftTemplate, ShiftSlot } from "../../types";
import { sessionDurationHours } from "../pnl";

export interface PlannedSlot {
  date: string;
  startTime: string;
  endTime: string;
  brandId?: string;
  brandName: string;
  platform: ShiftSlot["platform"];
  studioId?: string;
  studioName: string;
  notes: string;
  templateId: string;
}

export interface BrandPlanSummary {
  brandId: string;
  brandName: string;
  newCount: number;
  newHours: number;
}

export interface MonthSlotPlan {
  month: string; // "YYYY-MM"
  toCreate: PlannedSlot[];
  // Ca đã có sẵn trong tháng trùng khoá với quy tắc → không sinh lại.
  skippedExisting: number;
  // Ngày đã qua (< today) → không mở ca chờ đăng ký cho quá khứ.
  skippedPast: number;
  // Quy tắc active nhưng không gắn brand — không sinh (không so được cam kết, không có khoá).
  skippedNoBrand: number;
  perBrand: BrandPlanSummary[];
}

export const slotNaturalKey = (s: Pick<ShiftSlot, "brandId" | "date" | "startTime" | "endTime" | "platform">) =>
  `${s.brandId ?? ""}|${s.date}|${s.startTime}|${s.endTime}|${s.platform}`;

const pad2 = (n: number) => `${n}`.padStart(2, "0");

export function planMonthSlots(
  templates: RecurringShiftTemplate[],
  existingSlots: ShiftSlot[],
  month: string,
  today: string,
  brandId?: string
): MonthSlotPlan {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIdx = Number(monthStr) - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const existing = new Set(
    existingSlots.filter((s) => s.status !== "cancelled" && s.date.startsWith(month)).map(slotNaturalKey)
  );
  // Trong cùng 1 lô: 2 quy tắc giống hệt nhau chỉ sinh 1 ca.
  const planned = new Set<string>();

  const plan: MonthSlotPlan = { month, toCreate: [], skippedExisting: 0, skippedPast: 0, skippedNoBrand: 0, perBrand: [] };
  const perBrand = new Map<string, BrandPlanSummary>();

  const active = templates.filter((t) => t.active && (!brandId || t.brandId === brandId));
  for (const t of active) {
    if (!t.brandId) {
      plan.skippedNoBrand += 1;
      continue;
    }
    for (let day = 1; day <= daysInMonth; day++) {
      if (!t.isDaily && new Date(year, monthIdx, day).getDay() !== t.weekday) continue;
      const date = `${year}-${pad2(monthIdx + 1)}-${pad2(day)}`;
      if (date < today) {
        plan.skippedPast += 1;
        continue;
      }
      const slot: PlannedSlot = {
        date,
        startTime: t.startTime,
        endTime: t.endTime,
        brandId: t.brandId,
        brandName: t.brandName,
        platform: t.platform,
        studioId: t.studioId,
        studioName: t.studioName,
        notes: t.notes,
        templateId: t.id
      };
      const key = slotNaturalKey(slot);
      if (existing.has(key) || planned.has(key)) {
        plan.skippedExisting += 1;
        continue;
      }
      planned.add(key);
      plan.toCreate.push(slot);
      const cur = perBrand.get(t.brandId) ?? { brandId: t.brandId, brandName: t.brandName, newCount: 0, newHours: 0 };
      cur.newCount += 1;
      cur.newHours += sessionDurationHours(t.startTime, t.endTime);
      perBrand.set(t.brandId, cur);
    }
  }

  plan.toCreate.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  plan.perBrand = [...perBrand.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, "vi"));
  return plan;
}
