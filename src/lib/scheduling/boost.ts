import type { BoostSlot } from "../../types";

// Ca tăng cường (0165): ca OP mở thêm sau khi kế hoạch đã chốt. Mỗi ca có target ĐỀ XUẤT từ engine (dự báo riêng của ca) để chấm ca,
// nhưng target đó KHÔNG cộng vào target tháng / run-rate — chỉ GMV của ca cộng vào thực đạt như mọi ca ngoài kế hoạch.
// Hàm thuần: DB nằm ở lib/db/monthPlans.ts, engine dự báo ở MonthPlan.tsx (forecastsFor).

export interface BoostFillItem {
  id: string;
  target: number;
  expected: number;
}

/**
 * Target đề xuất cho các ca đang chờ = dự báo engine của chính ca (cùng quy ước "ca thêm sau chốt nhận target = dự báo").
 * Dự báo ≤ 0 (engine chưa có gì để nói) thì BỎ QUA ca đó — để nó vẫn "đang chờ" thay vì ghi 0 và trông như đã có target.
 */
export function boostFillItems(pending: Pick<BoostSlot, "id">[], forecasts: number[]): BoostFillItem[] {
  if (pending.length !== forecasts.length) throw new Error("boostFillItems: hai danh sách khác số ca");
  const items: BoostFillItem[] = [];
  pending.forEach((b, i) => {
    const f = Math.round(forecasts[i]);
    if (Number.isFinite(f) && f > 0) items.push({ id: b.id, target: f, expected: f });
  });
  return items;
}

export interface BoostSummary {
  count: number;
  /** Ca chưa có target đề xuất. */
  pending: number;
  /** Σ target đề xuất của các ca đã có target. KHÔNG cộng vào target tháng. */
  targetSum: number;
  /** Số ca ở ngày đã qua (< today). */
  past: number;
}

export function summarizeBoost(slots: Pick<BoostSlot, "date" | "targetGmv" | "targetPending">[], today: string): BoostSummary {
  let pending = 0;
  let targetSum = 0;
  let past = 0;
  for (const b of slots) {
    if (b.targetPending) pending++;
    else targetSum += b.targetGmv;
    if (b.date < today) past++;
  }
  return { count: slots.length, pending, targetSum, past };
}
