// Phân loại các phiên KHÔNG khớp ca nào (rổ "chưa gán") thành 3 nhóm, để màn đối soát hỏi một câu cho cả nhóm
// thay vì bắt người đọc từng dòng. Chỉ ĐỌC, hàm thuần, không đọc DB.
//
// Vì sao chia như vậy (đo 15/11 trên 440 dòng ngoài lịch của DB thật — 729 triệu ₫):
//   • ngày brand KHÔNG có ca nào            182 dòng · 31% tiền  → agency không làm hôm đó ⇒ gần như chắc brand tự live
//   • sát ca ≤ 30 phút                      115 dòng · 30% tiền  → thường là lịch lệch giờ / host bật sớm tắt muộn ⇒ phải xem
//   • ngày có ca nhưng cách ca > 30 phút    143 dòng · 40% tiền  → ngoài giờ làm của agency ⇒ nhiều khả năng tự live
// Thước "thời lượng phiên" từng được cân nhắc rồi bỏ: trung vị 113 phút, 69% dòng ≤ 2 giờ — không tách được nhóm nào.

import type { LiveSession } from "../../types";
import type { ReconciliationRow } from "../db/liveReconciliation";
import { sessionWindowMs } from "../sessionStatus";

export type OutsideKind = "no_shift_day" | "near_shift" | "off_hours";

/** Sát ca bao nhiêu phút thì coi là "có thể là ca bị lệch giờ" chứ không phải brand tự live. */
export const NEAR_SHIFT_MIN = 30;

export interface OutsideGroup {
  kind: OutsideKind;
  rows: ReconciliationRow[];
  gmv: number;
}

const MIN = 60_000;
/** Ngày theo giờ VN của một mốc thời gian. */
const vnDay = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10);

export function classifyOutsideRow(row: ReconciliationRow, sessions: LiveSession[]): OutsideKind {
  if (!row.startedAt || !row.endedAt) return "no_shift_day";
  const s0 = Date.parse(row.startedAt), e0 = Date.parse(row.endedAt);
  if (!Number.isFinite(s0) || !Number.isFinite(e0)) return "no_shift_day";
  // Phiên qua đêm chạm 2 ngày — xét ca của cả hai ngày.
  const days = new Set([vnDay(s0), vnDay(e0)]);
  const sameDay = sessions.filter((s) => s.status !== "Cancelled" && days.has(s.date));
  if (sameDay.length === 0) return "no_shift_day";
  let gap = Infinity;
  for (const s of sameDay) {
    const [ss, se] = sessionWindowMs(s);
    // Khoảng cách thật giữa hai khoảng: âm = chồng nhau (không xảy ra ở rổ này vì đã không khớp).
    gap = Math.min(gap, Math.max(ss - e0, s0 - se) / MIN);
  }
  return gap <= NEAR_SHIFT_MIN ? "near_shift" : "off_hours";
}

/** Gom rổ "chưa gán" thành 3 nhóm, giữ thứ tự: ngày không ca → ngoài giờ làm → sát ca (nhóm cần xem tay xuống cuối). */
export function groupOutsideRows(rows: ReconciliationRow[], sessions: LiveSession[]): OutsideGroup[] {
  const by = new Map<OutsideKind, ReconciliationRow[]>();
  for (const r of rows) {
    const k = classifyOutsideRow(r, sessions);
    by.set(k, [...(by.get(k) ?? []), r]);
  }
  const order: OutsideKind[] = ["no_shift_day", "off_hours", "near_shift"];
  return order
    .filter((k) => (by.get(k)?.length ?? 0) > 0)
    .map((kind) => {
      const rs = by.get(kind)!;
      return { kind, rows: rs, gmv: rs.reduce((s, r) => s + r.gmv, 0) };
    });
}

export const OUTSIDE_TITLE: Record<OutsideKind, string> = {
  no_shift_day: "Ngày không có ca nào của agency",
  off_hours: "Ngoài giờ làm, ngày vẫn có ca",
  near_shift: "Sát giờ ca, có thể ca bị lệch giờ"
};

export const OUTSIDE_HINT: Record<OutsideKind, string> = {
  no_shift_day: "Hôm đó agency không live — nhiều khả năng brand tự live.",
  off_hours: "Cách ca gần nhất hơn 30 phút — nhiều khả năng brand tự live.",
  near_shift: "Dưới 30 phút — xem lại giờ ca trước khi gán."
};

/** Nhóm nào gán cả nhóm được ngay, nhóm nào phải xem tay. */
export const OUTSIDE_BULK_OK: Record<OutsideKind, boolean> = {
  no_shift_day: true,
  off_hours: true,
  near_shift: false
};
