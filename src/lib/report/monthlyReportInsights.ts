import type { BrandMonthPlanSlot } from "../../types";
import { CAMP_DAY_BUCKET_ORDER, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../campaignDays";
import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import type { SkuRankSlice } from "../dataraw/monthlyProductSlice";
import type { ShopDaysMonthSlice } from "../dataraw/monthlyProductSlice";
import { vnDateOf } from "../dataraw/vnDate";
import { formatCurrencyAdaptive } from "../formatCurrency";

// Report Tháng 8 phần (user chốt 2026-09-25) — các phép tính MỚI của bố cục mới, tách khỏi component
// để test được: so cùng số ngày, tách nguyên nhân GMV thay đổi, tổng shop theo kênh, dấu hiệu xu hướng
// và bản nháp tóm tắt / việc tháng sau. Mọi hàm thuần, không đọc DB.
//
// Chỉ số theo ca đi qua đúng CreatorLivePerfRow mà Report Tháng vốn ăn (sessionToLivePerfRow hoặc file
// dự phòng) — không có bản công thức thứ hai: CTOR = đơn SKU / click như creatorLivePerfMetrics.

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
    ctor: productClicks > 0 ? (skuOrders / productClicks) * 100 : null,
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

export type DriverKey = "hours" | "viewsPerHour" | "gmvPerView" | "orders" | "upt" | "pricePerItem";
export const DRIVER_LABEL: Record<DriverKey, string> = {
  hours: "Giờ live",
  viewsPerHour: "Lượt xem mỗi giờ",
  gmvPerView: "GMV mỗi lượt xem",
  orders: "Số đơn",
  upt: "Sản phẩm mỗi đơn",
  pricePerItem: "GMV mỗi sản phẩm"
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
  const total = Math.log(toGmv / fromGmv);
  const parts = factors.map(([key, x, y]) => {
    const l = Math.log(y / x);
    // ΔGMV ≈ 0 thì tỷ trọng log vô nghĩa (chia cho ~0) — dùng xấp xỉ bậc nhất quanh GMV đầu kỳ.
    const value = Math.abs(total) < 1e-9 ? fromGmv * l : (delta * l) / total;
    return { key, value, change: ((y - x) / x) * 100 };
  });
  return { from: fromGmv, to: toGmv, delta, parts };
}

/** Phía traffic: GMV = giờ × (lượt xem / giờ) × (GMV / lượt xem). */
export function driverBreakdown(a: LiveStats, b: LiveStats): DriverBreakdown | null {
  return logShareBreakdown(a.gmv, b.gmv, [
    ["hours", a.hours, b.hours],
    ["viewsPerHour", a.viewsPerHour ?? 0, b.viewsPerHour ?? 0],
    ["gmvPerView", a.gmvPerView ?? 0, b.gmvPerView ?? 0]
  ]);
}

/** Phía giỏ hàng: GMV = số đơn × (SP / đơn) × (GMV / SP). Bổ sung cho driverBreakdown: deck report Crocs
 *  T8 đọc "giá/SP +24%" thành "GMV tăng nhờ giá" — tách đủ 3 thừa số thì thấy phần lớn là số đơn +10%,
 *  giá/SP tăng chủ yếu vì mỗi đơn ít SP hơn (UPT 1,43 → 1,18). */
export function basketBreakdown(a: LiveStats, b: LiveStats): DriverBreakdown | null {
  return logShareBreakdown(a.gmv, b.gmv, [
    ["orders", a.orders, b.orders],
    ["upt", a.upt ?? 0, b.upt ?? 0],
    ["pricePerItem", a.pricePerItem ?? 0, b.pricePerItem ?? 0]
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

function slotHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let m = eh * 60 + em - (sh * 60 + sm);
  if (m <= 0) m += 24 * 60;
  return m / 60;
}

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
      // CTOR = đơn SKU / click — cùng định nghĩa cột "CTOR (SKU order)" của TikTok.
      ctor: r.clicks && r.skuOrders != null ? (r.skuOrders / r.clicks) * 100 : null
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

export interface NarrativeInput {
  month: string;
  window: CompareWindow;
  shopCur: ShopTotals | null;
  shopPrev: ShopTotals | null;
  liveCur: LiveStats;
  livePrev: LiveStats;
  drivers: DriverBreakdown | null;
  basket: DriverBreakdown | null;
  signals: TrendSignal[];
  targetGmv: number | null;
  /** Khung camp tốt nhất vs ngày thường (GMV/giờ), nếu có. */
  campBest: { label: string; gmvPerHour: number } | null;
  dailyGmvPerHour: number | null;
  nextMonth: string;
  nextPlan: { targetGmv: number; status: "draft" | "locked"; slotCount: number } | null;
  skus?: SkuMoves | null;
}

const money = (v: number) => formatCurrencyAdaptive(v);
const pctTxt = (v: number, digits = 1) => `${v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${pctTxt(Math.abs(v), digits)}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;

// "GMV mỗi lượt xem" giữ nguyên chữ GMV — toLowerCase() cả chuỗi từng ra "gmv mỗi lượt xem".
const lowerFirst = (t: string) => (/^[A-Z]{2}/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

export const UPT_LABEL = "Sản phẩm mỗi đơn";
export const LIVE_CTR_LABEL = "LIVE CTR";

function signalText(s: TrendSignal): string {
  const fmt = (x: number) =>
    s.label === "CTOR" || s.label === "CTR" || s.label === LIVE_CTR_LABEL
      ? pctTxt(x, s.label === LIVE_CTR_LABEL ? 1 : 2)
      : s.label === "AOV"
        ? `${Math.round(x / 1000).toLocaleString("vi-VN")}k đ`
        : s.label === UPT_LABEL
          ? x.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : Math.round(x).toLocaleString("vi-VN");
  return `${s.label} ${s.direction === "down" ? "giảm" : "tăng"} ${s.streak} tháng liên tiếp: ${s.values.map(fmt).join(" → ")}`;
}

export function autoSummary(i: NarrativeInput): string[] {
  const out: string[] = [];
  const through = i.window.curEnd;
  const liveShare = i.shopCur && i.shopCur.gmv > 0 ? (i.liveCur.gmv / i.shopCur.gmv) * 100 : null;

  const head = i.shopCur
    ? `Tới ${dayMonth(through)}, shop đạt ${money(i.shopCur.gmv)} GMV; live do agency vận hành mang về ${money(i.liveCur.gmv)}${liveShare != null ? ` (${pctTxt(liveShare)} tổng shop)` : ""}.`
    : `Tới ${dayMonth(through)}, live do agency vận hành đạt ${money(i.liveCur.gmv)} GMV qua ${i.liveCur.sessions} ca.`;
  const target = i.targetGmv && i.targetGmv > 0 ? ` Đạt ${pctTxt((i.liveCur.gmv / i.targetGmv) * 100, 0)} target tháng (${money(i.targetGmv)}).` : "";
  out.push(head + target);

  const gmvChg = pctChange(i.livePrev.gmv, i.liveCur.gmv);
  if (gmvChg != null) {
    const hChg = pctChange(i.livePrev.hours, i.liveCur.hours);
    const ghChg = pctChange(i.livePrev.gmvPerHour, i.liveCur.gmvPerHour);
    const parts = [hChg != null ? `giờ live ${signed(hChg)}` : null, ghChg != null ? `GMV mỗi giờ ${signed(ghChg)}` : null].filter(Boolean).join(", ");
    const lbl = i.window.label.charAt(0).toUpperCase() + i.window.label.slice(1);
    out.push(`${lbl}: GMV live ${signed(gmvChg)}${parts ? ` (${parts})` : ""}.`);
  }

  if (i.drivers && Math.abs(i.drivers.delta) > 0) {
    const same = i.drivers.parts.filter((p) => Math.sign(p.value) === Math.sign(i.drivers!.delta)).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const main = same[0];
    if (main) {
      const verb = i.drivers.delta < 0 ? "mức giảm" : "mức tăng";
      const offset = i.drivers.parts.find((p) => Math.sign(p.value) !== Math.sign(i.drivers!.delta) && Math.abs(p.value) > Math.abs(i.drivers!.delta) * 0.2);
      out.push(
        `Phần lớn ${verb} đến từ ${lowerFirst(DRIVER_LABEL[main.key])} (${signed(main.change, 0)}, ${main.value >= 0 ? "+" : "−"}${money(Math.abs(main.value))})` +
          (offset ? `; ${lowerFirst(DRIVER_LABEL[offset.key])} ${signed(offset.change, 0)} bù lại ${money(Math.abs(offset.value))}.` : ".")
      );
    }
  }

  const basket = basketLine(i);
  if (basket) out.push(basket);

  if (i.signals.length > 0) out.push(i.signals.map(signalText).join("; ") + ".");

  const sku = skuLine(i.skus ?? null);
  if (sku) out.push(sku);

  if (i.campBest && i.dailyGmvPerHour && i.campBest.gmvPerHour > i.dailyGmvPerHour) {
    out.push(`${i.campBest.label} bán ${money(i.campBest.gmvPerHour)}/giờ, gấp ${(i.campBest.gmvPerHour / i.dailyGmvPerHour).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lần ngày thường (${money(i.dailyGmvPerHour)}/giờ).`);
  }
  return out;
}

/** SKU #1 + SKU tăng hạng mạnh nhất trong top (đã có hạng tháng trước). */
function skuLine(m: SkuMoves | null): string | null {
  if (!m || m.rows.length === 0) return null;
  const lead = m.rows[0];
  const chg = (r: SkuMove) => (r.gmvChange != null ? `GMV${m.perDay ? " mỗi ngày" : ""} ${signed(r.gmvChange, 0)}` : null);
  const leadRank = lead.prevRank == null ? "mới vào top" : lead.prevRank === 1 ? "giữ hạng 1" : `từ hạng ${lead.prevRank} lên hạng 1`;
  let txt = `SKU dẫn đầu: ${lead.name} (${[leadRank, chg(lead)].filter(Boolean).join(", ")}).`;
  const riser = m.rows
    .filter((r) => r.prevRank != null && r.prevRank - r.rank >= 2)
    .sort((a, b) => b.prevRank! - b.rank - (a.prevRank! - a.rank))[0];
  if (riser) txt += ` Lên hạng mạnh nhất: ${riser.name} (${riser.prevRank} → ${riser.rank}${chg(riser) ? `, ${chg(riser)}` : ""}).`;
  return txt;
}

/** Một câu về giỏ hàng. Không chọn "thừa số lớn nhất" trong 3 phần: SP mỗi đơn và GMV mỗi SP thường đi
 *  NGƯỢC chiều và bù nhau (CROCS T7→T8: −1,03 tỷ vs +1,19 tỷ) — chọn phần lớn nhất sẽ ra "GMV tăng nhờ
 *  giá/SP", đúng cách đọc sai của deck report Crocs. Gộp 2 phần đó thành giá trị đơn (AOV = UPT × GMV/SP)
 *  rồi so với số đơn; UPT/giá chỉ nêu khi chúng thật sự lệch nhau. */
function basketLine(i: NarrativeInput): string | null {
  const b = i.basket;
  if (!b || Math.abs(b.delta) <= 0) return null;
  const part = (k: DriverKey) => b.parts.find((p) => p.key === k)!;
  const orders = part("orders"), upt = part("upt"), price = part("pricePerItem");
  const aovValue = upt.value + price.value;
  const aovChg = pctChange(i.livePrev.aov, i.liveCur.aov);
  if (aovChg == null) return null;
  const amt = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.abs(v))}`;
  let txt = `Phía đơn hàng: số đơn ${signed(orders.change, 0)} (${amt(orders.value)}), giá trị đơn ${signed(aovChg, 0)} (${amt(aovValue)}).`;
  if (Math.abs(upt.change) >= 10 && Math.sign(upt.change) !== Math.sign(price.change)) {
    const uptTxt = (v: number | null) => (v ?? 0).toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    txt += ` Trong giá trị đơn, sản phẩm mỗi đơn ${uptTxt(i.livePrev.upt)} → ${uptTxt(i.liveCur.upt)} (${signed(upt.change, 0)}) và GMV mỗi sản phẩm ${signed(price.change, 0)} gần như bù nhau — GMV mỗi sản phẩm ${price.change > 0 ? "tăng" : "giảm"} chủ yếu vì mỗi đơn ${upt.change < 0 ? "ít" : "nhiều"} sản phẩm hơn, không hẳn vì giá bán.`;
  }
  return txt;
}

export function autoNextSteps(i: NarrativeInput): string[] {
  const out: string[] = [];
  const upt = i.signals.find((s) => s.label === UPT_LABEL && s.direction === "down");
  if (upt) {
    out.push(`Sản phẩm mỗi đơn giảm ${upt.streak} tháng liền — thử ưu đãi theo ngưỡng giá trị đơn hoặc combo 2 sản phẩm trên live để kéo số sản phẩm mỗi đơn lên lại.`);
  }
  const ctor = i.signals.find((s) => s.label === "CTOR" && s.direction === "down");
  if (ctor) {
    out.push(`Tỷ lệ chốt đơn (CTOR) giảm ${ctor.streak} tháng liền — rà giá, voucher và cách chốt của nhóm SKU chủ lực khi lên live${i.liveCur.ctr != null ? ` (người xem vẫn bấm sản phẩm, CTR ${pctTxt(i.liveCur.ctr, 2)})` : ""}.`);
  }
  const vph = pctChange(i.livePrev.viewsPerHour, i.liveCur.viewsPerHour);
  if (vph != null && vph <= -10) out.push(`Lượt xem mỗi giờ ${signed(vph, 0)} — rà lại khung giờ live và nguồn traffic trước khi chốt lịch tháng ${i.nextMonth.slice(5)}.`);
  const hChg = pctChange(i.livePrev.hours, i.liveCur.hours);
  const ghChg = pctChange(i.livePrev.gmvPerHour, i.liveCur.gmvPerHour);
  if (hChg != null && ghChg != null && hChg > 5 && ghChg <= -10) out.push(`Tăng giờ live nhưng GMV mỗi giờ giảm — ưu tiên dồn giờ vào khung giờ và ngày camp có GMV/giờ cao nhất thay vì kéo dài ca.`);
  if (i.nextPlan) {
    out.push(`Tháng ${i.nextMonth.slice(5)}: target ${money(i.nextPlan.targetGmv)} với ${i.nextPlan.slotCount} ca kế hoạch${i.nextPlan.status === "locked" ? " (đã chốt)" : " (đang lên lịch)"}.`);
  } else {
    out.push(`Chốt target và lịch live tháng ${i.nextMonth.slice(5)}.`);
  }
  return out;
}
