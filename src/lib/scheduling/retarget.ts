// Nhật ký chia lại target của kế hoạch ĐÃ CHỐT (0162/0164, 10/10) — phần thuần: gom `plan_target_audit` thành từng vòng thử.
// (Dựng danh sách gửi RPC nằm ở rebase.ts.) Không đụng supabaseClient để test được.

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
