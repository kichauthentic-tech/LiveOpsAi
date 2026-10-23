import { LiveSession, ShiftSlot } from "../../types";
import { addDays, eachDay } from "../dateUtils";
import { isPnlSession, sessionDurationHours } from "../pnl";
import { CampDayBucket, CampOverrides, CAMP_DAY_BUCKET_ORDER, resolveCampBucketType } from "../campaignDays";
import { isCountable, sessionHours } from "./hostPerformance";
import { keyMetricsOfSessions, type KeyMetrics } from "../report/keyMetrics";
import { DEFAULT_ENGINE_PARAMS } from "../scheduling/engineParams";
import { ForecastParams, buildMonthForecaster, inMonthProjection } from "./monthForecast";

// Bản Tin CEO (2026-09-25) — thay Toàn Cảnh Agency. File thuần: không đụng Supabase, test bằng vitest.
//
// Ba luật đã trả giá mới có, đừng nới:
//   1. So sánh cắt theo NGÀY CUỐI CÓ SỐ, không theo lịch. Số nạp theo đợt (chậm 2-3 ngày) mà cắt theo
//      lịch thì mấy ngày chưa nạp bị đọc thành "không bán được" — màn cũ báo −33,6% khi thực tế −18,4%.
//   2. Dự phóng = đã có + các ca CÒN LẠI TRONG LỊCH × dự báo theo hình dạng tháng (engine target v3, 10/10:
//      monthForecast.ts — mức lúc lập cập nhật bằng GMV thật ÷ kỳ vọng của chính các ca đã có số). Backtest T7–T9
//      CROCS+VERA ngày 8/15/18: 8% / 5% / 3%; cách cũ (giờ × doanh số/giờ 28 ngày) 12% / 8% / 6% — cách cũ chỉ còn
//      là đường lùi khi kênh chưa đủ 15 ca lịch sử.
//      "Ca còn lại trong lịch" gồm cả ca mở chưa có người và ca mở ngoài Kế Hoạch Tháng — tăng cường
//      lịch là dự phóng tăng theo ngay, không chờ ca chạy xong.
//   3. Tiến độ kỳ vọng tới hôm nay đi theo target TỪNG NGÀY (ngày camp nặng hơn), không chia đều theo
//      số ngày: 9 ngày camp mang ~50% doanh số tháng, chia đều thì nửa đầu tháng luôn "chậm".

/** Số ngày lịch sử để tính doanh số/giờ cho dự phóng. */
export const PROJECTION_LOOKBACK_DAYS = 28;
/** Run-rate dưới ngưỡng này thì báo chậm. */
export const RUN_RATE_WARN = 0.95;
export const RUN_RATE_BAD = 0.85;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export function monthEndOf(d: string): string {
  const [y, m] = d.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}
export const prevMonthOf = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);
export const nextMonthOf = (month: string) => addDays(monthEndOf(`${month}-01`), 1).slice(0, 7);

/** Ngày cuối có số (ca có doanh số hoặc lượt xem) trong các ca đưa vào, không vượt quá `today`. */
export function lastDataDate(sessions: LiveSession[], today: string): string | null {
  let last: string | null = null;
  for (const s of sessions) if (isCountable(s) && s.date <= today && (!last || s.date > last)) last = s.date;
  return last;
}

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

/** Key Metrics (lib/report/keyMetrics.ts) — cùng hàm với Report Tháng/Tuần, Dashboard, Hiệu Suất Host. Tỷ lệ là giá trị %. */
export type Totals = KeyMetrics;

/** Chỉ cộng ca có số — ca chưa diễn ra hoặc chưa có số không nói gì về hiệu suất. Tỷ lệ tính lại từ tổng. */
export function totalsOf(sessions: LiveSession[]): Totals {
  return keyMetricsOfSessions(sessions.filter(isCountable), sessionHours);
}

export interface FinanceTotals {
  /** Ca đã chạy (Completed) trong phạm vi — cùng luật isPnlSession với Finance & P&L, cộng thêm ca nạp bù. */
  sessions: number;
  /** Trong `sessions`, bao nhiêu ca là nạp bù — Finance & P&L không tính những ca này. */
  backfill: number;
  /** Ca đủ dữ liệu để tính tiền — mọi con số tiền bên dưới CHỈ cộng từ những ca này. */
  priced: number;
  /** Giờ của các ca đã tính được tiền — mẫu số "mỗi giờ". */
  pricedHours: number;
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
  const f: FinanceTotals = { sessions: 0, backfill: 0, priced: 0, pricedHours: 0, revenue: 0, cost: 0, profit: 0, margin: null, profitableSessions: 0, days: 0, profitableDays: 0, missing: new Map(), byDay: new Map() };
  const unpricedDays = new Set<string>();
  for (const s of sessions) {
    // Cùng luật với Finance & P&L (isPnlSession) — ca đã chạy mà GMV = 0 vẫn có chi phí host/phòng. Khác Finance
    // đúng một điểm có chủ ý: ca nạp bù được tính, màn CEO cần thấy cả lịch sử.
    if (!isPnlSession(s, { includeBackfill: true })) continue;
    f.sessions++;
    if (s.isBackfill) f.backfill++;
    const r = pnl(s);
    if (r.missing.length > 0) {
      for (const m of r.missing) f.missing.set(m, (f.missing.get(m) ?? 0) + 1);
      unpricedDays.add(s.date);
      continue;
    }
    f.priced++;
    f.pricedHours += sessionHours(s);
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


// ---------------------------------------------------------------------------
// Target, run-rate, dự phóng tháng
// ---------------------------------------------------------------------------

export interface MonthTarget {
  total: number;
  /** Target từng ngày trong tháng — cộng lại bằng `total`. */
  byDate: Map<string, number>;
}

/**
 * Nguồn target giống hệt applyAllocatedTargets (targetAllocation.ts) để các màn không nói hai số: Kế Hoạch Tháng đã
 * chốt; không có ⇒ null (gộp cấu hình 06/10 bỏ nhánh "target khung camp nhập ở Nhập Ads"). Target từng ca kế hoạch rơi
 * đúng ngày của ca; phần tổng chưa gắn được ngày (hiếm) chia đều các ngày.
 */
export function monthTargetOf(
  month: string,
  lockedTotal: number | undefined,
  lockedSlotTargets: { date: string; target: number }[]
): MonthTarget | null {
  if (!lockedTotal || lockedTotal <= 0) return null;
  const days = eachDay(`${month}-01`, monthEndOf(`${month}-01`));
  const byDate = new Map<string, number>(days.map((d) => [d, 0]));
  let placed = 0;
  for (const s of lockedSlotTargets) {
    if (!byDate.has(s.date)) continue;
    byDate.set(s.date, byDate.get(s.date)! + s.target);
    placed += s.target;
  }
  const rest = lockedTotal - placed;
  if (rest > 0) for (const d of days) byDate.set(d, byDate.get(d)! + rest / days.length);
  return { total: lockedTotal, byDate };
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
  /** Chỉ ở outlook gộp khi một phần brand có target (lỗi E2E #2): GMV / dự báo của RIÊNG các brand có target,
   *  để so với `target`/`targetToDate` — `actual.gmv`/`forecast` vẫn là của mọi brand. */
  targetScope?: { gmv: number; forecast: number };
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
  /** Cách ra `projected` — xem projectMonthEnd (planRunRate.ts). "none" = không có gì để chiếu phần còn lại,
   *  `projected` khi đó chỉ là số đã có, UI không được in nó như dự phóng (lỗi E2E #4: "Dự kiến 0 · Thiếu 100%"). */
  projectionMethod: "gmv_per_hour" | "run_rate" | "none";
  gap: number | null;
  remainingDays: number;
  needPerRemainingDay: number | null;
  actualByDate: Map<string, number>;
  forecastByDate: Map<string, number>;
  buckets: BucketOutlook[];
  /** Hệ số dải ~80% (× phần dự phóng chưa về). Thiếu = 0,35 của cách chiếu cũ. */
  coneCoef?: number;
  /** "shape" = engine target v3 (monthForecast.ts); "rate28" = giờ × GMV/giờ 28 ngày (đường lùi). */
  forecastModel?: "shape" | "rate28";
  /** Chẩn đoán dự báo v3 của kênh (chỉ outlook một kênh). */
  shape?: ShapeDiagnostics;
  /**
   * Chỉ có ở outlook GỘP khi CHỈ MỘT PHẦN brand có target (lỗi E2E #2, 2026-09-28): target là của các brand
   * có kế hoạch, còn `actual`/`actualByDate`/`projected` là của MỌI brand — đem chia cho nhau ra "Đã đạt
   * 24.103% Target" (VERA có plan 14,7M, CROCS không có plan mà bán 3,53B). Khối Target phải so target
   * với đúng phần này; phần còn lại của outlook vẫn là tổng agency.
   */
  targetScope?: {
    brands: number;
    of: number;
    actual: number;
    actualByDate: Map<string, number>;
    forecastByDate: Map<string, number>;
    projected: number;
    pending: PendingItem[];
    projectionMethod: MonthOutlook["projectionMethod"];
  };
}

export interface ShapeDiagnostics {
  /** GMV thật ÷ kỳ vọng của các ca đã có số trong tháng (null = chưa có ca nào có số). */
  ratio: number | null;
  /** Phần trọng số tháng đã có số (0–1). */
  seenShare: number;
  band: number;
  big: boolean;
  /** Giờ/ngày vượt p90 lịch sử của lịch tháng — phần vượt chỉ tính một phần GMV. */
  excessHours: number;
  /** Lệch dự báo lúc lập trung bình các tháng trước (dự báo ÷ thực tế − 1). */
  bias: number | null;
  mostlyManual: boolean;
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
  camp: CampOverrides | undefined,
  params: ForecastParams = DEFAULT_ENGINE_PARAMS
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
  // Ca có số nhưng ngày > hôm nay (hiếm — số nhập trước) không vào `done` lẫn `pending`, như trước.
  const rest: { date: string; startTime: string; endTime: string; kind: PendingItem["kind"] }[] = [];
  for (const s of inMonth) if (!isCountable(s)) rest.push({ date: s.date, startTime: s.startTime, endTime: s.endTime, kind: "session" });
  for (const sl of openSlots) {
    if (sl.status !== "open" || sl.sessionId || sl.date < today || sl.date < mStart || sl.date > mEnd) continue;
    rest.push({ date: sl.date, startTime: sl.startTime, endTime: sl.endTime, kind: "open_slot" });
  }
  // Engine target v3: lịch sử TRƯỚC tháng của chính kênh này ⇒ mức + hình dạng; số đã có của tháng cập nhật mức. Chưa đủ lịch sử ⇒ cách cũ.
  const forecaster = buildMonthForecaster(brandSessions, month, params);
  let shape: ShapeDiagnostics | undefined;
  let restForecast: number[];
  if (forecaster) {
    const items = [
      ...done.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.actualGmv ?? 0 })),
      ...rest.map((r) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime, actual: null }))
    ];
    const proj = inMonthProjection(forecaster, items, bucketOf);
    restForecast = rest.map((_, i) => proj.perItem[done.length + i]);
    shape = { ratio: proj.ratio, seenShare: proj.seenShare, band: forecaster.band, big: forecaster.big, excessHours: proj.excessHours, bias: forecaster.bias, mostlyManual: forecaster.mostlyManual };
  } else restForecast = rest.map((r) => sessionDurationHours(r.startTime, r.endTime) * rateFor(r.date));
  const pending: PendingItem[] = rest.map((r, i) => ({ date: r.date, hours: sessionDurationHours(r.startTime, r.endTime), forecast: restForecast[i], kind: r.kind, bucket: bucketOf(r.date) }));

  const actualByDate = new Map<string, number>();
  for (const s of done) actualByDate.set(s.date, (actualByDate.get(s.date) ?? 0) + (s.actualGmv ?? 0));
  const forecastByDate = new Map<string, number>();
  for (const p of pending) forecastByDate.set(p.date, (forecastByDate.get(p.date) ?? 0) + p.forecast);

  const actual = done.reduce((a, s) => a + (s.actualGmv ?? 0), 0);
  let expectedToDate: number | null = null;
  if (target && through) {
    expectedToDate = 0;
    for (const [d, v] of target.byDate) if (d <= through) expectedToDate += v;
  }
  // Có GMV/giờ 28 ngày (hoặc không còn ca nào) ⇒ chiếu theo giờ. Không có ⇒ phần target còn lại × run-rate nếu đã có
  // run-rate; không có nốt ⇒ không chiếu (audit 2026-09-28 mục 3, cùng luật projectMonthEnd).
  const runRateNow = expectedToDate && expectedToDate > 0 ? actual / expectedToDate : null;
  let projectionMethod: MonthOutlook["projectionMethod"] = "gmv_per_hour";
  let projected = actual + pending.reduce((a, p) => a + p.forecast, 0);
  if (!rates && !forecaster && pending.length > 0) {
    if (target && runRateNow != null && expectedToDate != null) {
      projectionMethod = "run_rate";
      projected = actual + (target.total - expectedToDate) * runRateNow;
    } else projectionMethod = "none";
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
    runRate: runRateNow,
    pending,
    projected,
    rates,
    projectionMethod,
    gap: target && projectionMethod !== "none" ? projected - target.total : null,
    remainingDays,
    needPerRemainingDay: target && remainingDays > 0 ? Math.max(0, target.total - actual) / remainingDays : null,
    actualByDate,
    forecastByDate,
    buckets,
    coneCoef: forecaster ? forecaster.band : undefined,
    forecastModel: forecaster ? "shape" : "rate28",
    shape
  };
}
