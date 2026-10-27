import type { PlanSlotState } from "../performance/planRunRate";
import { slotHours, type PlanDraftSlot } from "./monthPlanGrid";

// Tổng một nhóm ngày của lưới Kế Hoạch Tháng (một ngày, hoặc một hàng tuần T2–CN) — cột "Tuần" và % trên đầu ô ngày (đề xuất 27/10).
// Cùng luật run-rate (§5.6): ca kế hoạch HUỶ và ca qua giờ chưa có số vẫn giữ target trong mẫu số "tới nay"; chỉ ca có số cộng thực đạt.
// Chỉ ca kế hoạch của MỘT kênh — không cộng chéo sàn, không gồm ca tăng cường / ngoài kế hoạch (target 0, không thuộc target tháng).

export interface SlotOutcome {
  state: PlanSlotState;
  actual: number;
}

export interface PlanSpanSummary {
  slots: number;
  hours: number;
  target: number;
  /** Σ target của ca đã tới hạn (có số, qua giờ chưa có số, huỷ). */
  targetToDate: number;
  actual: number;
  /** Ca đã tới hạn — mẫu số của `pct`. */
  dueCount: number;
  noDataCount: number;
  /** Thực đạt ÷ target tới nay; null khi chưa có ca nào tới hạn hoặc target tới nay = 0. */
  pct: number | null;
}

const DUE: ReadonlySet<PlanSlotState> = new Set(["done", "no_data", "cancelled"]);

export function summarizePlanSpan(
  days: readonly string[],
  drafts: readonly PlanDraftSlot[],
  outcomeOf: (d: PlanDraftSlot) => SlotOutcome | undefined
): PlanSpanSummary {
  const inSpan = new Set(days);
  const s: PlanSpanSummary = { slots: 0, hours: 0, target: 0, targetToDate: 0, actual: 0, dueCount: 0, noDataCount: 0, pct: null };
  for (const d of drafts) {
    if (!inSpan.has(d.date)) continue;
    s.slots += 1;
    s.hours += slotHours(d);
    s.target += d.targetGmv || 0;
    const o = outcomeOf(d);
    if (!o || !DUE.has(o.state)) continue;
    s.dueCount += 1;
    s.targetToDate += d.targetGmv || 0;
    if (o.state === "done") s.actual += o.actual;
    if (o.state === "no_data") s.noDataCount += 1;
  }
  s.pct = s.dueCount > 0 && s.targetToDate > 0 ? s.actual / s.targetToDate : null;
  return s;
}
