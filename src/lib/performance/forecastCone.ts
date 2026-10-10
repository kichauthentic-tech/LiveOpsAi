import type { MonthOutlook } from "./ceoBrief";

// Dải tin cậy của dự phóng cuối tháng (09/10/2026) — thay dải ±8% cố định.
//
// Vì sao bỏ ±8%: backtest 13 kênh-tháng T7–T9 trên số thật (dự phóng = đã có + giờ ca còn lại × GMV/giờ 28 ngày):
// sai số tuyệt đối trung bình 16% / 9% / 8% ở ngày 8 / 15 / 22 của tháng, và chỉ 4/13, 6/13, 7/13 trường hợp nằm trong ±8%.
// Sai số phụ thuộc vào PHẦN THÁNG CÒN LẠI (phần chưa biết), không phải hằng số. Dải mới = 35% × phần dự phóng còn lại,
// bao 11/13, 12/13, 10/13 ở ba mốc đó (~80%). User giữ nguyên hệ số này (09/10) — đổi hệ số = chạy lại backtest.
//
// Giới hạn đã biết: lịch tương lai trong backtest là lịch đã thực sự chạy nên sai số thật hơi lớn hơn; dự phóng nghiêng
// lạc quan khoảng +7–8% trong quý giảm. Dải đối xứng quanh dự phóng, KHÔNG sửa lệch đó.

export const CONE_COEF = 0.35;
/** Dải bao ~80% ⇒ biên = 1,28 độ lệch chuẩn của phân phối chuẩn. */
const Z80 = 1.2816;

export interface ConePoint {
  /** Chỉ số ngày trong tháng (0 = ngày 1). */
  i: number;
  lo: number;
  mid: number;
  hi: number;
}

/** Φ(x) — hàm phân phối chuẩn (Abramowitz–Stegun 7.1.26, sai số < 1,5e-7). */
export function normalCdf(x: number): number {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
}

/**
 * Nửa dải tuyệt đối tại cuối tháng = hệ số × phần dự phóng còn lại (GMV chưa về). Hệ số theo kênh (`MonthOutlook.coneCoef`) từ
 * engine target v3 (10/10): 0,22 kênh đủ lịch sử / 0,30 kênh ít — backtest cho dự báo theo hình dạng bao ~80% tháng. Thiếu hệ số
 * (dự phóng kiểu cũ GMV/giờ 28 ngày) thì giữ 35% như 09/10.
 */
export const coneHalf = (actual: number, projected: number, coef: number = CONE_COEF) => coef * Math.max(0, projected - actual);

export interface Cone {
  /** Điểm mỗi ngày từ ngày cuối có số tới cuối tháng (cộng dồn). Rỗng khi không chiếu theo giờ. */
  points: ConePoint[];
  startIdx: number;
  lo: number;
  hi: number;
  /** Nửa dải ÷ dự phóng (để so với ngưỡng, không để vẽ). */
  halfShare: number;
}

/**
 * Dải cộng dồn: tại ngày i, nửa dải = 35% × (dự phóng cộng dồn tới i − đã có). Cuối tháng = 35% × phần còn lại.
 * `scale` < 1 khi vẽ nhiều kênh cộng lại (sai số độc lập: xem combineCones). Chỉ chiếu theo giờ mới có dải (run-rate/none không có phần "giờ còn lại" để đo).
 */
export function coneOf(o: Pick<MonthOutlook, "days" | "through" | "actual" | "projected" | "forecastByDate" | "pending" | "projectionMethod" | "coneCoef">, scale = 1): Cone {
  const coef = o.coneCoef ?? CONE_COEF;
  const n = o.days.length;
  const throughIdx = o.through ? o.days.indexOf(o.through) : -1;
  const startIdx = Math.max(0, throughIdx);
  const empty: Cone = { points: [], startIdx, lo: o.projected, hi: o.projected, halfShare: 0 };
  if (o.projectionMethod !== "gmv_per_hour" || o.pending.length === 0) return empty;
  // Ca đã qua mà số chưa về (ngày ≤ through) được chiếu vào điểm cuối — cùng cách vẽ đường dự phóng.
  const late = [...o.forecastByDate.entries()].filter(([d]) => o.through && d <= o.through).reduce((a, [, v]) => a + v, 0);
  let cum = o.actual + late;
  const points: ConePoint[] = [{ i: startIdx, lo: cum, mid: cum, hi: cum }];
  for (let i = startIdx + 1; i < n; i++) {
    cum += o.forecastByDate.get(o.days[i]) ?? 0;
    const h = coef * (cum - o.actual) * scale;
    points.push({ i, lo: cum - h, mid: cum, hi: cum + h });
  }
  const half = coneHalf(o.actual, o.projected, coef) * scale;
  return { points, startIdx, lo: o.projected - half, hi: o.projected + half, halfShare: o.projected > 0 ? half / o.projected : 0 };
}

export type LandingKey = "no_target" | "no_forecast" | "safe" | "likely" | "unlikely" | "short";

export interface Landing {
  key: LandingKey;
  /** Khả năng đạt target (0–1); null khi không có target hoặc không chiếu được. */
  pHit: number | null;
  /** Dự phóng ÷ target. */
  ratio: number | null;
  lo: number;
  hi: number;
}

export const LANDING_LABEL: Record<LandingKey, string> = {
  no_target: "Chưa có target",
  no_forecast: "Chưa chiếu được",
  safe: "Chắc đạt",
  likely: "Có thể đạt",
  unlikely: "Khó đạt",
  short: "Sẽ hụt"
};

/**
 * Khả năng đạt target = P(GMV cuối tháng ≥ target) với GMV cuối ~ chuẩn(dự phóng, σ), σ = nửa dải ÷ 1,28.
 * Tháng đã hết (không còn phần chưa biết) thì chắc chắn: 1 hoặc 0.
 */
export function landingOf(o: Pick<MonthOutlook, "actual" | "projected" | "projectionMethod" | "target" | "coneCoef">, halfOverride?: number): Landing {
  const half = halfOverride ?? coneHalf(o.actual, o.projected, o.coneCoef);
  const lo = o.projected - half, hi = o.projected + half;
  if (!o.target) return { key: "no_target", pHit: null, ratio: null, lo, hi };
  if (o.projectionMethod === "none") return { key: "no_forecast", pHit: null, ratio: null, lo, hi };
  const sigma = half / Z80;
  const pHit = sigma > 0 ? 1 - normalCdf((o.target.total - o.projected) / sigma) : o.projected >= o.target.total ? 1 : 0;
  const key: LandingKey = pHit >= 0.8 ? "safe" : pHit >= 0.5 ? "likely" : pHit >= 0.2 ? "unlikely" : "short";
  return { key, pHit, ratio: o.target.total > 0 ? o.projected / o.target.total : null, lo, hi };
}

/** Cộng dải nhiều kênh: sai số các kênh coi như độc lập ⇒ cộng theo căn bậc hai tổng bình phương (cộng thẳng thì dải quá rộng). */
export function combineCones(list: Pick<MonthOutlook, "actual" | "projected" | "coneCoef">[]): { projected: number; half: number; lo: number; hi: number } {
  const projected = list.reduce((a, o) => a + o.projected, 0);
  const half = Math.sqrt(list.reduce((a, o) => a + coneHalf(o.actual, o.projected, o.coneCoef) ** 2, 0));
  return { projected, half, lo: projected - half, hi: projected + half };
}

// ---------------------------------------------------------------------------
// Độ tin cậy của con số dự phóng
// ---------------------------------------------------------------------------

export interface ForecastFlag {
  level: "warn" | "info";
  text: string;
}

/**
 * Cờ "số này nên tin tới đâu" — hiện cạnh dự phóng để CEO không đọc một con số chính xác giả.
 * `missingPast` = ca đã chạy mà số chưa về (đang được tạm tính); `openFuture` = ca mở chưa có người trong lịch (đang được tính như sẽ có người).
 */
export function forecastFlags(o: Pick<MonthOutlook, "pending" | "rates" | "projectionMethod" | "actual" | "projected">, today: string): ForecastFlag[] {
  const out: ForecastFlag[] = [];
  if (o.projectionMethod === "none") return [{ level: "warn", text: "Chưa có GMV/giờ 28 ngày hay run-rate để chiếu." }];
  if (o.projectionMethod === "run_rate") out.push({ level: "warn", text: "Chưa có ca nào trong 28 ngày — dự phóng theo run-rate, kém tin hơn." });
  const missingPast = o.pending.filter((p) => p.kind === "session" && p.date < today);
  if (missingPast.length) out.push({ level: "warn", text: `${missingPast.length} ca đã chạy chưa có số — đang tạm tính theo dự báo từng ca.` });
  const openFuture = o.pending.filter((p) => p.kind === "open_slot");
  if (openFuture.length) {
    const g = openFuture.reduce((a, p) => a + p.forecast, 0);
    const share = o.projected - o.actual > 0 ? g / (o.projected - o.actual) : 0;
    if (share >= 0.1) out.push({ level: "info", text: `${Math.round(share * 100)}% phần còn lại đến từ ${openFuture.length} ca mở chưa có người — không ai nhận thì dự phóng giảm tương ứng.` });
  }
  return out;
}

/**
 * Khả năng đạt target của một nhóm kênh CÓ target: cộng thực đạt, dự phóng, target; dải theo căn bậc hai tổng bình phương.
 * `list` phải là outlook từng kênh (không phải outlook gộp) và đều có target.
 */
export function landingOfMany(list: Pick<MonthOutlook, "actual" | "projected" | "projectionMethod" | "target" | "coneCoef">[]): Landing & { target: number } {
  const target = list.reduce((a, o) => a + (o.target?.total ?? 0), 0);
  const sum = { actual: list.reduce((a, o) => a + o.actual, 0), projected: list.reduce((a, o) => a + o.projected, 0) };
  const method = list.some((o) => o.projectionMethod === "none") ? "none" : list.some((o) => o.projectionMethod === "run_rate") ? "run_rate" : "gmv_per_hour";
  const half = combineCones(list).half;
  return { ...landingOf({ ...sum, projectionMethod: method, target: list.length ? { total: target, byDate: new Map() } : null }, half), target };
}
