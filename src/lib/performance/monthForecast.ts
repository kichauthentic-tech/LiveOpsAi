import { LiveSession } from "../../types";
import { CampDayBucket, getCampaignDayInfo } from "../campaignDays";
import { sessionDurationHours } from "../pnl";
import type { EngineParams } from "../scheduling/engineParams";
import { AllocationModel, SlotLike, fitAllocationModel, glmWeights } from "./allocationModel";
import { normalCdf } from "./forecastCone";
import { isCountable, sessionHours } from "./hostPerformance";
import { assertOnePlatform } from "../platforms/perf";

// ENGINE TARGET v3 (2026-10-10) — dự báo GMV tháng của MỘT kênh (brand × sàn), dùng chung cho Kế Hoạch Tháng (lúc lập) và
// Dashboard / run-rate (trong tháng). Thay đường dự báo tổng của `estimateSlots` (suggestEngine), vốn học ô thứ × khung giờ từ
// MỌI ca kể cả ngày camp rồi lại nhân hệ số camp ⇒ đếm uplift camp hai lần (sai số tổng tháng lúc lập 31% CROCS+VERA, 48% mọi
// kênh; VERA Shopee +37–66%). Bản này dùng đúng mô hình hình dạng đang chia target ca (allocationModel: giờ × loại ngày × khung
// giờ × vị trí ngày) — một khái niệm, một hàm: target ca và dự báo ca cùng một trọng số.
//
//   dự báo ca  = mức × trọng_số(ca) × hệ_số_giờ_vượt_vùng(ngày)
//   mức        = trung bình nhân( mức N ngày gần nhất , mức 3 tháng gần nhất ),  mức của một khoảng = GMV ÷ Σ trọng số
//   trong tháng = GMV đã có + (GMV đã có ÷ kỳ vọng của chính các ca đó)^Z × mức × Σ trọng số ca còn lại
//
// Số đo backtest walk-forward T7–T9 (đề xuất https://claude.ai/artifact/Go5jTAAtVzjCCHxz7H9J98): lúc lập 12–15% (CROCS+VERA),
// sàn với thông tin hiện có vì GMV/giờ của brand tự dao động ±5–30%/tháng; trong tháng ngày 8 / 15 / 18 / 25: 9% / 6% / 4% / 3%.
// Run-rate tuyến tính cùng mốc 32% / 25% / 11% / 9%. Ca đơn lẻ không thể ≤ 5% (sàn 18%) — đánh giá ca bằng dải, không bằng 100%.

export type ForecastParams = Pick<
  EngineParams,
  | "fcRecentDays" | "fcCredibility" | "fcBandBig" | "fcBandSmall" | "fcOutOfRangeFactor" | "fcBiasCorrect" | "fcCheckpointCap"
  | "allocRidge" | "allocUseBand" | "allocUseCampPos"
>;
type BucketOf = (date: string) => CampDayBucket;

const BUCKETS: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];
const fixedBucket: BucketOf = (d) => getCampaignDayInfo(d)?.type ?? "daily";
/** Tháng có ít ca hơn thế không dùng làm mức (tháng mới mở, ngày camp lẻ). */
const MIN_LEVEL_SESSIONS = 8;
/** Kênh "đủ lịch sử" để dùng dải hẹp: ≥ 3 tháng, mỗi tháng ≥ 40 ca. */
const BIG_MONTHS = 3;
const BIG_SESSIONS = 40;
/** Dải 80% ⇒ biên = 1,28 độ lệch chuẩn. */
const Z80 = 1.2816;

const validHistory = (s: LiveSession) => !s.excludedFromReports && s.status === "Completed" && isCountable(s) && (s.actualGmv ?? 0) > 0 && sessionHours(s) > 0.5;
const geo = (xs: number[]) => (xs.length ? Math.exp(xs.reduce((a, v) => a + Math.log(v), 0) / xs.length) : 0);
const addDaysIso = (d: string, n: number) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const p90 = (xs: number[]) => {
  if (xs.length === 0) return Infinity;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(0.9 * (s.length - 1) + 0.5))];
};

export interface LevelPoint {
  month: string;
  sessions: number;
  /** GMV ÷ Σ trọng số hình dạng của các ca tháng đó. */
  level: number;
}

export interface MonthForecaster {
  month: string;
  model: AllocationModel;
  /** Mức dùng để chiếu (đã nhân hệ số hiệu chỉnh lệch nếu bật). */
  level: number;
  levelMonths: LevelPoint[];
  levelRecent: number | null;
  /** Nửa dải 80% lúc lập, tỷ lệ của dự báo. Trong tháng: nửa dải = band × phần dự báo chưa về. */
  band: number;
  big: boolean;
  /** p90 tổng giờ live/ngày theo loại ngày trong 3 tháng gần nhất — vượt thì phần vượt ra ít GMV hơn. */
  dayHoursP90: Record<CampDayBucket, number>;
  /** Lệch dự báo lúc lập của các tháng trước (dự báo ÷ thực tế − 1), cũ → mới. */
  pastErrors: { month: string; error: number }[];
  /** Trung bình lệch các tháng gần nhất (≤ 3), null khi chưa có tháng nào để đo. */
  bias: number | null;
  /** Hệ số đã nhân vào mức (1 khi không hiệu chỉnh). */
  biasFactor: number;
  /** Lịch sử chủ yếu là số nhập tay (chưa đối soát) — độ tin thấp hơn. */
  mostlyManual: boolean;
  params: ForecastParams;
}

/** Mức + mô hình, KHÔNG có hiệu chỉnh lệch (dùng nội bộ để đo lệch của chính các tháng trước). */
function coreFit(history: LiveSession[], month: string, params: ForecastParams) {
  const hist = history.filter((s) => s.date < `${month}-01` && validHistory(s));
  const model = fitAllocationModel(hist, month, { allocEnsembleShare: 1, allocRidge: params.allocRidge, allocMinMonths: 1, allocUseBand: params.allocUseBand, allocUseCampPos: params.allocUseCampPos });
  if (!model) return null;
  const W = (xs: LiveSession[]) => glmWeights(xs, model, fixedBucket).reduce((a, v) => a + v, 0);
  const byMonth = new Map<string, LiveSession[]>();
  for (const s of hist) {
    const m = s.date.slice(0, 7);
    (byMonth.get(m) ?? byMonth.set(m, []).get(m)!).push(s);
  }
  const levelMonths: LevelPoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([m, xs]) => ({ month: m, sessions: xs.length, level: xs.reduce((a, s) => a + s.actualGmv, 0) / Math.max(1e-9, W(xs)) }))
    .filter((p) => p.level > 0 && Number.isFinite(p.level));
  const usable = levelMonths.filter((p) => p.sessions >= MIN_LEVEL_SESSIONS);
  const last = hist.reduce((a, s) => (s.date > a ? s.date : a), "");
  const recent = hist.filter((s) => s.date > addDaysIso(last, -Math.max(1, params.fcRecentDays)));
  const levelRecent = recent.length >= MIN_LEVEL_SESSIONS ? recent.reduce((a, s) => a + s.actualGmv, 0) / Math.max(1e-9, W(recent)) : null;
  const level3 = geo((usable.length ? usable : levelMonths).slice(-3).map((p) => p.level));
  if (!(level3 > 0)) return null;
  const level = levelRecent && levelRecent > 0 ? geo([levelRecent, level3]) : level3;

  // Giờ/ngày p90 theo loại ngày (3 tháng gần nhất có ca) — vùng engine đã thấy.
  const recentMonths = new Set(levelMonths.slice(-3).map((p) => p.month));
  const dayHours = new Map<string, number>();
  for (const s of hist) if (recentMonths.has(s.date.slice(0, 7))) dayHours.set(s.date, (dayHours.get(s.date) ?? 0) + sessionDurationHours(s.startTime, s.endTime));
  const dayHoursP90 = Object.fromEntries(BUCKETS.map((b) => [b, p90([...dayHours.entries()].filter(([d]) => fixedBucket(d) === b).map(([, h]) => h))])) as Record<CampDayBucket, number>;

  const big = usable.length >= BIG_MONTHS && usable.slice(-BIG_MONTHS).every((p) => p.sessions >= BIG_SESSIONS);
  const mostlyManual = hist.filter((s) => s.dataSource === "manual" || !s.dataSource).length > hist.length / 2;
  return { hist, model, level, levelMonths, levelRecent, dayHoursP90, big, mostlyManual };
}

/** Hệ số "giờ vượt vùng" cho từng ca: ngày nào tổng giờ vượt p90 cùng loại ngày thì phần vượt chỉ tính `factor`. */
function outOfRangeFactors(slots: SlotLike[], bucketOf: BucketOf, p90ByBucket: Record<CampDayBucket, number>, factor: number): { perSlot: number[]; excessHours: number } {
  const dayH = new Map<string, number>();
  for (const s of slots) dayH.set(s.date, (dayH.get(s.date) ?? 0) + sessionDurationHours(s.startTime, s.endTime));
  let excessHours = 0;
  const dayF = new Map<string, number>();
  for (const [d, h] of dayH) {
    const cap = p90ByBucket[bucketOf(d)];
    if (!(h > cap) || !Number.isFinite(cap) || h <= 0) { dayF.set(d, 1); continue; }
    excessHours += h - cap;
    dayF.set(d, (cap + (h - cap) * factor) / h);
  }
  return { perSlot: slots.map((s) => dayF.get(s.date) ?? 1), excessHours };
}

/**
 * Bộ dự báo cho tháng `month` từ lịch sử TRƯỚC tháng đó của một kênh. null khi chưa đủ dữ liệu (dưới 15 ca) — nơi gọi rơi về
 * cách cũ. `pastErrors` = dự báo lúc lập của từng tháng trước (chỉ dùng dữ liệu trước tháng đó, lịch = ca đã thực sự chạy).
 */
export function buildMonthForecaster(history: LiveSession[], month: string, params: ForecastParams): MonthForecaster | null {
  // Mức GMV hai sàn khác bản chất (07/10) — một bộ dự báo chỉ cho MỘT kênh.
  assertOnePlatform(history, "buildMonthForecaster");
  const core = coreFit(history, month, params);
  if (!core) return null;
  // Lệch của các tháng trước: dự báo lúc lập (dữ liệu tới ngày 20 tháng trước nữa — đúng nhịp ops lập kế hoạch) ÷ thực tế.
  const pastErrors: { month: string; error: number }[] = [];
  const lastHist = core.hist.reduce((a, s) => (s.date > a ? s.date : a), "");
  for (const p of core.levelMonths.slice(-3)) {
    if (p.sessions < MIN_LEVEL_SESSIONS) continue;
    // Tháng đang chạy dở (lịch sử dừng trước 3 ngày cuối tháng) chưa chấm được — GMV cả tháng chưa có.
    const [py, pm] = p.month.split("-").map(Number);
    if (lastHist < addDaysIso(new Date(Date.UTC(py, pm, 0)).toISOString().slice(0, 10), -2)) continue;
    const [y, m] = p.month.split("-").map(Number);
    const cut = new Date(Date.UTC(y, m - 2, 20)).toISOString().slice(0, 10);
    const prior = coreFit(history.filter((s) => s.date < cut), p.month, params);
    if (!prior) continue;
    const xs = core.hist.filter((s) => s.date.startsWith(p.month));
    const w = glmWeights(xs, prior.model, fixedBucket);
    const f = outOfRangeFactors(xs, fixedBucket, prior.dayHoursP90, params.fcOutOfRangeFactor).perSlot;
    const pred = prior.level * w.reduce((a, v, i) => a + v * f[i], 0);
    const actual = xs.reduce((a, s) => a + s.actualGmv, 0);
    if (actual > 0 && pred > 0) pastErrors.push({ month: p.month, error: pred / actual - 1 });
  }
  const recentErr = pastErrors.slice(-3);
  const bias = recentErr.length ? recentErr.reduce((a, e) => a + e.error, 0) / recentErr.length : null;
  const sameSign = recentErr.length >= 2 && (recentErr.every((e) => e.error > 0) || recentErr.every((e) => e.error < 0));
  // Bù NỬA phần lệch: lệch đo trên 2–3 tháng còn nhiễu, bù hết dễ quá tay khi xu hướng đảo chiều.
  const biasFactor = params.fcBiasCorrect && bias !== null && sameSign && Math.abs(bias) > 0.05 ? 1 / (1 + bias / 2) : 1;
  return {
    month,
    model: core.model,
    level: core.level * biasFactor,
    levelMonths: core.levelMonths,
    levelRecent: core.levelRecent,
    band: core.big ? params.fcBandBig : params.fcBandSmall,
    big: core.big,
    dayHoursP90: core.dayHoursP90,
    pastErrors,
    bias,
    biasFactor,
    mostlyManual: core.mostlyManual,
    params
  };
}

/** Trọng số đã gồm hệ số giờ vượt vùng — tổng tỷ lệ với GMV kỳ vọng. */
export function forecastWeights(f: MonthForecaster, slots: SlotLike[], bucketOf: BucketOf): { weights: number[]; excessHours: number } {
  const w = glmWeights(slots, f.model, bucketOf);
  const o = outOfRangeFactors(slots, bucketOf, f.dayHoursP90, f.params.fcOutOfRangeFactor);
  return { weights: w.map((v, i) => v * o.perSlot[i]), excessHours: o.excessHours };
}

/** GMV kỳ vọng từng ca lúc lập kế hoạch. */
export function slotForecasts(f: MonthForecaster, slots: SlotLike[], bucketOf: BucketOf): number[] {
  return forecastWeights(f, slots, bucketOf).weights.map((w) => w * f.level);
}

export interface PlanOutlook {
  p50: number;
  lo: number;
  hi: number;
  /** Khả năng GMV tháng ≥ target (null khi chưa có target). */
  pHit: number | null;
  perSlot: number[];
  /** Tổng giờ vượt p90 giờ/ngày lịch sử của lưới (0 = mọi ngày trong vùng đã thấy). */
  excessHours: number;
  band: number;
}

/** Dự báo cả lưới lúc lập: P50 + dải 80% + khả năng đạt target (cùng phân phối với Dashboard). */
export function planOutlook(f: MonthForecaster, slots: SlotLike[], bucketOf: BucketOf, target: number): PlanOutlook {
  const { weights, excessHours } = forecastWeights(f, slots, bucketOf);
  const perSlot = weights.map((w) => w * f.level);
  const p50 = perSlot.reduce((a, v) => a + v, 0);
  const half = f.band * p50;
  const sigma = half / Z80;
  const pHit = target > 0 && p50 > 0 ? (sigma > 0 ? 1 - normalCdf((target - p50) / sigma) : p50 >= target ? 1 : 0) : null;
  return { p50, lo: Math.max(0, p50 - half), hi: p50 + half, pHit, perSlot, excessHours, band: f.band };
}

export interface MonthItem extends SlotLike {
  /** GMV thật khi ca đã có số; null = chưa có (sắp tới, hoặc đã qua mà số chưa về). */
  actual: number | null;
}

export interface InMonthProjection {
  /** GMV đã có + dự báo phần còn lại. */
  projected: number;
  actual: number;
  /** Dự báo từng ca chưa có số (cùng thứ tự `items`, 0 với ca đã có số). */
  perItem: number[];
  /** GMV đã có ÷ kỳ vọng của chính các ca đó (null khi chưa có ca nào có số). */
  ratio: number | null;
  /** Phần trọng số của tháng đã có số (0–1). */
  seenShare: number;
  /** Mức đang chiếu cho phần còn lại (đã cập nhật theo số trong tháng). */
  level: number;
  excessHours: number;
}

/**
 * Dự báo cập nhật trong tháng theo hình dạng: chỉ ca CÓ SỐ vào cả tử (GMV) lẫn mẫu (kỳ vọng) — ca đã qua mà chưa có số không bị
 * coi là 0. Tỷ lệ thật ÷ kỳ vọng được tin theo Z = E_đã_có ÷ (E_đã_có + c × E_cả_tháng); c nhỏ (0,05) vì backtest cho thấy kéo
 * mạnh về mức lúc lập làm tệ đi từ ngày 10 trở đi.
 */
export function inMonthProjection(f: MonthForecaster, items: MonthItem[], bucketOf: BucketOf): InMonthProjection {
  const { weights, excessHours } = forecastWeights(f, items, bucketOf);
  let A = 0, Wseen = 0, Wall = 0;
  items.forEach((it, i) => {
    Wall += weights[i];
    if (it.actual !== null) { A += it.actual; Wseen += weights[i]; }
  });
  const Eseen = f.level * Wseen;
  let level = f.level;
  let ratio: number | null = null;
  if (Eseen > 0) {
    ratio = A / Eseen;
    const Z = Wseen / (Wseen + Math.max(0, f.params.fcCredibility) * Wall);
    level = A > 0 ? f.level * Math.exp(Z * Math.log(ratio)) : f.level * (1 - Z);
  }
  const perItem = items.map((it, i) => (it.actual === null ? weights[i] * level : 0));
  return { projected: A + perItem.reduce((a, v) => a + v, 0), actual: A, perItem, ratio, seenShare: Wall > 0 ? Wseen / Wall : 0, level, excessHours };
}

// ---------------------------------------------------------------------------
// P6 — ba mốc điều chỉnh giờ trong tháng
// ---------------------------------------------------------------------------

export type CheckpointKey = "after_dday" | "after_midmonth" | "day20";
export const CHECKPOINT_LABEL: Record<CheckpointKey, string> = {
  after_dday: "Sau đợt D-Day",
  after_midmonth: "Sau Mid-Month",
  day20: "Ngày 20"
};
export interface Checkpoint { key: CheckpointKey; date: string }

/** Ngày của 3 mốc: hôm sau ngày cuối đợt D-Day, hôm sau ngày cuối Mid-Month, ngày 20 (theo khung camp của tháng). Bỏ mốc trùng/ngoài tháng. */
export function checkpointsOf(month: string, days: string[], bucketOf: BucketOf): Checkpoint[] {
  const lastOf = (b: CampDayBucket) => days.filter((d) => bucketOf(d) === b).pop();
  const out: Checkpoint[] = [];
  const dd = lastOf("dday");
  const mm = lastOf("midmonth");
  if (dd) out.push({ key: "after_dday", date: addDaysIso(dd, 1) });
  if (mm) out.push({ key: "after_midmonth", date: addDaysIso(mm, 1) });
  out.push({ key: "day20", date: `${month}-20` });
  const seen = new Set<string>();
  return out
    .filter((c) => c.date.startsWith(month) && !seen.has(c.date) && (seen.add(c.date), true))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface CheckpointAdvice {
  checkpoint: Checkpoint;
  /** Target − dự báo (dương = thiếu). */
  gap: number;
  /** % giờ phần còn lại cần đổi để dự báo chạm target (chưa kẹp). */
  needPct: number;
  /** Sau khi kẹp [0, +cap] — chỉ BÙ thêm, vượt target thì không cắt giờ (vượt là tốt cho agency). */
  pct: number;
  capped: boolean;
  extraHours: number;
  /** Dự báo nếu làm đúng `pct`. */
  projectedAfter: number;
}

/**
 * Giờ cần đổi = ((R̂ + thiếu) ÷ R̂)^(1 ÷ co_giãn) − 1, R̂ = dự báo của các ca còn lại. Co giãn < 1: một giờ thêm ra ít GMV hơn giờ
 * trung bình nên cần thêm nhiều giờ hơn tỷ lệ thiếu. Mô phỏng trên T7–T9 (co giãn 0,82, trần +30%): 9/9 kênh-tháng CROCS+VERA
 * đạt ≥ 95% target; không điều chỉnh: 3/9.
 */
export function checkpointAdvice(checkpoint: Checkpoint, target: number, projected: number, remainingForecast: number, remainingHours: number, elasticity: number, cap: number): CheckpointAdvice | null {
  if (!(target > 0) || !(remainingForecast > 0) || !(remainingHours > 0)) return null;
  const gap = target - projected;
  const el = Math.min(1, Math.max(0.3, elasticity));
  const needPct = Math.pow(Math.max(0.01, (remainingForecast + gap) / remainingForecast), 1 / el) - 1;
  const pct = Math.max(0, Math.min(Math.max(0, cap), needPct));
  const projectedAfter = projected + remainingForecast * (Math.pow(1 + pct, el) - 1);
  return { checkpoint, gap, needPct, pct, capped: needPct > pct + 1e-9, extraHours: remainingHours * pct, projectedAfter };
}

/** Mốc đang hiệu lực hôm nay: mốc gần nhất đã tới (null trước mốc đầu). */
export function activeCheckpoint(list: Checkpoint[], today: string): Checkpoint | null {
  return [...list].reverse().find((c) => c.date <= today) ?? null;
}

// ---------------------------------------------------------------------------
// P7 — backtest walk-forward (AI Training Center) + 4 chỉ số theo dõi
// ---------------------------------------------------------------------------

export const BACKTEST_DAYS = [8, 15, 18, 20] as const;
/** Co giãn giờ dùng cho mô phỏng vòng điều chỉnh (ngày thường CROCS đo 09/10: 0,82). */
const SIM_ELASTICITY = 0.82;

export interface ForecastFold {
  month: string;
  sessions: number;
  actual: number;
  /** Dự báo lúc lập (dữ liệu tới ngày 20 tháng trước, lịch = ca đã thực sự chạy). */
  plan: number;
  planError: number;
  /** |lệch| ≤ nửa dải 80% lúc lập. */
  inBand: boolean;
  band: number;
  /** Sai số dự báo cập nhật ở các ngày `BACKTEST_DAYS` (dự báo ÷ thực tế − 1). */
  inMonth: Record<number, number>;
  /** Mô phỏng 3 mốc điều chỉnh với target = dự báo lúc lập: GMV cuối ÷ target − 1. */
  simulated: number | null;
}

export interface ForecastBacktest {
  folds: ForecastFold[];
  /** Trung bình |lệch| lúc lập. */
  planMape: number | null;
  /** Trung bình lệch có dấu của ≤ 3 tháng gần nhất. */
  bias: number | null;
  coverage: { hit: number; of: number };
  inMonthMape: Record<number, number | null>;
  /** Số tháng |lệch| ≤ 5% ở ngày 18. */
  within5AtDay18: { hit: number; of: number };
  /** Số tháng mô phỏng đạt ≥ 95% target. */
  reach95: { hit: number; of: number };
}

/** Walk-forward trên một kênh: mỗi tháng đã hết chỉ dùng dữ liệu trước nó. Tháng chưa hết (chứa `today`) bỏ qua. */
export function backtestMonthForecast(channel: LiveSession[], params: ForecastParams, today: string): ForecastBacktest {
  assertOnePlatform(channel, "backtestMonthForecast");
  const valid = channel.filter(validHistory);
  const months = [...new Set(valid.map((s) => s.date.slice(0, 7)))].sort().filter((m) => m < today.slice(0, 7));
  const folds: ForecastFold[] = [];
  for (const m of months) {
    const test = valid.filter((s) => s.date.startsWith(m));
    if (test.length < 10) continue;
    const [y, mo] = m.split("-").map(Number);
    const cut = new Date(Date.UTC(y, mo - 2, 20)).toISOString().slice(0, 10);
    const fPlan = buildMonthForecaster(channel.filter((s) => s.date < cut), m, params);
    const fIn = buildMonthForecaster(channel.filter((s) => s.date < `${m}-01`), m, params);
    if (!fPlan || !fIn) continue;
    const actual = test.reduce((a, s) => a + s.actualGmv, 0);
    const plan = planOutlook(fPlan, test, fixedBucket, 0).p50;
    const inMonth: Record<number, number> = {};
    for (const d of BACKTEST_DAYS) {
      const cd = `${m}-${String(d).padStart(2, "0")}`;
      const items = test.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.date <= cd ? s.actualGmv : null }));
      inMonth[d] = inMonthProjection(fIn, items, fixedBucket).projected / actual - 1;
    }
    // Mô phỏng: ở mỗi mốc, giờ phần còn lại đổi theo checkpointAdvice; GMV thật của các ca còn lại nhân (1 + đổi)^co_giãn.
    let simulated: number | null = null;
    if (plan > 0) {
      const y2 = test.map((s) => s.actualGmv);
      const w = forecastWeights(fIn, test, fixedBucket).weights;
      const hrs = test.map((s) => sessionDurationHours(s.startTime, s.endTime));
      for (const cp of checkpointsOf(m, [...new Set(test.map((s) => s.date))].sort(), fixedBucket)) {
        const seen = test.map((s) => s.date < cp.date);
        const A = y2.reduce((a, v, i) => a + (seen[i] ? v : 0), 0);
        const Wd = w.reduce((a, v, i) => a + (seen[i] ? v : 0), 0);
        const Wr = w.reduce((a, v, i) => a + (seen[i] ? 0 : v), 0);
        if (!(Wd > 0) || !(Wr > 0)) continue;
        const Rhat = (A / Wd) * Wr;
        const adv = checkpointAdvice(cp, plan, A + Rhat, Rhat, hrs.reduce((a, v, i) => a + (seen[i] ? 0 : v), 0), SIM_ELASTICITY, params.fcCheckpointCap);
        if (!adv || adv.pct <= 0) continue;
        const f = Math.pow(1 + adv.pct, SIM_ELASTICITY);
        test.forEach((_, i) => { if (!seen[i]) y2[i] *= f; });
      }
      simulated = y2.reduce((a, v) => a + v, 0) / plan - 1;
    }
    folds.push({ month: m, sessions: test.length, actual, plan, planError: plan / actual - 1, inBand: Math.abs(plan - actual) <= fPlan.band * plan, band: fPlan.band, inMonth, simulated });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, v) => a + v, 0) / xs.length : null);
  const last3 = folds.slice(-3);
  return {
    folds,
    planMape: mean(folds.map((f) => Math.abs(f.planError))),
    bias: mean(last3.map((f) => f.planError)),
    coverage: { hit: folds.filter((f) => f.inBand).length, of: folds.length },
    inMonthMape: Object.fromEntries(BACKTEST_DAYS.map((d) => [d, mean(folds.map((f) => Math.abs(f.inMonth[d])))])) as Record<number, number | null>,
    within5AtDay18: { hit: folds.filter((f) => Math.abs(f.inMonth[18]) <= 0.05).length, of: folds.length },
    reach95: { hit: folds.filter((f) => f.simulated !== null && f.simulated >= -0.05).length, of: folds.filter((f) => f.simulated !== null).length }
  };
}

// ---------------------------------------------------------------------------
// Bước 4 — tín hiệu dẫn (ngân sách Ads, scheme khuyến mãi) cho mức tháng: chỉ ĐO, chưa đưa vào dự báo
// ---------------------------------------------------------------------------
// Phần sai số lúc lập (~13%) là biến động mức của brand mà lịch sử ca không chứa: Ads, voucher, hàng mới. App có sẵn hai ô:
// `brand_month_plans.ads_budget` và `promo_schemes`. Hàm này đo trên các tháng ĐÃ có cả tín hiệu lẫn lệch dự báo lúc lập: hồi quy
// lệch (thực tế ÷ dự báo − 1) theo tín hiệu, kiểm leave-one-out — chỉ khi sai số giảm ≥ 2 điểm % mới coi là có lợi. Dưới 3 tháng:
// chưa đủ, không kết luận (quyết định 10/10: thu thập từ T11, đo sau 3 tháng).

export const LEADING_MIN_MONTHS = 3;

export interface LeadingMonth {
  month: string;
  /** Lệch dự báo lúc lập (dự báo ÷ thực tế − 1) — từ backtest hoặc sổ dự báo. */
  planError: number;
  /** Ngân sách Ads của tháng (Kế Hoạch Tháng); null/0 = chưa nhập. */
  adsBudget: number | null;
  /** Phần ngày trong tháng có scheme khuyến mãi của brand (0–1). */
  schemeShare: number;
}

export interface LeadingCheck {
  signal: "ads" | "scheme";
  /** Số tháng đủ dữ liệu cho tín hiệu này. */
  months: number;
  needed: number;
  /** Hệ số: thực tế ÷ dự báo − 1 ≈ slope × (tín hiệu chuẩn hoá). null khi chưa đủ. */
  slope: number | null;
  mapeBefore: number | null;
  mapeAfter: number | null;
  helps: boolean;
}

function looCheck(xs: { x: number; e: number }[], signal: LeadingCheck["signal"]): LeadingCheck {
  const base: LeadingCheck = { signal, months: xs.length, needed: LEADING_MIN_MONTHS, slope: null, mapeBefore: null, mapeAfter: null, helps: false };
  if (xs.length < LEADING_MIN_MONTHS) return base;
  // Lệch theo chiều "thực tế ÷ dự báo − 1": dự báo nhân (1 + slope·x) là đúng hướng hiệu chỉnh.
  const pts = xs.map((p) => ({ x: p.x, r: 1 / (1 + p.e) - 1, e: p.e }));
  const fit = (ps: typeof pts) => {
    const mx = ps.reduce((a, p) => a + p.x, 0) / ps.length, my = ps.reduce((a, p) => a + p.r, 0) / ps.length;
    const sxx = ps.reduce((a, p) => a + (p.x - mx) ** 2, 0);
    const b = sxx > 1e-12 ? ps.reduce((a, p) => a + (p.x - mx) * (p.r - my), 0) / sxx : 0;
    return { a: my - b * mx, b };
  };
  let before = 0, after = 0;
  pts.forEach((p, i) => {
    const f = fit(pts.filter((_, j) => j !== i));
    before += Math.abs(p.e);
    // Dự báo mới = dự báo × (1 + a + b·x) ⇒ lệch mới = (1 + e)(1 + a + b·x) − 1.
    after += Math.abs((1 + p.e) * (1 + f.a + f.b * p.x) - 1);
  });
  const mapeBefore = before / pts.length, mapeAfter = after / pts.length;
  return { ...base, slope: fit(pts).b, mapeBefore, mapeAfter, helps: mapeAfter <= mapeBefore - 0.02 };
}

/** Ads: tín hiệu = log(ngân sách tháng ÷ trung bình nhân ngân sách các tháng có nhập). Scheme: phần ngày có scheme. */
export function leadingSignalCheck(months: LeadingMonth[]): LeadingCheck[] {
  const withAds = months.filter((m) => (m.adsBudget ?? 0) > 0);
  const g = geo(withAds.map((m) => m.adsBudget!));
  return [
    looCheck(withAds.map((m) => ({ x: Math.log(m.adsBudget! / g), e: m.planError })), "ads"),
    // Chưa tháng nào có scheme = chưa nhập dữ liệu (không phải "scheme không ảnh hưởng").
    looCheck(months.some((m) => m.schemeShare > 0) ? months.map((m) => ({ x: m.schemeShare, e: m.planError })) : [], "scheme")
  ];
}

/** Phần ngày của tháng có scheme khuyến mãi (khoảng ngày giao nhau, tính cả hai đầu). */
export function schemeShareOf(month: string, schemes: { start: string; end: string }[]): number {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let hit = 0;
  for (let d = 1; d <= days; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    if (schemes.some((s) => iso >= s.start && iso <= s.end)) hit++;
  }
  return hit / days;
}
