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

// Tên nhãn chuẩn hoá 24/10 (user duyệt bộ từ ngữ): Chắc đạt / Có thể đạt / Khó đạt / Sẽ hụt → Đạt target / Sát target / Rủi ro / Hụt target.
export const LANDING_LABEL: Record<LandingKey, string> = {
  no_target: "Chưa có target",
  no_forecast: "Chưa có dự báo",
  safe: "Đạt target",
  likely: "Sát target",
  unlikely: "Rủi ro",
  short: "Hụt target"
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
