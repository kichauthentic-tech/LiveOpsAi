import { LiveSession, ShiftSlot } from "../../types";
import { DateTimeRange, dateTimeRangesOverlap } from "../dateUtils";

// Kiểm trùng lịch — MỘT bộ luật cho mọi cửa xếp/sửa ca (audit 2026-09-28 mục 8). DB không chặn trùng, nên
// cảnh báo ở UI là hàng rào duy nhất; trước bản này 5 cửa kiểm theo 4 luật khác nhau:
//   - popup ca chờ đăng ký không kiểm Trợ live;
//   - sửa ca ở Cửa sổ ca chỉ so host với HOST ca khác (host đang làm trợ ở ca khác lọt), không kiểm Trợ live,
//     không xét ca chờ đăng ký đang giữ phòng;
//   - kéo thả đổi phòng không xét ca chờ đăng ký đang giữ phòng.
// Luật chung: một người bận nếu đang là Host HOẶC Trợ live của một ca chưa huỷ chồng giờ (kể cả ca qua đêm của
// hôm trước — dateTimeRangesOverlap); một phòng bận nếu có ca chưa huỷ, hoặc ca chờ đăng ký còn mở, chồng giờ.

export interface ScheduleWindow extends DateTimeRange {
  studioId?: string;
}

/** Ca (chưa huỷ, chồng giờ) mà người này đang làm Host hoặc Trợ live. */
export function personClash(sessions: LiveSession[], want: DateTimeRange, talentId: string | undefined, excludeSessionId?: string): LiveSession | null {
  if (!talentId) return null;
  return (
    sessions.find(
      (s) => s.id !== excludeSessionId && s.status !== "Cancelled" && (s.hostId === talentId || s.coHostId === talentId) && dateTimeRangesOverlap(s, want)
    ) ?? null
  );
}

export type StudioClash = { kind: "session"; session: LiveSession } | { kind: "open_slot"; slot: ShiftSlot };

/**
 * Ca chưa huỷ hoặc ca chờ đăng ký còn mở đang giữ phòng này trong khung giờ đó. `excludeSlotId` = chính ca chờ
 * đang xét; ca chờ đã gắn ca thật (sessionId) được đại diện bởi ca thật nên không xét lại.
 */
export function studioClash(
  sessions: LiveSession[],
  shiftSlots: ShiftSlot[],
  want: ScheduleWindow,
  opts: { excludeSessionId?: string; excludeSlotId?: string } = {}
): StudioClash | null {
  if (!want.studioId) return null;
  const s = sessions.find((x) => x.id !== opts.excludeSessionId && x.status !== "Cancelled" && x.studioId === want.studioId && dateTimeRangesOverlap(x, want));
  if (s) return { kind: "session", session: s };
  const sl = shiftSlots.find(
    (x) => x.id !== opts.excludeSlotId && x.status === "open" && !x.sessionId && x.studioId === want.studioId && dateTimeRangesOverlap(x, want)
  );
  return sl ? { kind: "open_slot", slot: sl } : null;
}

export function studioClashLabel(c: StudioClash): string {
  return c.kind === "session"
    ? `${c.session.brandName} ${c.session.startTime}–${c.session.endTime} (đã chốt)`
    : `${c.slot.brandName} ${c.slot.startTime}–${c.slot.endTime} (chờ đăng ký)`;
}
