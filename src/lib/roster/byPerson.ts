import type { Talent } from "../../types";
import { isoWeekStart } from "../dateUtils";
import { canHost, checkPlacement, hostAllowedAt, type RankContext } from "./candidates";
import { primaryRole } from "./monthPlanner";
import { personEntries, shiftHours, type RosterRole, type RosterShift } from "./rules";

// "Theo người" (17/11, chị trainer): chọn một talent → thấy mọi ca MỞ người đó đã đăng ký trong tháng → xếp vào nháp (host hoặc trợ).
// Không thêm luật mới: mỗi ô dùng lại `whatIf` của candidates.ts (trùng ca chặn; quá giờ tuần / nghỉ ngắn / giờ ngày / vai theo brand
// là cảnh báo). Ghi vẫn là NHÁP (talent chưa thấy), công bố vẫn theo tuần.

export interface PersonRow {
  shift: RosterShift;
  /** Vai người này đang giữ trong nháp của ca (đã xếp). */
  holds?: RosterRole;
  /** Vai sẽ xếp (mặc định theo hồ sơ + chỗ còn trống; đã xếp thì = holds). */
  role: RosterRole;
  /** Người khác đang giữ đúng vai này (xếp = thay người đó). */
  takenBy?: string;
  /** Trùng ca (chặn) — không xếp được. */
  blocked?: string;
  /** Cảnh báo (vẫn xếp được, nhưng "Xếp tất cả" bỏ qua). */
  issues: string[];
  /** Số người KHÁC cũng đăng ký ca này. */
  rivals: number;
  /** Vai trợ không áp dụng: ca đã gắn thẻ No Asst. */
  noCo: boolean;
}

/** Ca mở trong tháng mà người này đã báo rảnh. */
export const registeredShifts = (shifts: readonly RosterShift[], talentId: string, month: string): RosterShift[] =>
  shifts.filter((s) => s.kind === "open" && s.date.startsWith(month) && s.registrants.includes(talentId));

/** Số ca mở đã đăng ký / đã xếp của mỗi người trong tháng (để làm nhãn danh sách chọn người). */
export function registrationCounts(shifts: readonly RosterShift[], month: string): Map<string, { registered: number; placed: number }> {
  const out = new Map<string, { registered: number; placed: number }>();
  for (const s of shifts) {
    if (s.kind !== "open" || !s.date.startsWith(month)) continue;
    for (const id of s.registrants) {
      const c = out.get(id) ?? { registered: 0, placed: 0 };
      c.registered += 1;
      if (s.hostId === id || s.coHostId === id) c.placed += 1;
      out.set(id, c);
    }
  }
  return out;
}

/** Vai mặc định khi xếp: hồ sơ Assistant ⇒ trợ; host ⇒ host nếu chỗ host trống, không thì trợ nếu chỗ trợ trống. */
export function defaultRole(t: Talent, shift: RosterShift): RosterRole {
  if (shift.hostId === t.id) return "host";
  if (shift.coHostId === t.id) return "co_host";
  if (primaryRole(t) === "co_host") return "co_host";
  if (!shift.hostId) return "host";
  if (!shift.coHostId && !shift.noAssistant) return "co_host";
  return "host";
}

const withAssignment = (shifts: readonly RosterShift[], key: string, role: RosterRole, talentId: string | undefined): RosterShift[] =>
  shifts.map((s) => (s.key === key ? { ...s, [role === "host" ? "hostId" : "coHostId"]: talentId, drafted: s.kind === "open" ? true : s.drafted } : s));

/** Đánh giá một ô: người này vào vai `role` của ca thì sao. `shifts` = toàn bộ ca (kể cả ca khác của họ) để bắt trùng / giờ tuần. */
export function evaluateRow(shift: RosterShift, t: Talent, role: RosterRole, ctx: RankContext, entries: ReturnType<typeof personEntries>): Pick<PersonRow, "blocked" | "issues"> {
  const w = checkPlacement(shift, t.id, role, { ...ctx, weekStart: isoWeekStart(shift.date) }, entries);
  if (w.blocked) return { blocked: w.blocked, issues: [] };
  const issues = [...w.issues];
  if (role === "host" && !canHost(t, ctx.fam) && !hostAllowedAt(ctx.brandRules, shift, t.id)) issues.push("hồ sơ chưa phải host, chưa đứng host ở kênh này");
  if (role === "co_host" && !shift.hostId) issues.push("ca chưa có host — nháp chỉ có trợ thì chưa công bố được");
  return { issues };
}

export function buildPersonRows(shifts: readonly RosterShift[], t: Talent, month: string, ctx: RankContext, forced?: RosterRole): PersonRow[] {
  const entries = personEntries(shifts);
  return registeredShifts(shifts, t.id, month).map((shift) => {
    const holds: RosterRole | undefined = shift.hostId === t.id ? "host" : shift.coHostId === t.id ? "co_host" : undefined;
    const role = holds ?? forced ?? defaultRole(t, shift);
    const cur = role === "host" ? shift.hostId : shift.coHostId;
    const takenBy = cur && cur !== t.id ? cur : undefined;
    const noCo = role === "co_host" && !!shift.noAssistant && !holds;
    const ev = holds ? { issues: [] as string[], blocked: undefined } : evaluateRow(shift, t, role, ctx, entries);
    return { shift, holds, role, takenBy, blocked: ev.blocked, issues: ev.issues, rivals: shift.registrants.filter((id) => id !== t.id).length, noCo };
  });
}

export interface BulkPlan {
  placed: { shiftKey: string; slotId: string; role: RosterRole }[];
  /** Ô bị bỏ qua và lý do ngắn (đã có người / cảnh báo / trùng ca). */
  skipped: number;
  shifts: RosterShift[];
}

/**
 * "Xếp tất cả ca hợp lệ": lần lượt theo giờ, chỉ vào chỗ TRỐNG, không trùng ca, không cảnh báo. Tính lại từng bước nên ca vừa xếp
 * được tính vào trùng / giờ tuần của ca sau. Không bao giờ thay người đã có.
 */
export function planPersonBulk(shifts: readonly RosterShift[], t: Talent, month: string, ctx: RankContext, forced?: RosterRole): BulkPlan {
  let cur = [...shifts];
  const placed: BulkPlan["placed"] = [];
  let skipped = 0;
  const targets = registeredShifts(shifts, t.id, month).sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  for (const base of targets) {
    const shift = cur.find((s) => s.key === base.key)!;
    if (shift.hostId === t.id || shift.coHostId === t.id) continue;
    const role = forced ?? defaultRole(t, shift);
    const taken = role === "host" ? shift.hostId : shift.coHostId;
    if (taken || (role === "co_host" && shift.noAssistant)) {
      skipped += 1;
      continue;
    }
    const ev = evaluateRow(shift, t, role, { ...ctx, shifts: cur }, personEntries(cur));
    if (ev.blocked || ev.issues.length > 0) {
      skipped += 1;
      continue;
    }
    cur = withAssignment(cur, shift.key, role, t.id);
    placed.push({ shiftKey: shift.key, slotId: shift.slotId!, role });
  }
  return { placed, skipped, shifts: cur };
}

/** Giờ theo lịch (đã xếp + nháp) của người trong tháng, theo vai và theo tuần. */
export function personLoad(shifts: readonly RosterShift[], talentId: string, month: string): { host: number; co: number; byWeek: Map<string, number> } {
  let host = 0;
  let co = 0;
  const byWeek = new Map<string, number>();
  for (const s of shifts) {
    if (!s.date.startsWith(month)) continue;
    const h = shiftHours(s);
    if (s.hostId === talentId) host += h;
    else if (s.coHostId === talentId) co += h;
    else continue;
    const wk = isoWeekStart(s.date);
    byWeek.set(wk, (byWeek.get(wk) ?? 0) + h);
  }
  return { host, co, byWeek };
}
