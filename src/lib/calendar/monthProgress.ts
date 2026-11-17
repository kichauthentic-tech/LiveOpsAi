import type { LiveSession, ShiftSlot } from "../../types";
import { isDelivered, isScheduled, plannedHoursOf, realLiveHoursOf } from "../performance/brandCommitment";
import { sessionDurationHours } from "../pnl";
import { platformOf, type ReportPlatform } from "../reportPlatform";

// Số tiến độ tháng của lịch từng brand (ô số đầu trang Lịch Vận Hành): giờ đã live, ca đang live còn bao nhiêu giờ, giờ sắp tới,
// giờ ca đã huỷ và GMV thực từng sàn. Cùng định nghĩa "đã giao / sắp tới" với nowHours (monthDesk.ts) để hai màn không lệch số.

export interface MonthProgress {
  done: number;
  liveCount: number;
  /** Giờ còn lại tới hết ca của các ca đang live. */
  liveLeft: number;
  upcoming: number;
  upcomingCount: number;
  open: number;
  openCount: number;
  cancelled: number;
  cancelledCount: number;
  /** GMV thực từng sàn (chỉ ca đã giao) — không cộng hai sàn. */
  gmv: Record<ReportPlatform, number>;
}

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** Phút trong ngày theo giờ Việt Nam. */
export function nowMinutesVn(now: number = Date.now()): number {
  const d = new Date(now + 7 * 3600_000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function monthProgress(
  sessions: readonly LiveSession[],
  slots: readonly ShiftSlot[],
  month: string,
  today: string,
  nowMin: number,
  /** Ca bị che số với người xem (brand, tháng chưa phát hành) — không cộng GMV của ca đó. */
  hideMetrics?: (s: LiveSession) => boolean
): MonthProgress {
  const out: MonthProgress = { done: 0, liveCount: 0, liveLeft: 0, upcoming: 0, upcomingCount: 0, open: 0, openCount: 0, cancelled: 0, cancelledCount: 0, gmv: { TikTok: 0, Shopee: 0 } };
  for (const s of sessions) {
    if (s.date.slice(0, 7) !== month || s.excludedFromReports) continue;
    if (s.status === "Cancelled") {
      out.cancelled += plannedHoursOf(s);
      out.cancelledCount++;
    } else if (isDelivered(s)) {
      out.done += realLiveHoursOf(s) ?? plannedHoursOf(s);
      if (!hideMetrics?.(s)) out.gmv[platformOf(s)] += s.actualGmv || 0;
      if (s.status === "Live Now") {
        const st = toMin(s.startTime);
        let en = toMin(s.endTime);
        if (en <= st) en += 1440;
        const now = nowMin < st ? nowMin + 1440 : nowMin;
        out.liveCount++;
        out.liveLeft += Math.max(0, Math.min(en - st, en - now)) / 60;
      }
    } else if (isScheduled(s)) {
      out.upcoming += plannedHoursOf(s);
      out.upcomingCount++;
    }
  }
  for (const sl of slots) {
    if (sl.status !== "open" || sl.sessionId || sl.date.slice(0, 7) !== month || sl.date < today) continue;
    out.open += sessionDurationHours(sl.startTime, sl.endTime);
    out.openCount++;
  }
  return out;
}
