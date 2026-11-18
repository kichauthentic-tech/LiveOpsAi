import type { LiveSession, Talent } from "../../types";
import { addDays } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { hasStaffSegments } from "../staffSegments";
import type { HourBounds, MonthBounds, PersonCap } from "./monthPlanner";
import { primaryRole } from "./monthPlanner";

// Trần giờ TỰ SUY (17/11, user: "làm sao mà rảnh ngồi cài full cho tất cả talent"). Không bắt Trainer nhập từng người: mặc định trần tháng của
// mỗi người = giờ trung bình các tháng đã qua của CHÍNH họ × (1 + dư), nằm giữa giờ tối thiểu và tối đa của vai. Nhờ đó xếp ngày 1–15 không dồn
// hết giờ vào nửa đầu cho BẤT KỲ ai. Cam kết nhập tay (ngoại lệ: host rate cao, chiến lược riêng) luôn thắng. Hàm thuần.

export const AUTO_CAP_MONTHS = 3;
export const AUTO_CAP_MIN_ACTIVE = 2;

export interface AutoCap extends PersonCap {
  /** Trung bình giờ/tháng của các tháng có làm. */
  avg: number;
  /** Số tháng có làm trong cửa sổ. */
  months: number;
}

const prevMonth = (m: string) => addDays(`${m}-01`, -1).slice(0, 7);

/** Các tháng đã HẾT (trước tháng của `today`), mới nhất trước, tối đa `n`. */
export function completedMonths(today: string, n = AUTO_CAP_MONTHS): string[] {
  const out: string[] = [];
  let m = prevMonth(today.slice(0, 7));
  for (let i = 0; i < n; i++) {
    out.push(m);
    m = prevMonth(m);
  }
  return out;
}

/**
 * @param slack  dư trên giờ trung bình (0,15 = +15%); ≤ 0 tắt tự suy.
 * Người có < 2 tháng làm thì không suy (dùng giới hạn mặc định của vai).
 */
export function inferAutoCaps(sessions: readonly LiveSession[], talents: readonly Talent[], today: string, bounds: MonthBounds, slack: number): Record<string, AutoCap> {
  if (!(slack > 0)) return {};
  const months = completedMonths(today);
  const set = new Set(months);
  const per = new Map<string, Map<string, number>>();
  const add = (id: string | undefined, m: string, h: number) => {
    if (!id) return;
    const byM = per.get(id) ?? new Map<string, number>();
    byM.set(m, (byM.get(m) ?? 0) + h);
    per.set(id, byM);
  };
  for (const s of sessions) {
    const m = s.date.slice(0, 7);
    if (!set.has(m) || s.status === "Cancelled" || hasStaffSegments(s)) continue;
    const h = sessionDurationHours(s.startTime, s.endTime);
    if (!(h > 0)) continue;
    add(s.hostId, m, h);
    add(s.coHostId, m, h);
  }
  const out: Record<string, AutoCap> = {};
  for (const t of talents) {
    const byM = per.get(t.id);
    const active = byM ? [...byM.values()].filter((h) => h > 0) : [];
    if (active.length < AUTO_CAP_MIN_ACTIVE) continue;
    const avg = active.reduce((a, b) => a + b, 0) / active.length;
    const b: HourBounds = bounds[primaryRole(t)];
    const cap = Math.round(Math.min(b.max, Math.max(b.min, avg * (1 + slack))));
    out[t.id] = { monthMax: cap, avg, months: active.length };
  }
  return out;
}
