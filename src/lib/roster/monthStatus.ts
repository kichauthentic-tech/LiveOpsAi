import type { LiveSession, ShiftRegistration, ShiftSlot } from "../../types";
import type { RosterDraft, RosterWeek } from "../db/roster";
import { isoWeekStart } from "../dateUtils";
import type { NowHours } from "./monthDesk";

// Điều Phối Lịch Live bản gọn (đợt 1, 25/10 — user chốt theo demo https://claude.ai/artifact/6YoM6U3rE89iGcSNESPUyq):
// một màn Lịch tuần + dải trạng thái theo tháng + "Việc cần làm". File này là phần tính thuần: tháng đang ở bước nào
// (Mở ca → Đăng ký → Xếp người → Công bố → Live) và kết luận giờ MỘT câu cho mỗi kênh (bỏ cặp "xếp thêm giờ" + "không thêm giờ
// vì GMV" từng đứng cạnh nhau ở màn Tháng này cũ — phần GMV chuyển thành một việc "báo quản lý" riêng).

export type MonthPhase =
  /** Tháng đang chạy (chứa hôm nay). */
  | "live"
  /** Tháng đã qua. */
  | "past"
  /** Chưa có ca nào (cả ca đã chốt lẫn ca mở). */
  | "none"
  /** Có ca mở nhưng chưa đặt hạn đăng ký. */
  | "no_deadline"
  /** Hạn đăng ký còn ở tương lai, còn ca mở chưa có host nháp. */
  | "signup"
  /** Đã qua hạn (hoặc không còn ai chờ), còn ca mở chưa có host nháp. */
  | "staff"
  /** Đủ người nháp, còn tuần chưa công bố. */
  | "publish"
  /** Mọi ca đã chốt người. */
  | "done";

export const MONTH_STEPS = ["Mở ca", "Đăng ký", "Xếp người", "Công bố", "Live"] as const;

export interface MonthStatus {
  month: string;
  phase: MonthPhase;
  /** Bước đã xong trên dải 5 bước (cùng thứ tự MONTH_STEPS) — "cur" = đang ở bước này. */
  steps: ("done" | "cur" | "todo")[];
  sessions: number;
  openSlots: number;
  /** Ca mở có ít nhất một người báo rảnh. */
  slotsWithSignup: number;
  /** Số người khác nhau đã báo rảnh ít nhất một ca mở trong tháng. */
  signedPeople: number;
  signedIds: Set<string>;
  /** Ca mở chưa có host nháp. */
  noHost: number;
  /** Ca mở chưa có host nháp nhưng có người báo rảnh. */
  noHostWithSignup: number;
  /** Ca mở đã có host nháp. */
  drafted: number;
  /** Tuần (Thứ 2) có ca nháp chưa công bố. */
  weeksToPublish: string[];
  deadline?: string;
}

export interface MonthStatusInput {
  month: string;
  today: string;
  /** Giờ hiện tại (ISO) — so với hạn đăng ký. */
  now: string;
  sessions: readonly LiveSession[];
  slots: readonly ShiftSlot[];
  registrations: readonly ShiftRegistration[];
  drafts: readonly RosterDraft[];
  weeks: readonly RosterWeek[];
  deadline?: string;
}

const STEP_OF: Record<MonthPhase, number> = { none: 0, no_deadline: 0, signup: 1, staff: 2, publish: 3, done: 4, live: 4, past: 5 };

export function monthStatus(x: MonthStatusInput): MonthStatus {
  const inMonth = (d: string) => d.slice(0, 7) === x.month;
  const sessions = x.sessions.filter((s) => inMonth(s.date) && s.status !== "Cancelled").length;
  const open = x.slots.filter((sl) => inMonth(sl.date) && sl.status === "open" && !sl.sessionId);
  const openIds = new Set(open.map((sl) => sl.id));
  const regs = x.registrations.filter((r) => openIds.has(r.slotId));
  const regSlots = new Set(regs.map((r) => r.slotId));
  const signedIds = new Set(regs.map((r) => r.talentId));
  const draftBy = new Map(x.drafts.map((d) => [d.slotId, d]));
  const withHost = open.filter((sl) => !!draftBy.get(sl.id)?.hostId);
  const noHostSlots = open.filter((sl) => !draftBy.get(sl.id)?.hostId);
  const published = new Set(x.weeks.filter((w) => w.publishedAt).map((w) => w.weekStart));
  const weeksToPublish = [...new Set(withHost.map((sl) => isoWeekStart(sl.date)).filter((w) => !published.has(w)))].sort();

  const thisMonth = x.today.slice(0, 7);
  let phase: MonthPhase;
  if (x.month < thisMonth) phase = "past";
  else if (x.month === thisMonth) phase = "live";
  else if (open.length === 0 && sessions === 0) phase = "none";
  else if (noHostSlots.length > 0 && !x.deadline) phase = "no_deadline";
  else if (noHostSlots.length > 0 && x.deadline && x.deadline > x.now) phase = "signup";
  else if (noHostSlots.length > 0) phase = "staff";
  else if (weeksToPublish.length > 0) phase = "publish";
  else phase = "done";

  const cur = STEP_OF[phase];
  const steps = MONTH_STEPS.map((_, i) => (i < cur ? "done" : i === cur && phase !== "past" ? "cur" : "todo") as "done" | "cur" | "todo");
  return {
    month: x.month,
    phase,
    steps,
    sessions,
    openSlots: open.length,
    slotsWithSignup: regSlots.size,
    signedPeople: signedIds.size,
    signedIds,
    noHost: noHostSlots.length,
    noHostWithSignup: noHostSlots.filter((sl) => regSlots.has(sl.id)).length,
    drafted: withHost.length,
    weeksToPublish,
    deadline: x.deadline
  };
}

// ---------------------------------------------------------------------------------------------------------------------------

export type VerdictTone = "bad" | "good" | "muted";
export interface ChannelVerdict {
  tone: VerdictTone;
  text: string;
  /** Giờ cần xếp thêm (> 0.5) — để "Việc cần làm" gợi nút Thêm ca. */
  add: number;
}

/**
 * Một câu cho kênh trong tháng đang chạy, chỉ về GIỜ: thiếu (để đủ cam kết, hoặc — kênh không cam kết giờ — để dự báo kịp target
 * khi Dashboard nói "save"), dư, hay đủ. `saveExtra` = accountRow.rescue.extraHours khi kind = "save", còn lại null.
 */
export function channelVerdict(h: NowHours | null, saveExtra: number | null): ChannelVerdict | null {
  const commitExtra = h && h.committed > 0 ? h.extra : 0;
  const add = Math.max(commitExtra, saveExtra ?? 0);
  const vn = (v: number) => Math.round(v).toLocaleString("vi-VN");
  if (add > 0.5) return { tone: "bad", text: commitExtra >= (saveExtra ?? 0) ? `thiếu ~${vn(add)} giờ` : `thêm ~${vn(add)} giờ là kịp target`, add };
  if (h && h.committed > 0 && h.extra < -0.5) return { tone: "muted", text: `dư ~${vn(-h.extra)} giờ`, add: 0 };
  if (h && h.committed > 0) return { tone: "good", text: "đủ giờ", add: 0 };
  return null;
}
