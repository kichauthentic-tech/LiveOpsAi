import { LiveSession } from "../../types";
import { CampDayBucket, getCampaignDayInfo } from "../campaignDays";
import { sessionDurationHours } from "../pnl";
import { assertOnePlatform } from "../platforms/perf";
import type { EngineParams } from "../scheduling/engineParams";
import { isCountable, sessionHours } from "./hostPerformance";
import { TargetWeightModel, targetWeightModel, targetWeights } from "./slotInsights";

// ENGINE CHIA TARGET CA v2 (2026-10-09) — chia Target GMV tháng của một kênh (brand × sàn) xuống từng ca của Kế Hoạch Tháng.
// Toàn hàm thuần, test ở tests/allocationModel.test.ts; tham số chỉnh ở AI Training Center (EngineParams `alloc*`), cũng ở đó
// có bảng backtest để thấy mỗi lần vặn tham số sai số đổi ra sao.
//
// Trọng số ca = số giờ × exp(loại ngày + khung giờ bắt đầu + vị trí ngày trong đợt Mid-Month/Pay Day). Ba nhóm hệ số được fit ĐỒNG
// THỜI bằng hồi quy Poisson có phạt ridge (mô hình nhân), mỗi tháng một mức nền riêng nên tháng yếu (T9) không kéo lệch hệ số.
// Sau đó trộn với cách cũ (`targetWeights` của slotInsights) — hai cách sai theo hướng khác nhau nên trung bình bù cho nhau.
//
// Số đo backtest walk-forward (CROCS TikTok T8+T9, chỉ dùng tháng TRƯỚC để đoán tháng sau, chia đúng tổng tháng; sai số tuyệt đối
// ÷ GMV thật theo ca): chia theo giờ 27,2% · cách cũ 22,8% · công thức nhân hệ số gộp biên 23,0–23,3% · GLM 22,0% · trộn 50/50 21,8%.
// Mỗi nhóm hệ số đóng góp ~1,3 điểm %; cả hai ~3 điểm %. Phần sai số còn lại (~22%, trần fit ngay trên tháng test 18%) là nhiễu từng
// ca. Đã thử và KHÔNG giúp (đừng thử lại không có lý do mới): thứ trong tuần, tuần trong tháng, tương tác loại ngày × khung, ô trực
// tiếp khi n ≥ 5, vị trí ngày trong D-Day, log giờ, trọng số tháng gần, cắt ngoại lệ, cập nhật bằng nửa đầu tháng, học chung nhiều brand.

type BucketOf = (date: string) => CampDayBucket;
export type SlotLike = { date: string; startTime: string; endTime: string };
export type AllocParams = Pick<EngineParams, "allocEnsembleShare" | "allocRidge" | "allocMinMonths" | "allocUseBand" | "allocUseCampPos">;

/** Khung theo GIỜ BẮT ĐẦU ca. Ranh giới không ảnh hưởng độ chính xác (21,9–22,5% với mọi cách cắt đã thử) — chọn theo vận hành. */
export const ALLOC_BAND_LABEL = ["Sáng (đến 11h)", "Trưa 11–14h", "Chiều 14–18h", "Tối vàng 18–21h", "Đêm từ 21h"] as const;
const BAND_CUTS = [11, 14, 18, 21];
const BANDS = ALLOC_BAND_LABEL.length;
export const allocBand = (startTime: string): number => {
  const h = Number(startTime.slice(0, 2)) + Number(startTime.slice(3, 5) || 0) / 60;
  if (h < 6) return BANDS - 1; // 0–6h là đêm khuya hôm trước
  return BAND_CUTS.filter((cut) => h >= cut).length;
};

/** Lịch sử luôn xếp loại theo lịch cố định (quy ước 07/10: khung camp nhập tay của THÁNG ĐANG LẬP không áp lên tháng cũ). */
const bucketOfFixed: BucketOf = (d) => {
  const t = getCampaignDayInfo(d)?.type;
  return t ?? "daily";
};

const MIN_ROWS = 15;
const POS = 3;
const isPosBucket = (b: CampDayBucket) => b === "midmonth" || b === "payday";

interface Row { month: string; bucket: CampDayBucket; band: number; pos: number; hours: number; y: number }

/** Vị trí 0..2 trong đợt từ lịch cố định; ngày camp tay (ngoài lịch) thì -1 và để caller xếp theo thứ tự ngày. */
const calendarPos = (date: string, bucket: CampDayBucket): number => {
  if (!isPosBucket(bucket)) return -1;
  const info = getCampaignDayInfo(date);
  return info && info.type === bucket ? Math.min(POS - 1, info.spanIndex) : -1;
};

const validHistory = (s: LiveSession) => !s.excludedFromReports && s.status === "Completed" && isCountable(s) && (s.actualGmv ?? 0) > 0 && sessionHours(s) > 0.5;

export interface AllocationModel {
  /** Hệ số so với ngày thường (=1). */
  bucket: Record<CampDayBucket, number>;
  /** Hệ số từng khung, chuẩn hoá để trung bình theo giờ lịch sử = 1. Tắt khung ⇒ toàn 1. */
  band: number[];
  bandSessions: number[];
  /** Hệ số vị trí ngày 1/2/3 trong đợt Mid-Month/Pay Day, chuẩn hoá trung bình = 1. Tắt ⇒ toàn 1. */
  pos: number[];
  months: string[];
  sessions: number;
  useBand: boolean;
  useCampPos: boolean;
  /** log-hệ số thô, đúng thứ tự cột — dùng để tính trọng số. */
  coef: { bucket: Record<CampDayBucket, number>; band: number[]; pos: number[] };
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r;
    [M[i], M[p]] = [M[p], M[i]];
    const d = M[i][i] || 1e-12;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = M[r][i] / d;
      if (f) for (let c = i; c <= n; c++) M[r][c] -= f * M[i][c];
    }
  }
  return M.map((r, i) => r[n] / (r[i] || 1e-12));
}

/** Hồi quy Poisson (quasi) có phạt ridge: y ~ exp(β·x) · giờ, mỗi tháng một mức nền (không phạt). */
export function fitAllocationModel(history: LiveSession[], month: string, params: AllocParams): AllocationModel | null {
  const rows: Row[] = history
    .filter((s) => s.date < `${month}-01` && validHistory(s))
    .map((s) => {
      const bucket = bucketOfFixed(s.date);
      return { month: s.date.slice(0, 7), bucket, band: allocBand(s.startTime), pos: Math.max(0, calendarPos(s.date, bucket)), hours: sessionDurationHours(s.startTime, s.endTime), y: s.actualGmv / 1e6 };
    })
    .filter((r) => r.hours > 0);
  const months = [...new Set(rows.map((r) => r.month))].sort();
  if (months.length < Math.max(1, params.allocMinMonths) || rows.length < MIN_ROWS) return null;

  const { allocUseBand: useBand, allocUseCampPos: useCampPos } = params;
  const nMonth = months.length - 1;
  const cols = 1 + nMonth + 3 + (useBand ? BANDS : 0) + (useCampPos ? POS : 0);
  const pen = new Array<number>(cols).fill(0);
  const x = rows.map((r) => {
    const v = new Array<number>(cols).fill(0);
    let c = 0;
    v[c++] = 1;
    for (let m = 1; m < months.length; m++) v[c++] = r.month === months[m] ? 1 : 0;
    for (const b of ["dday", "midmonth", "payday"] as CampDayBucket[]) { pen[c] = params.allocRidge; v[c++] = r.bucket === b ? 1 : 0; }
    if (useBand) for (let k = 0; k < BANDS; k++) { pen[c] = params.allocRidge; v[c++] = r.band === k ? 1 : 0; }
    if (useCampPos) for (let p = 0; p < POS; p++) { pen[c] = params.allocRidge; v[c++] = isPosBucket(r.bucket) && r.pos === p ? 1 : 0; }
    return v;
  });
  const off = rows.map((r) => Math.log(r.hours));
  let beta = new Array<number>(cols).fill(0);
  beta[0] = Math.log(rows.reduce((a, r) => a + r.y, 0) / rows.reduce((a, r) => a + r.hours, 0));
  for (let it = 0; it < 30; it++) {
    const A = Array.from({ length: cols }, () => new Array<number>(cols).fill(0));
    const b = new Array<number>(cols).fill(0);
    let mw = 0;
    rows.forEach((r, i) => {
      const eta = x[i].reduce((a, v, j) => a + v * beta[j], 0) + off[i];
      const mu = Math.exp(Math.min(eta, 40));
      mw += mu;
      const z = eta - off[i] + (r.y - mu) / mu;
      for (let j = 0; j < cols; j++) {
        if (!x[i][j]) continue;
        b[j] += mu * z;
        for (let k = 0; k < cols; k++) if (x[i][k]) A[j][k] += mu;
      }
    });
    mw /= rows.length;
    // λ tính theo đơn vị "quan sát ảo" nên nhân với trọng số trung bình
    for (let j = 0; j < cols; j++) A[j][j] += pen[j] * mw;
    beta = solve(A, b);
    if (beta.some((v) => !Number.isFinite(v))) return null;
  }

  let c = 1 + nMonth;
  const coefBucket: Record<CampDayBucket, number> = { daily: 0, dday: beta[c++], midmonth: beta[c++], payday: beta[c++] };
  const coefBand = useBand ? beta.slice(c, (c += BANDS)) : new Array<number>(BANDS).fill(0);
  const coefPos = useCampPos ? beta.slice(c, c + POS) : new Array<number>(POS).fill(0);

  // Chuẩn hoá hệ số hiển thị: trung bình theo giờ lịch sử = 1 (hệ số thô chỉ có nghĩa tương đối).
  const hrs = rows.reduce((a, r) => a + r.hours, 0);
  const bandMean = rows.reduce((a, r) => a + r.hours * Math.exp(coefBand[r.band]), 0) / hrs;
  const posRows = rows.filter((r) => isPosBucket(r.bucket));
  const posHrs = posRows.reduce((a, r) => a + r.hours, 0);
  const posMean = posHrs > 0 ? posRows.reduce((a, r) => a + r.hours * Math.exp(coefPos[r.pos]), 0) / posHrs : 1;
  return {
    bucket: { daily: 1, dday: Math.exp(coefBucket.dday), midmonth: Math.exp(coefBucket.midmonth), payday: Math.exp(coefBucket.payday) },
    band: coefBand.map((v) => Math.exp(v) / bandMean),
    bandSessions: Array.from({ length: BANDS }, (_, k) => rows.filter((r) => r.band === k).length),
    pos: coefPos.map((v) => Math.exp(v) / posMean),
    months,
    sessions: rows.length,
    useBand,
    useCampPos,
    coef: { bucket: coefBucket, band: coefBand, pos: coefPos }
  };
}

/** Trọng số chia target của từng ca theo mô hình đã fit. `bucketOf` của các ca có thể mang khung camp nhập tay của tháng. */
export function glmWeights(slots: SlotLike[], model: AllocationModel, bucketOf: BucketOf): number[] {
  // Ngày camp ngoài lịch cố định (khung nhập tay): vị trí = thứ tự ngày trong chính lưới.
  const campDays = new Map<string, string[]>();
  for (const s of slots) {
    const b = bucketOf(s.date);
    if (!isPosBucket(b) || calendarPos(s.date, b) >= 0) continue;
    const l = campDays.get(b) ?? [];
    if (!l.includes(s.date)) l.push(s.date);
    campDays.set(b, l.sort());
  }
  return slots.map((s) => {
    const b = bucketOf(s.date);
    let logw = model.coef.bucket[b] + model.coef.band[allocBand(s.startTime)];
    if (isPosBucket(b)) {
      const cal = calendarPos(s.date, b);
      const p = cal >= 0 ? cal : Math.min(POS - 1, Math.max(0, (campDays.get(b) ?? []).indexOf(s.date)));
      logw += model.coef.pos[p];
    }
    return sessionDurationHours(s.startTime, s.endTime) * Math.exp(Math.max(-5, Math.min(5, logw)));
  });
}

// ---------------------------------------------------------------------------
// Bộ chia: mô hình v2 trộn với cách cũ
// ---------------------------------------------------------------------------

export interface Allocator {
  glm: AllocationModel | null;
  old: TargetWeightModel | null;
  /** Tỷ trọng mô hình v2 trong phần trộn (0 = chỉ cách cũ, 1 = chỉ v2). */
  share: number;
}

/** `old` truyền vào (kể cả null) để backtest không dựng lại mô hình cũ mỗi lần vặn tham số. Không có gì để chia ⇒ null. */
export function buildAllocator(history: LiveSession[], month: string, params: AllocParams, old?: TargetWeightModel | null): Allocator | null {
  assertOnePlatform(history, "buildAllocator");
  const oldModel = old !== undefined ? old : targetWeightModel(history, month, bucketOfFixed);
  const glm = fitAllocationModel(history, month, params);
  if (!glm && !oldModel) return null;
  return { glm, old: oldModel, share: Math.min(1, Math.max(0, params.allocEnsembleShare)) };
}

const normalize = (w: number[]): number[] => {
  const s = w.reduce((a, b) => a + b, 0);
  return s > 0 ? w.map((x) => x / s) : w.map(() => 0);
};

export interface AllocatorWeights {
  glm: number[] | null;
  old: number[] | null;
  /** Trọng số dùng thật (đã chuẩn hoá tổng 1). Thiếu một nguồn thì dùng nguồn còn lại. */
  blended: number[];
}

export function allocatorWeights(a: Allocator, slots: SlotLike[], bucketOf: BucketOf): AllocatorWeights {
  const glm = a.glm ? normalize(glmWeights(slots, a.glm, bucketOf)) : null;
  const old = a.old ? normalize(targetWeights(slots, a.old, bucketOf)) : null;
  const blended = glm && old ? glm.map((v, i) => a.share * v + (1 - a.share) * old[i]) : glm ?? old ?? slots.map(() => 0);
  return { glm, old, blended };
}

// ---------------------------------------------------------------------------
// Backtest walk-forward (cùng phương pháp đã dùng để chọn v2) — chạy ngay trong AI Training Center
// ---------------------------------------------------------------------------

export type AllocMethod = "hours" | "old" | "glm" | "v2";
export const ALLOC_METHOD_LABEL: Record<AllocMethod, string> = {
  hours: "Chia đều theo giờ",
  old: "Cách cũ (loại ngày + khung ngày thường + vị trí ngày)",
  glm: "Mô hình v2 riêng",
  v2: "v2 trộn với cách cũ (đang dùng)"
};
export const ALLOC_METHODS: AllocMethod[] = ["hours", "old", "glm", "v2"];

export interface PreparedFold {
  month: string;
  hist: LiveSession[];
  test: LiveSession[];
  old: TargetWeightModel | null;
}

export interface BacktestFold {
  month: string;
  sessions: number;
  historyMonths: number;
  /** Tháng chưa đủ ngày (còn ca chưa diễn ra) — số chỉ để tham khảo. */
  partial: boolean;
  slot: Record<AllocMethod, number | null>;
  day: Record<AllocMethod, number | null>;
}

export interface BacktestResult {
  folds: BacktestFold[];
  /** Cộng tất cả fold (mỗi fold chuẩn hoá về tổng GMV thật của nó rồi cộng sai số tuyệt đối). */
  pooled: Record<AllocMethod, { slot: number; day: number } | null>;
}

const MIN_TEST_SESSIONS = 15;

/** Bước nặng (mô hình cũ có bootstrap) — làm một lần cho mỗi kênh, không làm lại khi vặn tham số. */
export function prepareBacktest(channelSessions: LiveSession[], minMonths: number): PreparedFold[] {
  assertOnePlatform(channelSessions, "prepareBacktest");
  const valid = channelSessions.filter(validHistory);
  const months = [...new Set(valid.map((s) => s.date.slice(0, 7)))].sort();
  const out: PreparedFold[] = [];
  for (const m of months) {
    const test = valid.filter((s) => s.date.slice(0, 7) === m);
    const hist = valid.filter((s) => s.date < `${m}-01`);
    if (test.length < MIN_TEST_SESSIONS || new Set(hist.map((s) => s.date.slice(0, 7))).size < Math.max(1, minMonths)) continue;
    out.push({ month: m, hist, test, old: targetWeightModel(hist, m, bucketOfFixed) });
  }
  return out;
}

export function scoreBacktest(prepared: PreparedFold[], params: AllocParams, today: string): BacktestResult {
  const sumAbs: Record<AllocMethod, { slot: number; day: number; y: number } | null> = { hours: null, old: null, glm: null, v2: null };
  const folds: BacktestFold[] = [];
  for (const f of prepared) {
    const slots = f.test.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime }));
    const y = f.test.map((s) => s.actualGmv);
    const Y = y.reduce((a, b) => a + b, 0);
    const hours = normalize(slots.map((s) => sessionDurationHours(s.startTime, s.endTime)));
    const a = buildAllocator(f.hist, f.month, params, f.old);
    const parts = a ? allocatorWeights(a, slots, bucketOfFixed) : null;
    const weights: Record<AllocMethod, number[] | null> = { hours, old: parts?.old ?? null, glm: parts?.glm ?? null, v2: parts?.blended ?? null };
    const fold: BacktestFold = {
      month: f.month,
      sessions: f.test.length,
      historyMonths: new Set(f.hist.map((s) => s.date.slice(0, 7))).size,
      partial: f.test.some((s) => s.date > today) || today.slice(0, 7) === f.month,
      slot: { hours: null, old: null, glm: null, v2: null },
      day: { hours: null, old: null, glm: null, v2: null }
    };
    for (const k of ALLOC_METHODS) {
      const w = weights[k];
      if (!w) continue;
      const alloc = w.map((v) => v * Y);
      const abs = alloc.reduce((acc, v, i) => acc + Math.abs(v - y[i]), 0);
      const byDay = new Map<string, number>();
      f.test.forEach((s, i) => byDay.set(s.date, (byDay.get(s.date) ?? 0) + alloc[i] - y[i]));
      const absDay = [...byDay.values()].reduce((acc, v) => acc + Math.abs(v), 0);
      fold.slot[k] = abs / Y;
      fold.day[k] = absDay / Y;
      const cur = sumAbs[k] ?? { slot: 0, day: 0, y: 0 };
      sumAbs[k] = { slot: cur.slot + abs, day: cur.day + absDay, y: cur.y + Y };
    }
    folds.push(fold);
  }
  const pooled = Object.fromEntries(ALLOC_METHODS.map((k) => [k, sumAbs[k] ? { slot: sumAbs[k]!.slot / sumAbs[k]!.y, day: sumAbs[k]!.day / sumAbs[k]!.y } : null])) as BacktestResult["pooled"];
  return { folds, pooled };
}
