// Chia lại target CẢ LƯỚI của kế hoạch ĐÃ CHỐT (0162, 10/10) — phần thuần: dựng danh sách cập nhật gửi RPC `retarget_month_plan` và
// gom nhật ký `plan_target_audit` thành từng vòng thử. Không đụng supabaseClient để test được.

import { PlanDraftSlot } from "./monthPlanGrid";

export interface RetargetPlan {
  /** Chỉ ca ĐỔI target và đã có id DB — đúng thứ RPC cần. */
  updates: { id: string; target: number }[];
  changed: number;
  /** Trong số ca đổi, bao nhiêu ca ở ngày đã qua (mẫu số run-rate của tháng đổi theo). */
  pastChanged: number;
  /** Ca của lưới chưa có id DB (chưa lưu) — RPC không với tới được; có thì phải Chốt lại trước. */
  unsynced: number;
  oldTotal: number;
  newTotal: number;
}

/** `after` là lưới `before` sau khi chia lại (cùng thứ tự — `allocateDraftTargets` giữ nguyên thứ tự và key). */
export function buildRetarget(before: PlanDraftSlot[], after: PlanDraftSlot[], today: string): RetargetPlan {
  if (before.length !== after.length) throw new Error("buildRetarget: hai lưới khác số ca");
  const updates: { id: string; target: number }[] = [];
  let pastChanged = 0;
  let unsynced = 0;
  let oldTotal = 0;
  let newTotal = 0;
  before.forEach((b, i) => {
    const a = after[i];
    if (a.key !== b.key) throw new Error("buildRetarget: thứ tự ca bị đổi");
    const target = Math.max(0, Math.round(a.targetGmv));
    oldTotal += b.targetGmv;
    newTotal += target;
    if (!b.id) {
      unsynced++;
      return;
    }
    if (target !== Math.round(b.targetGmv)) {
      updates.push({ id: b.id, target });
      if (b.date < today) pastChanged++;
    }
  });
  return { updates, changed: updates.length, pastChanged, unsynced, oldTotal, newTotal };
}

export interface RetargetAuditRow {
  batch_id: string;
  changed_at: string;
  changed_by: string | null;
  note: string;
  date: string;
  old_target: number | string;
  new_target: number | string;
}

export interface RetargetBatch {
  batchId: string;
  changedAt: string;
  changedBy: string | null;
  note: string;
  slots: number;
  pastSlots: number;
  /** Σ target CŨ / MỚI của các ca đã đổi trong vòng này (không phải tổng tháng). */
  oldSum: number;
  newSum: number;
}

/** Mới nhất trước. `today` để đếm số ca đã qua trong vòng. */
export function summarizeRetargetBatches(rows: RetargetAuditRow[], today: string): RetargetBatch[] {
  const byBatch = new Map<string, RetargetBatch>();
  for (const r of rows) {
    const b = byBatch.get(r.batch_id) ?? { batchId: r.batch_id, changedAt: r.changed_at, changedBy: r.changed_by, note: r.note, slots: 0, pastSlots: 0, oldSum: 0, newSum: 0 };
    b.slots++;
    if (r.date < today) b.pastSlots++;
    b.oldSum += Number(r.old_target) || 0;
    b.newSum += Number(r.new_target) || 0;
    if (r.changed_at > b.changedAt) b.changedAt = r.changed_at;
    byBatch.set(r.batch_id, b);
  }
  return [...byBatch.values()].sort((a, b) => b.changedAt.localeCompare(a.changedAt));
}
