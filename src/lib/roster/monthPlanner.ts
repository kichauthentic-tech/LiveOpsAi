import type { LiveSession, Talent, TalentRateHistoryEntry } from "../../types";
import { addDays, isoWeekStart } from "../dateUtils";
import { getCampaignDayInfo } from "../campaignDays";
import type { EngineParams } from "../scheduling/engineParams";
import { hasStaffSegments } from "../staffSegments";
import { canHost, famOf, hostAllowedAt, hostChannelKey, plannedCost, type FamiliarityMap, type HostChannelGmv } from "./candidates";
import { absRange, brandRuleViolation, personEntries, shiftHours, type BrandRuleIndex, type RosterRole, type RosterRules, type RosterShift } from "./rules";

// Điều Phối Lịch Live — xếp CẢ THÁNG theo mục tiêu (Performance / Chi phí / Cân bằng). Hàm thuần.
//
// Ba nguyên tắc (user chốt 01/11):
//  1. Chỉ gợi ý người ĐÃ ĐĂNG KÝ đúng ca mở đó (pool = shift_registrations). Ca không ai đăng ký thì để trống và báo, không bốc người
//     ngoài pool.
//  2. Mỗi người có GIỜ TỐI THIỂU (đảm bảo thu nhập) và GIỜ TỐI ĐA (sức người + luật tuần/ngày) trong tháng. Tối đa là ràng buộc cứng,
//     tối thiểu là mục tiêu được ưu tiên trong điểm và có vòng cân lại cuối cùng.
//  3. Ca đã lên lịch / đã nháp là cố định (đổi người phải có lý do ở luồng cũ); bộ xếp chỉ lấp chỗ trống của ca MỞ.
//
// Chỉ số Performance của host là CHỈ SỐ CÓ CO NHỎ (shrinkage): thành tích host đo 13/10 không lặp lại ổn định tháng sau (r = 0,23 /
// −0,09 / −0,13), nên người ít ca bị kéo về 1,00 và UI luôn ghi số ca làm căn cứ. Đây là gợi ý có bằng chứng yếu, không phải xếp hạng.

export type PlanGoal = "performance" | "cost" | "balance";
export const GOAL_LABEL: Record<PlanGoal, string> = { performance: "Tối ưu Performance", cost: "Tối ưu chi phí", balance: "Cân bằng" };

export const GOALS: PlanGoal[] = ["performance", "balance", "cost"];
export const GOAL_HINT: Record<PlanGoal, string> = {
  performance: "Ưu tiên host có GMV/giờ cao hơn kỳ vọng cùng kênh × khung giờ (chỉ số đã co về 1,00 theo số ca)",
  cost: "Ưu tiên người rẻ hơn trong số đã đăng ký, vẫn giữ giờ tối thiểu từng người",
  balance: "Cân hiệu suất, chi phí, độ quen kênh và giờ tối thiểu"
};
export interface HourBounds {
  min: number;
  max: number;
}
export interface MonthBounds {
  host: HourBounds;
  co_host: HourBounds;
}

/** Mặc định đo trên giờ live thật T8–T10 (người có ca): host P25 ≈ 24h, P90 ≈ 75h; trợ P25 ≈ 30h, P90 ≈ 105h/tháng. */
export const DEFAULT_BOUNDS: MonthBounds = { host: { min: 24, max: 80 }, co_host: { min: 30, max: 110 } };

/** Vai chính của một người: hồ sơ Assistant ⇒ trợ, còn lại ⇒ host. */
export const primaryRole = (t: Talent): RosterRole => (t.role === "Assistant" ? "co_host" : "host");

/**
 * Giờ tối thiểu / tối đa trong tháng của một người. Tối đa = min(mức vai, luật giờ/tuần × số tuần của tháng); tối thiểu không vượt tối đa.
 * Người chưa đăng ký ca nào thì không thể đạt tối thiểu — UI báo "chưa đăng ký", không tính vào "dưới tối thiểu".
 */
export function personBounds(t: Talent, base: MonthBounds, rules: Pick<RosterRules, "maxWeekHours">, month: string): HourBounds {
  const b = base[primaryRole(t)];
  const days = daysInMonth(month);
  const max = Math.min(b.max, Math.round((rules.maxWeekHours * days) / 7));
  return { min: Math.min(b.min, max), max };
}

export const daysInMonth = (month: string) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();

// ---------------------------------------------------------------------------------------------------------------------------
// Chỉ số Performance của host
// ---------------------------------------------------------------------------------------------------------------------------

export interface HostPerf {
  /** 1,00 = bằng kỳ vọng của kênh × khung giờ. Đã co về 1,00 theo số ca. */
  index: number;
  /** Số ca host làm căn cứ. */
  n: number;
}
export const PERF_SHRINK_K = 6;
export const PERF_WINDOW_DAYS = 90;
const band = (start: string) => {
  const h = Number(start.slice(0, 2));
  return h < 12 ? "am" : h < 17 ? "pm" : h < 22 ? "eve" : "late";
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

/**
 * GMV/giờ của host ÷ GMV/giờ trung vị cùng kênh × khung giờ (khung ít hơn 5 ca thì lấy cả kênh), trung bình rồi co về 1,00 với K = 6 ca.
 * Chỉ ca host một người (không chia đoạn), có GMV và giờ. KHÔNG loại ca nạp bù: phần lớn lịch T8–T10 nạp từ Sheet, loại đi là mất gần hết căn cứ.
 */
export function buildHostPerformance(sessions: readonly LiveSession[], refDate: string, days = PERF_WINDOW_DAYS): Map<string, HostPerf> {
  return perfBetween(sessions, addDays(refDate, -days), refDate);
}

/**
 * PFM THÁNG TRƯỚC (17/11, brief chị Trainer): chỉ số host tính trên tháng dương lịch ngay trước tháng đang xếp, tới hôm nay nếu tháng đó chưa hết
 * (xếp T12 ngày 17/11 ⇒ 1–16/11). Cùng cách tính và độ co như `buildHostPerformance` — chỉ đổi cửa sổ; người ít ca vẫn bị kéo về 1,00.
 */
export function buildHostPerformancePrevMonth(sessions: readonly LiveSession[], month: string, today: string): Map<string, HostPerf> {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const monthStart = `${month}-01`;
  return perfBetween(sessions, `${prev}-01`, today < monthStart ? today : monthStart);
}

function perfBetween(sessions: readonly LiveSession[], from: string, refDate: string): Map<string, HostPerf> {
  const rows: { host: string; ch: string; band: string; rate: number }[] = [];
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date >= refDate || !s.hostId || hasStaffSegments(s)) continue;
    const h = shiftHours(s);
    if (h <= 0 || !(s.actualGmv > 0)) continue;
    rows.push({ host: s.hostId, ch: `${s.brandId}|${s.platform}`, band: band(s.startTime), rate: s.actualGmv / h });
  }
  const byCell = new Map<string, number[]>();
  const byCh = new Map<string, number[]>();
  for (const r of rows) {
    for (const [m, k] of [
      [byCell, `${r.ch}|${r.band}`],
      [byCh, r.ch]
    ] as const) {
      const l = m.get(k) ?? [];
      l.push(r.rate);
      m.set(k, l);
    }
  }
  const sums = new Map<string, { sum: number; n: number }>();
  for (const r of rows) {
    const cell = byCell.get(`${r.ch}|${r.band}`) ?? [];
    const expect = cell.length >= 5 ? median(cell) : median(byCh.get(r.ch) ?? []);
    if (!(expect > 0)) continue;
    const o = sums.get(r.host) ?? { sum: 0, n: 0 };
    o.sum += r.rate / expect;
    o.n += 1;
    sums.set(r.host, o);
  }
  const out = new Map<string, HostPerf>();
  for (const [id, { sum, n }] of sums) out.set(id, { index: (sum + PERF_SHRINK_K) / (n + PERF_SHRINK_K), n });
  return out;
}

export function buildHostChannelGmv(sessions: readonly LiveSession[], refDate: string, days = PERF_WINDOW_DAYS): Map<string, HostChannelGmv> {
  const from = addDays(refDate, -days);
  const acc = new Map<string, { gmv: number; hours: number; n: number }>();
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date >= refDate || !s.hostId || hasStaffSegments(s)) continue;
    const h = shiftHours(s);
    if (h <= 0 || !(s.actualGmv > 0)) continue;
    const k = hostChannelKey(s.hostId, `${s.brandId}|${s.platform}`);
    const o = acc.get(k) ?? { gmv: 0, hours: 0, n: 0 };
    o.gmv += s.actualGmv;
    o.hours += h;
    o.n += 1;
    acc.set(k, o);
  }
  const out = new Map<string, HostChannelGmv>();
  for (const [k, o] of acc) out.set(k, { gmvPerHour: o.gmv / o.hours, n: o.n });
  return out;
}

/** Sức mạnh khung giờ: GMV/giờ trung vị của (kênh × khung) ÷ trung vị cả kênh, 90 ngày. Khung ít hơn 5 ca không có số (coi là bình thường). */
export function buildBandStrength(sessions: readonly LiveSession[], refDate: string, days = PERF_WINDOW_DAYS): Map<string, number> {
  const from = addDays(refDate, -days);
  const byCell = new Map<string, number[]>();
  const byCh = new Map<string, number[]>();
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date >= refDate || hasStaffSegments(s)) continue;
    const h = shiftHours(s);
    if (h <= 0 || !(s.actualGmv > 0)) continue;
    const ch = `${s.brandId}|${s.platform}`;
    const rate = s.actualGmv / h;
    for (const [m, k] of [
      [byCell, `${ch}|${band(s.startTime)}`],
      [byCh, ch]
    ] as const) {
      const l = m.get(k) ?? [];
      l.push(rate);
      m.set(k, l);
    }
  }
  const out = new Map<string, number>();
  for (const [k, v] of byCell) {
    if (v.length < 5) continue;
    const chMed = median(byCh.get(k.split("|").slice(0, 2).join("|")) ?? []);
    if (chMed > 0) out.set(k, median(v) / chMed);
  }
  return out;
}

/** Trần giờ riêng của một người (người có rate cao / chiến lược riêng của Trainer). Người không có dòng = giới hạn mặc định chung. */
export interface PersonCap {
  /** Trần giờ cả tháng (thay giờ tối đa mặc định của vai). */
  monthMax: number;
  /** Ghi đè trần cho đợt ngày 1–15 (mặc định: monthMax × tỷ lệ giờ của nửa đầu, cộng dung sai). */
  firstHalfMax?: number;
  /** Trần TỰ SUY (autoCaps.ts): chỉ dùng để chia đợt và đo nhịp giờ, KHÔNG hạ giờ tối đa tháng của người đó. Cam kết nhập tay thì không "soft". */
  soft?: boolean;
}

/** Mọi đầu vào chỉnh được của luật tự fill (Điều Phối Lịch Live): tham số ở AI Training + trần giờ riêng + sức mạnh khung giờ. */
export interface PlanTuning {
  params: Pick<
    EngineParams,
    | "rosterPeakPerfAdd"
    | "rosterRegularCostAdd"
    | "rosterRegularCastCap"
    | "rosterShopeeCastCap"
    | "rosterCastOverPenalty"
    | "rosterScarcityWeight"
    | "rosterPaceWeight"
    | "rosterMaleAsstSport"
    | "rosterMaleAsstNight"
    | "rosterRangeTolerance"
    | "rosterPeakBandRatio"
    | "rosterAutoCapSlack"
    | "rosterLaneWeight"
  >;
  personCaps?: Readonly<Record<string, PersonCap>>;
  bandStrength?: ReadonlyMap<string, number>;
  /** Làn host (lanes.ts): peak = nghiêng ca Campaign/cao điểm, regular = nghiêng ca thường, balanced = theo cơ cấu giờ của tháng. Chỉ có tác dụng khi rosterLaneWeight > 0. */
  lanes?: Readonly<Record<string, HostLane>>;
}
export type HostLane = "peak" | "regular" | "balanced";
/** Tỷ lệ giờ cao điểm mong muốn của từng làn (balanced = cơ cấu giờ cần xếp của tháng). */
export const LANE_HI_SHARE: Record<Exclude<HostLane, "balanced">, number> = { peak: 0.8, regular: 0.2 };

/** Brand thể thao được ưu tiên trợ nam nhẹ (chị Trainer): tên chứa Franklin hoặc CROCS. */
export const SPORT_BRAND_PATTERN = /franklin|crocs/i;
const isMale = (g: string | undefined) => ["nam", "male", "m"].includes((g ?? "").trim().toLowerCase());

export type ShiftTier = "peak" | "regular";
/** Ca Campaign (D-Day / Mid-Month / Pay Day) hoặc khung giờ GMV/giờ cao ⇒ "peak"; còn lại (Daily, thấp điểm) ⇒ "regular". */
export function shiftTier(shift: RosterShift, tuning: PlanTuning | undefined): ShiftTier {
  if (getCampaignDayInfo(shift.date)) return "peak";
  const ratio = tuning?.bandStrength?.get(`${shift.channelKey}|${band(shift.startTime)}`);
  return ratio !== undefined && ratio >= (tuning?.params.rosterPeakBandRatio ?? 1.15) ? "peak" : "regular";
}

// ---------------------------------------------------------------------------------------------------------------------------
// Bộ xếp
// ---------------------------------------------------------------------------------------------------------------------------

interface Interval {
  start: number;
  end: number;
  date: string;
  hours: number;
  role: RosterRole;
  late: boolean;
  /** Ca do bộ xếp thêm (được phép gỡ khi cân lại). */
  planned: boolean;
  key: string;
  /** Kênh = brand × sàn (`channelKey`): luật "một host không hai ca cùng kênh trong một ngày". */
  channel: string;
}

export interface PlanInput {
  /** Ca của tháng + 7 ngày hai đầu (để bắt khoảng nghỉ / giờ tuần qua ranh tháng). */
  shifts: readonly RosterShift[];
  month: string;
  today: string;
  goal: PlanGoal;
  bounds: MonthBounds;
  /** Vòng cân lại để người dưới giờ tối thiểu nhận thêm ca từ người dư giờ. */
  guaranteeMin: boolean;
  rules: RosterRules;
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  fam: FamiliarityMap;
  perf: ReadonlyMap<string, HostPerf>;
  brandRules?: BrandRuleIndex;
  /** Chỉ lấp ca mở trong khoảng này (mốc chốt: ngày 1–15 hoặc cả tháng). Mặc định cả tháng. */
  range?: { from: string; to: string };
  /** Hệ số nhân giờ tối thiểu khi chỉ xếp một phần tháng (15/30 ⇒ 0,5). Mặc định 1. */
  minScale?: number;
  /** Chỉ báo khối lượng của lịch hiện có (ca + nháp), không xếp thêm ai. */
  reportOnly?: boolean;
  /** Báo khối lượng tính đến hết ngày này (mốc chốt); mặc định hết tháng. */
  loadTo?: string;
  /** Luật tự fill theo brief chị Trainer (tham số AI Training + trần giờ riêng). Thiếu = bộ xếp chạy như trước. */
  tuning?: PlanTuning;
}

export interface PlannedAssignment {
  shiftKey: string;
  slotId: string;
  role: RosterRole;
  talentId: string;
  /** "draft" = nháp có sẵn (giữ nguyên); "plan" = bộ xếp vừa gợi ý. */
  source: "draft" | "plan";
}
export type UnfilledReason = "no_registrant" | "all_blocked" | "no_host";
export interface UnfilledSpot {
  shiftKey: string;
  role: RosterRole;
  reason: UnfilledReason;
  detail: string;
}

export type LoadStatus = "below" | "ok" | "over" | "idle";
export interface PersonLoad {
  talentId: string;
  /** Vai ĐỨNG THẬT trong ca của dòng này (không phải vai chính hồ sơ): người vừa host vừa trợ có MỘT dòng cho mỗi vai, giờ tách riêng. */
  role: RosterRole;
  /** Giờ trong tháng đã có từ trước (ca đã lên lịch + nháp). */
  fixedHours: number;
  /** Trong `fixedHours`: phần của ca MỞ đã có người nháp (chưa công bố). */
  draftHours: number;
  /** Giờ do bộ xếp thêm. */
  plannedHours: number;
  hours: number;
  min: number;
  max: number;
  shifts: number;
  /** Số ca mở trong tháng người đó đã báo rảnh (khả năng nhận thêm). */
  registered: number;
  cost: number;
  costMissing: boolean;
  perf?: HostPerf;
  status: LoadStatus;
}

export interface MonthPlan {
  assignments: PlannedAssignment[];
  unfilled: UnfilledSpot[];
  load: PersonLoad[];
  totals: {
    openShifts: number;
    /** Chỗ (host + trợ) của ca mở cần người / đã có người sau khi xếp. */
    spots: number;
    filled: number;
    plannedCount: number;
    /** Chi phí người ước tính theo lịch của MỌI ca trong tháng (ca đã lên lịch + ca mở), giờ theo lịch. */
    cost: number;
    /** Riêng ca mở. */
    openCost: number;
    costMissing: number;
    /** Chỉ số Performance trung bình theo giờ host của mọi ca trong tháng (null = không ai có số liệu). */
    perfIndex: number | null;
    below: number;
    over: number;
    idle: number;
  };
}

const WEIGHTS: Record<PlanGoal, { perf: number; cost: number; fam: number; need: number; room: number }> = {
  performance: { perf: 0.45, cost: 0, fam: 0.2, need: 0.25, room: 0.1 },
  cost: { perf: 0, cost: 0.45, fam: 0.1, need: 0.3, room: 0.15 },
  balance: { perf: 0.25, cost: 0.2, fam: 0.15, need: 0.3, room: 0.1 }
};

const inMonth = (date: string, month: string) => date.slice(0, 7) === month;

class Roster {
  private byPerson = new Map<string, Interval[]>();
  private lateMin: number;
  /** Trần giờ của đợt đang xếp (người có trần riêng, chỉ khi xếp một phần tháng): tổng giờ trong tháng tới hết `to` không vượt `max`. */
  rangeCaps = new Map<string, { to: string; max: number }>();
  constructor(
    private rules: RosterRules,
    seed: Map<string, ReturnType<typeof personEntries> extends Map<string, infer E> ? E : never>
  ) {
    const [h, m] = rules.lateEndTime.split(":").map(Number);
    this.lateMin = h * 60 + m;
    for (const [id, list] of seed)
      this.byPerson.set(
        id,
        list.map((e) => ({ start: e.start, end: e.end, date: e.shift.date, hours: e.minutes / 60, role: e.role, late: this.isLate(e.end, e.shift.date), planned: false, key: e.shift.key, channel: e.shift.channelKey }))
      );
  }
  private dayStart(d: string) {
    return absRange({ date: d, startTime: "00:00", endTime: "00:01" })[0];
  }
  isLate(end: number, date: string) {
    return end - this.dayStart(date) >= this.lateMin;
  }
  list(id: string) {
    return this.byPerson.get(id) ?? [];
  }
  hoursInMonth(id: string, month: string) {
    return this.list(id).reduce((s, e) => s + (inMonth(e.date, month) ? e.hours : 0), 0);
  }
  /** Giờ trong tháng từ đầu tháng tới hết ngày `to`. */
  hoursThrough(id: string, month: string, to: string) {
    return this.list(id).reduce((s, e) => s + (inMonth(e.date, month) && e.date <= to ? e.hours : 0), 0);
  }
  /** Lý do KHÔNG xếp được (null = xếp được). Mọi luật ở đây là luật cứng của bộ xếp, chặt hơn DB (DB chỉ chặn trùng + quá giờ tuần). */
  blocked(id: string, shift: RosterShift, max: number, month: string, role?: RosterRole): string | null {
    const [a, b] = absRange(shift);
    const h = shiftHours(shift);
    const list = this.list(id);
    for (const e of list) if (e.start < b && e.end > a) return "trùng ca khác";
    // Chị Trainer 18/11: không xếp một host hai ca cùng brand × sàn trong một ngày (host khác brand/sàn cùng ngày vẫn được).
    if (role === "host") for (const e of list) if (e.role === "host" && e.date === shift.date && e.channel === shift.channelKey && e.key !== shift.key) return "đã có ca host cùng brand + sàn trong ngày";
    if (this.hoursInMonth(id, month) + (inMonth(shift.date, month) ? h : 0) > max) return "vượt giờ tối đa tháng";
    const rc = this.rangeCaps.get(id);
    if (rc && inMonth(shift.date, month) && shift.date <= rc.to && this.hoursThrough(id, month, rc.to) + h > rc.max + 1e-6) return "đủ trần giờ nửa đầu, chừa cho nửa sau";
    const ws = isoWeekStart(shift.date);
    const we = addDays(ws, 6);
    const week = list.filter((e) => e.date >= ws && e.date <= we).reduce((s, e) => s + e.hours, 0);
    if (week + h > this.rules.maxWeekHours) return "vượt giờ tối đa tuần";
    const day = list.filter((e) => e.date === shift.date).reduce((s, e) => s + e.hours, 0);
    if (day + h > this.rules.maxDayHours) return "vượt giờ tối đa ngày";
    const thisLate = this.isLate(b, shift.date);
    const rest = this.rules.minRestHours * 60;
    for (const e of list) {
      if (e.end <= a && e.late && a - e.end < rest) return "chưa đủ giờ nghỉ sau ca khuya";
      if (e.start >= b && thisLate && e.start - b < rest) return "ca sau quá sát ca khuya";
    }
    return null;
  }
  add(id: string, shift: RosterShift, role: RosterRole, planned: boolean) {
    const [a, b] = absRange(shift);
    const list = this.byPerson.get(id) ?? [];
    list.push({ start: a, end: b, date: shift.date, hours: shiftHours(shift), role, late: this.isLate(b, shift.date), planned, key: shift.key, channel: shift.channelKey });
    this.byPerson.set(id, list);
  }
  remove(id: string, key: string, role: RosterRole) {
    const list = this.byPerson.get(id);
    if (!list) return;
    const i = list.findIndex((e) => e.key === key && e.role === role);
    if (i >= 0) list.splice(i, 1);
  }
}

/** Giờ tối thiểu/tối đa của một người, có tính trần giờ riêng (nếu có): trần thay giờ tối đa mặc định của vai, vẫn bị luật giờ/tuần chặn. */
function boundsWithCap(t: Talent, base: MonthBounds, rules: Pick<RosterRules, "maxWeekHours">, month: string, cap: PersonCap | undefined): HourBounds {
  const b = personBounds(t, base, rules, month);
  if (!cap || !(cap.monthMax > 0) || cap.soft) return b;
  const max = Math.min(cap.monthMax, Math.round((rules.maxWeekHours * daysInMonth(month)) / 7));
  return { min: Math.min(b.min, max), max };
}

export function planMonth(input: PlanInput): MonthPlan {
  const { shifts, month, today, goal, rules, talents, history, fam, perf } = input;
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const minScale = input.minScale ?? 1;
  const P = input.tuning?.params;
  const caps = input.tuning?.personCaps ?? {};
  const bounds = new Map(
    talents.map((t) => {
      const b = boundsWithCap(t, input.bounds, rules, month, caps[t.id]);
      return [t.id, { min: b.min * minScale, max: b.max }] as const;
    })
  );
  const roster = new Roster(rules, personEntries(shifts));
  // Trần giờ theo đợt: xếp ngày 1–15 thì người có trần riêng chỉ được tới trần × tỷ lệ GIỜ CA của nửa đầu (+ dung sai), phần còn lại chừa cho nửa sau.
  const monthEnd = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
  if (input.range && input.range.to < monthEnd && !input.reportOnly) {
    const to = input.range.to;
    let all = 0;
    let upTo = 0;
    for (const s of shifts) {
      if (!inMonth(s.date, month)) continue;
      const h = shiftHours(s);
      all += h;
      if (s.date <= to) upTo += h;
    }
    const share = all > 0 ? upTo / all : 1;
    const tol = P?.rosterRangeTolerance ?? 0;
    for (const [id, cap] of Object.entries(caps)) {
      if (!(cap.monthMax > 0)) continue;
      const half = Number(to.slice(8, 10)) <= 15 && cap.firstHalfMax && cap.firstHalfMax > 0 ? cap.firstHalfMax : null;
      roster.rangeCaps.set(id, { to, max: half ?? cap.monthMax * share * (1 + tol) });
    }
  }

  // Pool đăng ký theo ca.
  const monthShifts = shifts.filter((s) => inMonth(s.date, month));
  const monthOpen = monthShifts.filter((s) => s.kind === "open");
  const inRange = (d: string) => !input.range || (d >= input.range.from && d <= input.range.to);
  const targets = input.reportOnly ? [] : monthOpen.filter((s) => s.date >= today && inRange(s.date));
  const loadTo = input.loadTo ?? `${month}-31`;
  const registeredIn = new Map<string, number>(); // talentId → số ca mở trong tháng đã báo rảnh
  for (const s of monthOpen) for (const t of s.registrants) registeredIn.set(t, (registeredIn.get(t) ?? 0) + 1);

  const rateCache = new Map<string, number>();
  const costOf = (id: string, role: RosterRole, shift: RosterShift) => plannedCost(talentById.get(id), history, role, shift.date, shiftHours(shift));
  // Giá vốn dự phòng cho người chưa có rate: trung vị chi phí/giờ của cùng vai trong pool.
  const fallbackPerHour = (role: RosterRole) => {
    const k = role;
    if (rateCache.has(k)) return rateCache.get(k)!;
    const v: number[] = [];
    for (const t of talents) {
      const c = plannedCost(t, history, role, `${month}-15`, 1);
      if (c.hourly && !c.missing) v.push(c.amount);
    }
    const m = median(v);
    rateCache.set(k, m);
    return m;
  };
  const costNum = (id: string, role: RosterRole, shift: RosterShift) => {
    const c = costOf(id, role, shift);
    return c.missing ? fallbackPerHour(role) * shiftHours(shift) : c.amount;
  };

  const assignments: PlannedAssignment[] = [];
  const unfilled: UnfilledSpot[] = [];
  const assigned = new Map<string, { host?: string; co_host?: string }>(); // shiftKey → người (cả nháp lẫn gợi ý)
  for (const s of shifts) assigned.set(s.key, { host: s.hostId, co_host: s.coHostId });
  for (const s of monthOpen) {
    if (s.hostId) assignments.push({ shiftKey: s.key, slotId: s.slotId!, role: "host", talentId: s.hostId, source: "draft" });
    if (s.coHostId) assignments.push({ shiftKey: s.key, slotId: s.slotId!, role: "co_host", talentId: s.coHostId, source: "draft" });
  }

  const eligible = (t: Talent, role: RosterRole, shift: RosterShift) => (role === "host" ? canHost(t, fam) || hostAllowedAt(input.brandRules, shift, t.id) : true);

  // Ca ít người đăng ký xếp trước (khó nhất trước), rồi theo ngày.
  const order = [...targets].sort((a, b) => a.registrants.length - b.registrants.length || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  const W = WEIGHTS[goal];
  // Làn host: cơ cấu giờ cần xếp (tỷ lệ giờ Campaign/cao điểm) và giờ cao điểm đã xếp của từng host trong lượt này.
  const laneOn = (P?.rosterLaneWeight ?? 0) > 0 && !!input.tuning?.lanes;
  let demandHi = 0;
  let demandAll = 0;
  if (laneOn) {
    for (const s of targets) {
      const h = shiftHours(s);
      demandAll += h;
      if (shiftTier(s, input.tuning) === "peak") demandHi += h;
    }
  }
  const demandShare = demandAll > 0 ? demandHi / demandAll : 0.5;
  const laneAcc = new Map<string, { hi: number; all: number }>();
  const regCounts = [...registeredIn.values()];
  const avgReg = regCounts.length > 0 ? regCounts.reduce((a, b) => a + b, 0) / regCounts.length : 0;

  for (const shift of order) {
    for (const role of ["host", "co_host"] as const) {
      const cur = assigned.get(shift.key)!;
      if (cur[role]) continue;
      if (role === "co_host" && shift.noAssistant) continue; // thẻ No Asst: ca chủ ý không trợ
      // Ca nháp chỉ có trợ mà chưa có host làm cả tuần không công bố được (publish_roster_week từ chối) ⇒ chưa xếp trợ khi chưa có host.
      if (role === "co_host" && !cur.host) {
        unfilled.push({ shiftKey: shift.key, role, reason: "no_host", detail: "chưa có host nên chưa xếp trợ (ca nháp không có host thì không công bố được)" });
        continue;
      }
      const other = role === "host" ? cur.co_host : cur.host;
      const pool = shift.registrants.filter((id) => id !== other && talentById.has(id) && eligible(talentById.get(id)!, role, shift));
      if (pool.length === 0) {
        unfilled.push({ shiftKey: shift.key, role, reason: "no_registrant", detail: shift.registrants.length === 0 ? "chưa ai đăng ký ca này" : role === "host" ? "người đăng ký chưa đủ điều kiện làm host" : "không có người đăng ký phù hợp" });
        continue;
      }
      const cands: { id: string; why: string | null; cost: number; load: number; b: HourBounds }[] = pool.map((id) => {
        const b = bounds.get(id)!;
        const violation = brandRuleViolation(input.brandRules, shift.brandId, id, role, shift.platform);
        return { id, why: violation ? violation.text : roster.blocked(id, shift, b.max, month, role), cost: costNum(id, role, shift), load: roster.hoursInMonth(id, month), b };
      });
      const ok = cands.filter((c) => !c.why);
      if (ok.length === 0) {
        unfilled.push({ shiftKey: shift.key, role, reason: "all_blocked", detail: `${pool.length} người đăng ký nhưng đều vướng: ${[...new Set(cands.map((c) => c.why))].slice(0, 2).join("; ")}` });
        continue;
      }
      // Trợ: người hồ sơ Assistant được ưu tiên tuyệt đối; host chỉ vào chỗ trợ khi không còn Assistant nào xếp được (đỡ ăn giờ của trợ, rẻ hơn).
      const assistants = role === "co_host" ? ok.filter((c) => talentById.get(c.id)!.role !== "Host") : [];
      if (assistants.length > 0) ok.splice(0, ok.length, ...assistants);
      const costs = ok.map((c) => c.cost);
      const lo = Math.min(...costs);
      const hi = Math.max(...costs);
      const tier = shiftTier(shift, input.tuning);
      const perfW = W.perf + (tier === "peak" ? P?.rosterPeakPerfAdd ?? 0 : 0);
      const costW = W.cost + (tier === "regular" ? P?.rosterRegularCostAdd ?? 0 : 0);
      // Trần cast theo sàn (Record, không rẽ nhánh theo tên sàn): Shopee = trần Shopee ở mọi ca; TikTok = trần Daily chỉ ở ca thường.
      const castCap = role === "host" && P ? { Shopee: P.rosterShopeeCastCap, TikTok: tier === "regular" ? P.rosterRegularCastCap : 0 }[shift.platform] : 0;
      const hrs = shiftHours(shift);
      const frac = inMonth(shift.date, month) ? Number(shift.date.slice(8, 10)) / daysInMonth(month) : 1;
      const night = role === "co_host" && roster.isLate(absRange(shift)[1], shift.date);
      const scored = ok.map((c) => {
        const t = talentById.get(c.id)!;
        const f = famOf(fam, c.id, shift.channelKey);
        const famN = role === "host" ? f.host + 0.5 * f.co : f.co + 0.5 * f.host;
        const fam01 = Math.log1p(famN) / Math.log1p(30);
        const p = role === "host" ? perf.get(c.id) : undefined;
        const perf01 = role === "host" ? Math.max(0, Math.min(1, ((p?.index ?? 1) - 0.85) / 0.3)) : 0.5;
        const cost01 = hi > lo ? 1 - (c.cost - lo) / (hi - lo) : 1;
        const need = c.b.min > 0 ? Math.max(0, (c.b.min - c.load) / c.b.min) : 0;
        const room = c.b.max > 0 ? Math.max(0, 1 - c.load / c.b.max) : 0;
        const mismatch = role === "co_host" && t.role === "Host" ? 0.15 : 0;
        const pref = input.brandRules?.preferred.has(`${shift.brandId}|${c.id}`) ? 0.1 : 0;
        let extra = 0;
        if (P) {
          // Ít đăng ký ⇒ ưu tiên lấp ca cho họ (so với mức trung bình của người đã đăng ký).
          const reg = registeredIn.get(c.id) ?? 0;
          if (avgReg > 0 && reg > 0) extra += P.rosterScarcityWeight * Math.max(0, Math.min(1, 1 - reg / avgReg));
          // Nhịp giờ: giờ đã xếp tới ngày của ca so với tiến độ (trần riêng, hoặc giờ tối thiểu cả tháng).
          const target = caps[c.id]?.monthMax ?? personBounds(t, input.bounds, rules, month).min;
          if (target > 0) {
            const upTo = roster.hoursThrough(c.id, month, shift.date);
            const ahead = upTo / Math.max(1, target * frac);
            extra -= P.rosterPaceWeight * Math.max(0, Math.min(1, ahead - 1));
          }
          if (laneOn && role === "host") {
            const lane = input.tuning!.lanes![c.id];
            if (lane) {
              const want = lane === "balanced" ? demandShare : LANE_HI_SHARE[lane];
              const a = laneAcc.get(c.id) ?? { hi: 0, all: 0 };
              const after = (a.hi + (tier === "peak" ? hrs : 0)) / (a.all + hrs);
              extra += P.rosterLaneWeight * (1 - Math.min(1, Math.abs(after - want)));
            }
          }
          if (castCap > 0 && c.cost / Math.max(hrs, 0.25) > castCap + 1) extra -= P.rosterCastOverPenalty;
          if (role === "co_host" && isMale(t.gender)) extra += (SPORT_BRAND_PATTERN.test(shift.brandName) ? P.rosterMaleAsstSport : 0) + (night ? P.rosterMaleAsstNight : 0);
        }
        return { c, score: perfW * perf01 + costW * cost01 + W.fam * fam01 + W.need * need + W.room * room - mismatch + pref + extra };
      });
      scored.sort((x, y) => y.score - x.score || x.c.cost - y.c.cost);
      const pick = scored[0].c;
      roster.add(pick.id, shift, role, true);
      if (laneOn && role === "host") {
        const a = laneAcc.get(pick.id) ?? { hi: 0, all: 0 };
        a.all += hrs;
        if (tier === "peak") a.hi += hrs;
        laneAcc.set(pick.id, a);
      }
      cur[role] = pick.id;
      assignments.push({ shiftKey: shift.key, slotId: shift.slotId!, role, talentId: pick.id, source: "plan" });
    }
  }

  if (input.guaranteeMin && !input.reportOnly) rebalance(input, roster, assignments, assigned, bounds, talentById);

  // ---- báo cáo khối lượng ----
  const planned = assignments.filter((a) => a.source === "plan");
  const shiftByKey = new Map(shifts.map((s) => [s.key, s]));
  // Mỗi (người, vai đứng thật) một dòng: người host brand này, trợ brand kia có giờ ở CẢ HAI bảng, mỗi bảng chỉ giờ của vai đó.
  // Tối thiểu chỉ áp cho vai chính hồ sơ (đảm bảo thu nhập); tối đa theo ngưỡng của chính vai đó. Số "đăng ký" chỉ gắn vào dòng vai chính.
  const load = new Map<string, PersonLoad>();
  const ensure = (id: string, role: RosterRole): PersonLoad | null => {
    const t = talentById.get(id);
    if (!t) return null;
    const key = `${id}|${role}`;
    let l = load.get(key);
    if (!l) {
      const main = primaryRole(t) === role;
      const own = boundsWithCap(t, { host: input.bounds.host, co_host: input.bounds.co_host }, rules, month, caps[id]);
      const b = main ? { min: own.min * minScale, max: own.max } : { min: 0, max: Math.min(input.bounds[role].max, Math.round((rules.maxWeekHours * daysInMonth(month)) / 7)) };
      l = { talentId: id, role, fixedHours: 0, draftHours: 0, plannedHours: 0, hours: 0, min: b.min, max: b.max, shifts: 0, registered: main ? registeredIn.get(id) ?? 0 : 0, cost: 0, costMissing: false, perf: role === "host" ? perf.get(id) : undefined, status: "ok" };
      load.set(key, l);
    }
    return l;
  };
  // Giờ cố định = mọi ca không phải gợi ý của bộ xếp (ca đã lên lịch + nháp) trong tháng.
  const plannedKeys = new Set(planned.map((a) => `${a.shiftKey}|${a.role}|${a.talentId}`));
  for (const [id, list] of personEntries(shifts)) {
    for (const e of list) {
      if (!inMonth(e.shift.date, month) || e.shift.date > loadTo || plannedKeys.has(`${e.shift.key}|${e.role}|${id}`)) continue;
      const l = ensure(id, e.role);
      if (!l) continue;
      const h = e.minutes / 60;
      l.fixedHours += h;
      if (e.shift.kind === "open") l.draftHours += h;
      l.shifts += 1;
      const c = costOf(id, e.role, e.shift);
      l.cost += c.missing ? 0 : c.amount * (c.hourly ? h / shiftHours(e.shift) : 1);
      l.costMissing = l.costMissing || c.missing;
    }
  }
  for (const a of planned) {
    const l = ensure(a.talentId, a.role);
    const s = shiftByKey.get(a.shiftKey);
    if (!l || !s || s.date > loadTo) continue;
    const h = shiftHours(s);
    l.plannedHours += h;
    l.shifts += 1;
    const c = costOf(a.talentId, a.role, s);
    l.cost += c.missing ? 0 : c.amount;
    l.costMissing = l.costMissing || c.missing;
  }
  // Người đã đăng ký mà chưa có giờ nào cũng phải hiện (ở vai chính, đang dưới tối thiểu).
  for (const t of talents) if ((t.role === "Host" || t.role === "Assistant") && (registeredIn.get(t.id) ?? 0) > 0) ensure(t.id, primaryRole(t));
  for (const l of load.values()) {
    l.hours = l.fixedHours + l.plannedHours;
    l.status = l.hours > l.max + 1e-6 ? "over" : l.hours < l.min - 1e-6 ? (l.registered > 0 || l.hours > 0 ? "below" : "idle") : "ok";
  }

  const scopeOpen = monthOpen.filter((s) => inRange(s.date));
  const spots = scopeOpen.length * 2;
  const filled = scopeOpen.reduce((n, s) => n + Number(!!assigned.get(s.key)?.host) + Number(!!assigned.get(s.key)?.co_host), 0);
  let perfSum = 0;
  let perfHours = 0;
  let cost = 0;
  let openCost = 0;
  let costMissing = 0;
  for (const s of monthShifts) {
    if (!inRange(s.date)) continue;
    const a = assigned.get(s.key)!;
    for (const role of ["host", "co_host"] as const) {
      const id = a[role];
      if (!id) continue;
      const c = costOf(id, role, s);
      cost += c.missing ? 0 : c.amount;
      if (s.kind === "open") openCost += c.missing ? 0 : c.amount;
      if (c.missing) costMissing += 1;
    }
    const hp = a.host ? perf.get(a.host) : undefined;
    if (hp) {
      perfSum += hp.index * shiftHours(s);
      perfHours += shiftHours(s);
    }
  }
  const loads = [...load.values()];
  return {
    assignments,
    unfilled,
    load: loads.sort((a, b) => Number(b.status === "below") - Number(a.status === "below") || Number(b.status === "over") - Number(a.status === "over") || b.hours - a.hours),
    totals: {
      openShifts: scopeOpen.length,
      spots,
      filled,
      plannedCount: planned.length,
      cost,
      openCost,
      costMissing,
      perfIndex: perfHours > 0 ? perfSum / perfHours : null,
      below: loads.filter((l) => l.status === "below").length,
      over: loads.filter((l) => l.status === "over").length,
      idle: loads.filter((l) => l.status === "idle").length
    }
  };
}

/**
 * Vòng cân lại: người dưới giờ tối thiểu (đã đăng ký) nhận ca do bộ xếp gợi ý cho người đang nhiều giờ hơn, miễn người nhường vẫn
 * giữ ≥ giờ tối thiểu của mình, người nhận không vi phạm luật cứng, và chênh giờ thật sự thu hẹp. Chỉ động vào gợi ý của bộ xếp.
 */
function rebalance(
  input: PlanInput,
  roster: Roster,
  assignments: PlannedAssignment[],
  assigned: Map<string, { host?: string; co_host?: string }>,
  bounds: Map<string, HourBounds>,
  talentById: Map<string, Talent>
) {
  const { shifts, month, fam } = input;
  const shiftByKey = new Map(shifts.map((s) => [s.key, s]));
  for (let guard = 0; guard < 400; guard++) {
    const needy = [...talentById.values()]
      .filter((t) => (t.role === "Host" || t.role === "Assistant") && shifts.some((s) => s.kind === "open" && s.registrants.includes(t.id) && inMonth(s.date, month)))
      .map((t) => ({ t, load: roster.hoursInMonth(t.id, month), b: bounds.get(t.id)! }))
      .filter((x) => x.load < x.b.min - 1e-6)
      .sort((a, b) => (b.b.min - b.load) / b.b.min - (a.b.min - a.load) / a.b.min);
    let moved = false;
    for (const n of needy) {
      for (const a of assignments) {
        if (a.source !== "plan") continue;
        const s = shiftByKey.get(a.shiftKey)!;
        if (!s.registrants.includes(n.t.id) || a.talentId === n.t.id) continue;
        const cur = assigned.get(a.shiftKey)!;
        const otherRole = a.role === "host" ? cur.co_host : cur.host;
        if (otherRole === n.t.id) continue;
        if (a.role === "host" && !canHost(n.t, fam) && !hostAllowedAt(input.brandRules, s, n.t.id)) continue;
        const h = shiftHours(s);
        const holderLoad = roster.hoursInMonth(a.talentId, month);
        const holderMin = bounds.get(a.talentId)?.min ?? 0;
        if (holderLoad - h < holderMin - 1e-6 || holderLoad <= n.load + h) continue;
        if (brandRuleViolation(input.brandRules, s.brandId, n.t.id, a.role, s.platform)) continue;
        roster.remove(a.talentId, a.shiftKey, a.role);
        if (roster.blocked(n.t.id, s, n.b.max, month, a.role)) {
          roster.add(a.talentId, s, a.role, true);
          continue;
        }
        roster.add(n.t.id, s, a.role, true);
        cur[a.role] = n.t.id;
        a.talentId = n.t.id;
        moved = true;
        break;
      }
      if (moved) break;
    }
    if (!moved) return;
  }
}

/** Phần nháp do bộ xếp tự fill, theo ca mở: so với nháp hiện tại để biết ô nào Trainer đã sửa tay (khác giá trị đã fill ⇒ giữ). */
export type AutoFill = Record<string, { hostId?: string; coHostId?: string }>;

/** Gỡ các ô nháp còn nguyên như bộ xếp đã fill (trong `range`) để xếp lại; ô Trainer đã tự đổi / tự xếp thì giữ cố định. */
export function releaseAutoFilled(shifts: readonly RosterShift[], auto: AutoFill, range?: { from: string; to: string }): RosterShift[] {
  return shifts.map((s) => {
    const a = s.kind === "open" && s.slotId ? auto[s.slotId] : undefined;
    if (!a || (range && (s.date < range.from || s.date > range.to))) return s as RosterShift;
    const hostId = a.hostId && s.hostId === a.hostId ? undefined : s.hostId;
    const coHostId = a.coHostId && s.coHostId === a.coHostId ? undefined : s.coHostId;
    return { ...s, hostId, coHostId, drafted: !!(hostId || coHostId) };
  });
}

/**
 * Gỡ khỏi NHÁP (ca mở, trong `range`) người đang đứng SAI VAI theo luật vai-theo-kênh (cài tay hoặc tự suy từ lịch sử), kể cả ô do Trainer xếp tay
 * hoặc nháp cũ chưa có dấu "tự fill" — để bấm Tự fill là xếp lại được. Ca đã lên lịch thật không đụng. Trả thêm danh sách ô bị gỡ.
 */
export function releaseRoleViolations(
  shifts: readonly RosterShift[],
  brandRules: BrandRuleIndex | undefined,
  range?: { from: string; to: string }
): { shifts: RosterShift[]; released: { slotId: string; role: RosterRole; talentId: string }[] } {
  const released: { slotId: string; role: RosterRole; talentId: string }[] = [];
  if (!brandRules) return { shifts: shifts as RosterShift[], released };
  const out = shifts.map((s) => {
    if (s.kind !== "open" || !s.slotId || !s.drafted || (range && (s.date < range.from || s.date > range.to))) return s as RosterShift;
    let { hostId, coHostId } = s;
    if (hostId && brandRuleViolation(brandRules, s.brandId, hostId, "host", s.platform)?.code === "brand_role") {
      released.push({ slotId: s.slotId, role: "host", talentId: hostId });
      hostId = undefined;
    }
    if (coHostId && brandRuleViolation(brandRules, s.brandId, coHostId, "co_host", s.platform)?.code === "brand_role") {
      released.push({ slotId: s.slotId, role: "co_host", talentId: coHostId });
      coHostId = undefined;
    }
    return hostId === s.hostId && coHostId === s.coHostId ? s : { ...s, hostId, coHostId, drafted: !!(hostId || coHostId) };
  });
  return { shifts: out, released };
}

/** Các dòng nháp cần ghi + bản ghi "đã tự fill" mới sau khi xếp. Ô đã từng tự fill mà lần này không ai đủ điều kiện ⇒ dòng rỗng (xoá nháp). */
export function applyPlanRows(
  plan: MonthPlan,
  freed: readonly RosterShift[],
  auto: AutoFill,
  range?: { from: string; to: string }
): { rows: { slotId: string; hostId?: string; coHostId?: string; noAssistant?: boolean }[]; nextAuto: AutoFill } {
  const byKey = new Map(freed.map((s) => [s.key, s]));
  const rows = new Map<string, { slotId: string; hostId?: string; coHostId?: string; noAssistant?: boolean }>();
  const nextAuto: AutoFill = {};
  const inR = (d: string) => !range || (d >= range.from && d <= range.to);
  for (const [slotId, v] of Object.entries(auto)) {
    const s = byKey.get(`o:${slotId}`);
    if (s && inR(s.date)) rows.set(slotId, { slotId, hostId: s.hostId, coHostId: s.coHostId, noAssistant: s.noAssistant });
    else nextAuto[slotId] = v; // ngoài phạm vi lần này: giữ nguyên
  }
  for (const a of plan.assignments) {
    if (a.source !== "plan") continue;
    const s = byKey.get(a.shiftKey);
    if (!s) continue;
    const r = rows.get(a.slotId) ?? { slotId: a.slotId, hostId: s.hostId, coHostId: s.coHostId, noAssistant: s.noAssistant };
    const n = nextAuto[a.slotId] ?? {};
    if (a.role === "host") {
      r.hostId = a.talentId;
      n.hostId = a.talentId;
    } else {
      r.coHostId = a.talentId;
      r.noAssistant = undefined;
      n.coHostId = a.talentId;
    }
    rows.set(a.slotId, r);
    nextAuto[a.slotId] = n;
  }
  return { rows: [...rows.values()], nextAuto };
}

/** Gom `PlannedAssignment[]` (chỉ source = "plan") thành nháp theo ca mở để lưu một lượt. */
export function draftsOfPlan(plan: MonthPlan, shifts: readonly RosterShift[]): { slotId: string; hostId?: string; coHostId?: string }[] {
  const byKey = new Map(shifts.map((s) => [s.key, s]));
  const out = new Map<string, { slotId: string; hostId?: string; coHostId?: string }>();
  for (const a of plan.assignments) {
    if (a.source !== "plan") continue;
    const s = byKey.get(a.shiftKey);
    if (!s) continue;
    const d = out.get(a.slotId) ?? { slotId: a.slotId, hostId: s.hostId, coHostId: s.coHostId };
    if (a.role === "host") d.hostId = a.talentId;
    else d.coHostId = a.talentId;
    out.set(a.slotId, d);
  }
  return [...out.values()];
}
