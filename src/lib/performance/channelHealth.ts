import type { LiveSession } from "../../types";
import { addDays, eachDay, isoWeekStart } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { CampDayBucket, resolveCampBucketType } from "../campaignDays";
import { METRIC } from "../metricGlossary";
import { noiseBand } from "../report/brandReport";
import { fmtVndShort } from "../format";
import type { MetricTotals, PlatformMetricSet } from "../platforms/profiles";
import { assertOnePlatform } from "../platforms/perf";
import { effectiveSegments } from "../staffSegments";
import { isCountable, sessionHours } from "./hostPerformance";
import { landingOf, LANDING_LABEL, type Landing } from "./forecastCone";
import { monthEndOf, prevMonthOf, RUN_RATE_BAD, RUN_RATE_WARN, type MonthOutlook } from "./ceoBrief";

// Dashboard làm lại đợt 1 (10/10/2026, đề xuất https://claude.ai/artifact/DKuM9K9dLJy1nTvFPPtYNX — user đồng ý cả 4 điểm).
// File thuần, test ở tests/channelHealth.test.ts. Bốn luật đo trên số thật 10/10 mới có, đừng nới:
//
//   1. NGÀY ĐỦ SỐ: một ngày chỉ được chấm khi ≥ 90% giờ ca đã chạy của ngày đó có số. Số đối soát về trễ (trung vị 3 ngày,
//      ~1/7 ca trễ ≥ 7 ngày; giao ca bằng file gần như chưa dùng) ⇒ cắt theo "ngày cuối có số bất kỳ" thì 09/10 có 6/21 ca có
//      số đã thành "Hôm qua 8%", run-rate tháng bị kéo xuống tới khi file về.
//   2. SO CÙNG LOẠI NGÀY: ngày thường thứ k ↔ ngày thường thứ k tháng trước; ngày camp ↔ cùng đợt, cùng vị trí trong đợt.
//      So 01–09/10 với 01–09/09 theo lịch ra GMV "−36%" vì kỳ trước có trọn D-Day, kỳ này mới 1,5 ngày D-Day có số; cùng
//      loại ngày thì GMV/giờ ngày thường +3%.
//   3. MỖI KÊNH MỘT KẾT LUẬN: nhãn = khả năng đạt (forecastCone.landingOf). Run-rate chỉ là số phụ — CROCS 10/10 hiện
//      cùng lúc run-rate 108% (xanh) và "Khó đạt 47%" vì ngày thường vượt còn ba đợt camp nặng nhất chưa tới.
//   4. NGUYÊN NHÂN GỐC theo thứ tự: số chưa về (khi phần tạm tính ≥ 5% dự phóng) → target cao ngay lúc chốt (cần > 1,3× GMV/giờ 28 ngày trước tháng — VERA
//      Shopee ×1,50, JOCKEY TikTok ×1,69 đã "sẽ hụt" từ ngày chốt) → năng suất cùng loại ngày giảm > 10% → lịch đợt tới mỏng.

/** Một ngày "đủ số" khi phần giờ ca có số ≥ ngưỡng này (user chốt 10/10). */
export const COMPLETE_DAY_SHARE = 0.9;
/** Target cần GMV/giờ (theo giờ ca kế hoạch) gấp hơn mức này so với 28 ngày trước tháng ⇒ "target cao ngay lúc chốt" (user chốt 10/10). */
export const TARGET_HIGH_RATIO = 1.3;
/** Target dễ: cần GMV/giờ thấp hơn mức này × lịch sử. */
export const TARGET_EASY_RATIO = 0.85;
/** GMV/giờ ngày thường đổi quá ±10% so với cùng loại ngày tháng trước thì mới nêu là nguyên nhân. */
export const PRODUCTIVITY_SHIFT = 0.1;
/** Lịch đợt camp tới dưới mức này × mọi khi ⇒ "lịch mỏng". */
export const THIN_WAVE_RATIO = 0.8;
/** Phần dự phóng đang tạm tính cho ca đã chạy chưa có số từ mức này trở lên thì "số chưa về" là nguyên nhân chính. */
export const MATERIAL_PENDING_SHARE = 0.05;
/** Số ca tối thiểu mỗi vế để so năng suất / tính GMV/giờ lịch sử. */
export const MIN_COMPARE_SESSIONS = 3;
const TRAILING_DAYS = 28;

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const plannedHours = (s: Pick<LiveSession, "startTime" | "endTime">) => sessionDurationHours(s.startTime, s.endTime);
const signedPct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.round(Math.abs(x) * 100)}%`;
const times = (x: number) => `×${x.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// 1. Ngày đủ số
// ---------------------------------------------------------------------------

export interface DataCoverage {
  /** Ngày cuối mà ≥ 90% giờ ca đã chạy có số (không tính hôm nay — ca hôm nay còn đang chạy). null = chưa ngày nào đủ. */
  completeThrough: string | null;
  /** Ngày cuối có số bất kỳ (cách cắt cũ — `lastDataDate`). */
  lastAny: string | null;
  /** Ca đã chạy (trước hôm nay, không huỷ) mà chưa có số. */
  missingSessions: number;
  missingHours: number;
  oldestMissing: string | null;
  /** Ngày ≤ completeThrough vẫn dưới ngưỡng — số của những ngày này còn tạm. */
  partialBefore: string[];
}

/** `sessions` = ca của phạm vi đang xem (một kênh hoặc nhiều kênh CÙNG sàn — chỉ đếm giờ, không cộng hiệu suất). */
export function dataCoverage(sessions: LiveSession[], today: string, from?: string, to?: string): DataCoverage {
  const byDay = new Map<string, { hours: number; withData: number }>();
  let lastAny: string | null = null;
  let missingSessions = 0, missingHours = 0;
  let oldestMissing: string | null = null;
  for (const s of sessions) {
    if (s.status === "Cancelled" || (from && s.date < from) || (to && s.date > to)) continue;
    const countable = isCountable(s);
    if (countable && s.date <= today && (!lastAny || s.date > lastAny)) lastAny = s.date;
    if (s.date >= today) continue;
    const h = plannedHours(s);
    const x = byDay.get(s.date) ?? { hours: 0, withData: 0 };
    x.hours += h;
    if (countable) x.withData += h;
    else {
      missingSessions++;
      missingHours += h;
      if (!oldestMissing || s.date < oldestMissing) oldestMissing = s.date;
    }
    byDay.set(s.date, x);
  }
  const days = [...byDay.keys()].sort();
  const ok = (d: string) => {
    const x = byDay.get(d)!;
    return x.hours <= 0 || x.withData / x.hours >= COMPLETE_DAY_SHARE;
  };
  // Ngày không có ca nào thì không có gì để chờ: mốc chạy qua ngày trống tới ngay trước ngày có ca đầu tiên còn thiếu số sau ngày đủ
  // cuối cùng (JOCKEY 10/10: đủ tới 04/10, 05–08/10 không có ca, 09/10 chờ số ⇒ đủ tới 08/10, không phải "04/10, trễ 5 ngày").
  let lastOk = -1;
  for (let i = days.length - 1; i >= 0; i--) if (ok(days[i])) { lastOk = i; break; }
  let completeThrough: string | null = null;
  if (lastOk >= 0) {
    const next = days[lastOk + 1];
    completeThrough = next ? addDays(next, -1) : addDays(today, -1);
    if (to && completeThrough > to) completeThrough = to;
  }
  const partialBefore = completeThrough ? days.filter((d) => d <= completeThrough! && !ok(d)) : [];
  return { completeThrough, lastAny, missingSessions, missingHours, oldestMissing, partialBefore };
}

/** Run-rate tới ngày đủ số: Σ GMV ÷ Σ target từng ngày (target theo ca kế hoạch đã chốt — cùng nguồn planRunRate). */
export function runRateThrough(o: Pick<MonthOutlook, "target" | "actualByDate">, through: string | null): { actual: number; expected: number; runRate: number | null } {
  if (!o.target || !through) return { actual: 0, expected: 0, runRate: null };
  let actual = 0, expected = 0;
  for (const [d, v] of o.actualByDate) if (d <= through) actual += v;
  for (const [d, v] of o.target.byDate) if (d <= through) expected += v;
  return { actual, expected, runRate: expected > 0 ? actual / expected : null };
}

// ---------------------------------------------------------------------------
// 2. So cùng loại ngày
// ---------------------------------------------------------------------------

/**
 * Ghép mỗi ngày của tháng đang xem với một ngày CÙNG LOẠI của tháng trước: ngày thường thứ k ↔ ngày thường thứ k; ngày camp ↔
 * cùng đợt, cùng vị trí tính từ đầu đợt (D-Day 08–11/10 có kế hoạch nới ⇒ 08/10 ↔ 07/09, ngày thứ 4 không có cặp). Ngày không có
 * cặp thì không nằm trong Map — hai vế luôn cùng tập loại ngày.
 */
export function matchedPrevDays(curDays: string[], bucketCur: (d: string) => CampDayBucket, bucketPrev: (d: string) => CampDayBucket): Map<string, string> {
  const out = new Map<string, string>();
  if (curDays.length === 0) return out;
  const month = curDays[0].slice(0, 7);
  const pm = prevMonthOf(month);
  const prevDays = eachDay(`${pm}-01`, monthEndOf(`${pm}-01`));
  const group = (days: string[], f: (d: string) => CampDayBucket) => {
    const g = new Map<CampDayBucket, string[]>();
    for (const d of days) g.set(f(d), [...(g.get(f(d)) ?? []), d]);
    return g;
  };
  const curAll = group(eachDay(`${month}-01`, monthEndOf(`${month}-01`)), bucketCur);
  const prevAll = group(prevDays, bucketPrev);
  const wanted = new Set(curDays);
  for (const [b, days] of curAll) {
    const prev = prevAll.get(b) ?? [];
    days.forEach((d, i) => {
      if (wanted.has(d) && prev[i]) out.set(d, prev[i]);
    });
  }
  return out;
}

export interface LikeForLike {
  /** Ngày tháng này (≤ ngày đủ số) có cặp ở tháng trước. */
  pairs: Map<string, string>;
  cur: LiveSession[];
  prev: LiveSession[];
}

/**
 * Hai tập ca để so: tháng này từ đầu tháng tới `through`, tháng trước đúng các ngày đã ghép. `keep` lọc loại ngày (vd chỉ ngày
 * thường cho cây GMV). Ca nhận vào là ca của MỘT kênh (hoặc nhiều kênh cùng sàn, mỗi kênh ghép ngày theo khung camp của chính nó
 * — dùng `likeForLikeMany`).
 */
export function likeForLike(
  sessions: LiveSession[],
  month: string,
  through: string | null,
  bucketCur: (d: string) => CampDayBucket,
  bucketPrev: (d: string) => CampDayBucket = (d) => resolveCampBucketType(d),
  keep: (b: CampDayBucket) => boolean = () => true
): LikeForLike {
  const empty = { pairs: new Map<string, string>(), cur: [], prev: [] };
  if (!through || through < `${month}-01`) return empty;
  const end = through > monthEndOf(`${month}-01`) ? monthEndOf(`${month}-01`) : through;
  const curDays = eachDay(`${month}-01`, end).filter((d) => keep(bucketCur(d)));
  const pairs = matchedPrevDays(curDays, bucketCur, bucketPrev);
  const prevSet = new Set(pairs.values());
  return {
    pairs,
    cur: sessions.filter((s) => pairs.has(s.date) && isCountable(s)),
    prev: sessions.filter((s) => prevSet.has(s.date) && isCountable(s))
  };
}

export interface TreePart {
  label: string;
  change: number;
}

export interface GmvTree {
  gmvPerHour: { cur: number | null; prev: number | null; change: number | null };
  /** Các nhánh tỷ lệ của phễu sàn (bỏ nhánh Giờ live): TikTok Views/giờ · LIVE CTR · CTOR · AOV; Shopee theo tên cột file Shopee. */
  parts: TreePart[];
  /** Nhánh giảm nhiều nhất (null khi không nhánh nào giảm). */
  worst: TreePart | null;
  curSessions: number;
  prevSessions: number;
  curDays: number;
}

export interface FunnelStep { label: string; prev: number; cur: number }
export interface FunnelRate {
  label: string;
  prev: number | null;
  cur: number | null;
  change: number | null;
  /** Ngưỡng "gãy rõ" = dao động 95% (phân số, 0,18 = ±18%) theo số ca của hai kỳ đang so và hệ số dao động đo trên chính kênh này. */
  band: number | null;
  /** Ngưỡng "chú ý" = dao động 80% của cùng công thức (hẹp hơn `band`). */
  watchBand: number | null;
  /** Đổi vượt ngưỡng 95% (cả tăng lẫn giảm): giảm = gãy rõ, tăng = tốt rõ. */
  sig: boolean;
  /** Đổi vượt ngưỡng 80% nhưng chưa tới 95% — chỉ để ý, chưa phải hành động. */
  watch: boolean;
}
export interface LiveFunnelLite {
  /** TikTok: LIVE impressions → Views → Product clicks → Orders; Shopee: Viewers → ATC → Orders. Tổng các ca ghép cặp. */
  steps: FunnelStep[];
  /** Tỷ lệ giữa các bậc (TikTok: ERR · LIVE CTR · CTOR; Shopee: ATC/Viewer · Orders/ATC). */
  rates: FunnelRate[];
  /** Tỷ lệ GIẢM vượt ngưỡng dao động, giảm nhiều nhất (null khi không tỷ lệ nào giảm vượt ngưỡng). */
  worst: FunnelRate | null;
  /** Số ca có số ở kỳ này / kỳ so — ngưỡng dao động tính từ đây. */
  curSessions: number;
  prevSessions: number;
  /** Tên cửa sổ đã dựng phễu (Luỹ kế tháng / 7 ngày) — gắn bởi funnelViews. */
  windowTab?: string;
}

/** Một cửa sổ xem phễu (Luỹ kế tháng / 7 ngày); `funnel` null ⇒ `empty` nói vì sao chưa kết luận. */
export interface FunnelView {
  key: "mtd" | "week";
  tab: string;
  /** Câu mô tả kỳ đang so, vd "29/10 so với 22/10". */
  sub: string;
  funnel: LiveFunnelLite | null;
  empty: string | null;
  /** Cảnh báo cách ghép (vd kỳ này nhiều ngày Campaign hơn kỳ so) — tỷ lệ có thể lệch vì loại ngày, đọc kèm. */
  note: string | null;
}

// ---- hệ số dao động theo từng bậc phễu --------------------------------------------------------------------------
// Đo 31/10/2026 trên 1.075 ca TikTok / 373 ca Shopee đã chạy: CV của tỷ lệ MỘT ca trong nhóm tháng × loại ngày × buổi — ERR 0,22 ·
// LIVE CTR 0,23 · CTOR 0,32 · Orders/ATC 0,42 · ATC/Viewer 0,75 (chỉ 6 nhóm, kẹp 0,60). Dùng làm mặc định khi kênh chưa đủ ca để tự đo.
interface FunnelRateDef { label: string; num: (s: LiveSession) => number | null | undefined; den: (s: LiveSession) => number | null | undefined; cv: number }
const TIKTOK_RATES: FunnelRateDef[] = [
  { label: METRIC.err, num: (s) => s.totalViews, den: (s) => s.impressions, cv: 0.22 },
  { label: METRIC.liveCtr, num: (s) => s.productClicks, den: (s) => s.totalViews, cv: 0.23 },
  { label: METRIC.ctor, num: (s) => s.totalOrders, den: (s) => s.productClicks, cv: 0.32 }
];
const SHOPEE_RATES: FunnelRateDef[] = [
  { label: METRIC.atcRate, num: (s) => s.report?.atcCount, den: (s) => s.totalViews, cv: 0.6 },
  { label: `${METRIC.orders}/${METRIC.atc}`, num: (s) => s.totalOrders, den: (s) => s.report?.atcCount, cv: 0.42 }
];
const CV_MIN = 0.15, CV_MAX = 0.6;
export type FunnelCv = Record<string, number>;

/** CV của tỷ lệ MỘT ca đo trên chính kênh (nhóm tháng × cuối tuần/ngày thường × buổi, gộp theo bậc tự do). Cần ≥ 30 ca nằm trong nhóm ≥ 3 ca, không thì dùng mặc định. */
export function estimateFunnelCv(sessions: LiveSession[]): FunnelCv {
  const out: FunnelCv = {};
  const ran = sessions.filter(isCountable);
  for (const def of [...TIKTOK_RATES, ...SHOPEE_RATES]) {
    const groups = new Map<string, number[]>();
    for (const s of ran) {
      const n = def.num(s), d = def.den(s);
      if (n == null || !(n >= 0) || !(d != null && d > 0)) continue;
      const h = (new Date(s.actualStartAt ?? s.startTime).getUTCHours() + 7) % 24;
      const dow = new Date(`${s.date}T00:00:00Z`).getUTCDay();
      const key = `${s.date.slice(0, 7)}|${dow === 0 || dow === 6 ? "we" : "wd"}|${h < 12 ? "s" : h < 17 ? "c" : "t"}`;
      (groups.get(key) ?? groups.set(key, []).get(key)!).push(n / d);
    }
    let used = 0, df = 0, ss = 0;
    for (const xs of groups.values()) {
      if (xs.length < 3) continue;
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      if (mean <= 0) continue;
      const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1);
      used += xs.length;
      df += xs.length - 1;
      ss += ((xs.length - 1) * v) / (mean * mean);
    }
    if (used >= 30 && df > 0) out[def.label] = Math.min(CV_MAX, Math.max(CV_MIN, Math.sqrt(ss / df)));
  }
  return out;
}

const Z95 = 1.96, Z80 = 1.28;

function funnelRate(def: FunnelRateDef, pn: number, pd: number, cn: number, cd: number, nPrev: number, nCur: number, cvs: FunnelCv): FunnelRate {
  const a = pd > 0 ? (pn / pd) * 100 : null, b = cd > 0 ? (cn / cd) * 100 : null;
  const change = a && b != null ? b / a - 1 : null;
  const bandPct = noiseBand(nPrev, nCur, cvs[def.label] ?? def.cv);
  const band = bandPct == null ? null : bandPct / 100;
  const watchBand = band == null ? null : (band * Z80) / Z95;
  const abs = change == null ? 0 : Math.abs(change);
  const sig = band != null && abs > band;
  return { label: def.label, prev: a, cur: b, change, band, watchBand, sig, watch: !sig && watchBand != null && abs > watchBand };
}
const worstRate = (rates: FunnelRate[]) => [...rates].filter((r) => r.sig && r.change! < 0).sort((a, b) => a.change! - b.change!)[0] ?? null;
/** Tỷ lệ giảm trong khoảng chú ý (80%–95%), giảm nhiều nhất — hiện ở thẻ nhưng KHÔNG vào Hành động đề xuất. */
export const watchRate = (f: LiveFunnelLite) => [...f.rates].filter((r) => r.watch && r.change! < 0).sort((a, b) => a.change! - b.change!)[0] ?? null;

/** Phễu LIVE TikTok cùng tập ca với cây GMV/giờ. Thiếu impressions ở một vế (ca cũ chưa có số) ⇒ null. */
export function liveFunnelLite(l: LikeForLike, cvs: FunnelCv = {}): LiveFunnelLite | null {
  if (l.cur.length < MIN_COMPARE_SESSIONS || l.prev.length < MIN_COMPARE_SESSIONS) return null;
  const has = (s: LiveSession) => (s.impressions ?? 0) > 0;
  const cur = l.cur.filter(has), prev = l.prev.filter(has);
  const sum = (xs: LiveSession[]) => xs.reduce((a, s) => ({ imp: a.imp + (s.impressions ?? 0), views: a.views + (s.totalViews ?? 0), clicks: a.clicks + (s.productClicks ?? 0), orders: a.orders + (s.totalOrders ?? 0) }), { imp: 0, views: 0, clicks: 0, orders: 0 });
  const p = sum(prev), c = sum(cur);
  if (cur.length < MIN_COMPARE_SESSIONS || prev.length < MIN_COMPARE_SESSIONS || p.views <= 0 || c.views <= 0) return null;
  const [err, ctr, ctor] = TIKTOK_RATES;
  const rates = [
    funnelRate(err, p.views, p.imp, c.views, c.imp, prev.length, cur.length, cvs),
    funnelRate(ctr, p.clicks, p.views, c.clicks, c.views, prev.length, cur.length, cvs),
    funnelRate(ctor, p.orders, p.clicks, c.orders, c.clicks, prev.length, cur.length, cvs)
  ];
  return {
    steps: [
      { label: METRIC.liveImpressions, prev: p.imp, cur: c.imp },
      { label: METRIC.views, prev: p.views, cur: c.views },
      { label: METRIC.productClicks, prev: p.clicks, cur: c.clicks },
      { label: METRIC.orders, prev: p.orders, cur: c.orders }
    ],
    rates,
    worst: worstRate(rates),
    curSessions: cur.length,
    prevSessions: prev.length
  };
}

/** Phễu LIVE Shopee (Live List): Viewers → ATC → Orders. Chỉ cộng các ca có số ATC — ca thiếu ATC không được kéo tỷ lệ xuống. */
export function shopeeFunnelLite(l: LikeForLike, cvs: FunnelCv = {}): LiveFunnelLite | null {
  const has = (s: LiveSession) => s.report?.atcCount != null;
  const cur = l.cur.filter(has), prev = l.prev.filter(has);
  if (cur.length < MIN_COMPARE_SESSIONS || prev.length < MIN_COMPARE_SESSIONS) return null;
  const sum = (xs: LiveSession[]) => xs.reduce((a, s) => ({ viewers: a.viewers + (s.totalViews ?? 0), atc: a.atc + (s.report?.atcCount ?? 0), orders: a.orders + (s.totalOrders ?? 0) }), { viewers: 0, atc: 0, orders: 0 });
  const p = sum(prev), c = sum(cur);
  if (p.viewers <= 0 || c.viewers <= 0 || p.atc <= 0 || c.atc <= 0) return null;
  const [atcRate, orderAtc] = SHOPEE_RATES;
  const rates = [
    funnelRate(atcRate, p.atc, p.viewers, c.atc, c.viewers, prev.length, cur.length, cvs),
    funnelRate(orderAtc, p.orders, p.atc, c.orders, c.atc, prev.length, cur.length, cvs)
  ];
  return {
    steps: [
      { label: METRIC.viewers, prev: p.viewers, cur: c.viewers },
      { label: METRIC.atc, prev: p.atc, cur: c.atc },
      { label: METRIC.orders, prev: p.orders, cur: c.orders }
    ],
    rates,
    worst: worstRate(rates),
    curSessions: cur.length,
    prevSessions: prev.length
  };
}

/** Ghép ngày theo thứ: mỗi ngày trong `span` ngày kết thúc ở `end` ghép với đúng ngày đó TUẦN TRƯỚC. `sameType` = chỉ giữ cặp cùng loại ngày (Campaign↔Campaign); dashboard không dùng (xem funnelViews). */
export function weekdayPairedLikeForLike(sessions: LiveSession[], end: string, span: number, bucketOf: (d: string) => CampDayBucket, sameType = true): LikeForLike {
  const pairs = new Map<string, string>();
  for (const d of eachDay(addDays(end, -(span - 1)), end)) {
    const pd = addDays(d, -7);
    if (!sameType || bucketOf(d) === bucketOf(pd)) pairs.set(d, pd);
  }
  const prevSet = new Set(pairs.values());
  return { pairs, cur: sessions.filter((s) => pairs.has(s.date) && isCountable(s)), prev: sessions.filter((s) => prevSet.has(s.date) && isCountable(s)) };
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Luỹ kế tháng: mọi ngày từ mùng 1 tới `through` ghép với CÙNG ngày-của-tháng ở tháng trước (ngày không có ở tháng trước thì bỏ). Không phân loại ngày: mỗi tháng có đúng một bộ ngày Campaign nên hai khoảng tự cân (đo T9/T10: lệch 0 ngày). */
export function monthToDateLikeForLike(sessions: LiveSession[], month: string, through: string): LikeForLike {
  const pairs = new Map<string, string>();
  const [y, m] = month.split("-").map(Number);
  const prevMonth = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const prevLen = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
  const last = through.slice(0, 7) === month ? Number(through.slice(8, 10)) : through > month ? 31 : 0;
  for (let d = 1; d <= last; d++) if (d <= prevLen) pairs.set(`${month}-${String(d).padStart(2, "0")}`, `${prevMonth}-${String(d).padStart(2, "0")}`);
  const prevSet = new Set(pairs.values());
  return { pairs, cur: sessions.filter((s) => pairs.has(s.date) && isCountable(s)), prev: sessions.filter((s) => prevSet.has(s.date) && isCountable(s)) };
}

/**
 * Hai cửa sổ xem phễu cho thẻ kênh (chỉ so cùng kỳ, KHÔNG ghép theo loại ngày — đo 31/10 thì ghép loại ngày làm mất hơn nửa số ca và nhiễu hơn):
 * **Luỹ kế tháng** (mùng 1 → ngày đủ số gần nhất so với tháng trước cùng khoảng ngày; mặc định, ~30 ca) và **7 ngày** (so 7 ngày liền trước,
 * ghép cùng thứ; cảnh báo sớm). Ngưỡng báo động tính theo số ca của từng cửa sổ. Hai kỳ lệch số ngày Campaign ⇒ `note`.
 */
export function funnelViews(x: {
  sessions: LiveSession[];
  funnelOf: (l: LikeForLike, cvs: FunnelCv) => LiveFunnelLite | null;
  through: string | null;
  month: string;
  bucketOf: (d: string) => CampDayBucket;
}): FunnelView[] {
  const cvs = estimateFunnelCv(x.sessions);
  const bucket = (d: string) => (d.slice(0, 7) === x.month ? x.bucketOf(d) : resolveCampBucketType(d));
  const camps = (ds: Iterable<string>) => [...ds].filter((d) => bucket(d) !== "daily").length;
  const thin = (l: LikeForLike) => (l.pairs.size === 0 ? "Chưa có ngày đủ số để so." : `Mới ${l.cur.length} ca kỳ này và ${l.prev.length} ca kỳ so — cần ≥ ${MIN_COMPARE_SESSIONS} ca có số ở mỗi kỳ.`);
  const mk = (key: FunnelView["key"], tab: string, sub: string, l: LikeForLike): FunnelView => {
    const raw = x.funnelOf(l, cvs);
    const funnel = raw ? { ...raw, windowTab: tab } : null;
    const a = camps(l.pairs.keys()), b = camps(l.pairs.values());
    const note = funnel && a !== b ? `Kỳ này có ${a} ngày Campaign, kỳ so ${b} — tỷ lệ có thể lệch vì camp, đọc kèm.` : null;
    return { key, tab, sub, funnel, empty: funnel ? null : thin(l), note };
  };
  const E = x.through;
  const none: LikeForLike = { pairs: new Map<string, string>(), cur: [], prev: [] };
  const mtd = E ? monthToDateLikeForLike(x.sessions, x.month, E) : none;
  const week = E ? weekdayPairedLikeForLike(x.sessions, E, 7, bucket, false) : none;
  const mtdDays = [...mtd.pairs.keys()].sort(), mtdPrev = [...mtd.pairs.values()].sort();
  return [
    mk("mtd", "Luỹ kế tháng", mtdDays.length ? `${ddmm(mtdDays[0])}–${ddmm(mtdDays[mtdDays.length - 1])} so với ${ddmm(mtdPrev[0])}–${ddmm(mtdPrev[mtdPrev.length - 1])}` : "chưa có ngày đủ số", mtd),
    mk("week", "7 ngày", E ? `${ddmm(addDays(E, -6))}–${ddmm(E)} so với 7 ngày liền trước, ghép cùng thứ` : "chưa có ngày đủ số", week)
  ];
}

/** Cây GMV/giờ ngày thường, cùng loại ngày. Thiếu ca ở một vế (< 3 ca) ⇒ null — không kết luận trên 1–2 ca. */
export function gmvTree(metrics: PlatformMetricSet, l: LikeForLike): GmvTree | null {
  if (l.cur.length < MIN_COMPARE_SESSIONS || l.prev.length < MIN_COMPARE_SESSIONS) return null;
  const a: MetricTotals = metrics.ofSessions(l.prev, sessionHours);
  const b: MetricTotals = metrics.ofSessions(l.cur, sessionHours);
  const pa = metrics.value(a, "gmvPerHour"), pb = metrics.value(b, "gmvPerHour");
  const d = metrics.drivers(a, b);
  const parts = (d?.parts ?? []).filter((p) => p.label !== METRIC.liveHours && isFinite(p.change));
  const worst = [...parts].sort((x, y) => x.change - y.change)[0];
  return {
    gmvPerHour: { cur: pb, prev: pa, change: pa && pb != null ? pb / pa - 1 : null },
    parts,
    worst: worst && worst.change < 0 ? worst : null,
    curSessions: l.cur.length,
    prevSessions: l.prev.length,
    curDays: new Set(l.cur.map((s) => s.date)).size
  };
}

/** Người giữ đòn bẩy của từng nhánh — để dòng nguyên nhân nói "ai làm gì", không chỉ "số nào giảm". */
export const LEVER_OWNER: Record<string, string> = {
  [METRIC.viewsPerHour]: "traffic — Ads (LIVE GMV Max), video dẫn traffic vào live, khung giờ live",
  [METRIC.viewersPerHour]: "traffic — Ads, video dẫn traffic vào live, khung giờ live",
  [METRIC.err]: "traffic — tiêu đề, ảnh bìa và Ads kéo người xem vào phiên",
  [METRIC.liveCtr]: "host — thứ tự ghim sản phẩm, kịch bản mở đầu",
  [METRIC.ctor]: "host và brand — giá, voucher, tồn kho SKU ghim",
  [METRIC.aov]: "brand — combo, quà tặng kèm",
  [METRIC.atcRate]: "host và brand — xu/voucher live, flash deal giờ vàng",
  [METRIC.gmvPerAtc]: "brand — combo, giá trị giỏ hàng"
};

// ---------------------------------------------------------------------------
// 3. Target lúc chốt
// ---------------------------------------------------------------------------

export interface TargetFeasibility {
  target: number;
  /** Giờ ca kế hoạch (theo lịch). */
  hours: number;
  /** Target ÷ giờ ca kế hoạch. */
  need: number | null;
  /** GMV ÷ giờ ca (theo lịch) của 28 ngày trước tháng. null = chưa đủ ca (kênh mới). */
  trailing: number | null;
  ratio: number | null;
}

/** `planSlots` = ca của Kế Hoạch Tháng đã chốt (target từng ca). `sessions` = mọi ca của kênh (cần 28 ngày trước tháng). */
export function targetFeasibility(sessions: LiveSession[], month: string, planSlots: { startTime: string; endTime: string; targetGmv: number }[]): TargetFeasibility | null {
  if (planSlots.length === 0) return null;
  const target = planSlots.reduce((a, s) => a + Math.max(0, s.targetGmv || 0), 0);
  const hours = planSlots.reduce((a, s) => a + plannedHours(s), 0);
  if (target <= 0 || hours <= 0) return null;
  const from = addDays(`${month}-01`, -TRAILING_DAYS), to = addDays(`${month}-01`, -1);
  const hist = sessions.filter((s) => isCountable(s) && s.date >= from && s.date <= to);
  assertOnePlatform(hist, "targetFeasibility");
  const hh = hist.reduce((a, s) => a + plannedHours(s), 0);
  const trailing = hist.length >= 5 && hh > 0 ? hist.reduce((a, s) => a + (s.actualGmv ?? 0), 0) / hh : null;
  const need = target / hours;
  return { target, hours, need, trailing, ratio: trailing ? need / trailing : null };
}

// ---------------------------------------------------------------------------
// 4. Đợt camp kế tiếp
// ---------------------------------------------------------------------------

export interface WaveReadiness {
  bucket: CampDayBucket;
  days: string[];
  status: "live" | "next";
  /** Giờ ca trong lịch của đợt (ca chưa huỷ + ca mở chưa có người). */
  scheduledHours: number;
  /** Trung bình giờ của cùng loại đợt ở tối đa 3 tháng trước có chạy. null = chưa có tháng nào để so. */
  usualHours: number | null;
  ratio: number | null;
  sessions: number;
  noHost: number;
  noAssistant: number;
}

/** Đợt camp đang chạy hoặc sắp tới gần nhất trong tháng (không tính ngày thường). */
export function nextWaveReadiness(
  sessions: LiveSession[],
  openSlotHoursByDate: Map<string, number>,
  month: string,
  today: string,
  bucketCur: (d: string) => CampDayBucket
): WaveReadiness | null {
  const days = eachDay(`${month}-01`, monthEndOf(`${month}-01`));
  const waves: { bucket: CampDayBucket; days: string[] }[] = [];
  for (const d of days) {
    const b = bucketCur(d);
    if (b === "daily") continue;
    const last = waves[waves.length - 1];
    if (last && last.bucket === b && addDays(last.days[last.days.length - 1], 1) === d) last.days.push(d);
    else waves.push({ bucket: b, days: [d] });
  }
  const w = waves.find((x) => x.days[x.days.length - 1] >= today);
  if (!w) return null;
  const inWave = sessions.filter((s) => w.days.includes(s.date) && s.status !== "Cancelled");
  const scheduledHours = inWave.reduce((a, s) => a + plannedHours(s), 0) + w.days.reduce((a, d) => a + (openSlotHoursByDate.get(d) ?? 0), 0);
  // Mọi khi: các tháng trước có ca, cùng loại đợt theo lịch cố định (khung kế hoạch tháng cũ không còn ở đây).
  const hist: number[] = [];
  let m = month;
  for (let i = 0; i < 6 && hist.length < 3; i++) {
    m = prevMonthOf(m);
    const mDays = eachDay(`${m}-01`, monthEndOf(`${m}-01`));
    const monthSessions = sessions.filter((s) => s.date.startsWith(m) && s.status !== "Cancelled");
    if (monthSessions.length === 0) continue;
    const wd = new Set(mDays.filter((d) => resolveCampBucketType(d) === w.bucket));
    hist.push(monthSessions.filter((s) => wd.has(s.date)).reduce((a, s) => a + plannedHours(s), 0));
  }
  const usualHours = hist.length ? hist.reduce((a, v) => a + v, 0) / hist.length : null;
  return {
    bucket: w.bucket,
    days: w.days,
    status: w.days[0] <= today ? "live" : "next",
    scheduledHours,
    usualHours,
    ratio: usualHours && usualHours > 0 ? scheduledHours / usualHours : null,
    sessions: inWave.length,
    noHost: inWave.filter((s) => !s.hostId && !s.hostName).length,
    noAssistant: inWave.filter((s) => !s.coHostId && !s.coHostName).length
  };
}

// ---------------------------------------------------------------------------
// 5. Một kết luận + nguyên nhân gốc
// ---------------------------------------------------------------------------

export type CauseKey = "data" | "target_high" | "new_channel" | "productivity_down" | "thin_wave" | "no_schedule" | "productivity_up" | "target_easy";
export interface Cause {
  key: CauseKey;
  tone: "bad" | "warn" | "good" | "info";
  text: string;
}

export interface ChannelVerdict {
  landing: Landing;
  label: string;
  /** Xếp theo thứ tự luật 4 — dòng đầu là nguyên nhân chính. */
  causes: Cause[];
  /** Run-rate tới ngày đủ số (số phụ). */
  runRate: number | null;
}

export const WAVE_NAME: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Daily" };

export function channelVerdict(x: {
  outlook: MonthOutlook;
  coverage: DataCoverage;
  feasibility: TargetFeasibility | null;
  tree: GmvTree | null;
  wave: WaveReadiness | null;
  today: string;
}): ChannelVerdict {
  const { outlook: o, coverage: c, feasibility: f, tree: t, wave: w } = x;
  const landing = landingOf(o);
  const causes: Cause[] = [];
  const hurting = landing.key === "short" || landing.key === "unlikely";

  // Số chưa về chỉ đứng đầu khi phần đang tạm tính đủ lớn để đổi kết luận (≥ 5% dự phóng). Nhỏ hơn thì xuống cuối danh sách —
  // 10/10 cả 4 kênh TikTok đều có 1–4 ca chờ số (1–4% dự phóng), để lên đầu là che mất VERA −47% GMV/giờ.
  const missingForecast = o.pending.filter((p) => p.kind === "session" && p.date < x.today).reduce((a, p) => a + p.forecast, 0);
  const dataCause: Cause | null =
    c.missingSessions > 0 ? { key: "data", tone: "warn", text: `${c.missingSessions} ca đã live chưa có số liệu${c.oldestMissing ? ` (từ ${dm(c.oldestMissing)})` : ""} — dự báo đang tạm tính${missingForecast > 0 ? ` ~${fmtVndShort(missingForecast)}` : ""} cho phần này` } : null;
  const dataMaterial = !!dataCause && o.projected > 0 && missingForecast >= MATERIAL_PENDING_SHARE * o.projected;
  if (dataCause && dataMaterial) causes.push(dataCause);
  if (f && f.ratio != null && f.ratio > TARGET_HIGH_RATIO)
    causes.push({ key: "target_high", tone: hurting ? "bad" : "warn", text: `Target cao ngay lúc chốt: cần ${fmtVndShort(f.need)}/giờ, ${times(f.ratio)} GMV/giờ 28 ngày trước tháng (${fmtVndShort(f.trailing)})` });
  if (f && f.trailing == null && o.target)
    causes.push({ key: "new_channel", tone: "info", text: "Kênh mới, chưa đủ 28 ngày lịch sử để kiểm target" });
  if (t && t.gmvPerHour.change != null && t.gmvPerHour.change <= -PRODUCTIVITY_SHIFT)
    causes.push({ key: "productivity_down", tone: hurting ? "bad" : "warn", text: `GMV/giờ ngày Daily ${signedPct(t.gmvPerHour.change)} so cùng loại ngày tháng trước${t.worst ? `; giảm mạnh nhất ${t.worst.label} ${signedPct(t.worst.change)} (${LEVER_OWNER[t.worst.label] ?? "xem phân rã GMV"})` : ""}` });
  if (w && w.ratio != null && w.ratio < THIN_WAVE_RATIO)
    causes.push({ key: "thin_wave", tone: "warn", text: `${WAVE_NAME[w.bucket]} ${dm(w.days[0])}–${dm(w.days[w.days.length - 1])} mới xếp ${Math.round(w.scheduledHours)} giờ, mức thông thường ~${Math.round(w.usualHours!)} giờ` });
  if (o.remainingDays > 0 && o.actual > 0 && !o.pending.some((p) => p.date >= x.today))
    causes.push({ key: "no_schedule", tone: "bad", text: `Chưa có ca nào trong lịch cho ${o.remainingDays} ngày còn lại` });
  if (t && t.gmvPerHour.change != null && t.gmvPerHour.change >= PRODUCTIVITY_SHIFT)
    causes.push({ key: "productivity_up", tone: "good", text: `GMV/giờ ngày Daily ${signedPct(t.gmvPerHour.change)} so cùng loại ngày tháng trước` });
  if (f && f.ratio != null && f.ratio < TARGET_EASY_RATIO)
    causes.push({ key: "target_easy", tone: "good", text: `Target vừa sức: cần ${times(f.ratio)} GMV/giờ lịch sử` });

  if (dataCause && !dataMaterial) causes.push({ ...dataCause, tone: "info" });

  const rr = runRateThrough(o, c.completeThrough).runRate;
  return { landing, label: LANDING_LABEL[landing.key], causes, runRate: rr };
}

// ---------------------------------------------------------------------------
// 6. Kỷ luật dữ liệu
// ---------------------------------------------------------------------------

export interface PersonLoad {
  talentId: string;
  name: string;
  hostHours: number;
  assistantHours: number;
  /** Số ngày đứng quá `dayLimit` giờ (host + trợ cộng lại). */
  heavyDays: number;
  /** Tuần (T2–CN) nhiều giờ nhất và số giờ của tuần đó. */
  peakWeek: { start: string; hours: number } | null;
  /** Kênh brand × sàn người này đứng trong kỳ ("CROCS", "VERA · Shopee"). */
  channels: string[];
}

/**
 * Giờ đứng ca của từng người trong [from, to] theo ĐOẠN hiệu lực (lib/staffSegments — đổi người giữa ca chia đúng phút),
 * ca chưa huỷ, gồm cả ca sắp tới (để thấy quá tải trước khi xảy ra). `channelOf` đặt tên kênh của ca.
 */
export function peopleLoad(sessions: LiveSession[], from: string, to: string, channelOf: (s: LiveSession) => string, dayLimit: number): PersonLoad[] {
  const map = new Map<string, { name: string; host: number; asst: number; byDay: Map<string, number>; byWeek: Map<string, number>; channels: Set<string> }>();
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date < from || s.date > to) continue;
    for (const g of effectiveSegments(s)) {
      const h = (g.toMin - g.fromMin) / 60;
      if (h <= 0) continue;
      const x = map.get(g.talentId) ?? { name: g.talentName, host: 0, asst: 0, byDay: new Map(), byWeek: new Map(), channels: new Set() };
      if (g.role === "host") x.host += h;
      else x.asst += h;
      if (!x.name && g.talentName) x.name = g.talentName;
      x.byDay.set(s.date, (x.byDay.get(s.date) ?? 0) + h);
      const w = isoWeekStart(s.date);
      x.byWeek.set(w, (x.byWeek.get(w) ?? 0) + h);
      x.channels.add(channelOf(s));
      map.set(g.talentId, x);
    }
  }
  return [...map.entries()]
    .map(([talentId, x]) => {
      const peak = [...x.byWeek.entries()].sort((a, b) => b[1] - a[1])[0];
      return {
        talentId,
        name: x.name || talentId,
        hostHours: x.host,
        assistantHours: x.asst,
        heavyDays: [...x.byDay.values()].filter((h) => h > dayLimit).length,
        peakWeek: peak ? { start: peak[0], hours: peak[1] } : null,
        channels: [...x.channels].sort()
      };
    })
    .sort((a, b) => b.hostHours + b.assistantHours - (a.hostHours + a.assistantHours));
}

// ---------------------------------------------------------------------------
// 8. Thang run-rate cắt ở ngày đủ số (tháng + từng đợt; KHÔNG còn hàng Hôm qua / Hôm nay — đó là việc của Bảng Vận Hành)
// ---------------------------------------------------------------------------

export type RunRateTone = "good" | "warn" | "bad" | "none";
/** Màu của một run-rate theo ngưỡng chung của app (85% / 95%). */
export const runRateTone = (v: number | null): RunRateTone => (v == null ? "none" : v >= RUN_RATE_WARN ? "good" : v >= RUN_RATE_BAD ? "warn" : "bad");
