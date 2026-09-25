import { LiveSession, ShiftSlot } from "../../types";
import { addDays, eachDay, isoWeekStart } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { CampDayBucket, CampOverrides, CAMP_DAY_BUCKET_ORDER, resolveCampBucketType } from "../campaignDays";
import { MonthTargetPlan } from "./targetAllocation";
import { isCountable, sessionHours } from "./hostPerformance";

// Bản Tin CEO (2026-09-25) — thay Toàn Cảnh Agency. File thuần: không đụng Supabase, test bằng vitest.
//
// Ba luật đã trả giá mới có, đừng nới:
//   1. So sánh cắt theo NGÀY CUỐI CÓ SỐ, không theo lịch. Số nạp theo đợt (chậm 2-3 ngày) mà cắt theo
//      lịch thì mấy ngày chưa nạp bị đọc thành "không bán được" — màn cũ báo −33,6% khi thực tế −18,4%.
//   2. Dự phóng = đã có + giờ các ca CÒN LẠI TRONG LỊCH × doanh số/giờ 28 ngày gần nhất (tách ngày camp
//      và ngày thường). Backtest T7/T8 trên số thật: lệch −7%…+8%. Engine của Kế Hoạch Tháng (trackMonth,
//      hệ số k) lệch +9%…+47% trên cùng dữ liệu — không dùng engine cho số trên màn CEO.
//      "Ca còn lại trong lịch" gồm cả ca mở chưa có người và ca mở ngoài Kế Hoạch Tháng — tăng cường
//      lịch là dự phóng tăng theo ngay, không chờ ca chạy xong.
//   3. Tiến độ kỳ vọng tới hôm nay đi theo target TỪNG NGÀY (ngày camp nặng hơn), không chia đều theo
//      số ngày: 9 ngày camp mang ~50% doanh số tháng, chia đều thì nửa đầu tháng luôn "chậm".

export type Grain = "day" | "week" | "month" | "custom";

/** Sai số dự phóng hiện trên màn (dải ±). Lấy từ backtest 6 mốc T7/T8/2026 — lệch lớn nhất 7,8%. */
export const PROJECTION_ERROR_BAND = 0.08;
/** Số ngày lịch sử để tính doanh số/giờ cho dự phóng. */
export const PROJECTION_LOOKBACK_DAYS = 28;
/** Một khách vượt ngưỡng này là rủi ro tập trung (mốc 20–25% của agency dịch vụ). */
export const CLIENT_CONCENTRATION_WARN = 0.25;
/** Một người gánh quá ngưỡng giờ live này là rủi ro nhân sự. */
export const PERSON_CONCENTRATION_WARN = 0.3;
/** Run-rate dưới ngưỡng này thì báo chậm. */
export const RUN_RATE_WARN = 0.95;
export const RUN_RATE_BAD = 0.85;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const monthStartOf = (d: string) => `${d.slice(0, 7)}-01`;
export function monthEndOf(d: string): string {
  const [y, m] = d.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export const prevMonthOf = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);
export const nextMonthOf = (month: string) => addDays(monthEndOf(`${month}-01`), 1).slice(0, 7);
const minDate = (...xs: (string | null | undefined)[]) => xs.filter((x): x is string => !!x).sort()[0];

// ---------------------------------------------------------------------------
// Kỳ xem
// ---------------------------------------------------------------------------

export interface Period {
  grain: Grain;
  start: string;
  /** Ngày cuối được tính: đã cắt theo hôm nay VÀ ngày cuối có số. < start = kỳ chưa có số nào. */
  end: string;
  /** Ngày cuối theo lịch của kỳ (cuối tuần/tháng). */
  calendarEnd: string;
  prevStart: string;
  prevEnd: string;
  /** true = kỳ bị cắt vì số liệu chưa về tới hôm nay (khác với kỳ chưa hết theo lịch). */
  cutByData: boolean;
}

/**
 * `anchor`: ngày (day), ngày bất kỳ trong tuần/tháng (week/month), ngày bắt đầu (custom).
 * `dataEnd`: ngày cuối có số của phạm vi đang xem (null = chưa có số nào).
 */
export function periodFor(grain: Grain, anchor: string, today: string, dataEnd: string | null, customEnd?: string): Period {
  let start: string, calendarEnd: string;
  if (grain === "day") {
    start = calendarEnd = anchor;
  } else if (grain === "week") {
    start = isoWeekStart(anchor);
    calendarEnd = addDays(start, 6);
  } else if (grain === "month") {
    start = monthStartOf(anchor);
    calendarEnd = monthEndOf(anchor);
  } else {
    start = anchor;
    calendarEnd = customEnd && customEnd >= anchor ? customEnd : anchor;
  }
  const lastPossible = minDate(calendarEnd, today)!;
  const end = grain === "day" ? start : dataEnd && dataEnd < lastPossible ? dataEnd : lastPossible;
  const cutByData = grain !== "day" && !!dataEnd && dataEnd < lastPossible;
  const len = Math.max(0, dayDiff(start, end));
  let prevStart: string, prevEnd: string;
  if (grain === "day") {
    prevStart = prevEnd = addDays(start, -7);
  } else if (grain === "week") {
    prevStart = addDays(start, -7);
    prevEnd = addDays(prevStart, len);
  } else if (grain === "month") {
    prevStart = `${prevMonthOf(start.slice(0, 7))}-01`;
    const pe = addDays(prevStart, len);
    prevEnd = pe > monthEndOf(prevStart) ? monthEndOf(prevStart) : pe;
  } else {
    prevEnd = addDays(start, -1);
    prevStart = addDays(start, -(len + 1));
  }
  return { grain, start, end, calendarEnd, prevStart, prevEnd, cutByData };
}

/** Ngày cuối có số (ca có doanh số hoặc lượt xem) trong các ca đưa vào, không vượt quá `today`. */
export function lastDataDate(sessions: LiveSession[], today: string): string | null {
  let last: string | null = null;
  for (const s of sessions) if (isCountable(s) && s.date <= today && (!last || s.date > last)) last = s.date;
  return last;
}

export const inRange = (sessions: LiveSession[], from: string, to: string) => sessions.filter((s) => s.date >= from && s.date <= to);

// ---------------------------------------------------------------------------
// Cộng số
// ---------------------------------------------------------------------------

export interface PnlResult {
  revenue: number;
  cost: number;
  profit: number;
  /** Rỗng = ca này đủ dữ liệu để tính tiền. */
  missing: string[];
}
export type PnlFn = (s: LiveSession) => PnlResult;

export interface Totals {
  sessions: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  impressions: number;
  clicks: number;
  gmvPerHour: number | null;
  aov: number | null;
  /** Đơn ÷ lượt xem. */
  buyRate: number | null;
  /** Click sản phẩm ÷ hiển thị sản phẩm. */
  ctr: number | null;
}

/** Chỉ cộng ca có số — ca chưa diễn ra hoặc chưa có số không nói gì về hiệu suất. Tỷ lệ tính lại từ tổng. */
export function totalsOf(sessions: LiveSession[]): Totals {
  const t = { sessions: 0, hours: 0, gmv: 0, orders: 0, views: 0, impressions: 0, clicks: 0 };
  for (const s of sessions) {
    if (!isCountable(s)) continue;
    t.sessions++;
    t.hours += sessionHours(s);
    t.gmv += s.actualGmv ?? 0;
    t.orders += s.totalOrders ?? 0;
    t.views += s.totalViews ?? 0;
    t.impressions += s.productImpressions ?? 0;
    t.clicks += s.productClicks ?? 0;
  }
  return {
    ...t,
    gmvPerHour: t.hours > 0 ? t.gmv / t.hours : null,
    aov: t.orders > 0 ? t.gmv / t.orders : null,
    buyRate: t.views > 0 ? t.orders / t.views : null,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : null
  };
}

export interface FinanceTotals {
  /** Ca có số trong phạm vi. */
  sessions: number;
  /** Ca đủ dữ liệu để tính tiền — mọi con số tiền bên dưới CHỈ cộng từ những ca này. */
  priced: number;
  revenue: number;
  cost: number;
  profit: number;
  margin: number | null;
  profitableSessions: number;
  days: number;
  profitableDays: number;
  /** Lý do thiếu → số ca. */
  missing: Map<string, number>;
  byDay: Map<string, number>;
}

export function financeOf(sessions: LiveSession[], pnl: PnlFn): FinanceTotals {
  const f: FinanceTotals = { sessions: 0, priced: 0, revenue: 0, cost: 0, profit: 0, margin: null, profitableSessions: 0, days: 0, profitableDays: 0, missing: new Map(), byDay: new Map() };
  const unpricedDays = new Set<string>();
  for (const s of sessions) {
    if (!isCountable(s)) continue;
    f.sessions++;
    const r = pnl(s);
    if (r.missing.length > 0) {
      for (const m of r.missing) f.missing.set(m, (f.missing.get(m) ?? 0) + 1);
      unpricedDays.add(s.date);
      continue;
    }
    f.priced++;
    f.revenue += r.revenue;
    f.cost += r.cost;
    f.profit += r.profit;
    if (r.profit > 0) f.profitableSessions++;
    f.byDay.set(s.date, (f.byDay.get(s.date) ?? 0) + r.profit);
  }
  // Ngày còn ca chưa tính được tiền thì không kết luận ngày đó lãi hay lỗ.
  for (const d of unpricedDays) f.byDay.delete(d);
  f.days = f.byDay.size;
  for (const v of f.byDay.values()) if (v > 0) f.profitableDays++;
  f.margin = f.revenue > 0 ? f.profit / f.revenue : null;
  return f;
}

/** % thay đổi; null khi kỳ trước = 0 hoặc thiếu (UI nói "kỳ trước chưa có số", không in 0% hay ∞). */
export function change(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

// ---------------------------------------------------------------------------
// Target, run-rate, dự phóng tháng
// ---------------------------------------------------------------------------

export interface MonthTarget {
  total: number;
  /** Target từng ngày trong tháng — cộng lại bằng `total`. */
  byDate: Map<string, number>;
  source: "locked_plan" | "monthly_report";
}

/**
 * Nguồn target giống hệt applyAllocatedTargets (targetAllocation.ts) để các màn không nói hai số:
 * Kế Hoạch Tháng đã chốt thắng; không có thì kế hoạch của Report Tháng (tab 05); không có gì ⇒ null.
 * - Kế hoạch chốt: target từng ca kế hoạch rơi đúng ngày của ca; phần tổng chưa gắn được ngày (hiếm)
 *   chia đều các ngày.
 * - Report Tháng: target từng khung (D-Day/Mid/Pay/ngày thường) chia đều các ngày của khung.
 */
export function monthTargetOf(
  month: string,
  lockedTotal: number | undefined,
  lockedSlotTargets: { date: string; target: number }[],
  reportPlan: MonthTargetPlan | null,
  camp: CampOverrides | undefined
): MonthTarget | null {
  const days = eachDay(`${month}-01`, monthEndOf(`${month}-01`));
  const byDate = new Map<string, number>(days.map((d) => [d, 0]));
  if (lockedTotal && lockedTotal > 0) {
    let placed = 0;
    for (const s of lockedSlotTargets) {
      if (!byDate.has(s.date)) continue;
      byDate.set(s.date, byDate.get(s.date)! + s.target);
      placed += s.target;
    }
    const rest = lockedTotal - placed;
    if (rest > 0) for (const d of days) byDate.set(d, byDate.get(d)! + rest / days.length);
    return { total: lockedTotal, byDate, source: "locked_plan" };
  }
  if (reportPlan) {
    const buckets = new Map<CampDayBucket, string[]>();
    for (const d of days) {
      const b = resolveCampBucketType(d, camp ?? reportPlan.camp);
      buckets.set(b, [...(buckets.get(b) ?? []), d]);
    }
    let total = 0;
    for (const b of CAMP_DAY_BUCKET_ORDER) {
      const amount = reportPlan.byBucket[b] ?? 0;
      if (amount <= 0) continue;
      total += amount;
      const ds = buckets.get(b);
      // Khung không có ngày nào trong tháng (khoảng camp nhập lệch tháng) — dồn đều cả tháng, không để bốc hơi.
      const spread = ds && ds.length > 0 ? ds : days;
      for (const d of spread) byDate.set(d, byDate.get(d)! + amount / spread.length);
    }
    return total > 0 ? { total, byDate, source: "monthly_report" } : null;
  }
  return null;
}

export interface PendingItem {
  date: string;
  hours: number;
  forecast: number;
  kind: "session" | "open_slot";
  bucket: CampDayBucket;
}

export interface BucketOutlook {
  bucket: CampDayBucket;
  days: string[];
  status: "done" | "live" | "next" | "none";
  actual: Totals;
  daysWithData: number;
  perDay: number | null;
  prevPerDay: number | null;
  target: number | null;
  /** Target của các ngày khung đã có số (để tính % đạt của khung đang chạy). */
  targetToDate: number | null;
  forecast: number;
  pendingCount: number;
}

export interface MonthOutlook {
  month: string;
  today: string;
  /** Ngày cuối có số trong tháng (null = tháng chưa có số). */
  through: string | null;
  days: string[];
  actual: number;
  target: MonthTarget | null;
  expectedToDate: number | null;
  runRate: number | null;
  pending: PendingItem[];
  projected: number;
  /** Doanh số/giờ dùng để chiếu — null khi 28 ngày gần nhất không có ca nào. */
  rates: { camp: number; daily: number } | null;
  gap: number | null;
  remainingDays: number;
  needPerRemainingDay: number | null;
  actualByDate: Map<string, number>;
  forecastByDate: Map<string, number>;
  buckets: BucketOutlook[];
}

/** Doanh số/giờ (theo giờ ca kế hoạch — cùng đơn vị với ca sắp tới) trong 28 ngày tới `through`. */
export function projectionRates(brandSessions: LiveSession[], through: string | null): { camp: number; daily: number } | null {
  if (!through) return null;
  const from = addDays(through, -(PROJECTION_LOOKBACK_DAYS - 1));
  const hist = brandSessions.filter((s) => isCountable(s) && s.date >= from && s.date <= through);
  const rate = (xs: LiveSession[]) => {
    const h = xs.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
    return h > 0 ? xs.reduce((a, s) => a + (s.actualGmv ?? 0), 0) / h : 0;
  };
  const all = rate(hist);
  if (all <= 0) return null;
  const camp = rate(hist.filter((s) => resolveCampBucketType(s.date) !== "daily"));
  const daily = rate(hist.filter((s) => resolveCampBucketType(s.date) === "daily"));
  return { camp: camp || all, daily: daily || all };
}

/**
 * Một brand, một tháng. `brandSessions` = mọi ca của brand (cả tháng trước để lấy doanh số/giờ);
 * `openSlots` = ca mở chưa có người của brand (status open, chưa gắn session).
 */
export function monthOutlook(
  month: string,
  today: string,
  brandSessions: LiveSession[],
  openSlots: ShiftSlot[],
  target: MonthTarget | null,
  camp: CampOverrides | undefined
): MonthOutlook {
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const days = eachDay(mStart, mEnd);
  const bucketOf = (d: string) => resolveCampBucketType(d, camp);
  const inMonth = brandSessions.filter((s) => s.date >= mStart && s.date <= mEnd && s.status !== "Cancelled");
  const done = inMonth.filter((s) => isCountable(s) && s.date <= today);
  const through = lastDataDate(done, today);
  const rates = projectionRates(brandSessions, lastDataDate(brandSessions, today));
  const rateFor = (d: string) => (rates ? (bucketOf(d) === "daily" ? rates.daily : rates.camp) : 0);

  // Còn lại trong lịch: ca chưa có số (sắp tới, hoặc đã qua mà số chưa về) + ca mở chưa có người.
  const pending: PendingItem[] = [];
  for (const s of inMonth) {
    if (isCountable(s)) continue;
    const hours = sessionDurationHours(s.startTime, s.endTime);
    pending.push({ date: s.date, hours, forecast: hours * rateFor(s.date), kind: "session", bucket: bucketOf(s.date) });
  }
  for (const sl of openSlots) {
    if (sl.status !== "open" || sl.sessionId || sl.date < today || sl.date < mStart || sl.date > mEnd) continue;
    const hours = sessionDurationHours(sl.startTime, sl.endTime);
    pending.push({ date: sl.date, hours, forecast: hours * rateFor(sl.date), kind: "open_slot", bucket: bucketOf(sl.date) });
  }

  const actualByDate = new Map<string, number>();
  for (const s of done) actualByDate.set(s.date, (actualByDate.get(s.date) ?? 0) + (s.actualGmv ?? 0));
  const forecastByDate = new Map<string, number>();
  for (const p of pending) forecastByDate.set(p.date, (forecastByDate.get(p.date) ?? 0) + p.forecast);

  const actual = done.reduce((a, s) => a + (s.actualGmv ?? 0), 0);
  const projected = actual + pending.reduce((a, p) => a + p.forecast, 0);
  let expectedToDate: number | null = null;
  if (target && through) {
    expectedToDate = 0;
    for (const [d, v] of target.byDate) if (d <= through) expectedToDate += v;
  }
  // Hôm nay tính là ngày còn lại — số của hôm nay chưa vào.
  const remainingDays = today > mEnd ? 0 : today < mStart ? days.length : dayDiff(today, mEnd) + 1;

  const prevM = prevMonthOf(month);
  const prevDays = eachDay(`${prevM}-01`, monthEndOf(`${prevM}-01`));
  const prevSessions = brandSessions.filter((s) => s.date.startsWith(prevM) && isCountable(s));
  const buckets: BucketOutlook[] = CAMP_DAY_BUCKET_ORDER.map((b) => {
    const bd = days.filter((d) => bucketOf(d) === b);
    const bDone = done.filter((s) => bucketOf(s.date) === b);
    const withData = new Set(bDone.map((s) => s.date)).size;
    const passed = bd.filter((d) => through && d <= through).length;
    const status: BucketOutlook["status"] = bd.length === 0 ? "none" : bd[bd.length - 1] < today ? "done" : bd[0] > today ? "next" : "live";
    const actualT = totalsOf(bDone);
    const prevBucketDays = prevDays.filter((d) => resolveCampBucketType(d) === b).length;
    const prevGmv = prevSessions.filter((s) => resolveCampBucketType(s.date) === b).reduce((a, s) => a + (s.actualGmv ?? 0), 0);
    const bPending = pending.filter((p) => p.bucket === b);
    const tgt = target ? bd.reduce((a, d) => a + (target.byDate.get(d) ?? 0), 0) : null;
    const tgtToDate = target && through ? bd.filter((d) => d <= through).reduce((a, d) => a + (target.byDate.get(d) ?? 0), 0) : null;
    return {
      bucket: b,
      days: bd,
      status,
      actual: actualT,
      daysWithData: withData,
      perDay: passed > 0 ? actualT.gmv / passed : null,
      prevPerDay: prevBucketDays > 0 && prevGmv > 0 ? prevGmv / prevBucketDays : null,
      target: tgt,
      targetToDate: tgtToDate,
      forecast: bPending.reduce((a, p) => a + p.forecast, 0),
      pendingCount: bPending.length
    };
  });

  return {
    month,
    today,
    through,
    days,
    actual,
    target,
    expectedToDate,
    runRate: expectedToDate && expectedToDate > 0 ? actual / expectedToDate : null,
    pending,
    projected,
    rates,
    gap: target ? projected - target.total : null,
    remainingDays,
    needPerRemainingDay: target && remainingDays > 0 ? Math.max(0, target.total - actual) / remainingDays : null,
    actualByDate,
    forecastByDate,
    buckets
  };
}

/** Cộng nhiều brand thành một tháng agency. Dự phóng mỗi brand đã tính bằng doanh số/giờ của chính nó. */
export function combineOutlooks(month: string, today: string, list: MonthOutlook[]): MonthOutlook {
  const days = eachDay(`${month}-01`, monthEndOf(`${month}-01`));
  const sumMap = (pick: (o: MonthOutlook) => Map<string, number>) => {
    const out = new Map<string, number>();
    for (const o of list) for (const [k, v] of pick(o)) out.set(k, (out.get(k) ?? 0) + v);
    return out;
  };
  const withTarget = list.filter((o) => o.target);
  const target: MonthTarget | null = withTarget.length
    ? { total: withTarget.reduce((a, o) => a + o.target!.total, 0), byDate: sumMap((o) => o.target?.byDate ?? new Map()), source: withTarget[0].target!.source }
    : null;
  const through = list.map((o) => o.through).filter((x): x is string => !!x).sort().pop() ?? null;
  const actual = list.reduce((a, o) => a + o.actual, 0);
  const projected = list.reduce((a, o) => a + o.projected, 0);
  // Run-rate agency: chỉ trên các brand có target, không để doanh số brand không có target thổi phồng %.
  const actualT = withTarget.reduce((a, o) => a + o.actual, 0);
  const expected = withTarget.reduce((a, o) => a + (o.expectedToDate ?? 0), 0);
  const projectedT = withTarget.reduce((a, o) => a + o.projected, 0);
  const remainingDays = list[0]?.remainingDays ?? 0;
  const bucketMerge = (b: CampDayBucket): BucketOutlook => {
    const xs = list.map((o) => o.buckets.find((x) => x.bucket === b)!).filter(Boolean);
    const first = xs[0];
    const gmv = xs.reduce((a, x) => a + x.actual.gmv, 0);
    const hours = xs.reduce((a, x) => a + x.actual.hours, 0);
    const passed = first ? first.days.filter((d) => through && d <= through).length : 0;
    const prev = xs.reduce((a, x) => a + (x.prevPerDay ?? 0), 0);
    return {
      bucket: b,
      days: first?.days ?? [],
      status: first?.status ?? "none",
      actual: { ...totalsOf([]), sessions: xs.reduce((a, x) => a + x.actual.sessions, 0), hours, gmv, gmvPerHour: hours > 0 ? gmv / hours : null },
      daysWithData: Math.max(0, ...xs.map((x) => x.daysWithData)),
      perDay: passed > 0 ? gmv / passed : null,
      prevPerDay: prev > 0 ? prev : null,
      target: xs.some((x) => x.target != null) ? xs.reduce((a, x) => a + (x.target ?? 0), 0) : null,
      targetToDate: xs.some((x) => x.targetToDate != null) ? xs.reduce((a, x) => a + (x.targetToDate ?? 0), 0) : null,
      forecast: xs.reduce((a, x) => a + x.forecast, 0),
      pendingCount: xs.reduce((a, x) => a + x.pendingCount, 0)
    };
  };
  return {
    month,
    today,
    through,
    days,
    actual,
    target,
    expectedToDate: target ? expected : null,
    runRate: expected > 0 ? actualT / expected : null,
    pending: list.flatMap((o) => o.pending),
    projected,
    rates: null,
    gap: target ? projectedT - target.total : null,
    remainingDays,
    needPerRemainingDay: target && remainingDays > 0 ? Math.max(0, target.total - actualT) / remainingDays : null,
    actualByDate: sumMap((o) => o.actualByDate),
    forecastByDate: sumMap((o) => o.forecastByDate),
    buckets: CAMP_DAY_BUCKET_ORDER.map(bucketMerge)
  };
}

// ---------------------------------------------------------------------------
// Nhân sự
// ---------------------------------------------------------------------------

export interface StaffRow {
  key: string;
  name: string;
  totals: Totals;
  /** Tỷ trọng giờ live trong kỳ. */
  hoursShare: number;
  prevGmvPerHour: number | null;
}

export const UNASSIGNED = "__unassigned__";

function staffBy(sessions: LiveSession[], prev: LiveSession[], keyOf: (s: LiveSession) => string, nameOf: (s: LiveSession) => string): { rows: StaffRow[]; unassigned: Totals | null; average: number | null } {
  const cur = sessions.filter(isCountable);
  const groups = new Map<string, LiveSession[]>();
  for (const s of cur) groups.set(keyOf(s), [...(groups.get(keyOf(s)) ?? []), s]);
  const prevGroups = new Map<string, LiveSession[]>();
  for (const s of prev.filter(isCountable)) prevGroups.set(keyOf(s), [...(prevGroups.get(keyOf(s)) ?? []), s]);
  const all = totalsOf(cur);
  const rows: StaffRow[] = [];
  for (const [k, list] of groups) {
    if (k === UNASSIGNED) continue;
    const t = totalsOf(list);
    rows.push({ key: k, name: nameOf(list[0]), totals: t, hoursShare: all.hours > 0 ? t.hours / all.hours : 0, prevGmvPerHour: prevGroups.has(k) ? totalsOf(prevGroups.get(k)!).gmvPerHour : null });
  }
  rows.sort((a, b) => (b.totals.gmvPerHour ?? 0) - (a.totals.gmvPerHour ?? 0));
  const un = groups.get(UNASSIGNED);
  return { rows, unassigned: un ? totalsOf(un) : null, average: all.gmvPerHour };
}

export const hostKeyOf = (s: LiveSession) => s.hostId || (s.hostName ? `ten:${s.hostName}` : UNASSIGNED);
export const assistantKeyOf = (s: LiveSession) => s.coHostId || (s.coHostName ? `ten:${s.coHostName}` : UNASSIGNED);

export const hostRows = (cur: LiveSession[], prev: LiveSession[]) => staffBy(cur, prev, hostKeyOf, (s) => s.hostName);
export const assistantRows = (cur: LiveSession[], prev: LiveSession[]) => staffBy(cur, prev, assistantKeyOf, (s) => s.coHostName);

export interface PairRow {
  host: string;
  assistant: string;
  totals: Totals;
}

/** Cặp host + trợ live chạy chung từ `minSessions` ca trở lên, xếp theo doanh số/giờ. */
export function pairRows(sessions: LiveSession[], minSessions = 3): PairRow[] {
  const groups = new Map<string, LiveSession[]>();
  for (const s of sessions) {
    if (!isCountable(s) || hostKeyOf(s) === UNASSIGNED || assistantKeyOf(s) === UNASSIGNED) continue;
    const k = `${hostKeyOf(s)}|${assistantKeyOf(s)}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  return [...groups.values()]
    .filter((l) => l.length >= minSessions)
    .map((l) => ({ host: l[0].hostName, assistant: l[0].coHostName, totals: totalsOf(l) }))
    .sort((a, b) => (b.totals.gmvPerHour ?? 0) - (a.totals.gmvPerHour ?? 0));
}

// ---------------------------------------------------------------------------
// Tháng qua tháng
// ---------------------------------------------------------------------------

export interface MonthColumn {
  month: string;
  /** Tháng đang chạy — cộng tới ngày cuối có số. */
  partial: boolean;
  through: string;
  totals: Totals;
}

export function monthColumns(sessions: LiveSession[], lastMonth: string, count: number, dataEnd: string | null): MonthColumn[] {
  const months: string[] = [];
  let m = lastMonth;
  for (let i = 0; i < count; i++) {
    months.unshift(m);
    m = prevMonthOf(m);
  }
  return months.map((mo) => {
    const end = monthEndOf(`${mo}-01`);
    const through = dataEnd && dataEnd < end && dataEnd >= `${mo}-01` ? dataEnd : end;
    return { month: mo, partial: through < end, through, totals: totalsOf(inRange(sessions, `${mo}-01`, through)) };
  });
}

// ---------------------------------------------------------------------------
// Cần chú ý
// ---------------------------------------------------------------------------

export type IssueLevel = "bad" | "warn" | "info";
export type IssueAction = "sessions" | "month_plan" | "reconcile" | "talents" | "rate_card" | "host_performance";
export interface Issue {
  level: IssueLevel;
  title: string;
  detail: string;
  action?: IssueAction;
}

export interface BrandSnapshot {
  brandId: string;
  name: string;
  outlook: MonthOutlook;
  lastData: string | null;
  /** Kế Hoạch Tháng của tháng sau: null = chưa có, "draft" | "locked". */
  nextPlan: "draft" | "locked" | null;
}

export interface IssueInput {
  today: string;
  brands: BrandSnapshot[];
  /** Ca có số trong kỳ đang xem (đã lọc theo phạm vi brand). */
  periodSessions: LiveSession[];
  finance: FinanceTotals | null;
  /** true khi đang xem cả agency (mới báo tập trung khách + brand chưa chạy). */
  agencyScope: boolean;
  fmt: (v: number) => string;
}

export function buildIssues(x: IssueInput): Issue[] {
  const out: Issue[] = [];
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const month = x.today.slice(0, 7);
  const monthEnd = monthEndOf(x.today);

  // "Thiếu số" = ca ĐÃ CHẠY mà chưa có số, không phải "hôm qua không có số" — có ngày vốn không lịch live.
  for (const b of x.brands) {
    const missing = b.outlook.pending.filter((p) => p.kind === "session" && p.date < x.today);
    if (missing.length === 0) continue;
    const oldest = missing.map((p) => p.date).sort()[0];
    out.push({ level: "bad", title: `${b.name}: ${missing.length} ca đã chạy chưa có số`, detail: `Từ ${oldest.slice(8, 10)}/${oldest.slice(5, 7)} — chưa up file giao ca hoặc chưa đối soát. Dự phóng đang tạm tính phần này theo doanh số/giờ gần đây.`, action: "reconcile" });
  }

  for (const b of x.brands) {
    const o = b.outlook;
    if (!o.actual && !o.pending.length) continue;
    if (o.runRate != null && o.runRate < RUN_RATE_WARN) {
      out.push({ level: o.runRate < RUN_RATE_BAD ? "bad" : "warn", title: `${b.name} chậm tiến độ: đạt ${pct(o.runRate)} kỳ vọng`, detail: `Đã có ${x.fmt(o.actual)}, kỳ vọng tới ngày có số là ${x.fmt(o.expectedToDate ?? 0)} (theo target từng ngày).`, action: "month_plan" });
    }
    if (o.target && o.gap != null && o.gap < 0) {
      out.push({ level: "bad", title: `${b.name} dự phóng thiếu ${x.fmt(-o.gap)} so với target`, detail: `Dự phóng cuối tháng ${x.fmt(o.projected)} (±${Math.round(PROJECTION_ERROR_BAND * 100)}%) với lịch đang có. Cần thêm ca hoặc tăng doanh số/giờ.`, action: "month_plan" });
    }
    if (o.remainingDays > 0 && o.pending.filter((p) => p.date >= x.today).length === 0 && o.actual > 0) {
      out.push({ level: "bad", title: `${b.name}: chưa có ca nào trong lịch cho ${o.remainingDays} ngày còn lại`, detail: "Dự phóng chỉ bằng số đã có. Kiểm tra lịch và Kế Hoạch Tháng.", action: "month_plan" });
    }
    const lastCamp = o.buckets.filter((c) => c.bucket !== "daily" && c.status === "done" && c.perDay != null && c.prevPerDay != null).pop();
    if (lastCamp && lastCamp.perDay! < lastCamp.prevPerDay! * 0.85) {
      out.push({ level: "warn", title: `${b.name}: đợt camp vừa rồi yếu hơn tháng trước`, detail: `${x.fmt(lastCamp.perDay!)}/ngày so với ${x.fmt(lastCamp.prevPerDay!)}/ngày tháng trước (${pct(lastCamp.perDay! / lastCamp.prevPerDay! - 1)}).` });
    }
  }

  if (x.agencyScope) {
    const withSales = x.brands.filter((b) => b.outlook.actual > 0);
    const total = withSales.reduce((a, b) => a + b.outlook.actual, 0);
    const top = [...withSales].sort((a, b) => b.outlook.actual - a.outlook.actual)[0];
    if (top && total > 0 && top.outlook.actual / total > CLIENT_CONCENTRATION_WARN) {
      const share = top.outlook.actual / total;
      out.push({ level: share > 0.5 ? "bad" : "warn", title: `${pct(share)} doanh số tháng đến từ một khách: ${top.name}`, detail: "Mốc an toàn phổ biến của agency dịch vụ: không khách nào quá 20–25% doanh thu." });
    }
    const idle = x.brands.filter((b) => !b.outlook.actual && !b.outlook.pending.length).map((b) => b.name);
    if (idle.length) out.push({ level: "warn", title: `${idle.join(", ")} chưa có ca nào tháng ${Number(month.slice(5))}`, detail: "Tài khoản đang có trên hệ thống nhưng tháng này chưa chạy, cũng chưa có ca trong lịch.", action: "month_plan" });
  }

  if (dayDiff(x.today, monthEnd) <= 10) {
    const unplanned = x.brands.filter((b) => b.nextPlan !== "locked");
    if (unplanned.length) out.push({ level: "warn", title: `Tháng sau chưa chốt kế hoạch: ${unplanned.map((b) => b.name + (b.nextPlan === "draft" ? " (nháp)" : "")).join(", ")}`, detail: `Còn ${dayDiff(x.today, monthEnd) + 1} ngày tới tháng mới — chốt trước để talent còn thời gian đăng ký.`, action: "month_plan" });
  }

  const cur = x.periodSessions.filter(isCountable);
  const hrs = new Map<string, { name: string; h: number }>();
  let totalH = 0;
  for (const s of cur) {
    totalH += sessionHours(s);
    const k = hostKeyOf(s);
    if (k === UNASSIGNED) continue;
    const e = hrs.get(k) ?? { name: s.hostName, h: 0 };
    e.h += sessionHours(s);
    hrs.set(k, e);
  }
  const topHost = [...hrs.values()].sort((a, b) => b.h - a.h)[0];
  if (topHost && totalH > 0 && topHost.h / totalH > PERSON_CONCENTRATION_WARN) {
    out.push({ level: "warn", title: `${topHost.name} gánh ${pct(topHost.h / totalH)} giờ live của kỳ`, detail: "Người này nghỉ là hụt một phần lớn lịch — cần host dự phòng.", action: "host_performance" });
  }
  if (x.finance && x.finance.priced > 0) {
    const losing = x.finance.priced - x.finance.profitableSessions;
    if (losing > 0) out.push({ level: "warn", title: `${losing}/${x.finance.priced} phiên lỗ trong kỳ`, detail: "Doanh thu agency của phiên không đủ trả chi phí trực tiếp. Xem mục Tài chính." });
  }
  const noHost = cur.filter((s) => hostKeyOf(s) === UNASSIGNED);
  if (noHost.length) {
    out.push({ level: "info", title: `${noHost.length} ca chưa ghi host`, detail: `${x.fmt(noHost.reduce((a, s) => a + (s.actualGmv ?? 0), 0))} doanh số chưa biết của ai, không xếp hạng được.`, action: "sessions" });
  }

  const rank: Record<IssueLevel, number> = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
