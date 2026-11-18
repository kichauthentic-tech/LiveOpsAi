import type { LiveSession, ShiftSlot, Talent, TalentRateHistoryEntry } from "../../types";
import { getCampaignDayInfo } from "../campaignDays";
import { sessionDurationHours } from "../pnl";
import { hasStaffSegments } from "../staffSegments";
import { buildFamiliarity, plannedCost } from "./candidates";
import { DEFAULT_BOUNDS, buildBandStrength, buildHostPerformancePrevMonth, planMonth, shiftTier, type HostLane, type PlanTuning } from "./monthPlanner";
import { buildRosterShifts, channelKeyOf, DEFAULT_ROSTER_RULES, type RosterShift } from "./rules";

// Cơ cấu giờ & làn host (18/11). Đo: một tháng có bao nhiêu giờ Campaign / cao điểm / thường, mỗi host thật sự làm ở cơ cấu nào;
// gợi ý làn cho host; và thử xếp lại một tháng ĐÃ QUA (không ghi gì) để so bộ xếp cũ với bộ xếp có làn. Hàm thuần.

export type Bucket = "camp" | "peak" | "regular";
export const BUCKET_LABEL: Record<Bucket, string> = { camp: "Campaign", peak: "Cao điểm", regular: "Thường" };
export const LANE_LABEL: Record<HostLane, string> = { peak: "Cao điểm", regular: "Ca thường", balanced: "Cân bằng" };

type Params = PlanTuning["params"];

export function bucketOf(shift: Pick<RosterShift, "date" | "startTime" | "channelKey">, tuning: PlanTuning): Bucket {
  if (getCampaignDayInfo(shift.date)) return "camp";
  return shiftTier(shift as RosterShift, tuning) === "peak" ? "peak" : "regular";
}

const emptyMix = (): Record<Bucket, number> => ({ camp: 0, peak: 0, regular: 0 });
export const mixTotal = (m: Record<Bucket, number>) => m.camp + m.peak + m.regular;
/** Tỷ lệ giờ Campaign + cao điểm. */
export const hiShare = (m: Record<Bucket, number>) => (mixTotal(m) > 0 ? (m.camp + m.peak) / mixTotal(m) : 0);

const usable = (s: LiveSession, month: string) => s.date.slice(0, 7) === month && s.status !== "Cancelled" && !hasStaffSegments(s) && sessionDurationHours(s.startTime, s.endTime) > 0;

/** Khung cao điểm như bộ xếp thấy lúc xếp tháng này: chỉ dữ liệu TRƯỚC tháng. */
export function tuningBefore(sessions: readonly LiveSession[], month: string, params: Params, lanes?: PlanTuning["lanes"]): PlanTuning {
  return { params, bandStrength: buildBandStrength(sessions, `${month}-01`), lanes };
}

export interface MonthMix {
  month: string;
  total: Record<Bucket, number>;
  /** Giờ host đứng ca theo từng host. */
  byHost: Map<string, Record<Bucket, number>>;
}

export function measureMonth(sessions: readonly LiveSession[], month: string, params: Params): MonthMix {
  const tuning = tuningBefore(sessions, month, params);
  const total = emptyMix();
  const byHost = new Map<string, Record<Bucket, number>>();
  for (const s of sessions) {
    if (!usable(s, month)) continue;
    const h = sessionDurationHours(s.startTime, s.endTime);
    const b = bucketOf({ date: s.date, startTime: s.startTime, channelKey: channelKeyOf(s.brandId, s.platform) }, tuning);
    total[b] += h;
    if (s.hostId) {
      const m = byHost.get(s.hostId) ?? emptyMix();
      m[b] += h;
      byHost.set(s.hostId, m);
    }
  }
  return { month, total, byHost };
}

export interface LaneSuggestion {
  talentId: string;
  lane: HostLane;
  why: string;
}

/**
 * Gợi ý làn từ rate (so với trần cast Daily) và PFM tháng trước:
 *  - rate/giờ > trần cast Daily và PFM ≥ 1,05 (≥ 6 ca) ⇒ cao điểm (đắt nhưng đáng ở ca camp / cao điểm);
 *  - rate > trần nhưng PFM chưa nổi bật ⇒ cân bằng (đo 18/11: 19/21 host vượt trần, gán hết "cao điểm" thì làn vô nghĩa);
 *  - rate ≤ trần và PFM ≥ 1,05 ⇒ cân bằng; rate ≤ trần còn lại ⇒ ca thường; chưa có rate ⇒ cân bằng.
 */
export function suggestLanes(hostIds: readonly string[], talents: readonly Talent[], history: readonly TalentRateHistoryEntry[], perf: ReadonlyMap<string, { index: number; n: number }>, date: string, params: Pick<Params, "rosterRegularCastCap">): LaneSuggestion[] {
  const byId = new Map(talents.map((t) => [t.id, t]));
  return hostIds.map((id) => {
    const t = byId.get(id);
    const c = t ? plannedCost(t, history, "host", date, 1) : null;
    const p = perf.get(id);
    if (!c || c.missing || !c.hourly) return { talentId: id, lane: "balanced" as const, why: "chưa có rate" };
    const strong = !!p && p.n >= 6 && p.index >= 1.05;
    if (c.amount > params.rosterRegularCastCap + 1) return strong ? { talentId: id, lane: "peak" as const, why: "rate cao hơn trần cast Daily, PFM cao" } : { talentId: id, lane: "balanced" as const, why: "rate cao hơn trần cast Daily, PFM chưa nổi bật" };
    if (strong) return { talentId: id, lane: "balanced" as const, why: "rate thấp, PFM cao" };
    return { talentId: id, lane: "regular" as const, why: "rate trong trần cast Daily" };
  });
}

// ---------------------------------------------------------------------------------------------------------------------------
// Thử xếp lại tháng đã qua
// ---------------------------------------------------------------------------------------------------------------------------

export interface PlanScore {
  /** Ca có host / tổng ca. */
  fillPct: number;
  /** PFM tháng trước, TB theo giờ, của host đứng ca Campaign + cao điểm / ca thường. */
  perfHi: number | null;
  perfRegular: number | null;
  /** % giờ TikTok ca thường có cast ≤ trần Daily (chỉ tính host có rate). */
  castTiktokRegular: number | null;
  castShopee: number | null;
  /** Tổng chi phí host (K). */
  hostCostK: number;
  /** Số host có ≥ 1 ca. */
  hostsUsed: number;
  /** Giờ lệch so với giờ thật (người nhiều nhất / TB), đo độ dồn giờ. */
  maxHours: number;
  /** % giờ host thuộc làn đúng cơ cấu (host làn cao điểm có ≥ 60% giờ cao điểm; làn thường ≤ 40%; cân bằng: lệch ≤ 20 điểm so với cơ cấu tháng). */
  laneFitPct: number | null;
}

export interface BacktestResult {
  month: string;
  shifts: number;
  poolHosts: number;
  poolAssistants: number;
  demandHiPct: number;
  actual: PlanScore;
  baseline: PlanScore;
  lane: PlanScore;
  lanes: Record<string, HostLane>;
}

interface PickRow {
  shift: Pick2;
  hostId?: string;
}
type Pick2 = { date: string; startTime: string; endTime: string; channelKey: string; platform: string };

function scorePicks(picks: readonly PickRow[], hours: (p: Pick2) => number, ctx: { tuning: PlanTuning; talentById: Map<string, Talent>; history: readonly TalentRateHistoryEntry[]; perf: ReadonlyMap<string, { index: number; n: number }>; params: Params; lanes: Record<string, HostLane>; demandHi: number }): PlanScore {
  let filled = 0;
  let sumHi = 0;
  let hHi = 0;
  let sumReg = 0;
  let hReg = 0;
  const cast = { tt: { ok: 0, all: 0 }, sp: { ok: 0, all: 0 } };
  let cost = 0;
  const per = new Map<string, Record<Bucket, number>>();
  for (const p of picks) {
    if (!p.hostId) continue;
    filled++;
    const h = hours(p.shift);
    const b = bucketOf(p.shift, ctx.tuning);
    const hi = b !== "regular";
    const m = per.get(p.hostId) ?? emptyMix();
    m[b] += h;
    per.set(p.hostId, m);
    const pf = ctx.perf.get(p.hostId);
    if (pf) {
      if (hi) {
        sumHi += pf.index * h;
        hHi += h;
      } else {
        sumReg += pf.index * h;
        hReg += h;
      }
    }
    const t = ctx.talentById.get(p.hostId);
    if (!t) continue;
    const c = plannedCost(t, ctx.history, "host", p.shift.date, h);
    if (c.missing || !c.hourly) continue;
    cost += c.amount;
    const perHour = c.amount / Math.max(h, 0.25);
    // Theo sàn bằng Record (test platformProfiles cấm rẽ nhánh theo tên sàn).
    const slot = { Shopee: { key: "sp" as const, cap: ctx.params.rosterShopeeCastCap, on: true }, TikTok: { key: "tt" as const, cap: ctx.params.rosterRegularCastCap, on: !hi } }[p.shift.platform as "Shopee" | "TikTok"];
    if (slot?.on && slot.cap > 0) {
      cast[slot.key].all += h;
      if (perHour <= slot.cap + 1) cast[slot.key].ok += h;
    }
  }
  let fitOk = 0;
  let fitAll = 0;
  for (const [id, m] of per) {
    const lane = ctx.lanes[id];
    if (!lane) continue;
    const s = hiShare(m);
    const ok = lane === "peak" ? s >= 0.6 : lane === "regular" ? s <= 0.4 : Math.abs(s - ctx.demandHi) <= 0.2;
    fitAll += mixTotal(m);
    if (ok) fitOk += mixTotal(m);
  }
  const pct = (a: { ok: number; all: number }) => (a.all > 0 ? (a.ok / a.all) * 100 : null);
  const hostHours = [...per.values()].map(mixTotal);
  return {
    fillPct: picks.length > 0 ? (filled / picks.length) * 100 : 0,
    perfHi: hHi > 0 ? sumHi / hHi : null,
    perfRegular: hReg > 0 ? sumReg / hReg : null,
    castTiktokRegular: pct(cast.tt),
    castShopee: pct(cast.sp),
    hostCostK: cost / 1000,
    hostsUsed: per.size,
    maxHours: hostHours.length > 0 ? Math.max(...hostHours) : 0,
    laneFitPct: fitAll > 0 ? (fitOk / fitAll) * 100 : null
  };
}

const hostIdsOf = (list: readonly LiveSession[]) => new Set(list.flatMap((s) => (s.hostId ? [s.hostId] : [])));

export interface BacktestInput {
  sessions: readonly LiveSession[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  brandNames: ReadonlyMap<string, string>;
  month: string;
  params: Params;
  /** Trọng số làn dùng cho lượt "có làn" (mặc định 0,3). */
  laneWeight?: number;
  /** Ghi đè làn (nhập tay) — thắng gợi ý. */
  laneOverrides?: Readonly<Record<string, HostLane>>;
}

/**
 * Dựng lại các ca THẬT của tháng M thành ca mở, đăng ký = mọi host/trợ có làm ca nào trong tháng (cận trên: bỏ qua lịch rảnh thật),
 * rồi xếp bằng bộ xếp cũ (làn tắt) và bộ xếp có làn; so cả hai với lịch thật. Không ghi gì.
 */
export function backtestMonth(input: BacktestInput): BacktestResult | null {
  const { sessions, talents, history, brandNames, month, params } = input;
  const monthStart = `${month}-01`;
  const used = sessions.filter((s) => usable(s, month));
  if (used.length === 0) return null;
  const activeIds = new Set<string>();
  for (const s of used) {
    if (s.hostId) activeIds.add(s.hostId);
    if (s.coHostId) activeIds.add(s.coHostId);
  }
  const pool = talents.filter((t) => activeIds.has(t.id) && (t.role === "Host" || t.role === "Assistant"));
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const slots: ShiftSlot[] = used.map((s) => ({ id: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, brandId: s.brandId, brandName: brandNames.get(s.brandId) ?? "", platform: s.platform, studioId: "bt", studioName: "bt", notes: "", status: "open" }) as ShiftSlot);
  const regs = slots.flatMap((sl) => pool.map((t) => ({ id: `${sl.id}-${t.id}`, slotId: sl.id, talentId: t.id, registeredAt: "" })));
  const last = used.reduce((m, s) => (s.date > m ? s.date : m), monthStart);
  const shifts = buildRosterShifts([], slots, [], regs, monthStart, last);
  const perf = buildHostPerformancePrevMonth(sessions, month, monthStart);
  const fam = buildFamiliarity(sessions, monthStart);
  const hostPool = [...hostIdsOf(used)];
  const lanes: Record<string, HostLane> = {};
  for (const l of suggestLanes(hostPool, talents, history, perf, monthStart, params)) lanes[l.talentId] = l.lane;
  Object.assign(lanes, input.laneOverrides ?? {});

  const baseTuning: PlanTuning = tuningBefore(sessions, month, { ...params, rosterLaneWeight: 0 });
  const laneTuning: PlanTuning = tuningBefore(sessions, month, { ...params, rosterLaneWeight: input.laneWeight ?? 0.3 }, lanes);
  const run = (tuning: PlanTuning) => planMonth({ shifts, month, today: monthStart, goal: "balance", bounds: DEFAULT_BOUNDS, guaranteeMin: false, rules: DEFAULT_ROSTER_RULES, talents: pool, history, fam, perf, tuning });
  const shiftBySlot = new Map(shifts.map((s) => [s.slotId!, s]));
  const asPicks = (hostOf: (slotId: string) => string | undefined): PickRow[] => slots.map((sl) => ({ shift: shiftBySlot.get(sl.id)!, hostId: hostOf(sl.id) }));
  const planPicks = (tuning: PlanTuning) => {
    const plan = run(tuning);
    const m = new Map(plan.assignments.filter((a) => a.role === "host").map((a) => [a.slotId, a.talentId]));
    return asPicks((id) => m.get(id));
  };
  const hours = (p: Pick2) => sessionDurationHours(p.startTime, p.endTime);
  const demand = emptyMix();
  for (const s of shifts) demand[bucketOf(s, baseTuning)] += hours(s);
  const demandHi = hiShare(demand);
  const ctx = (tuning: PlanTuning) => ({ tuning, talentById, history, perf, params, lanes, demandHi });
  const actualHost = new Map(used.map((s) => [s.id, s.hostId]));
  return {
    month,
    shifts: slots.length,
    poolHosts: pool.filter((t) => t.role === "Host").length,
    poolAssistants: pool.filter((t) => t.role === "Assistant").length,
    demandHiPct: demandHi * 100,
    actual: scorePicks(asPicks((id) => actualHost.get(id)), hours, ctx(baseTuning)),
    baseline: scorePicks(planPicks(baseTuning), hours, ctx(baseTuning)),
    lane: scorePicks(planPicks(laneTuning), hours, ctx(laneTuning)),
    lanes
  };
}
