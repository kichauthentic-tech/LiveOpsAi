import type { LiveSession } from "../../types";
import { addDays, eachDay } from "../dateUtils";
import type { CampDayBucket } from "../campaignDays";
import { dataSourceTier } from "../dataSource";
import { profileOf } from "../platforms/profiles";
import type { ReportPlatform } from "../reportPlatform";
import { lastDataDate } from "./ceoBrief";
import { isCountable, sessionHours } from "./hostPerformance";
import type { ChannelCard } from "./channelCard";
import { planTargetOf } from "./targetAllocation";
import { fmtDateVn, fmtVndShort } from "../format";
import { CAMP_DAY_BUCKET_LABEL } from "../campaignDays";

// Báo Cáo Tuần (agency) — MỘT hàm trả lời cho từng kênh (brand × sàn) các câu sếp hỏi:
//   1. Target tới nay được bao nhiêu?            → `range.targetToDate / actual / pct`, `month.*` (luỹ kế từ đầu tháng)
//   2. Target/actual từng ngày, ngày camp?       → `days[]` (bucket D-Day / Mid-Month / Pay Day / Daily)
//   3. Tổng từng đợt?                            → `events[]` (mỗi dải camp liền nhau một dòng) + `daily`
//   4. Ca đáng lưu ý, gãy ở chỉ số nào?          → `weak[]` + `breaks` của từng ca, `funnel[]` của cả kỳ
//   5. Ca tốt vì sao?                            → `strong[]` + `wins` của từng ca
//
// KHÔNG tự tính target/thực đạt lần thứ hai: nguồn là `card.rr` (planRunRate — luật run-rate duy nhất của app, 28/09:
// target = ca của Kế Hoạch Tháng đã chốt, ca huỷ giữ target, ca mở thêm ngoài plan target 0). Chỉ khi kênh chưa chốt kế hoạch
// (`rr` null) mới rơi về Σ target của ca và ghi rõ `targetSource: "sessions"`.
// Hàm thuần: không đọc DB, không đọc đồng hồ (nhận `today`) ⇒ test được.

/** Ngưỡng chấm — đặt MỘT chỗ để nhãn, màu và test cùng đọc. */
export const WEEKLY_THRESHOLDS = {
  /** Thực đạt ÷ target tới nay: ≥ 1 đạt, ≥ NEAR sát, dưới đó hụt. */
  near: 0.8,
  /** Ca có target: dưới mức này (ví dụ 0,6 = đạt chưa tới 60%) là ca đáng lưu ý. */
  weakPct: 0.6,
  /** Ca không có target (ca mở thêm): GMV/giờ so nền kênh. */
  weakRate: 0.5,
  strongRate: 1.3,
  /** Chỉ số phễu của ca lệch so nền kênh: dưới `breakRatio` = gãy, trên `winRatio` = tốt. */
  breakRatio: 0.8,
  winRatio: 1.2,
  /** Nền kênh: số ngày gần nhất tới hết kỳ, và số ca tối thiểu để dám so. */
  baselineDays: 28,
  minBaselineSessions: 5,
  minFunnelSessions: 3,
  topN: 4
} as const;

export type PaceLevel = "on" | "near" | "behind" | "none";

export function paceLevel(pct: number | null): PaceLevel {
  if (pct == null) return "none";
  if (pct >= 1) return "on";
  if (pct >= WEEKLY_THRESHOLDS.near) return "near";
  return "behind";
}

/** Chỉ số dùng để chỉ "gãy ở đâu" — phễu của từng sàn, theo thứ tự từ lưu lượng tới giỏ hàng. */
export const FUNNEL_KEYS: Record<ReportPlatform, string[]> = {
  TikTok: ["viewsPerHour", "err", "liveCtr", "ctor", "aov"],
  Shopee: ["viewersPerHour", "abs"]
};

export type DayState = "done" | "waiting" | "future";

export interface WeeklyDay {
  date: string;
  /** 0 = T2 … 6 = CN */
  dow: number;
  bucket: CampDayBucket;
  target: number;
  actual: number;
  /** done = đã có số; waiting = ngày đã qua/hôm nay nhưng chưa có số; future = chưa tới. */
  state: DayState;
  sessions: number;
  pct: number | null;
}

export interface WeeklyEvent {
  bucket: Exclude<CampDayBucket, "daily">;
  from: string;
  to: string;
  target: number;
  targetToDate: number;
  actual: number;
  pct: number | null;
  status: "done" | "live" | "next";
  /** Đợt có ngày nằm trong kỳ đang xem. */
  inRange: boolean;
}

export interface CumPoint {
  date: string;
  cumTarget: number;
  /** null sau ngày cuối có số — đường thực đạt dừng, không kéo phẳng như "bán 0". */
  cumActual: number | null;
  bucket: CampDayBucket;
}

export interface MetricNote {
  key: string;
  label: string;
  value: number | null;
  base: number | null;
  /** value ÷ base */
  ratio: number;
  text: string;
}

export interface SessionNote {
  session: LiveSession;
  target: number;
  actual: number;
  pct: number | null;
  hours: number;
  gmvPerHour: number | null;
  /** GMV/giờ ÷ nền kênh */
  rateRatio: number | null;
  bucket: CampDayBucket;
  /** Chỉ số phễu thấp hơn nền kênh — nguyên nhân gãy, nặng nhất trước. */
  breaks: MetricNote[];
  /** Chỉ số phễu cao hơn nền kênh — lý do tốt, mạnh nhất trước. */
  wins: MetricNote[];
  tier: ReturnType<typeof dataSourceTier>;
}

export interface MissingNote {
  kind: "no_data" | "cancelled";
  date: string;
  startTime: string;
  endTime: string;
  target: number;
  hostName: string;
}

export interface FunnelRow {
  key: string;
  label: string;
  cur: number | null;
  base: number | null;
  /** cur ÷ base − 1 */
  delta: number | null;
  goodWhenUp: boolean | null;
}

export interface WeeklyChannel {
  key: string;
  brandId: string;
  brandName: string;
  brandLogo?: string;
  platform: ReportPlatform;
  name: string;
  month: string;
  from: string;
  to: string;
  today: string;
  /** Ngày cuối có số của tháng; target "tới nay" cắt ở đây (cùng luật planRunRate). */
  through: string | null;
  targetSource: "plan" | "sessions" | "none";
  range: {
    target: number;
    targetToDate: number;
    actual: number;
    pct: number | null;
    gap: number;
    hours: number;
    gmvPerHour: number | null;
    sessions: number;
    cancelled: number;
    waiting: number;
    /** GMV kỳ liền trước cùng độ dài; null = kỳ trước không có ca có số. */
    prevActual: number | null;
    prevDelta: number | null;
  };
  monthTotal: {
    target: number;
    targetToDate: number;
    actual: number;
    pct: number | null;
    keepPace: number | null;
    remainingDays: number;
    needPerRemainingDay: number | null;
  };
  level: PaceLevel;
  days: WeeklyDay[];
  cum: CumPoint[];
  events: WeeklyEvent[];
  daily: { target: number; targetToDate: number; actual: number; pct: number | null };
  funnel: FunnelRow[];
  weak: SessionNote[];
  strong: SessionNote[];
  missing: MissingNote[];
  /** Số ca có số tự khai chưa đối soát/chưa có file — số này còn lệch được. */
  manualCount: number;
  baselineSessions: number;
}

const dowOf = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

/** Hai đầu của kỳ liền trước, cùng độ dài. */
export function prevRange(from: string, to: string): { from: string; to: string } {
  const n = eachDay(from, to).length;
  return { from: addDays(from, -n), to: addDays(from, -1) };
}

const sumActual = (list: LiveSession[]) => list.reduce((a, s) => a + (s.actualGmv ?? 0), 0);

/**
 * Dựng báo cáo một kênh. `sessions` = ca của ĐÚNG kênh (đã bỏ ca `excludedFromReports`, mọi tháng — nền kênh cần 28 ngày lùi).
 * `from..to` nằm trong `card.month` (UI cắt tuần theo tháng).
 */
export function buildWeeklyChannel(x: { card: ChannelCard; sessions: LiveSession[]; from: string; to: string; today: string }): WeeklyChannel {
  const { card, sessions, from, to, today } = x;
  const th = WEEKLY_THRESHOLDS;
  const platform = card.platform;
  const metrics = profileOf(platform).metrics;
  const rr = card.rr;
  const month = card.month;
  const mStart = `${month}-01`;
  const mEnd = monthLast(month);
  const bucketOf = card.bucketOf;

  const monthSessions = sessions.filter((s) => s.date >= mStart && s.date <= mEnd);
  const through = rr ? rr.through : lastDataDate(monthSessions, today);
  const live = (s: LiveSession) => s.status !== "Cancelled";

  // ---- target / thực đạt theo ngày ----
  const sessTargetByDate = new Map<string, number>();
  for (const s of monthSessions) if (live(s)) sessTargetByDate.set(s.date, (sessTargetByDate.get(s.date) ?? 0) + planTargetOf(s));
  const sessActualByDate = new Map<string, number>();
  for (const s of monthSessions) if (isCountable(s) && s.date <= today) sessActualByDate.set(s.date, (sessActualByDate.get(s.date) ?? 0) + (s.actualGmv ?? 0));
  const targetOn = (d: string) => (rr ? rr.targetByDate.get(d) ?? 0 : sessTargetByDate.get(d) ?? 0);
  const actualOn = (d: string) => (rr ? rr.actualByDate.get(d) ?? 0 : sessActualByDate.get(d) ?? 0);
  const monthTargetSum = eachDay(mStart, mEnd).reduce((a, d) => a + targetOn(d), 0);
  const targetSource: WeeklyChannel["targetSource"] = rr ? "plan" : monthTargetSum > 0 ? "sessions" : "none";
  const upTo = (d: string) => through != null && d <= through;

  const sessionsOnDate = new Map<string, number>();
  for (const s of monthSessions) if (live(s)) sessionsOnDate.set(s.date, (sessionsOnDate.get(s.date) ?? 0) + 1);

  const dayRow = (d: string): WeeklyDay => {
    const target = targetOn(d);
    const actual = upTo(d) ? actualOn(d) : 0;
    const state: DayState = d > today ? "future" : upTo(d) ? "done" : "waiting";
    return { date: d, dow: dowOf(d), bucket: bucketOf(d), target, actual, state, sessions: sessionsOnDate.get(d) ?? 0, pct: state === "done" ? ratio(actual, target) : null };
  };
  const days = eachDay(from, to).map(dayRow);

  // ---- luỹ kế cả tháng ----
  const cum: CumPoint[] = [];
  let cT = 0, cA = 0;
  for (const d of eachDay(mStart, mEnd)) {
    cT += targetOn(d);
    if (upTo(d)) cA += actualOn(d);
    cum.push({ date: d, cumTarget: cT, cumActual: upTo(d) ? cA : null, bucket: bucketOf(d) });
  }

  // ---- đợt (dải camp liền nhau) ----
  const events: WeeklyEvent[] = [];
  let open: { bucket: Exclude<CampDayBucket, "daily">; days: string[] } | null = null;
  const flush = () => {
    if (!open) return;
    const ds = open.days;
    const target = ds.reduce((a, d) => a + targetOn(d), 0);
    const targetToDate = ds.filter(upTo).reduce((a, d) => a + targetOn(d), 0);
    const actual = ds.filter(upTo).reduce((a, d) => a + actualOn(d), 0);
    const last = ds[ds.length - 1];
    const status: WeeklyEvent["status"] = through && last <= through ? "done" : !through || ds[0] > through ? "next" : "live";
    events.push({ bucket: open.bucket, from: ds[0], to: last, target, targetToDate, actual, pct: ratio(actual, targetToDate), status, inRange: ds.some((d) => d >= from && d <= to) });
    open = null;
  };
  for (const d of eachDay(mStart, mEnd)) {
    const b = bucketOf(d);
    if (b === "daily") { flush(); continue; }
    if (open && open.bucket !== b) flush();
    if (!open) open = { bucket: b, days: [] };
    open.days.push(d);
  }
  flush();
  const dailyDays = eachDay(mStart, mEnd).filter((d) => bucketOf(d) === "daily");
  const daily = {
    target: dailyDays.reduce((a, d) => a + targetOn(d), 0),
    targetToDate: dailyDays.filter(upTo).reduce((a, d) => a + targetOn(d), 0),
    actual: dailyDays.filter(upTo).reduce((a, d) => a + actualOn(d), 0),
    pct: null as number | null
  };
  daily.pct = ratio(daily.actual, daily.targetToDate);

  // ---- tổng kỳ ----
  const rangeSessions = monthSessions.filter((s) => s.date >= from && s.date <= to && live(s));
  const rangeCountable = rangeSessions.filter((s) => isCountable(s) && s.date <= today);
  const rTargetToDate = days.filter((d) => upTo(d.date)).reduce((a, d) => a + d.target, 0);
  const rActual = days.reduce((a, d) => a + d.actual, 0);
  const rHours = rangeCountable.reduce((a, s) => a + sessionHours(s), 0);
  const prev = prevRange(from, to);
  const prevCountable = sessions.filter((s) => s.date >= prev.from && s.date <= prev.to && isCountable(s));
  const prevActual = prevCountable.length > 0 ? sumActual(prevCountable) : null;
  const waiting = rr ? rr.slots.filter((t) => t.state === "no_data" && t.planSlot.date >= from && t.planSlot.date <= to).length : 0;
  const cancelledInRange = rr
    ? rr.slots.filter((t) => t.state === "cancelled" && t.planSlot.date >= from && t.planSlot.date <= to).length
    : monthSessions.filter((s) => s.status === "Cancelled" && s.date >= from && s.date <= to).length;

  // ---- nền kênh + phễu ----
  const baseTo = to < today ? to : today; // kỳ chưa hết (cả tháng) thì nền kết thúc ở hôm nay, không đếm ngày tương lai
  const baseFrom = addDays(baseTo, -(th.baselineDays - 1));
  const baseSessions = sessions.filter((s) => s.date >= baseFrom && s.date <= baseTo && isCountable(s));
  const baseM = baseSessions.length >= th.minBaselineSessions ? metrics.ofSessions(baseSessions, sessionHours) : null;
  const defOf = (key: string) => metrics.defs.find((d) => d.key === key);
  const funnelKeys = FUNNEL_KEYS[platform];

  const noteOf = (key: string, sessionM: ReturnType<typeof metrics.ofSessions>): MetricNote | null => {
    const def = defOf(key);
    if (!def || !baseM) return null;
    const v = metrics.value(sessionM, key);
    const b = metrics.value(baseM, key);
    if (v == null || b == null || !(b > 0)) return null;
    const r = v / b;
    return { key, label: def.label, value: v, base: b, ratio: r, text: `${def.label} ${metrics.fmt(def, v)} (nền ${metrics.fmt(def, b)}, ${r >= 1 ? "+" : "−"}${Math.round(Math.abs(r - 1) * 100)}%)` };
  };

  // Phễu cả kỳ: kỳ này so với 28 ngày liền trước kỳ (không lẫn chính kỳ này vào nền).
  const preFrom = addDays(from, -th.baselineDays);
  const preSessions = sessions.filter((s) => s.date >= preFrom && s.date < from && isCountable(s));
  const curM = rangeCountable.length >= th.minFunnelSessions ? metrics.ofSessions(rangeCountable, sessionHours) : null;
  const preM = preSessions.length >= th.minFunnelSessions ? metrics.ofSessions(preSessions, sessionHours) : null;
  const funnel: FunnelRow[] = ["gmvPerHour", ...funnelKeys].flatMap((key) => {
    const def = defOf(key);
    if (!def || !curM) return [];
    const cur = metrics.value(curM, key);
    const base = preM ? metrics.value(preM, key) : null;
    return [{ key, label: def.label, cur, base, delta: cur != null && base != null && base > 0 ? cur / base - 1 : null, goodWhenUp: def.goodWhenUp }];
  });

  // ---- từng ca ----
  const slotBySession = new Map<string, { target: number; state: string }>();
  if (rr) for (const t of rr.slots) if (t.session) slotBySession.set(t.session.id, { target: t.target, state: t.state });
  const baseRate = baseM ? metrics.value(baseM, "gmvPerHour") : null;

  const notes: SessionNote[] = rangeCountable.map((s) => {
    const own = slotBySession.get(s.id);
    const target = rr ? own?.target ?? 0 : planTargetOf(s);
    const actual = s.actualGmv ?? 0;
    const hours = sessionHours(s);
    const sm = metrics.ofSessions([s], sessionHours);
    const rate = hours > 0 ? actual / hours : null;
    const all = funnelKeys.map((k) => noteOf(k, sm)).filter((n): n is MetricNote => n != null);
    return {
      session: s, target, actual, pct: target > 0 ? actual / target : null, hours, gmvPerHour: rate,
      rateRatio: rate != null && baseRate != null && baseRate > 0 ? rate / baseRate : null,
      bucket: bucketOf(s.date),
      breaks: all.filter((n) => goodDirection(metrics.defs, n.key) && n.ratio < th.breakRatio).sort((a, b) => a.ratio - b.ratio),
      wins: all.filter((n) => goodDirection(metrics.defs, n.key) && n.ratio > th.winRatio).sort((a, b) => b.ratio - a.ratio),
      tier: dataSourceTier(s)
    };
  });
  const isWeak = (n: SessionNote) => (n.pct != null ? n.pct < th.weakPct : n.rateRatio != null && n.rateRatio < th.weakRate);
  const isStrong = (n: SessionNote) => (n.pct != null ? n.pct >= 1 : n.rateRatio != null && n.rateRatio >= th.strongRate);
  // Nặng nhất trước: ca có target xếp theo số tiền hụt/vượt (to nhất mới đáng nói với sếp); ca không target theo tỷ lệ GMV/giờ.
  const weak = notes.filter(isWeak).sort((a, b) => (b.target - b.actual) - (a.target - a.actual) || (a.rateRatio ?? 1) - (b.rateRatio ?? 1)).slice(0, th.topN);
  const strong = notes.filter(isStrong).sort((a, b) => (b.actual - b.target) - (a.actual - a.target) || (b.rateRatio ?? 0) - (a.rateRatio ?? 0)).slice(0, th.topN);

  const missing: MissingNote[] = rr
    ? rr.slots
        .filter((t) => (t.state === "no_data" || t.state === "cancelled") && t.planSlot.date >= from && t.planSlot.date <= to && t.target > 0)
        .map((t) => ({ kind: t.state as "no_data" | "cancelled", date: t.planSlot.date, startTime: t.planSlot.startTime, endTime: t.planSlot.endTime, target: t.target, hostName: t.session?.hostName ?? "" }))
        .sort((a, b) => b.target - a.target)
    : [];

  return {
    key: card.key, brandId: card.brandId, brandName: card.brandName, brandLogo: card.brandLogo, platform, name: card.name, month, from, to, today, through, targetSource,
    range: {
      target: days.reduce((a, d) => a + d.target, 0), targetToDate: rTargetToDate, actual: rActual, pct: ratio(rActual, rTargetToDate), gap: rActual - rTargetToDate,
      hours: rHours, gmvPerHour: rHours > 0 ? rActual / rHours : null, sessions: rangeCountable.length, cancelled: cancelledInRange, waiting,
      prevActual, prevDelta: prevActual != null && prevActual > 0 ? rActual / prevActual - 1 : null
    },
    monthTotal: rr
      ? { target: rr.total.target, targetToDate: rr.total.targetToDate, actual: rr.total.actual, pct: rr.total.runRate, keepPace: rr.total.keepPace, remainingDays: rr.total.remainingDays, needPerRemainingDay: rr.total.needPerRemainingDay }
      : { target: monthTargetSum, targetToDate: cum.filter((c) => upTo(c.date)).length ? cum.filter((c) => upTo(c.date)).slice(-1)[0].cumTarget : 0, actual: cA, pct: null, keepPace: null, remainingDays: 0, needPerRemainingDay: null },
    level: paceLevel(ratio(rActual, rTargetToDate)),
    days, cum, events, daily, funnel, weak, strong, missing,
    manualCount: rangeCountable.filter((s) => dataSourceTier(s) === "manual").length,
    baselineSessions: baseSessions.length
  };
}

/** Chỉ số tăng là tốt (bỏ chỉ số trung tính — AOV/UPT thay đổi theo quà tặng không phải "gãy"). */
function goodDirection(defs: { key: string; goodWhenUp: boolean | null }[], key: string): boolean {
  return defs.find((d) => d.key === key)?.goodWhenUp === true;
}

function monthLast(month: string): string {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  return `${month}-${`${new Date(Date.UTC(y, m, 0)).getUTCDate()}`.padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Tổng hợp nhiều kênh CÙNG SÀN (hai sàn không cộng hiệu suất — gọi từng sàn một)
// ---------------------------------------------------------------------------

export interface PlatformRollup {
  target: number;
  targetToDate: number;
  actual: number;
  pct: number | null;
  channels: number;
  on: number;
  near: number;
  behind: number;
  none: number;
}

export function rollupChannels(list: WeeklyChannel[]): PlatformRollup {
  const targetToDate = list.reduce((a, c) => a + c.range.targetToDate, 0);
  const actual = list.reduce((a, c) => a + c.range.actual, 0);
  return {
    target: list.reduce((a, c) => a + c.range.target, 0),
    targetToDate,
    actual,
    pct: ratio(actual, targetToDate),
    channels: list.length,
    on: list.filter((c) => c.level === "on").length,
    near: list.filter((c) => c.level === "near").length,
    behind: list.filter((c) => c.level === "behind").length,
    none: list.filter((c) => c.level === "none").length
  };
}

// ---------------------------------------------------------------------------
// Kỳ xem: tuần ISO cắt theo tháng, hoặc "từ đầu tháng tới nay"
// ---------------------------------------------------------------------------

export type WeeklyMode = "week" | "mtd";

/** Khoảng [from, to] của kỳ chứa `anchor`. Tuần cắt ở ranh giới tháng để mọi số (target, camp, kế hoạch) thuộc đúng MỘT tháng. */
export function weeklyBounds(mode: WeeklyMode, anchor: string, weekStart: (d: string) => string): { from: string; to: string; month: string } {
  const month = anchor.slice(0, 7);
  const mStart = `${month}-01`, mEnd = monthLast(month);
  if (mode === "mtd") return { from: mStart, to: mEnd, month };
  const ws = weekStart(anchor);
  const we = addDays(ws, 6);
  return { from: ws < mStart ? mStart : ws, to: we > mEnd ? mEnd : we, month };
}

// ---------------------------------------------------------------------------
// Kết luận bằng chữ — các gạch đầu dòng sếp đọc trước khi nhìn biểu đồ. Mọi câu đều suy từ số trong `WeeklyChannel`,
// không có câu nào cố định: kênh không có gì đáng nói thì chỉ còn câu đầu.
// ---------------------------------------------------------------------------

const pctText = (x: number) => `${Math.round(x * 100)}%`;
const dm = (d: string) => fmtDateVn(d, false);
/** "09–11/11" khi cùng tháng, ngược lại "30/11–02/12". */
export const spanLabel = (from: string, to: string) => (from === to ? dm(from) : from.slice(0, 7) === to.slice(0, 7) ? `${from.slice(8, 10)}–${dm(to)}` : `${dm(from)}–${dm(to)}`);

export function channelHeadline(w: WeeklyChannel): string[] {
  const out: string[] = [];
  const r = w.range;
  if (w.targetSource === "none") {
    out.push(`Chưa có target: thực đạt ${fmtVndShort(r.actual)}, ${r.sessions} ca có số.`);
  } else if (w.through == null || r.targetToDate <= 0) {
    out.push("Kỳ này chưa ngày nào có số để so target.");
  } else {
    const word = w.level === "on" ? "đạt" : w.level === "near" ? "sát target" : "hụt target";
    const delta = r.prevDelta != null ? `; ${r.prevDelta >= 0 ? "tăng" : "giảm"} ${pctText(Math.abs(r.prevDelta))} so với kỳ liền trước` : "";
    out.push(`Tới ${dm(w.through)}: ${fmtVndShort(r.actual)} / ${fmtVndShort(r.targetToDate)} target tới nay = ${pctText(r.pct ?? 0)} (${word})${delta}.`);
  }
  const ev = w.events.filter((e) => e.inRange && e.pct != null && e.status !== "next").sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
  if (ev.length > 0) {
    const worst = ev[0], best = ev[ev.length - 1];
    const label = (e: WeeklyEvent) => `${CAMP_DAY_BUCKET_LABEL[e.bucket].split(" (")[0]} ${spanLabel(e.from, e.to)}`;
    if ((worst.pct ?? 1) < WEEKLY_THRESHOLDS.near) out.push(`Đợt kéo xuống: ${label(worst)} chỉ ${pctText(worst.pct ?? 0)} target (${fmtVndShort(worst.actual)} / ${fmtVndShort(worst.targetToDate)}).`);
    if (best !== worst && (best.pct ?? 0) >= 1) out.push(`Đợt tốt: ${label(best)} đạt ${pctText(best.pct ?? 0)} target.`);
  }
  const who = (n: SessionNote) => `${dm(n.session.date)} ${n.session.startTime.slice(0, 5)} (${n.session.hostName || "chưa gán host"})`;
  const result = (n: SessionNote) => (n.pct != null ? `đạt ${pctText(n.pct)} target` : `GMV/giờ ${pctText(n.rateRatio ?? 0)} so nền`);
  const wk = w.weak[0];
  if (wk) {
    const why = wk.breaks[0] ? `, gãy ở ${wk.breaks[0].label} (−${pctText(1 - wk.breaks[0].ratio)})` : "";
    out.push(["Ca đáng lưu ý nhất:", who(wk), result(wk) + why].join(" ") + ".");
  }
  const st = w.strong[0];
  if (st) {
    const why = st.wins[0] ? `, nhờ ${st.wins[0].label} (+${pctText(st.wins[0].ratio - 1)})` : "";
    out.push(["Ca tốt nhất:", who(st), result(st) + why].join(" ") + ".");
  }
  if (r.waiting > 0 || w.missing.length > 0) {
    const t = w.missing.reduce((a, m) => a + m.target, 0);
    const wait = w.missing.filter((m) => m.kind === "no_data");
    if (wait.length > 0) out.push([`${wait.length} ca đã qua chưa có số`, `(target ${fmtVndShort(wait.reduce((a, m) => a + m.target, 0))}),`, "thực đạt có thể còn thấp hơn."].join(" "));
    else if (t > 0) out.push(`${w.missing.length} ca huỷ giữ target ${fmtVndShort(t)}.`);
  }
  return out;
}
