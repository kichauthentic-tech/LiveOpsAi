import type { LiveSession } from "../types";

// Giờ ca theo luật user chốt 10/11 (migration 0213): ca đầu bắt đầu lúc room bật trong file, mỗi ca live đủ giờ lịch + OT − kết thúc
// sớm − trễ (không bù), ca sau nối tiếp; ca cuối kết thúc lúc room tắt thật. Giờ tải file không dùng ở đâu. DB tính, app chỉ đọc
// để (1) gợi ý ở bước "Ca có gì khác?" và (2) cảnh báo ở Cần xử lý.

export interface SessionTimeCheck {
  sessionId: string;
  headSessionId: string;
  prevSessionId?: string;
  /** Ca cuối chuỗi (hoặc ca đơn): kết thúc lúc room tắt thật. */
  isLast: boolean;
  startAt: string;
  endAt: string;
  liveMinutes: number;
  /** Số phút phải live = giờ lịch + OT − kết thúc sớm − trễ đã khai. */
  targetMinutes: number;
  /** Room còn live lúc xuất file: giờ kết thúc chưa biết, không gắn nhãn gì. */
  endPending: boolean;
  /** Chỉ ca đầu chuỗi: room bật trễ bao nhiêu phút so với lịch (âm = bật sớm). */
  fileLateMinutes?: number;
  /** Chỉ ca cuối chuỗi, room đã tắt: phút live thật − phút phải live. Dương = live dài hơn đã khai, âm = thiếu. */
  endGapMinutes?: number;
}

/** Lệch trong khoảng này coi như khớp (user: trễ 3' không cần khai). */
export const TIME_TOLERANCE_MIN = 5;
/** Room bật trễ từ mức này ⇒ cảnh báo kiểm lý do (có thể là sự cố, không mặc định lỗi team — user 10/11). */
export const LATE_CHECK_MIN = 30;

export interface TimeSuggestion {
  /** Live dài hơn đã khai (ca cuối / ca đơn) ⇒ gợi ý OT. */
  otMinutes?: number;
  /** Live ngắn hơn (ca cuối / ca đơn) ⇒ gợi ý kết thúc sớm. */
  earlyMinutes?: number;
  /** Ca đầu chuỗi room bật trễ quá ngưỡng: chỉ báo, KHÔNG chọn sẵn — dữ liệu T11: 3/3 ca trễ 7–9' đều live bù đủ giờ. */
  lateMinutes?: number;
}

/** Gợi ý cho bước "Ca có gì khác?" từ giờ ca đã tính (trước khi trợ khai gì). */
export function timeSuggestion(c: SessionTimeCheck | null | undefined): TimeSuggestion {
  if (!c) return {};
  const out: TimeSuggestion = {};
  if ((c.fileLateMinutes ?? 0) > TIME_TOLERANCE_MIN) out.lateMinutes = c.fileLateMinutes;
  if (c.isLast && !c.endPending && c.endGapMinutes != null) {
    if (c.endGapMinutes > TIME_TOLERANCE_MIN) out.otMinutes = c.endGapMinutes;
    else if (c.endGapMinutes < -TIME_TOLERANCE_MIN) out.earlyMinutes = -c.endGapMinutes;
  }
  return out;
}

export type TimeIssueKind = "late" | "gap";
export interface TimeIssue {
  session: LiveSession;
  kind: TimeIssueKind;
  minutes: number;
}

/**
 * Cần xử lý: (1) ca đầu chuỗi room bật trễ ≥ 30' — kiểm lý do thật (team trễ / sự cố / lịch đổi); (2) ca cuối chuỗi đã giao ca mà
 * giờ live thật lệch giờ đã khai quá 5' — có ca trong chuỗi khai thiếu/thừa. Ghi lý do vào ghi chú giao ca thì tắt cảnh báo.
 */
export function timeIssues(checks: SessionTimeCheck[], sessions: LiveSession[]): TimeIssue[] {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const out: TimeIssue[] = [];
  for (const c of checks) {
    const s = byId.get(c.sessionId);
    if (!s || s.status === "Cancelled" || s.excludedFromReports) continue;
    if (s.report?.statusNote?.trim()) continue;
    if ((c.fileLateMinutes ?? 0) >= LATE_CHECK_MIN) out.push({ session: s, kind: "late", minutes: c.fileLateMinutes! });
    if (c.isLast && !c.endPending && s.report?.handoverAt && Math.abs(c.endGapMinutes ?? 0) > TIME_TOLERANCE_MIN) {
      out.push({ session: s, kind: "gap", minutes: c.endGapMinutes! });
    }
  }
  return out.sort((a, b) => a.session.date.localeCompare(b.session.date) || a.session.startTime.localeCompare(b.session.startTime));
}
