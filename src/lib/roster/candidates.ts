import type { LiveSession, Talent, TalentRateHistoryEntry } from "../../types";
import { addDays, dateTimeRangesOverlap } from "../dateUtils";
import { effectiveSegments } from "../staffSegments";
import { findTalentRateAsOf } from "../pnl";
import {
  absRange,
  analyzeRoster,
  brandRuleViolation,
  channelKeyOf,
  shiftHours,
  type BrandRuleIndex,
  type RosterAnalysis,
  type RosterRole,
  type RosterRules,
  type RosterShift
} from "./rules";

// Điều Phối Lịch Live — ai hợp cho một ca. KHÔNG xếp theo GMV/giờ của host: đo 13/10 trên 1.197 ca, sau khi trừ kênh/khung giờ/camp host chỉ
// chênh ~±5%, xếp lại host theo thành tích tháng trước được +0,7% / −0,3% / +0,4% GMV (T8/T9/T10) và thành tích không lặp lại
// tháng sau (r = 0,23 / −0,09 / −0,13). Thứ tự gợi ý dựa vào thứ trainer kiểm soát được: người đã báo rảnh, quen kênh, giờ tuần
// còn thấp, không phạm luật nghỉ — và chi phí khi trainer chọn "Chi phí thấp".

export interface ChannelFamiliarity {
  host: number;
  co: number;
}
export type FamiliarityMap = Map<string, Map<string, ChannelFamiliarity>>;

/** Số ca (không huỷ) mỗi người đã đứng host / trợ ở từng kênh trong `days` ngày trước `refDate`. */
export function buildFamiliarity(sessions: readonly LiveSession[], refDate: string, days = 90): FamiliarityMap {
  const from = addDays(refDate, -days);
  const out: FamiliarityMap = new Map();
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date >= refDate) continue;
    const ck = channelKeyOf(s.brandId, s.platform);
    const counted = new Set<string>();
    for (const g of effectiveSegments(s)) {
      const k = `${g.talentId}|${g.role}`;
      if (counted.has(k)) continue;
      counted.add(k);
      const byCh = out.get(g.talentId) ?? new Map<string, ChannelFamiliarity>();
      const f = byCh.get(ck) ?? { host: 0, co: 0 };
      if (g.role === "host") f.host += 1;
      else f.co += 1;
      byCh.set(ck, f);
      out.set(g.talentId, byCh);
    }
  }
  return out;
}

export const famOf = (fam: FamiliarityMap, talentId: string, channelKey: string): ChannelFamiliarity =>
  fam.get(talentId)?.get(channelKey) ?? { host: 0, co: 0 };

/** Đứng được vai host: hồ sơ là Host, hoặc đã đứng host ≥ 3 ca ở bất kỳ kênh nào (hồ sơ chỉ là nhãn, không chặn). */
export function canHost(t: Talent, fam: FamiliarityMap): boolean {
  if (t.role === "Host") return true;
  let n = 0;
  for (const f of fam.get(t.id)?.values() ?? []) n += f.host;
  return n >= 3;
}

export interface PlannedCost {
  amount: number;
  hourly: boolean;
  /** Chưa có rate nào (theo giờ lẫn theo phiên) — chi phí không biết, KHÔNG phải 0. */
  missing: boolean;
}

/** Chi phí dự kiến của một người cho một ca theo lịch: cùng luật lib/pnl.ts (rate tại ngày ca, trợ ưu tiên rate trợ, không có
 *  rate giờ thì rate/phiên), giờ = giờ theo lịch (chưa có OT/off sớm), không có hoa hồng GMV (user chốt 06/10). */
export function plannedCost(t: Talent | undefined, history: readonly TalentRateHistoryEntry[], role: RosterRole, date: string, hours: number): PlannedCost {
  if (!t) return { amount: 0, hourly: false, missing: true };
  const r = findTalentRateAsOf(history as TalentRateHistoryEntry[], t.id, date);
  let hourRate: number;
  if (role === "host") hourRate = r?.ratePerHour ?? t.ratePerHour ?? 0;
  else {
    const a = r?.assistantRatePerHour ?? t.assistantRatePerHour ?? 0;
    hourRate = a > 0 ? a : r?.ratePerHour ?? t.ratePerHour ?? 0;
  }
  if (hourRate > 0) return { amount: hourRate * hours, hourly: true, missing: false };
  const perSession = r?.ratePerSession ?? t.ratePerSession ?? 0;
  return { amount: perSession, hourly: false, missing: perSession <= 0 };
}

export type RankMode = "balance" | "cost";

export interface RankContext {
  shifts: RosterShift[];
  rules: RosterRules;
  weekStart: string;
  fam: FamiliarityMap;
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  mode: RankMode;
  nameOf: (talentId: string) => string;
  /** Điều khoản về host với brand (0191): host bị brand từ chối / độc quyền brand khác không vào danh sách gợi ý. */
  brandRules?: BrandRuleIndex;
}

export interface Candidate {
  talentId: string;
  /** Lý do không xếp được (trùng ca, quá giờ tuần). */
  blocked?: string;
  score: number;
  famHost: number;
  famCo: number;
  weekHours: number;
  issues: string[];
  cost: PlannedCost;
  registered: boolean;
  /** Đủ điều kiện để xếp theo giá: quen kênh (host ≥ 3 ca host / trợ ≥ 3 ca), không cảnh báo, tuần ≤ 36 giờ sau khi xếp. */
  qualified: boolean;
}

const SOFT_WEEK_CAP = 36;
const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace(".", ",");

/** Những gì sẽ xảy ra nếu xếp `talentId` vào ca: trùng (chặn), quá giờ tuần (chặn), nghỉ ngắn / chạy phòng / quá giờ ngày (cảnh báo). */
function whatIf(shift: RosterShift, talentId: string, ctx: RankContext, an: RosterAnalysis): { blocked?: string; issues: string[]; weekHours: number } {
  const violation = brandRuleViolation(ctx.brandRules, shift.brandId, talentId);
  if (violation) return { blocked: violation.text[0].toUpperCase() + violation.text.slice(1), issues: [], weekHours: 0 };
  const want = { date: shift.date, startTime: shift.startTime, endTime: shift.endTime };
  const [a, b] = absRange(want);
  const list = (an.entries.get(talentId) ?? []).filter((e) => e.shift.key !== shift.key);
  for (const e of list) {
    if (e.ranges.some((r) => dateTimeRangesOverlap(r, want))) {
      return { blocked: `Đang ở ca ${e.shift.brandName} ${e.shift.startTime}–${e.shift.endTime}`, issues: [], weekHours: 0 };
    }
  }
  const weekEnd = addDays(ctx.weekStart, 6);
  const curWeek = list.filter((e) => e.shift.date >= ctx.weekStart && e.shift.date <= weekEnd).reduce((s, e) => s + e.minutes / 60, 0);
  const inWeek = shift.date >= ctx.weekStart && shift.date <= weekEnd;
  const after = curWeek + (inWeek ? shiftHours(shift) : 0);
  if (after > ctx.rules.maxWeekHours) return { blocked: `Sẽ thành ${fmtH(after)} giờ/tuần`, issues: [], weekHours: curWeek };
  const issues: string[] = [];
  const lateMin = (() => {
    const [h, m] = ctx.rules.lateEndTime.split(":").map(Number);
    return h * 60 + m;
  })();
  const dayStart = (d: string) => absRange({ date: d, startTime: "00:00", endTime: "00:01" })[0];
  for (const e of list) {
    const g1 = a - e.end; // ca của họ trước ca này
    const g2 = e.start - b; // ca của họ sau ca này
    const prevLate = e.end - dayStart(e.shift.date) >= lateMin;
    const thisLate = b - dayStart(shift.date) >= lateMin;
    const roomDiff = e.shift.studioId && shift.studioId && e.shift.studioId !== shift.studioId;
    if (((g1 >= 0 && g1 <= ctx.rules.minRoomChangeMinutes) || (g2 >= 0 && g2 <= ctx.rules.minRoomChangeMinutes)) && roomDiff) {
      issues.push(`sát ca phòng ${e.shift.studioName || "khác"}`);
    } else if (g1 >= 0 && g1 < ctx.rules.minRestHours * 60 && prevLate) issues.push(`nghỉ ${fmtH(g1 / 60)}h sau ca khuya`);
    else if (g2 >= 0 && g2 < ctx.rules.minRestHours * 60 && thisLate) issues.push(`ca sau chỉ cách ${fmtH(g2 / 60)}h`);
  }
  const dayH = list.filter((e) => e.shift.date === shift.date).reduce((s, e) => s + e.minutes / 60, 0) + shiftHours(shift);
  if (dayH > ctx.rules.maxDayHours) issues.push(`${fmtH(dayH)}h trong ngày`);
  // Chuỗi ngày làm liền nếu thêm ngày này (cùng luật "streak" của analyzeRoster).
  const days = new Set(list.map((e) => e.shift.date));
  if (!days.has(shift.date)) {
    let run = 1;
    for (let d = addDays(shift.date, -1); days.has(d); d = addDays(d, -1)) run++;
    for (let d = addDays(shift.date, 1); days.has(d); d = addDays(d, 1)) run++;
    if (run > ctx.rules.maxStreakDays) issues.push(`${run} ngày làm liền`);
  }
  if (after > ctx.rules.warnWeekHours) issues.push(`${fmtH(after)}h tuần`);
  return { issues, weekHours: curWeek };
}

/** Xếp hạng người cho một vai của một ca. Người đang ở vai kia của ca, hoặc đang ở đúng vai này, không vào danh sách. */
export function rankCandidates(shift: RosterShift, role: RosterRole, ctx: RankContext, an: RosterAnalysis): Candidate[] {
  const other = role === "host" ? shift.coHostId : shift.hostId;
  const current = role === "host" ? shift.hostId : shift.coHostId;
  const h = shiftHours(shift);
  const out: Candidate[] = [];
  for (const t of ctx.talents) {
    if (t.id === other || t.id === current) continue;
    if (role === "host" && !canHost(t, ctx.fam)) continue;
    const f = famOf(ctx.fam, t.id, shift.channelKey);
    const w = whatIf(shift, t.id, ctx, an);
    const cost = plannedCost(t, ctx.history, role, shift.date, h);
    const registered = shift.registrants.includes(t.id);
    if (w.blocked) {
      out.push({ talentId: t.id, blocked: w.blocked, score: -Infinity, famHost: f.host, famCo: f.co, weekHours: w.weekHours, issues: [], cost, registered, qualified: false });
      continue;
    }
    const famN = role === "host" ? f.host + 0.5 * f.co : f.co + 0.5 * f.host;
    let score = (45 * Math.log1p(famN)) / Math.log1p(30) + 30 * Math.max(-0.5, 1 - w.weekHours / SOFT_WEEK_CAP) - 12 * w.issues.length;
    if (f.host + f.co === 0) score -= 25;
    if (registered) score += 30;
    if (ctx.brandRules?.preferred.has(`${shift.brandId}|${t.id}`)) score += 20;
    const known = role === "host" ? f.host >= 3 : f.host + f.co >= 3;
    const qualified = known && w.issues.length === 0 && w.weekHours + h <= SOFT_WEEK_CAP && !cost.missing;
    out.push({ talentId: t.id, score, famHost: f.host, famCo: f.co, weekHours: w.weekHours, issues: w.issues, cost, registered, qualified });
  }
  if (ctx.mode === "cost") {
    return out.sort(
      (x, y) =>
        Number(!!x.blocked) - Number(!!y.blocked) ||
        Number(y.qualified) - Number(x.qualified) ||
        (x.qualified && y.qualified ? Number(y.registered) - Number(x.registered) || x.cost.amount - y.cost.amount : y.score - x.score)
    );
  }
  return out.sort((x, y) => Number(!!x.blocked) - Number(!!y.blocked) || y.score - x.score);
}

export interface Assignment {
  shiftKey: string;
  slotId: string;
  role: RosterRole;
  talentId: string;
}

const withAssignment = (shifts: RosterShift[], key: string, role: RosterRole, talentId: string | undefined) =>
  shifts.map((s) => (s.key === key ? { ...s, [role === "host" ? "hostId" : "coHostId"]: talentId, drafted: s.kind === "open" ? true : s.drafted } : s));

/**
 * Lấp chỗ trống của các CA MỞ trong tuần (ca đã lên lịch đổi người phải có lý do nên không tự đổi). Lần lượt theo giờ, chọn người
 * đầu bảng không bị chặn, không cảnh báo, đã đứng/trợ kênh trong 90 ngày (chế độ chi phí: người đủ điều kiện rẻ nhất).
 */
export function autofillWeek(ctx: RankContext): { assignments: Assignment[]; missed: number; shifts: RosterShift[] } {
  let shifts = ctx.shifts;
  const weekEnd = addDays(ctx.weekStart, 6);
  const targets = shifts.filter((s) => s.kind === "open" && s.date >= ctx.weekStart && s.date <= weekEnd);
  const assignments: Assignment[] = [];
  let missed = 0;
  for (const t of targets) {
    for (const role of ["host", "co_host"] as const) {
      const cur = shifts.find((s) => s.key === t.key)!;
      if (role === "host" ? cur.hostId : cur.coHostId) continue;
      const an = analyzeRoster(shifts, ctx.rules, ctx.weekStart, ctx.nameOf, undefined, ctx.brandRules);
      const pick = rankCandidates(cur, role, { ...ctx, shifts }, an).find(
        (c) => !c.blocked && c.issues.length === 0 && c.famHost + c.famCo > 0 && (ctx.mode !== "cost" || c.qualified)
      );
      if (!pick) {
        missed += 1;
        continue;
      }
      shifts = withAssignment(shifts, t.key, role, pick.talentId);
      assignments.push({ shiftKey: t.key, slotId: t.slotId!, role, talentId: pick.talentId });
    }
  }
  return { assignments, missed, shifts };
}

export interface CostMove {
  shiftKey: string;
  slotId: string;
  role: RosterRole;
  from: string;
  to: string;
  save: number;
  /** Người cũ đang dính cảnh báo/lỗi ở ca này — đổi là gỡ luôn. */
  fixes: boolean;
}

/**
 * Giảm chi phí trên NHÁP của tuần (ca mở có người nháp): mỗi vòng chọn lần đổi tiết kiệm nhiều nhất (ưu tiên lần đổi gỡ được lỗi),
 * chỉ sang người đủ điều kiện rẻ hơn ≥ 15%, mỗi người nhận thêm ≤ 9 giờ, dừng ở `limit` lần đổi để lịch không bị xáo trộn
 * (bản thử 13/10 không giới hạn đổi 111 người một tuần).
 */
export function planCostCut(ctx: RankContext, limit: number): { moves: CostMove[]; save: number; shifts: RosterShift[] } {
  let shifts = ctx.shifts;
  const weekEnd = addDays(ctx.weekStart, 6);
  const moves: CostMove[] = [];
  const touched = new Set<string>();
  const added = new Map<string, number>();
  const costCtx: RankContext = { ...ctx, mode: "cost" };
  for (let k = 0; k < limit; k++) {
    const an = analyzeRoster(shifts, ctx.rules, ctx.weekStart, ctx.nameOf, undefined, ctx.brandRules);
    let best: (CostMove & { key: number; hours: number }) | null = null;
    for (const s of shifts) {
      if (s.kind !== "open" || s.date < ctx.weekStart || s.date > weekEnd) continue;
      for (const role of ["host", "co_host"] as const) {
        const cur = role === "host" ? s.hostId : s.coHostId;
        if (!cur || touched.has(`${s.key}|${role}`)) continue;
        const h = shiftHours(s);
        const old = plannedCost(ctx.talents.find((t) => t.id === cur), ctx.history, role, s.date, h);
        if (old.missing) continue;
        const hadIssue = (an.byShift.get(s.key) ?? []).some((i) => i.talentId === cur);
        const c = rankCandidates(s, role, { ...costCtx, shifts }, an).find((x) => x.qualified && (added.get(x.talentId) ?? 0) + h <= 9);
        if (!c) continue;
        const save = old.amount - c.cost.amount;
        if (!(c.cost.amount <= old.amount * 0.85 || (hadIssue && save >= 0))) continue;
        const key = save + (hadIssue ? 1e12 : 0);
        if (!best || key > best.key) best = { key, hours: h, shiftKey: s.key, slotId: s.slotId!, role, from: cur, to: c.talentId, save, fixes: hadIssue };
      }
    }
    if (!best) break;
    const move: CostMove = { shiftKey: best.shiftKey, slotId: best.slotId, role: best.role, from: best.from, to: best.to, save: best.save, fixes: best.fixes };
    const hours = best.hours;
    moves.push(move);
    touched.add(`${move.shiftKey}|${move.role}`);
    added.set(move.to, (added.get(move.to) ?? 0) + hours);
    shifts = withAssignment(shifts, move.shiftKey, move.role, move.to);
  }
  return { moves, save: moves.reduce((s, m) => s + m.save, 0), shifts };
}

/** Chi phí theo lịch của một ca (host + trợ). `missing` = có người trong ca chưa có rate. */
export function shiftCost(s: RosterShift, talents: readonly Talent[], history: readonly TalentRateHistoryEntry[]): PlannedCost {
  const h = shiftHours(s);
  let amount = 0;
  let missing = false;
  for (const [tid, role] of [
    [s.hostId, "host"],
    [s.coHostId, "co_host"]
  ] as const) {
    if (!tid) continue;
    const c = plannedCost(
      talents.find((t) => t.id === tid),
      history,
      role,
      s.date,
      h
    );
    amount += c.amount;
    missing = missing || c.missing;
  }
  return { amount, hourly: true, missing };
}
