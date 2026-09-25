import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
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
  productImpressions: number;
  productClicks: number;
  gmvPerHour: number | null;
  viewsPerHour: number | null;
  gmvPerView: number | null;
  ctr: number | null;
  ctor: number | null;
  aov: number | null;
}

export function liveStatsFromRows(rows: CreatorLivePerfRow[], start: string, end: string): LiveStats {
  let sessions = 0, gmv = 0, hours = 0, views = 0, orders = 0, skuOrders = 0, productImpressions = 0, productClicks = 0;
  for (const r of rows) {
    const d = vnDateOf(r.startTime);
    if (d < start || d > end) continue;
    sessions += 1;
    gmv += r.gmv;
    hours += r.hours;
    views += r.views;
    orders += r.orders;
    skuOrders += r.skuOrders;
    productImpressions += r.productImpressions;
    productClicks += r.productClicks;
  }
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  return {
    sessions, gmv, hours, views, orders, skuOrders, productImpressions, productClicks,
    gmvPerHour: div(gmv, hours),
    viewsPerHour: div(views, hours),
    gmvPerView: div(gmv, views),
    ctr: productImpressions > 0 ? (productClicks / productImpressions) * 100 : null,
    ctor: productClicks > 0 ? (skuOrders / productClicks) * 100 : null,
    aov: div(gmv, orders)
  };
}

export function pctChange(from: number | null | undefined, to: number | null | undefined): number | null {
  if (from == null || to == null || from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

// ---------- tách nguyên nhân ----------

export type DriverKey = "hours" | "viewsPerHour" | "gmvPerView";
export const DRIVER_LABEL: Record<DriverKey, string> = {
  hours: "Giờ live",
  viewsPerHour: "Lượt xem mỗi giờ",
  gmvPerView: "GMV mỗi lượt xem"
};

export interface DriverBreakdown {
  from: number;
  to: number;
  delta: number;
  parts: { key: DriverKey; value: number; change: number }[];
}

/** GMV = giờ × (lượt xem / giờ) × (GMV / lượt xem). Chia ΔGMV theo tỷ trọng log của từng thừa số — 3
 *  phần cộng đúng bằng ΔGMV, không phụ thuộc thứ tự như cách "đổi lần lượt từng biến". Thiếu dữ liệu
 *  lượt xem/giờ ở một bên ⇒ null (không bịa phần tách). */
export function driverBreakdown(a: LiveStats, b: LiveStats): DriverBreakdown | null {
  const factors: [DriverKey, number, number][] = [
    ["hours", a.hours, b.hours],
    ["viewsPerHour", a.viewsPerHour ?? 0, b.viewsPerHour ?? 0],
    ["gmvPerView", a.gmvPerView ?? 0, b.gmvPerView ?? 0]
  ];
  if (a.gmv <= 0 || b.gmv <= 0 || factors.some(([, x, y]) => !(x > 0) || !(y > 0))) return null;
  const delta = b.gmv - a.gmv;
  const total = Math.log(b.gmv / a.gmv);
  const parts = factors.map(([key, x, y]) => {
    const l = Math.log(y / x);
    // ΔGMV ≈ 0 thì tỷ trọng log vô nghĩa (chia cho ~0) — dùng xấp xỉ bậc nhất quanh GMV đầu kỳ.
    const value = Math.abs(total) < 1e-9 ? a.gmv * l : (delta * l) / total;
    return { key, value, change: ((y - x) / x) * 100 };
  });
  return { from: a.gmv, to: b.gmv, delta, parts };
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
  signals: TrendSignal[];
  targetGmv: number | null;
  /** Khung camp tốt nhất vs ngày thường (GMV/giờ), nếu có. */
  campBest: { label: string; gmvPerHour: number } | null;
  dailyGmvPerHour: number | null;
  nextMonth: string;
  nextPlan: { targetGmv: number; status: "draft" | "locked"; slotCount: number } | null;
}

const money = (v: number) => formatCurrencyAdaptive(v);
const pctTxt = (v: number, digits = 1) => `${v.toLocaleString("vi-VN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
const signed = (v: number, digits = 1) => `${v >= 0 ? "+" : "−"}${pctTxt(Math.abs(v), digits)}`;
const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;

function signalText(s: TrendSignal): string {
  const fmt = (x: number) =>
    s.label === "CTOR" || s.label === "CTR" ? pctTxt(x, 2) : s.label === "AOV" ? `${Math.round(x / 1000).toLocaleString("vi-VN")}k đ` : Math.round(x).toLocaleString("vi-VN");
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
        `Phần lớn ${verb} đến từ ${DRIVER_LABEL[main.key].toLowerCase()} (${signed(main.change, 0)}, ${main.value >= 0 ? "+" : "−"}${money(Math.abs(main.value))})` +
          (offset ? `; ${DRIVER_LABEL[offset.key].toLowerCase()} ${signed(offset.change, 0)} bù lại ${money(Math.abs(offset.value))}.` : ".")
      );
    }
  }

  if (i.signals.length > 0) out.push(i.signals.map(signalText).join("; ") + ".");

  if (i.campBest && i.dailyGmvPerHour && i.campBest.gmvPerHour > i.dailyGmvPerHour) {
    out.push(`${i.campBest.label} bán ${money(i.campBest.gmvPerHour)}/giờ, gấp ${(i.campBest.gmvPerHour / i.dailyGmvPerHour).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} lần ngày thường (${money(i.dailyGmvPerHour)}/giờ).`);
  }
  return out;
}

export function autoNextSteps(i: NarrativeInput): string[] {
  const out: string[] = [];
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
