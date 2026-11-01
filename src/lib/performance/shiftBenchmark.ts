import type { LiveSession } from "../../types";
import { METRIC } from "../metricGlossary";
import { sumByPlatform } from "../platforms/perf";

// Benchmark theo ca cho OP (01/11/2026). OP đọc số trên TikTok/Shopee Dashboard rồi đối chiếu với thang này — app KHÔNG nhận số real-time
// (user chốt: không nối API vì rủi ro lộ dữ liệu), nên đây là hàm thuần chỉ đọc lịch sử ca đã có số.
// Nhóm so sánh = brand × sàn × khung giờ (giờ bắt đầu kế hoạch). Mỗi chỉ số chia 4 vùng theo phân vị của chính nhóm:
//   < P15 kết thúc sớm · P15–P40 cần action · P40–P75 đúng target · ≥ P75 có thể xin OT.
// Đo 01/11 trên 1.388 ca (T6–T10), tương quan hạng với GMV/giờ trong nhóm: Đơn/giờ 0,93 · GPM 0,74 · Lượt xem/giờ 0,59 ·
// CTOR 0,48 · LIVE CTR 0,48 (TikTok); Shopee Đơn/giờ 0,96. Cờ `lead` đánh dấu các chỉ số đó; chỉ số yếu (AOV, thời lượng xem…) không vào bảng.
// Số là cả ca quy ra theo giờ: chưa kiểm được "sau 30 phút thấp thì cả ca có thấp không" (dữ liệu chỉ có tổng cả ca).

export type BenchBand = "Sáng" | "Chiều" | "Tối" | "Khuya";
export type BenchZone = "off" | "act" | "ok" | "ot";
export type BenchKind = "count" | "rate" | "money";

export interface BenchItem {
  key: string;
  label: string;
  kind: BenchKind;
  /** true = số tuyệt đối theo giờ (nhân với số giờ đã live khi đối chiếu); false = tỷ lệ / giá trị bình quân, giữ nguyên. */
  perHour: boolean;
  p15: number;
  p40: number;
  p50: number;
  p75: number;
  n: number;
  /** Tương quan mạnh với GMV/giờ (đo 01/11) — chỉ số quyết định. */
  lead: boolean;
}

export interface ShiftBenchmark {
  brandId: string;
  platform: LiveSession["platform"];
  band: BenchBand;
  /** "band" = đúng khung giờ; "all-bands" = nhóm khung giờ ít ca nên gộp mọi khung giờ của brand × sàn. */
  scope: "band" | "all-bands";
  /** Số ca lịch sử làm mốc (ca đủ điều kiện của nhóm). */
  n: number;
  /** Số ca ít (< WEAK_N) ⇒ mốc chưa vững. */
  weak: boolean;
  funnel: BenchItem[];
  rates: BenchItem[];
  outcomes: BenchItem[];
}

export const MIN_BENCH_N = 20;
export const WEAK_N = 40;
const MIN_LIVE_MINUTES = 60;

export function benchBandOf(startTime: string): BenchBand {
  const h = Number(startTime.slice(0, 2));
  return h < 12 ? "Sáng" : h < 18 ? "Chiều" : h < 22 ? "Tối" : "Khuya";
}

/** Ca lịch sử đủ làm mốc: đã xong, có doanh thu, có số giờ live thật ≥ 1 giờ (ca ngắn nhân theo giờ sẽ méo). */
export function isBenchHistory(s: LiveSession): boolean {
  return s.status === "Completed" && !s.excludedFromReports && s.actualGmv > 0 && (s.liveDurationMinutes ?? 0) >= MIN_LIVE_MINUTES;
}

function quantile(sorted: number[], p: number): number {
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

interface Def {
  key: string;
  label: string;
  kind: BenchKind;
  perHour: boolean;
  lead: boolean;
  value: (s: LiveSession, hours: number) => number | null;
}

const pos = (x: number | null | undefined): number | null => (x != null && x > 0 ? x : null);
const ratio = (num: number | null | undefined, den: number | null | undefined, k = 1): number | null =>
  den != null && den > 0 && num != null ? (num / den) * k : null;

const TIKTOK_FUNNEL: Def[] = [
  { key: "imp", label: `${METRIC.liveImpressions}/giờ`, kind: "count", perHour: true, lead: false, value: (s, h) => (pos(s.impressions) != null ? s.impressions! / h : null) },
  { key: "views", label: `${METRIC.views}/giờ`, kind: "count", perHour: true, lead: true, value: (s, h) => s.totalViews / h },
  { key: "clicks", label: `${METRIC.productClicks}/giờ`, kind: "count", perHour: true, lead: false, value: (s, h) => (pos(s.productClicks) != null ? s.productClicks! / h : null) },
  { key: "orders", label: `${METRIC.orders}/giờ`, kind: "count", perHour: true, lead: true, value: (s, h) => s.totalOrders / h }
];
const TIKTOK_RATES: Def[] = [
  { key: "err", label: METRIC.err, kind: "rate", perHour: false, lead: false, value: (s) => (pos(s.impressions) != null ? ratio(s.totalViews, s.impressions, 100) : null) },
  { key: "liveCtr", label: METRIC.liveCtr, kind: "rate", perHour: false, lead: true, value: (s) => (pos(s.productClicks) != null ? ratio(s.productClicks, s.totalViews, 100) : null) },
  { key: "ctor", label: METRIC.ctor, kind: "rate", perHour: false, lead: true, value: (s) => (pos(s.productClicks) != null ? ratio(s.totalOrders, s.productClicks, 100) : null) }
];
const TIKTOK_OUT: Def[] = [
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", perHour: true, lead: true, value: (s, h) => s.actualGmv / h },
  { key: "gpm", label: METRIC.gpm, kind: "money", perHour: false, lead: true, value: (s) => (pos(s.impressions) != null ? ratio(s.actualGmv, s.impressions, 1000) : null) },
  { key: "aov", label: METRIC.aov, kind: "money", perHour: false, lead: false, value: (s) => ratio(s.actualGmv, s.totalOrders) }
];

// Shopee: phễu dựng theo CHỈ SỐ DASHBOARD SHOPEE hiện (user chốt 01/11: "không copy phễu trong app"): Total Views → Orders, tỷ lệ Orders/Views, kết quả GPM
// (Sales trên 1.000 Views), ABS (= AOV) và Avg. Viewing Duration. Dashboard không có ATC cộng dồn nên không còn bậc ATC. CTR và Click to Order Rate của
// Dashboard chưa có lịch sử (không ca nào lưu) ⇒ chỉ hiện số thật, không có mốc.
const SHOPEE_FUNNEL: Def[] = [
  { key: "views", label: `${METRIC.views}/giờ`, kind: "count", perHour: true, lead: true, value: (s, h) => (s.totalViews > 0 ? s.totalViews / h : null) },
  { key: "orders", label: `${METRIC.orders}/giờ`, kind: "count", perHour: true, lead: true, value: (s, h) => s.totalOrders / h }
];
const SHOPEE_RATES: Def[] = [
  { key: "ordersViews", label: `${METRIC.orders}/${METRIC.views}`, kind: "rate", perHour: false, lead: false, value: (s) => (s.totalViews > 0 ? ratio(s.totalOrders, s.totalViews, 100) : null) }
];
const SHOPEE_OUT: Def[] = [
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", perHour: true, lead: true, value: (s, h) => s.actualGmv / h },
  { key: "gpm", label: METRIC.gpm, kind: "money", perHour: false, lead: false, value: (s) => (s.totalViews > 0 ? (s.actualGmv / s.totalViews) * 1000 : null) },
  { key: "aov", label: METRIC.aov, kind: "money", perHour: false, lead: false, value: (s) => ratio(s.actualGmv, s.totalOrders) },
  { key: "watch", label: "Xem TB (giây)", kind: "count", perHour: false, lead: false, value: (s) => (s.avgWatchTimeSeconds > 0 ? s.avgWatchTimeSeconds : null) }
];

const DEFS: Record<LiveSession["platform"], { funnel: Def[]; rates: Def[]; outcomes: Def[] }> = {
  TikTok: { funnel: TIKTOK_FUNNEL, rates: TIKTOK_RATES, outcomes: TIKTOK_OUT },
  Shopee: { funnel: SHOPEE_FUNNEL, rates: SHOPEE_RATES, outcomes: SHOPEE_OUT }
};

function items(defs: Def[], rows: LiveSession[]): BenchItem[] {
  const out: BenchItem[] = [];
  for (const d of defs) {
    const xs = rows.map((s) => d.value(s, (s.liveDurationMinutes ?? 0) / 60)).filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (xs.length < MIN_BENCH_N) continue;
    out.push({ key: d.key, label: d.label, kind: d.kind, perHour: d.perHour, lead: d.lead, n: xs.length, p15: quantile(xs, 0.15), p40: quantile(xs, 0.4), p50: quantile(xs, 0.5), p75: quantile(xs, 0.75) });
  }
  return out;
}

/** Benchmark của một nhóm brand × sàn × khung giờ; null nếu cả brand × sàn chưa đủ MIN_BENCH_N ca. `history` là mọi ca của app (hàm tự lọc). */
export function buildShiftBenchmark(history: LiveSession[], brandId: string, platform: LiveSession["platform"], band: BenchBand): ShiftBenchmark | null {
  const pool = history.filter((s) => s.brandId === brandId && s.platform === platform && isBenchHistory(s));
  const inBand = pool.filter((s) => benchBandOf(s.startTime) === band);
  const [rows, scope] = inBand.length >= MIN_BENCH_N ? [inBand, "band" as const] : [pool, "all-bands" as const];
  if (rows.length < MIN_BENCH_N) return null;
  const defs = DEFS[platform];
  const funnel = items(defs.funnel, rows);
  const rates = items(defs.rates, rows);
  const outcomes = items(defs.outcomes, rows);
  if (!outcomes.length) return null;
  return { brandId, platform, band, scope, n: rows.length, weak: rows.length < WEAK_N, funnel, rates, outcomes };
}

/** Vùng của một giá trị trên thang của chỉ số (cao hơn là tốt hơn ở mọi chỉ số trong bảng). */
export function benchZone(item: Pick<BenchItem, "p15" | "p40" | "p75">, v: number): BenchZone {
  return v < item.p15 ? "off" : v < item.p40 ? "act" : v < item.p75 ? "ok" : "ot";
}

/** Giá trị của chỉ số sau `hours` giờ live: số theo giờ nhân số giờ, tỷ lệ giữ nguyên. */
export function benchAt(item: BenchItem, hours: number): { p15: number; p40: number; p50: number; p75: number } {
  const k = item.perHour ? hours : 1;
  return { p15: item.p15 * k, p40: item.p40 * k, p50: item.p50 * k, p75: item.p75 * k };
}

// ── Ads (01/11/2026, user: "OP nhập ads tới lúc cần tracking, benchmark nhảy recommend theo ads") ──────────────────────────────
// Ads KHÔNG có theo ca (live_session_reports.ads_cost trống ở cả 1.388 ca), chỉ có theo NGÀY ở brand_ads_daily (dán từ file tracking, hiện chỉ CROCS
// TikTok). Nên ads/giờ lịch sử = ads Live của ngày ÷ tổng giờ live của brand × sàn trong ngày. Đo 01/11 trên 127 ngày CROCS: tương quan hạng của
// ads/giờ với GMV/giờ −0,01, với Đơn/giờ 0,04, với Views/giờ −0,09 — tức mốc GMV KHÔNG đổi theo ads trong khoảng đã chi (0,66M–1,33M/giờ); ads quyết
// định ROAS (chi nhiều thì ROAS thấp, tương quan −0,83, phần lớn là do phép chia). Vì vậy: mốc GMV giữ nguyên, ads đổi "GMV/ROAS cần đạt" và lời khuyên.
// Lời khuyên đọc `rho` đo ngay trên dữ liệu của brand: |rho| < 0,2 ⇒ không có cơ sở bảo "tăng ads để kéo GMV".

export interface AdsHistory {
  /** Số ngày ghép được (có ads Live > 0 và ≥ 2 giờ live). */
  n: number;
  /** Phân vị ads Live mỗi giờ live (VND/giờ). */
  p25: number;
  p50: number;
  p75: number;
  /** Tương quan hạng giữa ads/giờ và GMV/giờ trong cùng các ngày. */
  rho: number;
}

export type AdsLevel = "low" | "usual" | "high";
export const MIN_ADS_DAYS = 20;

const rankOf = (a: number[]): number[] => {
  const idx = a.map((v, i) => [v, i] as const).sort((x, y) => x[0] - y[0]);
  const r = Array<number>(a.length);
  idx.forEach(([, i], k) => { r[i] = k; });
  return r;
};
function spearman(x: number[], y: number[]): number {
  const a = rankOf(x), b = rankOf(y), m = (x.length - 1) / 2;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < x.length; i++) { num += (a[i] - m) * (b[i] - m); da += (a[i] - m) ** 2; db += (b[i] - m) ** 2; }
  return da > 0 && db > 0 ? num / Math.sqrt(da * db) : 0;
}

/** Ads/giờ lịch sử của brand × sàn từ ads theo ngày + giờ live của chính các ca đã xong; null nếu < MIN_ADS_DAYS ngày. */
export function adsHistoryOf(history: LiveSession[], adsByDate: { date: string; live: number | null }[], brandId: string, platform: LiveSession["platform"]): AdsHistory | null {
  const byDay = new Map<string, LiveSession[]>();
  for (const s of history) {
    if (s.brandId !== brandId || s.platform !== platform || !isBenchHistory(s)) continue;
    byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]);
  }
  const perHour: number[] = [], gmvPerHour: number[] = [];
  for (const a of adsByDate) {
    const rows = byDay.get(a.date);
    if (!rows || a.live == null || a.live <= 0) continue;
    const hours = rows.reduce((h, s) => h + (s.liveDurationMinutes ?? 0) / 60, 0);
    if (hours < 2) continue;
    perHour.push(a.live / hours);
    gmvPerHour.push(sumByPlatform(rows, (s) => s.actualGmv)[platform] / hours);
  }
  if (perHour.length < MIN_ADS_DAYS) return null;
  const xs = [...perHour].sort((a, b) => a - b);
  return { n: xs.length, p25: quantile(xs, 0.25), p50: quantile(xs, 0.5), p75: quantile(xs, 0.75), rho: spearman(perHour, gmvPerHour) };
}

export interface AdsAdvice {
  adsPerHour: number;
  level: AdsLevel | null;
  /** GMV tích luỹ cần có (và ROAS tương ứng) ở từng mốc của thang, với số ads đã chi. */
  need: { min: { gmv: number; roas: number }; ok: { gmv: number; roas: number }; ot: { gmv: number; roas: number } };
  roas: number | null;
  zone: BenchZone | null;
  /** Câu khuyến nghị theo luật; rỗng khi chưa đủ số. */
  advice: string;
}

/**
 * Đối chiếu số ads OP nhập (tích luỹ tới "sau `hours` giờ live") với benchmark. `gmvSoFar` (tuỳ chọn) là GMV tích luỹ đọc từ Dashboard.
 * Mốc GMV không đổi theo ads (xem ghi chú đầu mục); ads chỉ đổi ROAS cần đạt và lời khuyên.
 */
export function adviseAds(bench: ShiftBenchmark, hist: AdsHistory | null, hours: number, adsSpent: number, gmvSoFar: number | null): AdsAdvice | null {
  const gmv = bench.outcomes.find((o) => o.key === "gmvPerHour");
  if (!gmv || !(adsSpent > 0) || !(hours > 0)) return null;
  const b = benchAt(gmv, hours);
  const adsPerHour = adsSpent / hours;
  const level: AdsLevel | null = hist ? (adsPerHour < hist.p25 ? "low" : adsPerHour > hist.p75 ? "high" : "usual") : null;
  const mk = (g: number) => ({ gmv: g, roas: g / adsSpent });
  const need = { min: mk(b.p15), ok: mk(b.p40), ot: mk(b.p75) };
  const hasGmv = gmvSoFar != null && gmvSoFar >= 0;
  const zone = hasGmv ? benchZone({ p15: b.p15, p40: b.p40, p75: b.p75 }, gmvSoFar!) : null;
  const roas = hasGmv ? gmvSoFar! / adsSpent : null;
  const lifts = hist != null && hist.rho >= 0.3; // ads có dấu hiệu kéo GMV trong dữ liệu của brand
  let advice = "";
  if (zone === "ot") advice = level === "high" ? "GMV đã vào vùng xin OT nhưng ads cao hơn mức thường: tính lại ROAS trước khi xin OT." : "GMV đã vào vùng xin OT với mức ads này: có thể xin OT, giữ ads.";
  else if (zone === "ok") advice = level === "high" ? "Đúng target nhưng ads cao hơn mức thường: giữ nhịp, đừng tăng thêm." : "Đúng target với mức ads này: giữ nhịp.";
  else if (zone === "act") advice = level === "high"
    ? "Ads đã cao hơn mức thường mà GMV vẫn dưới target: đừng tăng thêm ads, kiểm tra sản phẩm gắn giỏ và kịch bản host trước."
    : lifts
      ? "GMV dưới target và ads chưa cao: có cơ sở thử nâng ads về mức thường, theo dõi 30 phút."
      : "GMV dưới target: ads không phải đòn bẩy rõ ở brand này (chưa thấy ads kéo GMV), kiểm tra sản phẩm gắn giỏ và kịch bản host trước.";
  else if (zone === "off") advice = level === "high"
    ? "GMV thuộc nhóm yếu nhất dù ads cao: cân nhắc kết thúc sớm và cắt ads."
    : "GMV thuộc nhóm yếu nhất: cân nhắc kết thúc sớm; thêm ads không phải lối thoát nếu chưa thấy ads kéo GMV.";
  return { adsPerHour, level, need, roas, zone, advice };
}

// ── Đối chiếu số đang chạy với phễu trung bình (01/11/2026) ──────────────────────────────────────────────────────────────────
// OP đưa số TÍCH LUỸ đọc từ Dashboard (gõ tay hoặc đọc từ ảnh chụp) + số phút đã live. Phễu trên màn hình chỉ hiện số TRUNG BÌNH của ca cùng loại;
// hàm này nói GÃY Ở ĐÂU và LÀM GÌ. Kết luận (xin OT / đúng target / cần action / kết thúc sớm) tính từ CẢ PHỄU, không từ một chỉ số:
//  • bậc "gãy" = bậc thuộc vùng cần action hoặc kết thúc sớm (P15 / P40 của nhóm); chỉ tính các đòn bẩy độc lập — lượng vào phễu (bậc đầu) và từng tỷ lệ
//    giữa các bậc. Số click/đơn thấp mà các tỷ lệ vẫn ổn chỉ là hệ quả của lượng vào thấp nên không thành việc riêng.
//  • kết quả cuối = GMV/giờ (có GMV) hoặc Đơn/giờ.
//  • xin OT: không bậc nào gãy và kết quả ≥ P75 · kết thúc sớm: kết quả thuộc nhóm yếu nhất VÀ ≥ 2 bậc gãy ở vùng kết thúc sớm · cần action: còn lại có bậc gãy
//    hoặc kết quả dưới target · còn lại đúng target.
// Không ghi gì vào ca.

export interface ShiftSnapshotInput {
  minutes: number;
  gmv: number | null;
  ads: number | null;
  /** Thời lượng xem trung bình trên Dashboard (giây), trung bình nên không trừ được ở ca nối. Shopee: "Avg. Viewing Duration". */
  watchSeconds?: number | null;
  /** Số tích luỹ theo khoá bậc phễu của nhóm (imp, views, clicks, orders / views, orders). */
  counts: Record<string, number | null>;
}

export interface CheckRow {
  key: string;
  label: string;
  /** Giá trị đem so với thang: số theo giờ (bậc phễu, GMV/giờ), hoặc tỷ lệ % / giá trị bình quân. */
  value: number;
  /** Với bậc phễu: số tích luỹ OP đã nhập. */
  total?: number;
  zone: BenchZone;
  item: BenchItem;
}

/** Một chỗ gãy của phễu. `vsAvg` = thực tế ÷ trung bình − 1 (−0,62 = thấp hơn trung bình 62%). */
export interface FunnelBreak {
  key: string;
  label: string;
  kind: "volume" | "rate" | "value";
  actual: number;
  avg: number;
  vsAvg: number;
  zone: "off" | "act";
  action: string;
  item: BenchItem;
}

export interface ShiftCheck {
  hours: number;
  steps: CheckRow[];
  rates: CheckRow[];
  outcomes: CheckRow[];
  /** Kết luận theo cả phễu; null khi chưa có đủ số để kết luận. */
  verdict: BenchZone | null;
  headline: string;
  /** Các chỗ gãy theo thứ tự thượng nguồn → hạ nguồn (phần tử đầu là gốc). */
  breaks: FunnelBreak[];
  /** Lời khuyên riêng về ads khi OP nhập ads. */
  adsLine: string;
  ads: AdsAdvice | null;
}

const RATE_PARTS: Record<string, [string, string]> = {
  err: ["views", "imp"], liveCtr: ["clicks", "views"], ctor: ["orders", "clicks"], ordersViews: ["orders", "views"]
};
/** Bậc phễu có thể vắng ở số của phiên mà phễu vẫn chấm được (Dashboard Shopee không có ATC cộng dồn). */
export const OPTIONAL_STEPS = new Set<string>();

/** Các bậc dùng để chấm: bỏ bậc tuỳ chọn khi chưa có số; mỗi cặp bậc liền nhau lấy tỷ lệ (tử, mẫu) = (bậc sau, bậc trước) nếu benchmark có. */
export function funnelChain(bench: ShiftBenchmark, has: (key: string) => boolean): { steps: BenchItem[]; arrows: (BenchItem | null)[] } {
  const steps = bench.funnel.filter((f) => !OPTIONAL_STEPS.has(f.key) || has(f.key));
  const arrows = steps.slice(1).map((next, i) => {
    const prev = steps[i];
    return bench.rates.find((r) => RATE_PARTS[r.key]?.[0] === next.key && RATE_PARTS[r.key]?.[1] === prev.key) ?? null;
  });
  return { steps, arrows };
}
/** Việc cần làm theo chỗ gãy — cùng người giữ đòn bẩy như Dashboard (LEVER_OWNER, channelHealth.ts). */
const ACTION: Record<string, string> = {
  imp: "Ít người được đề xuất vào phiên: kiểm tra Ads Live (GMV Max) có đang chạy và đủ ngân sách, nhờ video dẫn traffic, xem lại khung giờ.",
  views: "Ít người vào phiên: kiểm tra Ads Live (GMV Max) có đang chạy và đủ ngân sách, nhờ video dẫn traffic, xem lại khung giờ.",
  err: "Người thấy phiên nhưng ít người bấm vào: đổi tiêu đề và ảnh bìa, host nói câu mở đầu giữ người trong 30 giây đầu.",
  liveCtr: "Người xem ít bấm vào sản phẩm: host đổi thứ tự ghim, đưa SKU bán chạy lên đầu, giới thiệu sản phẩm ngay khi ghim.",
  ctor: "Bấm vào sản phẩm nhưng ít chốt đơn: brand xem giá, voucher, flash deal và tồn kho SKU đang ghim; host nhắc ưu đãi và thời hạn.",
  ordersViews: "Nhiều người vào xem nhưng ít chốt đơn: host nhắc ưu đãi và hạn chót, bật xu/voucher live, flash deal giờ vàng; brand xem giá và tồn kho SKU đang ghim.",
  watch: "Người xem rời nhanh: đổi nhịp mở đầu, gắn quà/voucher giữ người trong 30 giây đầu.",
  aov: "Đơn đủ nhưng giá trị mỗi đơn thấp: brand đẩy combo, mua kèm, quà tặng kèm theo mốc giá; host ghim combo trước sản phẩm lẻ."
};

const OUTCOME_LABEL = "kết quả";
/** Mẫu số của GPM: TikTok = LIVE impressions, Shopee = Total Views (Shopee GPM = Sales trên 1.000 Views). */
const GPM_DEN: Record<LiveSession["platform"], string> = { TikTok: "imp", Shopee: "views" };

export function checkShift(bench: ShiftBenchmark, input: ShiftSnapshotInput, hist: AdsHistory | null): ShiftCheck | null {
  const hours = input.minutes / 60;
  if (!(hours > 0)) return null;
  const c = input.counts;
  const chain = funnelChain(bench, (k) => c[k] != null);
  const steps: CheckRow[] = [];
  for (const item of chain.steps) {
    const total = c[item.key];
    if (total == null || !(total >= 0)) continue;
    const value = total / hours;
    steps.push({ key: item.key, label: item.label, value, total, zone: benchZone(item, value), item });
  }
  const rates: CheckRow[] = [];
  for (const item of chain.arrows) {
    if (!item) continue;
    const parts = RATE_PARTS[item.key];
    const num = parts ? c[parts[0]] : null, den = parts ? c[parts[1]] : null;
    if (num == null || den == null || !(den > 0)) continue;
    const value = (num / den) * 100;
    rates.push({ key: item.key, label: item.label, value, zone: benchZone(item, value), item });
  }
  const outcomes: CheckRow[] = [];
  const g = input.gmv;
  for (const item of bench.outcomes) {
    let value: number | null = null;
    if (g != null) {
      if (item.key === "gmvPerHour") value = g / hours;
      else if (item.key === "gpm") { const den = c[GPM_DEN[bench.platform]]; value = den != null && den > 0 ? (g / den) * 1000 : null; }
      else if (item.key === "aov") value = c.orders != null && c.orders > 0 ? g / c.orders : null;
    }
    if (item.key === "watch") value = input.watchSeconds != null && input.watchSeconds > 0 ? input.watchSeconds : null;
    if (value != null) outcomes.push({ key: item.key, label: item.label, value, zone: benchZone(item, value), item });
  }

  // Chỗ gãy: lượng vào phễu (bậc đầu) rồi từng tỷ lệ theo thứ tự phễu.
  const low = (z: BenchZone): z is "off" | "act" => z === "off" || z === "act";
  const breaks: FunnelBreak[] = [];
  const first = chain.steps[0] ? steps.find((s) => s.key === chain.steps[0].key) : undefined;
  if (first && low(first.zone)) breaks.push({ key: first.key, label: first.label.replace("/giờ", ""), kind: "volume", actual: first.value, avg: first.item.p50, vsAvg: first.value / first.item.p50 - 1, zone: first.zone, action: ACTION[first.key] ?? "", item: first.item });
  for (const r of chain.arrows) {
    const row = r ? rates.find((x) => x.key === r.key) : undefined;
    if (row && low(row.zone)) breaks.push({ key: row.key, label: row.label, kind: "rate", actual: row.value, avg: row.item.p50, vsAvg: row.value / row.item.p50 - 1, zone: row.zone, action: ACTION[row.key] ?? "", item: row.item });
  }

  // Đơn đủ mà GMV/giờ vẫn thấp ⇒ gãy ở giá trị mỗi đơn (AOV), không phải ở phễu.
  const gph = outcomes.find((o) => o.key === "gmvPerHour");
  const ordersStep = steps.find((x) => x.key === "orders");
  const aov = outcomes.find((o) => o.key === "aov");
  if (gph && low(gph.zone) && ordersStep && !low(ordersStep.zone) && aov && low(aov.zone))
    breaks.push({ key: "aov", label: aov.label, kind: "value", actual: aov.value, avg: aov.item.p50, vsAvg: aov.value / aov.item.p50 - 1, zone: aov.zone, action: ACTION.aov, item: aov.item });

  // Kết quả cuối của phễu: GMV/giờ, không có GMV thì Đơn/giờ.
  const result = outcomes.find((o) => o.key === "gmvPerHour")?.zone ?? steps.find((s) => s.key === "orders")?.zone ?? null;
  const known = steps.length + rates.length > 0 && result != null;
  const severe = breaks.filter((b) => b.zone === "off").length;
  let verdict: BenchZone | null = null;
  if (known) {
    if (breaks.length === 0 && result === "ot") verdict = "ot";
    else if (result === "off" && severe >= 2) verdict = "off";
    else if (breaks.length > 0 || result === "off" || result === "act") verdict = "act";
    else verdict = "ok";
  }
  const names = breaks.map((b) => b.label).join(", ");
  const headline =
    verdict === "ot" ? "Phễu không gãy bậc nào và kết quả vượt trung bình ca cùng loại: có thể xin OT." :
    verdict === "ok" ? "Phễu quanh mức trung bình ca cùng loại, không có chỗ gãy." :
    verdict === "act" ? (breaks.length ? `Gãy ở ${names}.` : `Phễu không gãy bậc nào nhưng ${OUTCOME_LABEL} dưới trung bình.`) :
    verdict === "off" ? `Gãy ở nhiều bậc (${names}) và ${OUTCOME_LABEL} thuộc nhóm yếu nhất: cân nhắc kết thúc sớm nếu xử lý xong mà chưa lên.` :
    "";

  const ads = input.ads != null && input.ads > 0 ? adviseAds(bench, hist, hours, input.ads, g) : null;
  return { hours, steps, rates, outcomes, verdict, headline, breaks, adsLine: ads?.advice ?? "", ads };
}

// ── Ca nối: trừ số lúc giao ca (01/11/2026) ─────────────────────────────────────────────────────────────────────────────────
// Dashboard là số CỘNG DỒN từ lúc mở phòng (cả "Duration"), nên ở ca nối nó gồm cả phần của host ca trước. Muốn chấm riêng ca hiện tại thì trừ đi số
// đã thấy trên Dashboard LÚC GIAO CA — báo cáo giao ca của ca trước đã lưu GMV / Views / Orders / ATC cộng dồn (LiveSessionReport.cum*). Impressions,
// Product clicks, Ads cộng dồn lúc giao ca chưa có sẵn trong app: OP gõ nếu có, không thì bậc đó KHÔNG được chấm (không đoán).

export interface HandoverBase {
  /** Số phút phòng đã live lúc giao ca (cùng mốc với Duration trên Dashboard). */
  minutes: number | null;
  gmv: number | null;
  ads: number | null;
  counts: Record<string, number | null>;
}

const CUM_OF: Record<string, "cumViews" | "cumOrders" | "cumAtc"> = { views: "cumViews", orders: "cumOrders", atc: "cumAtc" };

const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };

/** Phút từ giờ bắt đầu đến giờ kết thúc, ca qua nửa đêm tính thêm 24 giờ. */
const spanMin = (start: string, end: string) => { const d = hm(end) - hm(start); return d > 0 ? d : d + 1440; };

export interface HandoverSource {
  /** Ca trước (đã giao) mà số cộng dồn được lấy ra. */
  session: LiveSession;
  base: HandoverBase;
}

/**
 * Ca trước của cùng brand × sàn trong ngày `date` có báo cáo giao ca (có số cộng dồn), lấy ca kết thúc muộn nhất. Số phút lúc giao ca = từ lúc mở phòng
 * (ca đầu của chuỗi ca nối liền nhau, lệch ≤ 15 phút) đến giờ kết thúc ca đó. `null` khi không có ca nào có số cộng dồn.
 */
export function findHandoverSource(sessions: LiveSession[], brandId: string, platform: LiveSession["platform"], date: string, funnelKeys: string[]): HandoverSource | null {
  const day = sessions.filter((s) => s.brandId === brandId && s.platform === platform && s.date === date && s.status !== "Cancelled" && !s.excludedFromReports);
  const withCum = day.filter((s) => s.report && (s.report.cumGmv != null || s.report.cumViews != null || s.report.cumOrders != null || s.report.cumAtc != null));
  if (!withCum.length) return null;
  const prev = [...withCum].sort((a, b) => spanMin("00:00", b.endTime) - spanMin("00:00", a.endTime) || b.endTime.localeCompare(a.endTime))[0];
  // Lần ngược chuỗi ca nối liền nhau để tìm lúc mở phòng.
  let first = prev;
  for (let guard = 0; guard < 12; guard++) {
    const before = day.find((s) => s.id !== first.id && Math.abs(((hm(s.endTime) - hm(first.startTime) + 1440) % 1440)) <= 15 || (s.id !== first.id && ((hm(first.startTime) - hm(s.endTime) + 1440) % 1440) <= 15));
    if (!before || before.id === first.id || hm(before.startTime) === hm(first.startTime)) break;
    first = before;
  }
  const minutes = spanMin(first.startTime, prev.endTime);
  const r = prev.report!;
  const counts: Record<string, number | null> = {};
  for (const k of funnelKeys) counts[k] = CUM_OF[k] ? (r[CUM_OF[k]] ?? null) : null;
  return { session: prev, base: { minutes, gmv: r.cumGmv ?? null, ads: null, counts } };
}

/** Số của RIÊNG ca hiện tại = số Dashboard − số lúc giao ca. Thiếu số lúc giao ca của một mục ⇒ mục đó null (không chấm). `null` khi không tính được số giờ. */
export function subtractHandover(input: ShiftSnapshotInput, base: HandoverBase): ShiftSnapshotInput | null {
  if (base.minutes == null) return null;
  const minutes = input.minutes - base.minutes;
  if (!(minutes > 0)) return null;
  const sub = (a: number | null, b: number | null) => (a != null && b != null && a >= b ? a - b : null);
  const counts: Record<string, number | null> = {};
  for (const k of Object.keys(input.counts)) counts[k] = sub(input.counts[k], base.counts[k] ?? null);
  return { minutes, gmv: sub(input.gmv, base.gmv), ads: sub(input.ads, base.ads), counts, watchSeconds: null };
}
