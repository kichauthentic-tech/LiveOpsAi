import { LiveSession, ShiftSlot } from "../../types";
import { DateTimeRange, dateTimeRangesOverlap } from "../dateUtils";
import { personWindows } from "../staffSegments";

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

/** Ca (chưa huỷ, chồng giờ) mà người này đang làm Host hoặc Trợ live. Ca đổi người giữa ca (0138) chỉ tính đúng khoảng
 *  người này đứng ca — ra giữa ca thì phần sau của ca không còn chiếm họ. */
export function personClash(sessions: LiveSession[], want: DateTimeRange, talentId: string | undefined, excludeSessionId?: string): LiveSession | null {
  if (!talentId) return null;
  return (
    sessions.find(
      (s) => s.id !== excludeSessionId && s.status !== "Cancelled" && personWindows(s, talentId).some((w) => dateTimeRangesOverlap(w, want))
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

/** Một chỗ trùng người trên lịch: cùng một người ở hai ca giao giờ (`other`), hoặc vừa Host vừa Trợ live của
 *  chính một ca (`other` = null). */
export interface PersonClash {
  talentId: string;
  talentName: string;
  session: LiveSession;
  other: LiveSession | null;
}

const nameIn = (s: LiveSession, talentId: string): string =>
  (s.hostId === talentId ? s.hostName : s.coHostId === talentId ? s.coHostName : s.staffSegments?.find((g) => g.talentId === talentId)?.talentName) ?? "";

/**
 * Quét TOÀN BỘ lịch tìm người bị xếp hai chỗ cùng lúc (user chốt 06/10: host hay trợ đều chỉ đứng MỘT ca tại một
 * thời điểm). `personClash` ở trên chỉ hỏi lúc sửa từng ca; lịch nạp hàng loạt (330 ca T10, 06/10) đi qua mà không
 * ai biết — 24 cặp trùng + 3 ca một người vừa host vừa trợ. Cùng luật với `personClash`: ca chưa huỷ, đúng khoảng
 * người đó đứng (đổi người giữa ca), giao nhau mở (chạm mép không tính). Bỏ ca nạp bù: đó là lịch sử đọc từ file,
 * DB (0143) cũng không chặn chúng. `from` = chỉ xét ca từ ngày này (YYYY-MM-DD).
 */
export function findPersonClashes(sessions: LiveSession[], opts: { from?: string } = {}): PersonClash[] {
  const live = sessions.filter((s) => s.status !== "Cancelled" && !s.isBackfill && (!opts.from || s.date >= opts.from));
  const out: PersonClash[] = [];
  const byDay = new Map<string, LiveSession[]>();
  for (const s of live) {
    const l = byDay.get(s.date) ?? [];
    l.push(s);
    byDay.set(s.date, l);
    if (s.hostId && s.hostId === s.coHostId && !s.staffSegments?.length) {
      out.push({ talentId: s.hostId, talentName: s.hostName ?? "", session: s, other: null });
    }
  }
  const people = (s: LiveSession) => [...new Set([s.hostId, s.coHostId, ...(s.staffSegments ?? []).map((g) => g.talentId)].filter((x): x is string => !!x))];
  const days = [...byDay.keys()].sort();
  for (const day of days) {
    // Ca hôm trước có thể kéo qua nửa đêm — so ca hôm nay với ca hôm nay và hôm trước.
    const prev = new Date(`${day}T00:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    const before = byDay.get(prev.toISOString().slice(0, 10)) ?? [];
    const today = byDay.get(day)!;
    today.forEach((a, i) => {
      for (const b of [...today.slice(i + 1), ...before]) {
        for (const id of people(a)) {
          if (!people(b).includes(id)) continue;
          if (personWindows(a, id).some((wa) => personWindows(b, id).some((wb) => dateTimeRangesOverlap(wa, wb)))) {
            const [x, y] = b.date < a.date || (b.date === a.date && b.startTime < a.startTime) ? [b, a] : [a, b];
            out.push({ talentId: id, talentName: nameIn(a, id) || nameIn(b, id), session: x, other: y });
          }
        }
      }
    });
  }
  return out.sort((p, q) => p.session.date.localeCompare(q.session.date) || p.session.startTime.localeCompare(q.session.startTime));
}

/** id ca → tên những người bị trùng ở ca đó (để tô đỏ thẻ ca). */
export function clashedSessionIds(clashes: PersonClash[]): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const c of clashes) {
    for (const s of [c.session, c.other]) {
      if (!s) continue;
      const l = m.get(s.id) ?? [];
      if (!l.includes(c.talentName)) l.push(c.talentName);
      m.set(s.id, l);
    }
  }
  return m;
}
