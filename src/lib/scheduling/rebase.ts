// "Chia lại theo lịch hiện có" (0164, 10/10) — phần thuần: gom MỌI ca đang có trên lịch của một kênh × tháng (ca đã nằm trong kế hoạch +
// ca OP tạo thêm ngoài kế hoạch, kể cả ngày đã qua), loại ca huỷ, rồi dựng danh sách gửi RPC `rebase_month_plan`.
// Không đụng supabaseClient để test được.
//
// Luật user chốt 10/10: (1) ca đã qua CÓ bị chia lại; (2) ca đã huỷ BỎ khỏi phần chia (target về 0, Σ target = Σ ca còn chạy);
// (3) ca OP thêm TÍNH NGAY vào kế hoạch (giờ + Σ target).

import { LiveSession, ShiftSlot } from "../../types";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { PlanDraftSlot, draftKeyOf } from "./monthPlanGrid";

/** active = vào phần chia · cancelled = ca/phiên đã huỷ · nosession = ca kế hoạch ngày đã qua mà lịch không có ca nào (chưa từng live). */
export type RebaseState = "active" | "cancelled" | "nosession";

export interface RebaseRow {
  /** Khoá của `draft` (id ca kế hoạch, hoặc `add:<id ca thật>` cho ca thêm mới). */
  key: string;
  source: "plan" | "added";
  state: RebaseState;
  /** Ca thật cần gắn: ca thêm mới luôn có; ca kế hoạch chưa gắn mà khớp giờ với một phiên trên lịch cũng có. */
  link?: { sessionId?: string; shiftSlotId?: string };
  reason: string;
  draft: PlanDraftSlot;
}

export interface RebaseSet {
  /** Sắp theo ngày + giờ. */
  rows: RebaseRow[];
  /** Phiên trên lịch không đưa vào được vì trùng đúng giờ với một ca khác (kế hoạch không có hai ca cùng giờ). */
  skippedSameTime: number;
  /** Ca kế hoạch ngày chưa qua nhưng lịch chưa có ca nào (chưa mở ca / chưa chốt lại) — vẫn tính vào phần chia. */
  futureNoCalendar: number;
}

const hhmm = (t: string) => t.slice(0, 5);

export interface CollectInput {
  /** Các ca đã LƯU trong kế hoạch (có id). Ca chỉ nằm trên lưới trình duyệt không được tính. */
  planDrafts: PlanDraftSlot[];
  sessions: Pick<LiveSession, "id" | "brandId" | "platform" | "date" | "startTime" | "endTime" | "status">[];
  shiftSlots: Pick<ShiftSlot, "id" | "brandId" | "platform" | "date" | "startTime" | "endTime" | "status" | "sessionId">[];
  brandId: string;
  platform: ReportPlatform;
  month: string;
  today: string;
}

export function collectRebase(input: CollectInput): RebaseSet {
  const { sessions, shiftSlots, brandId, platform, month, today } = input;
  const saved = input.planDrafts.filter((d) => d.id);
  const sessionById = new Map(sessions.map((s) => [s.id, s]));
  const shiftById = new Map(shiftSlots.map((s) => [s.id, s]));
  const monthSessions = sessions.filter(
    (s) => s.brandId === brandId && platformOf(s) === platform && s.date.slice(0, 7) === month && s.status !== "Cancelled"
  );
  const keyOfSession = (s: { date: string; startTime: string; endTime: string }) => draftKeyOf({ date: s.date, startTime: hhmm(s.startTime), endTime: hhmm(s.endTime) });
  const sessionByKey = new Map<string, (typeof monthSessions)[number]>();
  for (const s of monthSessions) if (!sessionByKey.has(keyOfSession(s))) sessionByKey.set(keyOfSession(s), s);

  const usedSessions = new Set<string>();
  const usedShifts = new Set<string>();
  const takenKeys = new Set(saved.map(draftKeyOf));
  const rows: RebaseRow[] = [];
  let futureNoCalendar = 0;

  for (const d of saved) {
    const ss = d.slotId ? shiftById.get(d.slotId) : undefined;
    if (ss) usedShifts.add(ss.id);
    const ses = ss?.sessionId ? sessionById.get(ss.sessionId) : undefined;
    if (ses) usedSessions.add(ses.id);
    const row = (state: RebaseState, reason: string, link?: RebaseRow["link"]): RebaseRow => ({ key: d.key, source: "plan", state, reason, link, draft: d });
    if (ss && ss.status === "cancelled") {
      rows.push(row("cancelled", "ca đã huỷ"));
    } else if (ses && ses.status === "Cancelled") {
      rows.push(row("cancelled", "phiên live đã huỷ"));
    } else if (ses) {
      rows.push(row("active", ""));
    } else if (ss) {
      // Ca mở chờ đăng ký, chưa có phiên: qua ngày mà chưa ai live thì coi như không diễn ra.
      rows.push(d.date < today ? row("nosession", "ca mở đã qua ngày, không có phiên live") : row("active", ""));
    } else {
      // Ca kế hoạch chưa gắn ca thật: khớp giờ với một phiên trên lịch thì gắn luôn, không thì xét theo ngày.
      const match = sessionByKey.get(draftKeyOf(d));
      if (match && !usedSessions.has(match.id)) {
        usedSessions.add(match.id);
        rows.push(row("active", "", { sessionId: match.id }));
      } else if (d.date < today) {
        rows.push(row("nosession", "ngày đã qua, lịch không có ca nào"));
      } else {
        futureNoCalendar++;
        rows.push(row("active", ""));
      }
    }
  }

  // Ca trên lịch chưa nằm trong kế hoạch: phiên live (OP thêm / nạp bù) + ca mở chờ đăng ký không có phiên.
  let skippedSameTime = 0;
  const addedRows: RebaseRow[] = [];
  const addCandidate = (c: { id: string; kind: "session" | "slot"; date: string; startTime: string; endTime: string }) => {
    const draft: PlanDraftSlot = { key: `add:${c.id}`, date: c.date, startTime: hhmm(c.startTime), endTime: hhmm(c.endTime), targetGmv: 0, note: "" };
    const k = draftKeyOf(draft);
    if (takenKeys.has(k)) {
      skippedSameTime++;
      return;
    }
    takenKeys.add(k);
    addedRows.push({
      key: draft.key,
      source: "added",
      state: "active",
      reason: c.date < today ? "ca OP thêm, đã qua" : "ca OP thêm",
      link: c.kind === "session" ? { sessionId: c.id } : { shiftSlotId: c.id },
      draft
    });
  };
  for (const s of [...monthSessions].sort((a, b) => keyOfSession(a).localeCompare(keyOfSession(b)))) {
    if (usedSessions.has(s.id)) continue;
    addCandidate({ id: s.id, kind: "session", date: s.date, startTime: s.startTime, endTime: s.endTime });
  }
  const openShifts = shiftSlots
    .filter((x) => x.brandId === brandId && platformOf(x) === platform && x.date.slice(0, 7) === month && x.status === "open" && !x.sessionId && !usedShifts.has(x.id))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  for (const x of openShifts) addCandidate({ id: x.id, kind: "slot", date: x.date, startTime: x.startTime, endTime: x.endTime });

  const all = [...rows, ...addedRows].sort((a, b) => draftKeyOf(a.draft).localeCompare(draftKeyOf(b.draft)));
  return { rows: all, skippedSameTime, futureNoCalendar };
}

/** Các ca VÀO phần chia (theo thứ tự `set.rows`), target cũ giữ nguyên để so. */
export const activeDrafts = (set: RebaseSet): PlanDraftSlot[] => set.rows.filter((r) => r.state === "active").map((r) => r.draft);

/** Ghép kết quả chia (`afterActive` cùng thứ tự `activeDrafts`) về cả danh sách: ca không active nhận target 0. */
export function mergeAllocated(set: RebaseSet, afterActive: PlanDraftSlot[]): PlanDraftSlot[] {
  if (afterActive.length !== activeDrafts(set).length) throw new Error("mergeAllocated: số ca chia khác số ca active");
  let i = 0;
  return set.rows.map((r) => {
    if (r.state !== "active") return { ...r.draft, targetGmv: 0 };
    const a = afterActive[i++];
    if (a.key !== r.draft.key) throw new Error("mergeAllocated: thứ tự ca bị đổi");
    return a;
  });
}

export interface RebaseItem {
  id?: string;
  target: number;
  session_id?: string;
  shift_slot_id?: string;
  expected?: number;
}

export interface RebasePlan {
  items: RebaseItem[];
  /** Ca kế hoạch có sẵn đổi target. */
  changed: number;
  pastChanged: number;
  /** Ca trên lịch được thêm vào kế hoạch. */
  added: number;
  addedPast: number;
  /** Ca đổi về 0 vì huỷ / không có ca thật. */
  zeroed: number;
  /** Ca kế hoạch có sẵn được gắn thêm ca thật. */
  linked: number;
  oldTotal: number;
  newTotal: number;
  /** Số ca vào phần chia / tổng giờ của chúng. */
  activeSlots: number;
}

/** `after` = `mergeAllocated(set, …)`. Chỉ gửi ca có thay đổi (target đổi, cần gắn, hoặc thêm mới). */
export function buildRebase(set: RebaseSet, after: PlanDraftSlot[], today: string): RebasePlan {
  if (after.length !== set.rows.length) throw new Error("buildRebase: hai danh sách khác số ca");
  const items: RebaseItem[] = [];
  const p: RebasePlan = { items, changed: 0, pastChanged: 0, added: 0, addedPast: 0, zeroed: 0, linked: 0, oldTotal: 0, newTotal: 0, activeSlots: 0 };
  set.rows.forEach((r, i) => {
    const a = after[i];
    const target = Math.max(0, Math.round(a.targetGmv));
    p.newTotal += target;
    if (r.state === "active") p.activeSlots++;
    if (r.source === "added") {
      p.added++;
      if (r.draft.date < today) p.addedPast++;
      items.push({
        target,
        ...(r.link?.sessionId ? { session_id: r.link.sessionId } : {}),
        ...(r.link?.shiftSlotId ? { shift_slot_id: r.link.shiftSlotId } : {}),
        ...(a.expectedGmv && a.expectedGmv > 0 ? { expected: Math.round(a.expectedGmv) } : {})
      });
      return;
    }
    p.oldTotal += r.draft.targetGmv;
    const needLink = !!r.link;
    const targetChanged = target !== Math.round(r.draft.targetGmv);
    if (needLink) p.linked++;
    if (!targetChanged && !needLink) return;
    if (targetChanged) {
      p.changed++;
      if (r.draft.date < today) p.pastChanged++;
      if (target === 0 && r.state !== "active") p.zeroed++;
    }
    items.push({
      id: r.draft.id,
      target,
      ...(r.link?.sessionId ? { session_id: r.link.sessionId } : {}),
      ...(r.link?.shiftSlotId ? { shift_slot_id: r.link.shiftSlotId } : {})
    });
  });
  return p;
}
