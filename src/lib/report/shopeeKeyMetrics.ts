import type { LiveSession } from "../../types";
import { fmtFixed, fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { assertOnePlatform } from "../platforms/perf";
import { logShareBreakdown, type DriverBreakdown } from "./monthlyReportInsights";

// Key Metrics SHOPEE (user chốt 07/10): file Shopee khác bản chất file TikTok — không có LIVE impressions / Product
// impressions / click / ERR / CTR / CTOR; có Viewers, ATC, CO, GPM, Xu, doanh số Đặt vs Xác nhận. Nên Dashboard / Report
// Tuần / Hiệu Suất Host / Bản Tin CEO của sàn Shopee đọc bộ này, KHÔNG đọc keyMetrics.ts (TikTok).
//
// Luật ca thiếu trường (cùng tinh thần keyMetrics.ts): ATC/CO/Xu/Orders do người trực khai hoặc có sau đối soát Live List,
// nên mỗi tỷ lệ chỉ tính trên các ca CÓ đủ cả tử lẫn mẫu số — cộng thẳng thì ca thiếu số kéo tỷ lệ tụt.
// Hàm thuần: không import supabaseClient, test chạy không cần .env.

export interface ShopeeKeyInput {
  gmv: number;
  hours: number;
  viewers: number;
  atc: number | null;
  checkout: number | null;
  orders: number | null;
  items: number | null;
  coins: number | null;
}

export interface ShopeeKeyCounts {
  sessions: number;
  gmv: number;
  hours: number;
  viewers: number;
  /** ATC và mẫu số của nó: Σ Viewers / Σ giờ / Σ GMV của các ca CÓ số ATC. */
  atc: number; atcViewers: number; atcHours: number; atcGmv: number;
  /** CO và Σ ATC của các ca có CẢ CO lẫn ATC. */
  checkout: number; checkoutAtc: number;
  /** Orders và mẫu số của các ca có Orders (>0). */
  orders: number; ordersGmv: number; ordersAtc: number; ordersWithAtc: number;
  items: number; itemsOrders: number;
  /** Xu và Σ GMV của các ca có khai xu. */
  coins: number; coinsGmv: number;
}

export const emptyShopeeCounts = (): ShopeeKeyCounts => ({
  sessions: 0, gmv: 0, hours: 0, viewers: 0,
  atc: 0, atcViewers: 0, atcHours: 0, atcGmv: 0,
  checkout: 0, checkoutAtc: 0,
  orders: 0, ordersGmv: 0, ordersAtc: 0, ordersWithAtc: 0,
  items: 0, itemsOrders: 0,
  coins: 0, coinsGmv: 0
});

export function shopeeInputFromSession(s: LiveSession, hours: number): ShopeeKeyInput {
  return {
    gmv: s.actualGmv ?? 0,
    hours,
    viewers: s.totalViews ?? 0,
    // ATC/CO/Xu nằm ở báo cáo ca (live_session_reports) — người trực khai lúc giao ca hoặc ops nhập.
    atc: s.report?.atcCount != null ? s.report.atcCount : null,
    checkout: s.report?.checkoutCount != null ? s.report.checkoutCount : null,
    orders: (s.totalOrders ?? 0) > 0 ? s.totalOrders! : null,
    items: (s.attributedItemsSold ?? 0) > 0 ? s.attributedItemsSold! : null,
    coins: s.report?.coinSpent != null ? s.report.coinSpent : null
  };
}

export function addShopeeInput(c: ShopeeKeyCounts, x: ShopeeKeyInput): ShopeeKeyCounts {
  c.sessions += 1;
  c.gmv += x.gmv;
  c.hours += x.hours;
  c.viewers += x.viewers;
  if (x.atc != null) {
    c.atc += x.atc;
    c.atcViewers += x.viewers;
    c.atcHours += x.hours;
    c.atcGmv += x.gmv;
  }
  if (x.checkout != null && x.atc != null) {
    c.checkout += x.checkout;
    c.checkoutAtc += x.atc;
  }
  if (x.orders != null) {
    c.orders += x.orders;
    c.ordersGmv += x.gmv;
    if (x.atc != null) {
      c.ordersAtc += x.atc;
      c.ordersWithAtc += x.orders;
    }
    if (x.items != null) c.itemsOrders += x.orders;
  }
  if (x.items != null && x.orders != null) c.items += x.items;
  if (x.coins != null) {
    c.coins += x.coins;
    c.coinsGmv += x.gmv;
  }
  return c;
}

/** Tỷ lệ là PHẦN TRĂM (2,4 = 2,4%); thiếu mẫu số ⇒ null. */
export interface ShopeeKeyMetrics extends ShopeeKeyCounts {
  gmvPerHour: number | null;
  viewersPerHour: number | null;
  atcPerHour: number | null;
  atcRate: number | null; // ATC ÷ Viewers (%)
  coRate: number | null; // CO ÷ ATC (%)
  orderPerAtc: number | null; // Orders ÷ ATC (%)
  aov: number | null; // GMV ÷ Orders
  upt: number | null; // Items ÷ Orders
  gpm: number | null; // GMV trên 1.000 Viewers
  gmvPerAtc: number | null; // GMV ÷ ATC — "mỗi lần thêm giỏ đáng bao nhiêu tiền"
  coinsPctGmv: number | null; // Xu ÷ GMV (%), 1 xu = 1đ
}

export function shopeeKeyMetrics(c: ShopeeKeyCounts): ShopeeKeyMetrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  return {
    ...c,
    gmvPerHour: div(c.gmv, c.hours),
    viewersPerHour: div(c.viewers, c.hours),
    atcPerHour: div(c.atc, c.atcHours),
    atcRate: pct(c.atc, c.atcViewers),
    coRate: pct(c.checkout, c.checkoutAtc),
    orderPerAtc: pct(c.ordersWithAtc, c.ordersAtc),
    aov: div(c.ordersGmv, c.orders),
    upt: div(c.items, c.itemsOrders),
    gpm: c.viewers > 0 ? (c.gmv / c.viewers) * 1000 : null,
    gmvPerAtc: div(c.atcGmv, c.atc),
    coinsPctGmv: pct(c.coins, c.coinsGmv)
  };
}

export const shopeeKeyMetricsOfSessions = (sessions: LiveSession[], hoursOf: (s: LiveSession) => number): ShopeeKeyMetrics => {
  assertOnePlatform(sessions, "shopeeKeyMetricsOfSessions");
  return shopeeKeyMetrics(sessions.reduce<ShopeeKeyCounts>((c, s) => addShopeeInput(c, shopeeInputFromSession(s, hoursOf(s))), emptyShopeeCounts()));
};

// ---------- danh sách hiển thị ----------

export type ShopeeMetricKey =
  | "gmv" | "gmvPerHour" | "hours" | "orders" | "aov" | "viewers" | "viewersPerHour" | "gpm" | "atc" | "atcRate"
  | "atcPerHour" | "gmvPerAtc" | "checkout" | "coRate" | "orderPerAtc" | "coins" | "coinsPctGmv";

type Kind = "money" | "int" | "pct1" | "pct2" | "hours";

/** Phân tầng theo phễu Shopee: kết quả → người xem vào → thêm giỏ/thanh toán → khuyến mãi. */
export type ShopeeMetricGroup = "result" | "traffic" | "conversion";

export const SHOPEE_METRIC_GROUPS: { group: ShopeeMetricGroup; label: string; hint: string }[] = [
  { group: "result", label: "Kết quả", hint: "Tiền thu được trên số giờ đã chạy." },
  { group: "traffic", label: "Người xem", hint: "Shopee đưa bao nhiêu người vào phòng live." },
  { group: "conversion", label: "Thêm giỏ → đơn", hint: "Người xem thêm giỏ rồi chốt đơn. ATC và đơn của ca có sau khi đối soát bằng Live List." }
];

export interface ShopeeMetricDef {
  key: ShopeeMetricKey;
  label: string;
  kind: Kind;
  /** true = tăng là tốt; false = tăng là xấu; null = trung tính. */
  goodWhenUp: boolean | null;
  group: ShopeeMetricGroup;
}

// Bộ hiển thị theo ca (07/10): bỏ CO và Xu — không file Shopee nào có hai số này THEO PHIÊN (Live List chỉ có ATC/đơn/người
// xem; Xu chỉ ở file tổng quan tháng, Report Shopee đọc ở đó) và user chốt trợ live không gõ thêm số lúc giao ca.
export const SHOPEE_METRICS: ShopeeMetricDef[] = [
  { key: "gmv", label: METRIC.gmv, kind: "money", goodWhenUp: true, group: "result" },
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", goodWhenUp: true, group: "result" },
  { key: "hours", label: METRIC.liveHours, kind: "hours", goodWhenUp: null, group: "result" },
  { key: "orders", label: METRIC.orders, kind: "int", goodWhenUp: true, group: "result" },
  { key: "aov", label: METRIC.aov, kind: "money", goodWhenUp: true, group: "result" },
  { key: "viewers", label: METRIC.viewers, kind: "int", goodWhenUp: true, group: "traffic" },
  { key: "viewersPerHour", label: METRIC.viewersPerHour, kind: "int", goodWhenUp: true, group: "traffic" },
  { key: "gpm", label: METRIC.gpm, kind: "money", goodWhenUp: true, group: "traffic" },
  { key: "atc", label: METRIC.atc, kind: "int", goodWhenUp: true, group: "conversion" },
  { key: "atcRate", label: METRIC.atcRate, kind: "pct2", goodWhenUp: true, group: "conversion" },
  { key: "atcPerHour", label: "ATC/giờ", kind: "int", goodWhenUp: true, group: "conversion" },
  { key: "gmvPerAtc", label: "GMV/ATC", kind: "money", goodWhenUp: true, group: "conversion" },
  { key: "orderPerAtc", label: METRIC.orderPerAtc, kind: "pct1", goodWhenUp: true, group: "conversion" }
];

/** Giá trị một chỉ số; kỳ không có ca ⇒ null. Chỉ số cộng dồn của trường thiếu hẳn (0 ca khai) cũng ⇒ null, không hiện "0". */
export function shopeeMetricValue(m: ShopeeKeyMetrics, key: ShopeeMetricKey): number | null {
  if (m.sessions === 0) return null;
  switch (key) {
    case "atc": return m.atcViewers > 0 || m.atc > 0 ? m.atc : null;
    case "checkout": return m.checkoutAtc > 0 ? m.checkout : null;
    case "orders": return m.orders > 0 ? m.orders : null;
    // Ca gõ tay / chưa có số người xem: 0 là "chưa có số", không phải 0 người xem.
    case "viewers": return m.viewers > 0 ? m.viewers : null;
    case "viewersPerHour": return m.viewers > 0 ? m.viewersPerHour : null;
    case "coins": return m.coinsGmv > 0 ? m.coins : null;
    default: return m[key];
  }
}

export function fmtShopeeMetric(kind: Kind | ShopeeMetricDef, v: number | null | undefined): string {
  const k = typeof kind === "string" ? kind : kind.kind;
  if (v == null || Number.isNaN(v)) return "—";
  switch (k) {
    case "money": return fmtVndShort(v);
    case "int": return Math.round(v).toLocaleString("vi-VN");
    case "pct1": return `${fmtFixed(v, 1)}%`;
    case "pct2": return `${fmtFixed(v, 2)}%`;
    case "hours": return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
  }
}

// ---------- tách nguyên nhân ----------

export type ShopeeDriverKey = "hours" | "viewersPerHour" | "atcRate" | "gmvPerAtc";
export const SHOPEE_DRIVER_LABEL: Record<ShopeeDriverKey, string> = {
  hours: METRIC.liveHours,
  viewersPerHour: METRIC.viewersPerHour,
  atcRate: METRIC.atcRate,
  gmvPerAtc: "GMV/ATC"
};

/**
 * GMV = Giờ live × Viewers/giờ × ATC/Viewer × GMV/ATC (giờ × viewers/giờ = viewers; × ATC/viewer = ATC; × GMV/ATC = GMV).
 * Chỉ tính trên phần ca CÓ số ATC (atcGmv/atcHours/atcViewers) để tích đúng bằng GMV của phần đó; thiếu ATC một bên ⇒ null.
 * Không có CTOR/AOV như TikTok: Shopee không cho Product clicks, và số đơn của ca chỉ có sau đối soát.
 */
export function shopeeDriverBreakdown(a: ShopeeKeyMetrics, b: ShopeeKeyMetrics): DriverBreakdown<ShopeeDriverKey> | null {
  const vph = (m: ShopeeKeyMetrics) => (m.atcHours > 0 ? m.atcViewers / m.atcHours : 0);
  const rate = (m: ShopeeKeyMetrics) => (m.atcViewers > 0 ? m.atc / m.atcViewers : 0);
  const per = (m: ShopeeKeyMetrics) => (m.atc > 0 ? m.atcGmv / m.atc : 0);
  return logShareBreakdown<ShopeeDriverKey>(a.atcGmv, b.atcGmv, [
    ["hours", a.atcHours, b.atcHours],
    ["viewersPerHour", vph(a), vph(b)],
    ["atcRate", rate(a), rate(b)],
    ["gmvPerAtc", per(a), per(b)]
  ]);
}
