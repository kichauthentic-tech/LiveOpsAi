import type { LiveSession } from "../../types";
import { addDays, eachDay, isoWeekStart } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { CampDayBucket, resolveCampBucketType } from "../campaignDays";
import { METRIC } from "../metricGlossary";
import { fmtVndShort } from "../format";
import type { MetricTotals, PlatformMetricSet } from "../platforms/profiles";
import { assertOnePlatform } from "../platforms/perf";
import { dataSourceTier } from "../dataSource";
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

/** Nhiều kênh cùng sàn: ghép ngày theo khung camp của TỪNG kênh rồi gộp ca (chỉ để cộng số vận hành/GMV trong một sàn). */
export function likeForLikeMany(
  channels: { sessions: LiveSession[]; bucketCur: (d: string) => CampDayBucket }[],
  month: string,
  through: string | null
): { cur: LiveSession[]; prev: LiveSession[]; prevByCurDay: Map<string, LiveSession[]> } {
  const cur: LiveSession[] = [], prev: LiveSession[] = [];
  // Ngày tháng này → ca của ngày cùng loại tháng trước (mỗi kênh ghép theo khung của nó) — đường so sánh của biểu đồ nhỏ.
  const prevByCurDay = new Map<string, LiveSession[]>();
  for (const c of channels) {
    const l = likeForLike(c.sessions, month, through, c.bucketCur);
    cur.push(...l.cur);
    prev.push(...l.prev);
    for (const [cd, pd] of l.pairs) prevByCurDay.set(cd, [...(prevByCurDay.get(cd) ?? []), ...l.prev.filter((s) => s.date === pd)]);
  }
  return { cur, prev, prevByCurDay };
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
  [METRIC.viewsPerHour]: "lưu lượng: Ads (LIVE GMV Max), video kéo vào live, giờ phát",
  [METRIC.viewersPerHour]: "lưu lượng: Ads, video kéo vào live, giờ phát",
  [METRIC.liveCtr]: "host: thứ tự ghim, kịch bản mở đầu",
  [METRIC.ctor]: "host + brand: giá, voucher, tồn kho SKU ghim",
  [METRIC.aov]: "brand: combo, quà tặng",
  [METRIC.atcRate]: "host + brand: xu/voucher live, deal giờ vàng",
  [METRIC.gmvPerAtc]: "brand: combo, giá trị giỏ"
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

export const WAVE_NAME: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Ngày thường" };

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
    c.missingSessions > 0 ? { key: "data", tone: "warn", text: `${c.missingSessions} ca đã chạy chưa có số${c.oldestMissing ? ` (từ ${dm(c.oldestMissing)})` : ""} — dự phóng đang tạm tính${missingForecast > 0 ? ` ~${fmtVndShort(missingForecast)}` : ""} cho phần này` } : null;
  const dataMaterial = !!dataCause && o.projected > 0 && missingForecast >= MATERIAL_PENDING_SHARE * o.projected;
  if (dataCause && dataMaterial) causes.push(dataCause);
  if (f && f.ratio != null && f.ratio > TARGET_HIGH_RATIO)
    causes.push({ key: "target_high", tone: hurting ? "bad" : "warn", text: `Target cao ngay lúc chốt: cần ${fmtVndShort(f.need)}/giờ, ${times(f.ratio)} GMV/giờ 28 ngày trước tháng (${fmtVndShort(f.trailing)})` });
  if (f && f.trailing == null && o.target)
    causes.push({ key: "new_channel", tone: "info", text: "Kênh mới, chưa đủ 28 ngày lịch sử để kiểm target" });
  if (t && t.gmvPerHour.change != null && t.gmvPerHour.change <= -PRODUCTIVITY_SHIFT)
    causes.push({ key: "productivity_down", tone: hurting ? "bad" : "warn", text: `GMV/giờ ngày thường ${signedPct(t.gmvPerHour.change)} so cùng loại ngày tháng trước${t.worst ? `; giảm nhiều nhất ${t.worst.label} ${signedPct(t.worst.change)} (${LEVER_OWNER[t.worst.label] ?? "xem cây GMV"})` : ""}` });
  if (w && w.ratio != null && w.ratio < THIN_WAVE_RATIO)
    causes.push({ key: "thin_wave", tone: "warn", text: `${WAVE_NAME[w.bucket]} ${dm(w.days[0])}–${dm(w.days[w.days.length - 1])} mới xếp ${Math.round(w.scheduledHours)} giờ, mọi khi ~${Math.round(w.usualHours!)} giờ` });
  if (o.remainingDays > 0 && o.actual > 0 && !o.pending.some((p) => p.date >= x.today))
    causes.push({ key: "no_schedule", tone: "bad", text: `Chưa có ca nào trong lịch cho ${o.remainingDays} ngày còn lại` });
  if (t && t.gmvPerHour.change != null && t.gmvPerHour.change >= PRODUCTIVITY_SHIFT)
    causes.push({ key: "productivity_up", tone: "good", text: `GMV/giờ ngày thường ${signedPct(t.gmvPerHour.change)} so cùng loại ngày tháng trước` });
  if (f && f.ratio != null && f.ratio < TARGET_EASY_RATIO)
    causes.push({ key: "target_easy", tone: "good", text: `Target vừa sức: cần ${times(f.ratio)} GMV/giờ lịch sử` });

  if (dataCause && !dataMaterial) causes.push({ ...dataCause, tone: "info" });

  const rr = runRateThrough(o, c.completeThrough).runRate;
  return { landing, label: LANDING_LABEL[landing.key], causes, runRate: rr };
}

// ---------------------------------------------------------------------------
// 6. Kỷ luật dữ liệu
// ---------------------------------------------------------------------------

/** Giờ tối đa có thể có trong một tháng (31 × 24) — cam kết vượt mức này chắc chắn là gõ nhầm ô. */
export const MAX_MONTH_HOURS = 744;

export interface DataDisciplineRow {
  /** Ca chờ số lâu nhất đã chờ bao nhiêu ngày (hôm nay − ngày của ca). 0 = không có ca nào chờ. */
  lagDays: number;
  missingSessions: number;
  /** Phần ca có số mà số còn là khai tay (bậc "manual" — "Tạm tính"), chưa qua file giao ca hay đối soát. */
  manualShare: number | null;
  errors: string[];
}

export function dataDiscipline(x: {
  coverage: DataCoverage;
  today: string;
  monthSessions: LiveSession[];
  commitmentHours?: number | null;
  planTarget?: number | null;
  planSlotSum?: number | null;
}): DataDisciplineRow {
  const lagDays = x.coverage.oldestMissing ? Math.max(0, Math.round((Date.parse(`${x.today}T00:00:00Z`) - Date.parse(`${x.coverage.oldestMissing}T00:00:00Z`)) / 86400000)) : 0;
  const withData = x.monthSessions.filter((s) => isCountable(s) && !s.isBackfill);
  const manual = withData.filter((s) => dataSourceTier(s) === "manual").length;
  const errors: string[] = [];
  if (x.commitmentHours != null && x.commitmentHours > MAX_MONTH_HOURS)
    errors.push(`Cam kết giờ = ${Math.round(x.commitmentHours).toLocaleString("vi-VN")} giờ (một tháng tối đa ${MAX_MONTH_HOURS}) — có thể đã gõ số GMV vào ô giờ`);
  if (x.planTarget != null && x.planSlotSum != null && x.planTarget > 0 && Math.abs(x.planTarget - x.planSlotSum) > Math.max(1000, x.planTarget * 0.001))
    errors.push(`Target tháng ${fmtVndShort(x.planTarget)} khác tổng target ca ${fmtVndShort(x.planSlotSum)}`);
  return { lagDays, missingSessions: x.coverage.missingSessions, manualShare: withData.length ? manual / withData.length : null, errors };
}

// ---------------------------------------------------------------------------
// 7. Tải người (số vận hành — cộng được qua hai sàn: một người là một người)
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

export interface WaveRunRate {
  key: "month" | CampDayBucket;
  label: string;
  days: string[];
  target: number;
  targetToDate: number;
  actual: number;
  runRate: number | null;
  state: "done" | "live" | "next";
  /** Đợt chưa tới: GMV dự phóng của các ca trong lịch. */
  forecast: number | null;
}

/** Cùng luật planRunRate (target theo ca kế hoạch đã chốt, ca huỷ giữ target) — chỉ đổi mốc cắt sang ngày đủ số. */
export function runRateByWave(o: Pick<MonthOutlook, "month" | "target" | "actualByDate" | "buckets">, through: string | null): WaveRunRate[] {
  if (!o.target) return [];
  const t = o.target;
  const line = (days: string[]) => {
    let target = 0, targetToDate = 0, actual = 0;
    for (const d of days) {
      const v = t.byDate.get(d) ?? 0;
      target += v;
      if (through && d <= through) {
        targetToDate += v;
        actual += o.actualByDate.get(d) ?? 0;
      }
    }
    return { target, targetToDate, actual, runRate: targetToDate > 0 ? actual / targetToDate : null };
  };
  const all = eachDay(`${o.month}-01`, monthEndOf(`${o.month}-01`));
  const month: WaveRunRate = { key: "month", label: `Cả tháng ${Number(o.month.slice(5))}`, days: all, ...line(all), state: through && through >= all[all.length - 1] ? "done" : "live", forecast: null };
  const waves = o.buckets
    .filter((b) => b.days.length > 0 && b.target != null && b.target > 0)
    .map((b): WaveRunRate => {
      const l = line(b.days);
      const state: WaveRunRate["state"] = through && b.days[b.days.length - 1] <= through ? "done" : !through || b.days[0] > through ? "next" : "live";
      return { key: b.bucket, label: WAVE_NAME[b.bucket], days: b.days, ...l, state, forecast: state === "next" ? b.forecast : null };
    });
  return [month, ...waves];
}
