import { METRIC } from "../metricGlossary";
import type { BrandMonthPlanSlot } from "../../types";
import { CAMP_DAY_BUCKET_ORDER, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../campaignDays";
import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import type { SkuRankSlice } from "../dataraw/monthlyProductSlice";
import type { ShopDaysMonthSlice } from "../dataraw/monthlyProductSlice";
import { vnDateOf } from "../dataraw/vnDate";
import { fmtVndShort } from "../format";
import { sessionDurationHours } from "../pnl";

// Report Tháng 8 phần (user chốt 2026-09-25) — các phép tính MỚI của bố cục mới, tách khỏi component
// để test được: so cùng số ngày, tách nguyên nhân GMV thay đổi, tổng shop theo kênh, dấu hiệu xu hướng
// và bản nháp tóm tắt / việc tháng sau. Mọi hàm thuần, không đọc DB.
//
// Chỉ số theo ca đi qua đúng CreatorLivePerfRow mà Report Tháng vốn ăn (sessionToLivePerfRow hoặc file
// dự phòng) — không có bản công thức thứ hai. CTOR = Orders ÷ Product clicks (như deck + từ điển chỉ số):
// đếm theo SKU order thì quà tặng kèm (Jibbitz 0–3k, CTOR > 100%) thổi CTOR lên — xem deepAnalysis.ts.

// ---------- cửa sổ so sánh ----------

export interface CompareWindow {
  curStart: string;
  curEnd: string;
  prevStart: string;
  prevEnd: string;
  /** Tháng report chưa có số tới ngày cuối ⇒ so cùng số ngày thay vì cả tháng trước. */
  partial: boolean;
  /** "1–22/09 so với 1–22/08" hoặc "tháng 09 so với tháng 08". */
  label: string;
}

function lastDayOf(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
const dd = (n: number) => String(n).padStart(2, "0");

/** `through` = ngày muộn nhất có số của tháng report (coverage.sessionsThrough). Không có ⇒ coi như trọn tháng. */
export function compareWindow(month: string, through: string | null): CompareWindow {
  const prev = prevMonthOf(month);
  const last = lastDayOf(month);
  const day = through && through.startsWith(month) ? Number(through.slice(8, 10)) : last;
  const partial = day < last;
  const prevDay = partial ? Math.min(day, lastDayOf(prev)) : lastDayOf(prev);
  return {
    curStart: `${month}-01`,
    curEnd: `${month}-${dd(day)}`,
    prevStart: `${prev}-01`,
    prevEnd: `${prev}-${dd(prevDay)}`,
    partial,
    label: partial ? `1–${day}/${month.slice(5)} so với 1–${prevDay}/${prev.slice(5)}` : `tháng ${month.slice(5)} so với tháng ${prev.slice(5)}`
  };
}

// ---------- chỉ số live theo cửa sổ ----------

export interface LiveStats {
  sessions: number;
  gmv: number;
  hours: number;
  views: number;
  orders: number;
  skuOrders: number;
  itemsSold: number;
  productImpressions: number;
  productClicks: number;
  gmvPerHour: number | null;
  viewsPerHour: number | null;
  gmvPerView: number | null;
  ctr: number | null;
  ctor: number | null;
  aov: number | null;
  /** Sản phẩm mỗi đơn = itemsSold / orders (cùng công thức `upt` của creatorLivePerfMetrics). */
  upt: number | null;
  /** GMV mỗi sản phẩm = GMV / itemsSold. Đọc CÙNG với UPT: UPT giảm thì số này tự tăng dù giá bán không đổi. */
  pricePerItem: number | null;
  /** Click sản phẩm / lượt xem — cột "LIVE CTR" của TikTok (khớp deck report Crocs: T8 56,2%). */
  liveCtr: number | null;
}

export function liveStatsFromRows(rows: CreatorLivePerfRow[], start: string, end: string): LiveStats {
  let sessions = 0, gmv = 0, hours = 0, views = 0, orders = 0, skuOrders = 0, itemsSold = 0, productImpressions = 0, productClicks = 0;
  for (const r of rows) {
    const d = vnDateOf(r.startTime);
    if (d < start || d > end) continue;
    sessions += 1;
    gmv += r.gmv;
    hours += r.hours;
    views += r.views;
    orders += r.orders;
    skuOrders += r.skuOrders;
    itemsSold += r.itemsSold;
    productImpressions += r.productImpressions;
    productClicks += r.productClicks;
  }
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    sessions, gmv, hours, views, orders, skuOrders, itemsSold, productImpressions, productClicks,
    gmvPerHour: div(gmv, hours),
    viewsPerHour: div(views, hours),
    gmvPerView: div(gmv, views),
    ctr: productImpressions > 0 ? (productClicks / productImpressions) * 100 : null,
    ctor: productClicks > 0 ? (orders / productClicks) * 100 : null,
    aov: div(gmv, orders),
    upt: div(itemsSold, orders),
    pricePerItem: div(gmv, itemsSold),
    liveCtr: views > 0 ? (productClicks / views) * 100 : null
  };
}

export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

// ---------- tách nguyên nhân ----------

export type DriverKey = "hours" | "viewsPerHour" | "liveCtr" | "ctor" | "aov";
export const DRIVER_LABEL: Record<DriverKey, string> = {
  hours: METRIC.liveHours,
  viewsPerHour: METRIC.viewsPerHour,
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov
};

export interface DriverBreakdown {
  from: number;
  to: number;
  delta: number;
  parts: { key: DriverKey; value: number; change: number }[];
}

/** GMV = tích các thừa số. Chia ΔGMV theo tỷ trọng log của từng thừa số — các phần cộng đúng bằng ΔGMV,
 *  không phụ thuộc thứ tự như cách "đổi lần lượt từng biến". Thiếu thừa số ở một bên ⇒ null (không bịa). */
function logShareBreakdown(fromGmv: number, toGmv: number, factors: [DriverKey, number, number][]): DriverBreakdown | null {
  if (fromGmv <= 0 || toGmv <= 0 || factors.some(([, x, y]) => !(x > 0) || !(y > 0))) return null;
  const delta = toGmv - fromGmv;
  // Chia theo tổng log của CHÍNH các thừa số (bằng log(GMV mới/cũ) khi tích đúng bằng GMV) — số nguồn làm tròn
  // hay lệch vài đồng thì các phần vẫn cộng đúng ΔGMV.
  const total = factors.reduce((a, [, x, y]) => a + Math.log(y / x), 0);
  const parts = factors.map(([key, x, y]) => {
    const l = Math.log(y / x);
    // Tổng log ≈ 0 thì tỷ trọng vô nghĩa (chia cho ~0) — dùng xấp xỉ bậc nhất quanh GMV đầu kỳ.
    const value = Math.abs(total) < 1e-9 ? fromGmv * l : (delta * l) / total;
    return { key, value, change: ((y - x) / x) * 100 };
  });
  return { from: fromGmv, to: toGmv, delta, parts };
}

/** GMV = Giờ live × Views/giờ × LIVE CTR × CTOR × AOV (đúng tích: giờ × views/giờ = views; × clicks/views =
 *  clicks; × orders/clicks = orders; × GMV/orders = GMV). Một phép tách thay cho 2 waterfall cũ (traffic 3 thừa
 *  số + giỏ hàng Orders × UPT × Avg. price): phía giỏ hàng bị quà tặng 0đ làm méo — UPT/Avg. price đổi theo quà
 *  chứ không theo cách bán, còn AOV thì không (quà 0đ không đổi GMV mỗi đơn). */
export function driverBreakdown(a: LiveStats, b: LiveStats): DriverBreakdown | null {
  return logShareBreakdown(a.gmv, b.gmv, [
    ["hours", a.hours, b.hours],
    ["viewsPerHour", a.viewsPerHour ?? 0, b.viewsPerHour ?? 0],
    ["liveCtr", a.liveCtr ?? 0, b.liveCtr ?? 0],
    ["ctor", a.ctor ?? 0, b.ctor ?? 0],
    ["aov", a.aov ?? 0, b.aov ?? 0]
  ]);
}

// ---------- khung camp ----------

export interface CampCompareRow {
  key: CampDayBucket;
  cur: LiveStats;
  /** Cùng khung đó của tháng trước (trọn khung — camp là ngày cố định, không cắt theo cùng kỳ). */
  prev: LiveStats;
  target: number | null;
}

/** So từng khung camp với CHÍNH khung đó tháng trước. Mỗi tháng phân loại ngày theo khoảng camp của
 *  tháng đó — dùng khoảng của tháng này cho tháng trước thì ngày camp tháng trước bị tính là ngày thường. */
export function campCompare(
  curRows: CreatorLivePerfRow[],
  cur: { start: string; end: string; overrides?: CampOverrides },
  prevRows: CreatorLivePerfRow[],
  prev: { start: string; end: string; overrides?: CampOverrides },
  targets: Partial<Record<CampDayBucket, number | null>>
): CampCompareRow[] {
  const split = (rows: CreatorLivePerfRow[], overrides?: CampOverrides) => {
    const out: Record<CampDayBucket, CreatorLivePerfRow[]> = { dday: [], midmonth: [], payday: [], daily: [] };
    for (const r of rows) out[resolveCampBucketType(vnDateOf(r.startTime), overrides)].push(r);
    return out;
  };
  const c = split(curRows, cur.overrides);
  const p = split(prevRows, prev.overrides);
  return CAMP_DAY_BUCKET_ORDER.map((key) => ({
    key,
    cur: liveStatsFromRows(c[key], cur.start, cur.end),
    prev: liveStatsFromRows(p[key], prev.start, prev.end),
    target: targets[key] ?? null
  }));
}

export interface PlanCampAllocation {
  key: CampDayBucket;
  target: number;
  hours: number;
  slots: number;
  /** % của tổng target kế hoạch. */
  share: number | null;
  /** GMV mỗi giờ cần đạt để về đích khung này. */
  requiredGmvPerHour: number | null;
}

// Giờ kế hoạch của ca — dùng chung pnl.sessionDurationHours (giờ bắt đầu = giờ kết thúc ra 0, không phải 24 giờ).
const slotHours = sessionDurationHours;

/** Cộng target + giờ của ca Kế Hoạch Tháng theo khung camp (khoảng camp của chính kế hoạch đó). */
export function planCampAllocation(slots: Pick<BrandMonthPlanSlot, "date" | "startTime" | "endTime" | "targetGmv">[], overrides?: CampOverrides): PlanCampAllocation[] {
  const acc: Record<CampDayBucket, { target: number; hours: number; slots: number }> = {
    dday: { target: 0, hours: 0, slots: 0 },
    midmonth: { target: 0, hours: 0, slots: 0 },
    payday: { target: 0, hours: 0, slots: 0 },
    daily: { target: 0, hours: 0, slots: 0 }
  };
  for (const s of slots) {
    const a = acc[resolveCampBucketType(s.date, overrides)];
    a.target += s.targetGmv || 0;
    a.hours += slotHours(s.startTime, s.endTime);
    a.slots += 1;
  }
  const total = CAMP_DAY_BUCKET_ORDER.reduce((x, k) => x + acc[k].target, 0);
  return CAMP_DAY_BUCKET_ORDER.map((key) => ({
    key,
    ...acc[key],
    share: total > 0 ? (acc[key].target / total) * 100 : null,
    requiredGmvPerHour: acc[key].hours > 0 && acc[key].target > 0 ? acc[key].target / acc[key].hours : null
  }));
}

// ---------- SKU: hạng tháng trước → tháng này ----------

export interface SkuMove {
  name: string;
  rank: number;
  /** null = ngoài top `limit` tháng trước (hoặc tháng trước không có file). */
  prevRank: number | null;
  gmv: number;
  prevGmv: number | null;
  /** % đổi GMV — theo GMV MỖI NGÀY khi 2 file phủ số ngày khác nhau (xem `perDay`). */
  gmvChange: number | null;
  gmvLive: number;
  orders: number;
  itemsSold: number | null;
  ctr: number | null;
  ctor: number | null;
}

export interface SkuMoves {
  rows: SkuMove[];
  /** File tháng này và tháng trước phủ số ngày khác nhau ⇒ % đổi GMV tính trên GMV mỗi ngày. */
  perDay: boolean;
  curDays: number | null;
  prevDays: number | null;
  prevLimit: number | null;
}

const daysIn = (a?: string, b?: string) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1 : null);

/** File Sản Phẩm là tổng cả kỳ, không cắt theo ngày được. Tháng này mới có file tới 22/09 mà tháng trước
 *  đủ 31 ngày thì so thẳng GMV là so 22 ngày với 31 ngày (deck Crocs T8 dính đúng lỗi này: "dữ liệu T8
 *  mới tính đến 27/08") ⇒ so GMV mỗi ngày. Hạng thì so thẳng được. */
export function skuMoves(cur: SkuRankSlice | null, prev: SkuRankSlice | null, top = 10): SkuMoves | null {
  if (!cur?.hasAnyBatch || cur.items.length === 0) return null;
  const curDays = daysIn(cur.periodStart, cur.periodEnd);
  const prevDays = prev?.hasAnyBatch ? daysIn(prev.periodStart, prev.periodEnd) : null;
  const perDay = curDays != null && prevDays != null && curDays !== prevDays;
  const prevBy = new Map((prev?.hasAnyBatch ? prev.items : []).map((r) => [r.name, r]));
  const rows = cur.items.slice(0, top).map((r) => {
    const p = prevBy.get(r.name) ?? null;
    const gmvChange = !p ? null : perDay ? pctChange(p.gmv / prevDays!, r.gmv / curDays!) : pctChange(p.gmv, r.gmv);
    return {
      name: r.name,
      rank: r.rank,
      prevRank: p?.rank ?? null,
      gmv: r.gmv,
      prevGmv: p?.gmv ?? null,
      gmvChange,
      gmvLive: r.gmvLive,
      orders: r.orders,
      itemsSold: r.itemsSold ?? null,
      ctr: r.impressions && r.clicks != null ? (r.clicks / r.impressions) * 100 : null,
      // CTOR = Orders ÷ Product clicks — cùng định nghĩa cả report (đếm SKU order thì SKU quà tặng ra > 100%).
      ctor: r.clicks ? (r.orders / r.clicks) * 100 : null
    };
  });
  return { rows, perDay, curDays, prevDays, prevLimit: prev?.hasAnyBatch ? prev.limit : null };
}

// ---------- toàn shop ----------

export interface ShopTotals {
  gmv: number;
  refunds: number;
  orders: number;
  visitors: number;
  liveLinked: number;
  affiliate: number;
  video: number;
  days: number;
  through: string | null;
}

export function shopTotals(slice: ShopDaysMonthSlice | null | undefined, start: string, end: string): ShopTotals | null {
  if (!slice?.hasAnyBatch) return null;
  const days = slice.days.filter((d) => d.date >= start && d.date <= end);
  if (days.length === 0) return null;
  const sum = (k: keyof (typeof days)[number]) => days.reduce((a, d) => a + (Number(d[k]) || 0), 0);
  return {
    gmv: sum("gmv"),
    refunds: sum("refunds"),
    orders: sum("orders"),
    visitors: sum("visitors"),
    liveLinked: sum("liveLinked"),
    affiliate: sum("affiliate"),
    video: sum("video"),
    days: days.length,
    through: days[days.length - 1].date
  };
}

export interface ChannelMix {
  month: string;
  shopGmv: number;
  liveLinked: number;
  affiliate: number;
  video: number;
  card: number | null;
  /** 4 kênh ÷ tổng shop — kiểm chéo; lệch xa 100% nghĩa là thiếu file hoặc TikTok đổi cột. */
  coverage: number | null;
  refundRate: number | null;
}

export function channelMix(month: string, shop: ShopTotals | null, card: number | null): ChannelMix | null {
  if (!shop || shop.gmv <= 0) return null;
  const sum = shop.liveLinked + shop.affiliate + shop.video + (card ?? 0);
  return {
    month,
    shopGmv: shop.gmv,
    liveLinked: shop.liveLinked,
    affiliate: shop.affiliate,
    video: shop.video,
    card,
    coverage: card == null ? null : (sum / shop.gmv) * 100,
    refundRate: (shop.refunds / shop.gmv) * 100
  };
}

// ---------- KPI cả shop (0122) ----------

export interface ShopKpiProgress {
  target: number;
  actual: number;
  /** % KPI đã đạt tới ngày có số. */
  pct: number;
  /** Tháng chưa hết ⇒ dự kiến cả tháng; tháng đủ ⇒ = actual. */
  projected: number;
  projectedPct: number;
  partial: boolean;
  /** "prev" = theo nhịp cùng kỳ tháng trước (tỷ trọng các ngày còn lại của tháng trước), "linear" = chia đều theo ngày. */
  method: "prev" | "linear" | null;
}

/** KPI GMV cả shop brand giao (Kế Hoạch Tháng) vs GMV cả shop Shop Analytics. Tháng chưa hết thì dự kiến
 *  theo NHỊP CÙNG KỲ tháng trước (GMV tới ngày N ÷ tỷ trọng 1..N của tháng trước) — chia đều theo ngày bỏ
 *  qua camp còn ở phía trước (Pay Day 23–25); không có tháng trước mới chia đều. */
export function shopKpiProgress(
  target: number | null | undefined,
  cur: ShopTotals | null,
  lastDay: number,
  prevShape: { toDay: number; total: number } | null
): ShopKpiProgress | null {
  if (!target || target <= 0 || !cur || cur.gmv <= 0) return null;
  const throughDay = cur.through ? Number(cur.through.slice(8, 10)) : lastDay;
  const partial = throughDay < lastDay;
  let projected = cur.gmv;
  let method: ShopKpiProgress["method"] = null;
  if (partial) {
    if (prevShape && prevShape.toDay > 0 && prevShape.total > prevShape.toDay) {
      projected = (cur.gmv * prevShape.total) / prevShape.toDay;
      method = "prev";
    } else {
      projected = (cur.gmv / throughDay) * lastDay;
      method = "linear";
    }
  }
  return { target, actual: cur.gmv, pct: (cur.gmv / target) * 100, projected, projectedPct: (projected / target) * 100, partial, method };
}

// ---------- dấu hiệu xu hướng ----------

export interface TrendSignal {
  label: string;
  values: number[];
  direction: "up" | "down";
  /** Số tháng liên tiếp cùng chiều tính tới tháng report (≥ 3 mới báo). */
  streak: number;
  totalChange: number;
}

/** Dãy cũ → mới. Báo khi ≥ 3 tháng liên tiếp cùng chiều (tính cả tháng report) và tổng biến động ≥ 10%. */
export function trendSignal(label: string, values: (number | null)[]): TrendSignal | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length < 3 || v.length !== values.length) return null;
  const last = v.length - 1;
  const dir = v[last] < v[last - 1] ? "down" : v[last] > v[last - 1] ? "up" : null;
  if (!dir) return null;
  let streak = 1;
  for (let i = last - 1; i > 0; i--) {
    if ((dir === "down" && v[i] < v[i - 1]) || (dir === "up" && v[i] > v[i - 1])) streak++;
    else break;
  }
  const first = v[last - streak];
  const totalChange = first !== 0 ? ((v[last] - first) / Math.abs(first)) * 100 : 0;
  if (streak < 2 || Math.abs(totalChange) < 10) return null;
  // streak đếm số BƯỚC đổi; số tháng liên tiếp = bước + 1.
  return { label, values: v.slice(last - streak), direction: dir, streak: streak + 1, totalChange };
}

// ---------- bản nháp văn xuôi ----------

// Kết luận trước (Pyramid Principle, user chọn 2026-09-26): 3–5 câu — kết quả, nguyên nhân, thị trường hay vận
// hành, cơ hội quy ra tiền, lưu ý quà tặng. Chi tiết từng mảng nằm ở khung Insight của từng phần, không lặp ở đây.
export interface NarrativeInput {
  month: string;
  window: CompareWindow;
  shopCur: ShopTotals | null;
  shopPrev: ShopTotals | null;
  liveCur: LiveStats;
  livePrev: LiveStats;
  drivers: DriverBreakdown | null;
  targetGmv: number | null;
  nextMonth: string;
  nextPlan: { targetGmv: number; status: "draft" | "locked"; slotCount: number } | null;
  shopKpi?: ShopKpiProgress | null;
  /** Câu nhóm đối chứng (deepAnalysis.controlLine). */
  controlLine?: string | null;
  /** Nhóm ngày mà nhóm đối chứng kết luận "hụt do vận hành". */
  controlOpsGroup?: "daily" | "camp" | null;
  /** Cơ hội ngày thường (deepAnalysis.dailyGapLine) kèm số tiền để so với cơ hội khác. */
  dailyGap?: { line: string; value: number } | null;
  /** Câu quà tặng (deepAnalysis.giftLine). */
  giftLine?: string | null;
  /** Việc cần làm của khung Insight phần 2–6 đã bỏ trùng (sectionInsights.sectionNextSteps). */
  sectionSteps?: string[];
}

const money = (v: number) => fmtVndShort(v);
export const pctTxt = (v: number, digits = 1) => `${v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
export const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${pctTxt(Math.abs(v), digits)}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;

// Tên chỉ số chuẩn (Views/giờ, UPT, Avg. price…) giữ nguyên hoa/thường giữa câu; chỉ "Giờ live" là chữ Việt.
const lowerFirst = (t: string) => (t === METRIC.liveHours ? "giờ live" : t);

export const UPT_LABEL = METRIC.upt;
export const LIVE_CTR_LABEL = METRIC.liveCtr;
export const PRODUCT_CTR_LABEL = METRIC.productCtr;

/** 4 thừa số của GMV/giờ — phần agency điều khiển được (giờ live là quyết định lịch, không phải hiệu suất). */
export const RATE_FACTORS = ["viewsPerHour", "liveCtr", "ctor", "aov"] as const;
export type RateFactor = (typeof RATE_FACTORS)[number];

export function factorValueText(key: RateFactor, s: LiveStats): string {
  const v = s[key];
  if (v == null) return "—";
  if (key === "viewsPerHour") return Math.round(v).toLocaleString("vi-VN");
  if (key === "liveCtr") return pctTxt(v);
  if (key === "ctor") return pctTxt(v, 2);
  return fmtVndShort(v);
}

export const FACTOR_ACTION: Record<RateFactor, string> = {
  viewsPerHour: "Điểm nghẽn ở traffic — rà khung giờ live, ảnh bìa/tiêu đề phiên và ngân sách đẩy live.",
  liveCtr: "Điểm nghẽn ở bước bấm sản phẩm — ghim sản phẩm và nhắc bấm giỏ thường xuyên hơn trong live.",
  ctor: "Điểm nghẽn ở bước chốt đơn — rà giá, voucher và cách chốt của nhóm SKU chủ lực.",
  aov: "Giá trị mỗi đơn giảm — thử combo hoặc ưu đãi theo ngưỡng AOV."
};

export function autoSummary(i: NarrativeInput): string[] {
  const out: string[] = [];
  const through = i.window.curEnd;
  const liveShare = i.shopCur && i.shopCur.gmv > 0 ? (i.liveCur.gmv / i.shopCur.gmv) * 100 : null;

  const head = i.shopCur
    ? `Tới ${dayMonth(through)}, shop đạt ${money(i.shopCur.gmv)} GMV; live do agency vận hành mang về ${money(i.liveCur.gmv)}${liveShare != null ? ` (${pctTxt(liveShare)} tổng shop)` : ""}.`
    : `Tới ${dayMonth(through)}, live do agency vận hành đạt ${money(i.liveCur.gmv)} GMV qua ${i.liveCur.sessions} ca.`;
  const target = i.targetGmv && i.targetGmv > 0 ? ` Đạt ${pctTxt((i.liveCur.gmv / i.targetGmv) * 100, 0)} target tháng (${money(i.targetGmv)}).` : "";
  const k = i.shopKpi;
  const kpi = k
    ? k.partial
      ? ` Cả shop đạt ${pctTxt(k.pct, 0)} KPI ${money(k.target)}; ${k.method === "prev" ? "theo nhịp cùng kỳ tháng trước" : "chia đều theo ngày"}, dự kiến cuối tháng ~${money(k.projected)} (${pctTxt(k.projectedPct, 0)} KPI).`
      : ` Cả shop đạt ${pctTxt(k.pct, 0)} KPI ${money(k.target)}${k.pct >= 100 ? ` (vượt ${money(k.actual - k.target)})` : ` (thiếu ${money(k.target - k.actual)})`}.`
    : "";
  out.push(head + target + kpi);

  const gmvChg = pctChange(i.livePrev.gmv, i.liveCur.gmv);
  const ghChg = pctChange(i.livePrev.gmvPerHour, i.liveCur.gmvPerHour);
  if (gmvChg != null) {
    const hChg = pctChange(i.livePrev.hours, i.liveCur.hours);
    const parts = [hChg != null ? `giờ live ${signed(hChg)}` : null, ghChg != null ? `GMV/giờ ${signed(ghChg)}` : null].filter(Boolean).join(", ");
    const lbl = i.window.label.charAt(0).toUpperCase() + i.window.label.slice(1);
    let txt = `${lbl}: LIVE GMV ${signed(gmvChg)}${parts ? ` (${parts})` : ""}.`;
    const d = i.drivers;
    if (d && ghChg != null && Math.abs(ghChg) >= 1) {
      const rate = d.parts.filter((p): p is typeof p & { key: RateFactor } => (RATE_FACTORS as readonly string[]).includes(p.key));
      const same = rate.filter((p) => Math.sign(p.value) === Math.sign(ghChg)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 2);
      const offset = rate.filter((p) => Math.sign(p.value) !== Math.sign(ghChg)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
      const amt = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
      if (same.length) {
        txt += ` GMV/giờ ${ghChg < 0 ? "giảm" : "tăng"} chủ yếu do ${same.map((p) => `${lowerFirst(DRIVER_LABEL[p.key])} (${signed(p.change, 0)}, ${amt(p.value)})`).join(" và ")}`;
        txt += offset && Math.abs(offset.value) >= Math.abs(d.delta) * 0.1 ? `; ${DRIVER_LABEL[offset.key]} ${signed(offset.change, 0)} bù lại ${money(Math.abs(offset.value))}.` : ".";
      }
    }
    out.push(txt);
  }

  if (i.controlLine) out.push(i.controlLine);

  // Cơ hội lớn nhất quy ra tiền: ngày thường về GMV/giờ kỳ trước, hoặc thừa số tụt nhiều tiền nhất về mức kỳ trước.
  const worst = i.drivers?.parts
    .filter((p): p is typeof p & { key: RateFactor } => (RATE_FACTORS as readonly string[]).includes(p.key) && p.value < 0)
    .sort((a, b) => a.value - b.value)[0];
  if (i.dailyGap && (!worst || i.dailyGap.value >= -worst.value)) out.push(`Cơ hội lớn nhất: ${i.dailyGap.line.charAt(0).toLowerCase()}${i.dailyGap.line.slice(1)}`);
  else if (worst) out.push(`Cơ hội lớn nhất: đưa ${DRIVER_LABEL[worst.key]} về mức kỳ trước (${factorValueText(worst.key, i.livePrev)}, nay ${factorValueText(worst.key, i.liveCur)}) — LIVE GMV thêm ~${money(-worst.value)}.`);

  if (i.giftLine) out.push(i.giftLine);
  return out;
}

export function autoNextSteps(i: NarrativeInput): string[] {
  const out: string[] = [];
  const worst = RATE_FACTORS.map((k) => ({ k, c: pctChange(i.livePrev[k], i.liveCur[k]) }))
    .filter((x): x is { k: RateFactor; c: number } => x.c != null && x.c <= -5)
    .sort((a, b) => a.c - b.c)[0];
  if (worst) out.push(`${DRIVER_LABEL[worst.k]} ${signed(worst.c, 0)} so với cùng kỳ. ${FACTOR_ACTION[worst.k]}`);
  if (i.controlOpsGroup) {
    out.push(
      `${i.controlOpsGroup === "daily" ? "Ngày thường" : "Ngày camp"} là chỗ hụt của riêng live (giảm mạnh hơn phần còn lại của shop) — rà khung giờ, host và kịch bản của các ca ${i.controlOpsGroup === "daily" ? "ngày thường" : "ngày camp"} trước khi chốt lịch tháng ${i.nextMonth.slice(5)}.`
    );
  }
  if (i.giftLine && /giảm từ/.test(i.giftLine)) {
    out.push("Hỏi brand về chương trình quà tặng kèm đã giảm — nếu quà từng kéo tỷ lệ chốt đơn, đề xuất chạy lại cho ngày camp.");
  }
  const hChg = pctChange(i.livePrev.hours, i.liveCur.hours);
  const ghChg = pctChange(i.livePrev.gmvPerHour, i.liveCur.gmvPerHour);
  if (hChg != null && ghChg != null && hChg > 5 && ghChg <= -10) out.push(`Tăng giờ live nhưng GMV/giờ giảm — ưu tiên dồn giờ vào khung giờ và ngày Campaign có GMV/giờ cao nhất thay vì kéo dài ca.`);
  for (const t of i.sectionSteps ?? []) if (!out.includes(t)) out.push(t);
  // Có kế hoạch thì target + số ca đã ở 2 ô ngay dưới danh sách — không viết lại thành 1 việc.
  if (!i.nextPlan) out.push(`Chốt target và lịch live tháng ${i.nextMonth.slice(5)}.`);
  return out;
}
