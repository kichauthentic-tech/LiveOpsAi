import { LiveSession } from "../types";

// Tháng MỞ SẴN của các màn — một luật cho cả app (audit người mới 2026-10-04, Nhóm 4). Trước đây màn nào cũng mở
// "tháng của hôm nay": ngày 04/10 Dashboard, Report Tháng, Finance đều ra tháng 10 trống trơn trong khi số liệu
// mới về tới 22/09, người mới tưởng app hỏng. Màn lập kế hoạch thì ngược lại, mở tháng SAU dù kế hoạch tháng này
// của CROCS còn nháp.

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

type Dated = Pick<LiveSession, "date" | "status">;

/** Tháng mới nhất (≤ `upTo`) có ít nhất một ca không huỷ; null khi chưa có ca nào. */
function latestMonthWithSessions(sessions: Dated[], upTo: string): string | null {
  let best: string | null = null;
  for (const s of sessions) {
    if (s.status === "Cancelled") continue;
    const m = s.date.slice(0, 7);
    if (m <= upTo && (best == null || m > best)) best = m;
  }
  return best;
}

/**
 * Màn XEM SỐ trong tháng (Dashboard, Finance): tháng này nếu tháng này đã có ca (kể cả ca chưa diễn ra — đang
 * theo dõi tiến độ), không thì tháng gần nhất có ca. Không có ca nào thì vẫn tháng này.
 */
export function defaultViewMonth(today: string, sessions: Dated[]): string {
  const cur = today.slice(0, 7);
  return latestMonthWithSessions(sessions, cur) ?? cur;
}

/**
 * Report Tháng: report chỉ phát hành được khi tháng đã hết (0133), nên mở THÁNG ĐÃ HẾT gần nhất có ca — không
 * có thì tháng trước.
 */
export function defaultReportMonth(today: string, sessions: Dated[]): string {
  const last = prevMonth(today.slice(0, 7));
  return latestMonthWithSessions(sessions, last) ?? last;
}

/**
 * Màn LẬP KẾ HOẠCH: tháng này nếu còn brand có kế hoạch tháng này đang dở (đã tạo, chưa chốt) — việc đang treo;
 * không thì tháng sau. `draftMonths` = các tháng có ít nhất một kế hoạch ở trạng thái nháp.
 */
export function defaultPlanMonth(today: string, draftMonths: ReadonlySet<string>): string {
  const cur = today.slice(0, 7);
  return draftMonths.has(cur) ? cur : nextMonth(cur);
}
