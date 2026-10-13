import type { LiveSession, ShiftRegistration, ShiftSlot } from "../../types";
import { addDays, type DateTimeRange, dateTimeRangesOverlap } from "../dateUtils";
import { hasStaffSegments, personRoleMinutes, personWindows } from "../staffSegments";
import { hasSessionData } from "../sessionStatus";
import { sessionDurationHours } from "../pnl";

// Bàn Trainer — luật lịch tuần. Hàm thuần: nhận ca thật + ca mở (kèm người nháp) của một khoảng ngày, trả lỗi/cảnh báo theo ca.
// Ngưỡng ở bảng roster_rules (0175); DB chỉ CHẶN quá max_week_hours (lúc công bố/đổi người) và trùng người (0143) — mọi luật còn
// lại là cảnh báo để trainer tự quyết (user chốt 13/10).

export interface RosterRules {
  maxWeekHours: number;
  warnWeekHours: number;
  minRestHours: number;
  /** Ca kết thúc từ giờ này (hoặc qua nửa đêm) là "ca khuya" — sau đó cần nghỉ đủ minRestHours. */
  lateEndTime: string;
  maxDayHours: number;
  maxStreakDays: number;
  /** Nối hai ca khác phòng mà khoảng nghỉ ≤ số phút này ⇒ cảnh báo chạy phòng. */
  minRoomChangeMinutes: number;
}

export const DEFAULT_ROSTER_RULES: RosterRules = {
  maxWeekHours: 48,
  warnWeekHours: 40,
  minRestHours: 10,
  lateEndTime: "23:00",
  maxDayHours: 9,
  maxStreakDays: 6,
  minRoomChangeMinutes: 30
};

export type RosterRole = "host" | "co_host";

export interface RosterShift {
  /** "s:<sessionId>" cho ca đã lên lịch, "o:<slotId>" cho ca mở. */
  key: string;
  kind: "session" | "open";
  sessionId?: string;
  slotId?: string;
  session?: LiveSession;
  brandId: string;
  brandName: string;
  platform: "TikTok" | "Shopee";
  channelKey: string;
  date: string;
  startTime: string;
  endTime: string;
  studioId?: string;
  studioName: string;
  hostId?: string;
  coHostId?: string;
  /** Ca mở đã có người nháp (chưa công bố). */
  drafted: boolean;
  /** Ca đã chia đoạn người (0138) — đổi người ở Cửa sổ Ca Live, không ở Bàn Trainer. */
  segmented: boolean;
  hasData: boolean;
  planId?: string;
  /** Talent đã báo rảnh (chỉ ca mở). */
  registrants: string[];
}

export const channelKeyOf = (brandId: string, platform: string) => `${brandId}|${platform}`;
export const shiftHours = (s: Pick<RosterShift, "startTime" | "endTime">) => sessionDurationHours(s.startTime, s.endTime);

export interface DraftAssignment {
  slotId: string;
  hostId?: string;
  coHostId?: string;
}

/** Ca thật (chưa huỷ) + ca mở chưa chốt trong [from, to], gắn người nháp và người đã báo rảnh. */
export function buildRosterShifts(
  sessions: readonly LiveSession[],
  slots: readonly ShiftSlot[],
  drafts: readonly DraftAssignment[],
  registrations: readonly ShiftRegistration[],
  from: string,
  to: string
): RosterShift[] {
  const draftBySlot = new Map(drafts.map((d) => [d.slotId, d]));
  const regsBySlot = new Map<string, string[]>();
  for (const r of registrations) {
    const list = regsBySlot.get(r.slotId) ?? [];
    list.push(r.talentId);
    regsBySlot.set(r.slotId, list);
  }
  const out: RosterShift[] = [];
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date > to) continue;
    out.push({
      key: `s:${s.id}`,
      kind: "session",
      sessionId: s.id,
      session: s,
      brandId: s.brandId,
      brandName: s.brandName,
      platform: s.platform,
      channelKey: channelKeyOf(s.brandId, s.platform),
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      studioId: s.studioId || undefined,
      studioName: s.studioName ?? "",
      hostId: s.hostId || undefined,
      coHostId: s.coHostId || undefined,
      drafted: false,
      segmented: hasStaffSegments(s),
      hasData: hasSessionData(s),
      registrants: []
    });
  }
  for (const sl of slots) {
    if (sl.status !== "open" || sl.sessionId || !sl.brandId || sl.date < from || sl.date > to) continue;
    const d = draftBySlot.get(sl.id);
    out.push({
      key: `o:${sl.id}`,
      kind: "open",
      slotId: sl.id,
      brandId: sl.brandId,
      brandName: sl.brandName,
      platform: sl.platform,
      channelKey: channelKeyOf(sl.brandId, sl.platform),
      date: sl.date,
      startTime: sl.startTime,
      endTime: sl.endTime,
      studioId: sl.studioId,
      studioName: sl.studioName,
      hostId: d?.hostId,
      coHostId: d?.coHostId,
      drafted: !!d && !!(d.hostId || d.coHostId),
      segmented: false,
      hasData: false,
      planId: sl.planId,
      registrants: regsBySlot.get(sl.id) ?? []
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime) || a.key.localeCompare(b.key));
}

// ---- thời gian tuyệt đối (phút) để đo khoảng nghỉ, qua đêm cộng 24h ----
const dayIdx = (date: string) => Math.round(Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10)) / 86400000);
const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
export function absRange(r: DateTimeRange): [number, number] {
  const base = dayIdx(r.date) * 1440;
  const a = base + toMin(r.startTime);
  let b = base + toMin(r.endTime);
  if (b <= a) b += 1440;
  return [a, b];
}

export interface PersonEntry {
  shift: RosterShift;
  role: RosterRole;
  ranges: DateTimeRange[];
  minutes: number;
  start: number;
  end: number;
}

/** Ca của từng người (cả vai host và trợ). Ca chia đoạn chỉ tính khoảng người đó đứng (staffSegments). */
export function personEntries(shifts: readonly RosterShift[]): Map<string, PersonEntry[]> {
  const out = new Map<string, PersonEntry[]>();
  const push = (tid: string, e: PersonEntry) => {
    const list = out.get(tid) ?? [];
    list.push(e);
    out.set(tid, list);
  };
  for (const sh of shifts) {
    const seen = new Set<string>();
    if (sh.session && sh.segmented) {
      for (const g of sh.session.staffSegments ?? []) {
        const k = `${g.talentId}|${g.role}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const ranges = personWindows(sh.session, g.talentId);
        const abs = ranges.map(absRange);
        push(g.talentId, {
          shift: sh,
          role: g.role,
          ranges,
          minutes: personRoleMinutes(sh.session, g.talentId, g.role),
          start: Math.min(...abs.map((x) => x[0])),
          end: Math.max(...abs.map((x) => x[1]))
        });
      }
    }
    const whole: DateTimeRange = { date: sh.date, startTime: sh.startTime, endTime: sh.endTime };
    const [a, b] = absRange(whole);
    for (const [tid, role] of [
      [sh.hostId, "host"],
      [sh.coHostId, "co_host"]
    ] as const) {
      if (!tid || seen.has(`${tid}|${role}`)) continue;
      if (sh.segmented && (sh.session?.staffSegments ?? []).some((g) => g.role === role)) continue;
      push(tid, { shift: sh, role, ranges: [whole], minutes: b - a, start: a, end: b });
    }
  }
  for (const list of out.values()) list.sort((x, y) => x.start - y.start);
  return out;
}

export type IssueCode = "clash" | "week_over" | "draft_no_host" | "no_host" | "no_co" | "week_warn" | "rest" | "room" | "day" | "streak" | "new_channel";
/** block = DB/công bố sẽ chặn; hole = ca thiếu host (còn trống, không chặn công bố); warn = cảnh báo. */
export type IssueSeverity = "block" | "hole" | "warn";

export const ISSUE_SEVERITY: Record<IssueCode, IssueSeverity> = {
  clash: "block",
  week_over: "block",
  draft_no_host: "block",
  no_host: "hole",
  no_co: "warn",
  week_warn: "warn",
  rest: "warn",
  room: "warn",
  day: "warn",
  streak: "warn",
  new_channel: "warn"
};

export interface RosterIssue {
  code: IssueCode;
  severity: IssueSeverity;
  shiftKey: string;
  talentId?: string;
  text: string;
}

export interface RosterAnalysis {
  issues: RosterIssue[];
  byShift: Map<string, RosterIssue[]>;
  /** Giờ theo lịch của mỗi người trong tuần đang xét. */
  weekHours: Map<string, number>;
  entries: Map<string, PersonEntry[]>;
}

const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");
const ddmm = (d: string) => `${+d.slice(8, 10)}/${+d.slice(5, 7)}`;
const isLateEnd = (e: PersonEntry, lateEnd: string) => {
  const endOfDay = e.end - dayIdx(e.shift.date) * 1440;
  return endOfDay >= 1440 || endOfDay >= toMin(lateEnd);
};

/**
 * Luật lịch cho tuần bắt đầu `weekStart` (thứ Hai). `shifts` nên gồm cả tuần trước để bắt khoảng nghỉ / chuỗi ngày qua tuần.
 * `familiar(talentId, channelKey)` trả số ca 90 ngày của người đó ở kênh — 0 ⇒ cảnh báo host chưa quen kênh.
 */
export function analyzeRoster(
  shifts: readonly RosterShift[],
  rules: RosterRules,
  weekStart: string,
  nameOf: (talentId: string) => string,
  familiar?: (talentId: string, channelKey: string) => number
): RosterAnalysis {
  const weekEnd = addDays(weekStart, 6);
  const inWeek = (sh: RosterShift) => sh.date >= weekStart && sh.date <= weekEnd;
  const issues: RosterIssue[] = [];
  const add = (code: IssueCode, sh: RosterShift, text: string, talentId?: string) => {
    if (!inWeek(sh)) return;
    issues.push({ code, severity: ISSUE_SEVERITY[code], shiftKey: sh.key, talentId, text });
  };
  const entries = personEntries(shifts);
  const weekHours = new Map<string, number>();

  for (const [tid, list] of entries) {
    const name = nameOf(tid);
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      if (prev.shift.key === cur.shift.key) continue;
      const overlap = prev.ranges.some((a) => cur.ranges.some((b) => dateTimeRangesOverlap(a, b)));
      if (overlap) {
        add("clash", cur.shift, `${name} trùng giờ với ca ${prev.shift.brandName} ${prev.shift.startTime}–${prev.shift.endTime} (${ddmm(prev.shift.date)})`, tid);
        continue;
      }
      const gap = cur.start - prev.end;
      const roomChange = prev.shift.studioId && cur.shift.studioId && prev.shift.studioId !== cur.shift.studioId;
      if (gap <= rules.minRoomChangeMinutes && roomChange) {
        add("room", cur.shift, `${name} hết ca ở phòng ${prev.shift.studioName || "khác"} lúc ${prev.shift.endTime}, chỉ có ${gap} phút để sang phòng ${cur.shift.studioName || "này"}`, tid);
      } else if (gap < rules.minRestHours * 60 && isLateEnd(prev, rules.lateEndTime)) {
        add("rest", cur.shift, `${name} tan ca ${prev.shift.endTime} (${ddmm(prev.shift.date)}), chỉ nghỉ ${fmtH(gap / 60)} giờ trước ca này`, tid);
      }
    }
    // Giờ theo ngày + chuỗi ngày làm liền.
    const byDay = new Map<string, { h: number; first: RosterShift }>();
    for (const e of list) {
      const cur = byDay.get(e.shift.date) ?? { h: 0, first: e.shift };
      cur.h += e.minutes / 60;
      byDay.set(e.shift.date, cur);
    }
    for (const [d, v] of byDay) {
      if (v.h > rules.maxDayHours) add("day", v.first, `${name} làm ${fmtH(v.h)} giờ ngày ${ddmm(d)} (ngưỡng ${rules.maxDayHours})`, tid);
    }
    const days = [...byDay.keys()].sort();
    let run = 1;
    for (let i = 1; i < days.length; i++) {
      run = addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
      if (run === rules.maxStreakDays + 1) add("streak", byDay.get(days[i])!.first, `${name} làm ${run} ngày liền tới ${ddmm(days[i])}`, tid);
    }
    // Giờ tuần.
    const mine = list.filter((e) => inWeek(e.shift));
    const h = mine.reduce((sum, e) => sum + e.minutes / 60, 0);
    if (mine.length > 0) {
      weekHours.set(tid, h);
      if (h > rules.maxWeekHours) add("week_over", mine[0].shift, `${name} có ${fmtH(h)} giờ trong tuần (tối đa ${rules.maxWeekHours})`, tid);
      else if (h > rules.warnWeekHours) add("week_warn", mine[0].shift, `${name} có ${fmtH(h)} giờ trong tuần`, tid);
    }
  }

  for (const sh of shifts) {
    if (!sh.hostId) {
      if (sh.kind === "open" && sh.drafted) add("draft_no_host", sh, "Nháp có trợ live nhưng chưa có host — công bố sẽ bị chặn");
      else add("no_host", sh, "Ca chưa có host");
    }
    if (!sh.coHostId) add("no_co", sh, "Ca chưa có trợ live");
    if (sh.hostId && familiar && familiar(sh.hostId, sh.channelKey) === 0) {
      add("new_channel", sh, `${nameOf(sh.hostId)} chưa đứng hay trợ kênh này trong 90 ngày — nên có người kèm`, sh.hostId);
    }
  }

  const byShift = new Map<string, RosterIssue[]>();
  for (const it of issues) {
    const list = byShift.get(it.shiftKey) ?? [];
    list.push(it);
    byShift.set(it.shiftKey, list);
  }
  return { issues, byShift, weekHours, entries };
}

/** Mức nặng nhất của một ca để tô thẻ. */
export function worstSeverity(list: readonly RosterIssue[] | undefined): IssueSeverity | null {
  if (!list || list.length === 0) return null;
  if (list.some((i) => i.severity === "block")) return "block";
  if (list.some((i) => i.severity === "hole")) return "hole";
  return "warn";
}
