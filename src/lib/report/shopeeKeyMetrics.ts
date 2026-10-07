import type { LiveSession } from "../../types";
import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { assertOnePlatform } from "../platforms/perf";
import { logShareBreakdown, type DriverBreakdown } from "./monthlyReportInsights";

// Key Metrics SHOPEE (user chốt 07/10): file Shopee khác bản chất file TikTok — không có LIVE impressions / ERR / LIVE CTR /
// CTOR / CVR / UPT / AOV. Nên Dashboard / Report Tuần / Hiệu Suất Host / Bản Tin CEO của sàn Shopee đọc bộ này, KHÔNG đọc
// keyMetrics.ts (TikTok).
//
// TÊN CHỈ SỐ (user chốt 07/10 tối): đúng tên cột của file Shopee — Viewers, ATC, Orders, Items Sold, ABS (Shopee gọi AOV là ABS).
// Theo CA, Live List chỉ có: Viewers, Engaged Viewers, Comments, ATC, Avg. Viewing Duration, Orders, Items Sold, Sales. Shopee không
// có CO và Xu theo phiên (Coins Claimed chỉ ở file overview của cả tháng), và GPM của Shopee tính trên Total Views mà Live List
// không có ⇒ bộ theo ca KHÔNG có CO, Xu, GPM. Chỉ số "tự tính" (GMV/giờ, Viewers/giờ, ATC/Viewer, GMV/ATC) ghi rõ trong tooltip.
//
// Luật ca thiếu trường (cùng tinh thần keyMetrics.ts): ATC/Orders/Items có sau đối soát Live List, nên mỗi tỷ lệ chỉ tính trên
// các ca CÓ đủ cả tử lẫn mẫu số — cộng thẳng thì ca thiếu số kéo tỷ lệ tụt.
// Hàm thuần: không import supabaseClient, test chạy không cần .env.

export interface ShopeeKeyInput {
  gmv: number;
  hours: number;
  viewers: number;
  atc: number | null;
  orders: number | null;
  items: number | null;
}

export interface ShopeeKeyCounts {
  sessions: number;
  gmv: number;
  hours: number;
  viewers: number;
  /** ATC và mẫu số của nó: Σ Viewers / Σ giờ / Σ GMV của các ca CÓ số ATC. */
  atc: number; atcViewers: number; atcHours: number; atcGmv: number;
  /** Orders và Σ GMV của các ca có Orders (>0). */
  orders: number; ordersGmv: number;
  /** Items Sold và Σ Orders của các ca có CẢ Items lẫn Orders. */
  items: number; itemsOrders: number;
}

export const emptyShopeeCounts = (): ShopeeKeyCounts => ({
  sessions: 0, gmv: 0, hours: 0, viewers: 0,
  atc: 0, atcViewers: 0, atcHours: 0, atcGmv: 0,
  orders: 0, ordersGmv: 0,
  items: 0, itemsOrders: 0
});

export function shopeeInputFromSession(s: LiveSession, hours: number): ShopeeKeyInput {
  return {
    gmv: s.actualGmv ?? 0,
    hours,
    viewers: s.totalViews ?? 0,
    // ATC nằm ở báo cáo ca (live_session_reports.atc_count) — ghi khi đối soát bằng Live List (0150).
    atc: s.report?.atcCount != null ? s.report.atcCount : null,
    orders: (s.totalOrders ?? 0) > 0 ? s.totalOrders! : null,
    items: (s.attributedItemsSold ?? 0) > 0 ? s.attributedItemsSold! : null
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
  if (x.orders != null) {
    c.orders += x.orders;
    c.ordersGmv += x.gmv;
    if (x.items != null) c.itemsOrders += x.orders;
  }
  if (x.items != null && x.orders != null) c.items += x.items;
  return c;
}

/** Tỷ lệ là PHẦN TRĂM (2,4 = 2,4%); thiếu mẫu số ⇒ null. */
export interface ShopeeKeyMetrics extends ShopeeKeyCounts {
  gmvPerHour: number | null; // tự tính: GMV ÷ Giờ live
  viewersPerHour: number | null; // tự tính: Viewers ÷ Giờ live
  atcRate: number | null; // tự tính: ATC ÷ Viewers (%)
  abs: number | null; // ABS(Placed Order) = GMV ÷ Orders
  gmvPerAtc: number | null; // tự tính: GMV ÷ ATC — "mỗi lần thêm giỏ đáng bao nhiêu tiền"
}

export function shopeeKeyMetrics(c: ShopeeKeyCounts): ShopeeKeyMetrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  return {
    ...c,
    gmvPerHour: div(c.gmv, c.hours),
    viewersPerHour: div(c.viewers, c.hours),
    atcRate: pct(c.atc, c.atcViewers),
    abs: div(c.ordersGmv, c.orders),
    gmvPerAtc: div(c.atcGmv, c.atc)
  };
}

export const shopeeKeyMetricsOfSessions = (sessions: LiveSession[], hoursOf: (s: LiveSession) => number): ShopeeKeyMetrics => {
  assertOnePlatform(sessions, "shopeeKeyMetricsOfSessions");
  return shopeeKeyMetrics(sessions.reduce<ShopeeKeyCounts>((c, s) => addShopeeInput(c, shopeeInputFromSession(s, hoursOf(s))), emptyShopeeCounts()));
};

// ---------- danh sách hiển thị ----------

export type ShopeeMetricKey = "gmv" | "gmvPerHour" | "hours" | "orders" | "abs" | "items" | "viewers" | "viewersPerHour" | "atc";

type Kind = "money" | "int" | "hours";

/** Hai tầng: kết quả → người xem & giỏ hàng. Theo ca, Live List chỉ cho bấy nhiêu số — phần còn lại của phễu (Product Impressions,
 *  Product Clicks, CTR, Order Rate, GPM…) chỉ có cho cả tháng/cả ngày ở Report Tháng Shopee. */
export type ShopeeMetricGroup = "result" | "traffic";

export const SHOPEE_METRIC_GROUPS: { group: ShopeeMetricGroup; label: string; hint: string }[] = [
  { group: "result", label: "Kết quả", hint: "Tiền thu được trên số giờ đã chạy. Orders, ABS, Items Sold có sau khi đối soát bằng Live List." },
  { group: "traffic", label: "Viewers và ATC", hint: "Shopee đưa bao nhiêu người vào phòng live và bao nhiêu lần họ thêm vào giỏ (ATC có sau khi đối soát bằng Live List)." }
];

export interface ShopeeMetricDef {
  key: ShopeeMetricKey;
  label: string;
  kind: Kind;
  /** true = tăng là tốt; false = tăng là xấu; null = trung tính. */
  goodWhenUp: boolean | null;
  group: ShopeeMetricGroup;
}

// Bộ hiển thị theo ca: chỉ số có thật trong Live List (GMV = Sales(Placed Order), Orders, Items Sold, ABS, Viewers, ATC) + hai số
// chia theo giờ là cách agency đo năng suất (GMV/giờ, Viewers/giờ). Bỏ CO, Xu, GPM, Orders/ATC, ATC/giờ — không có trong file Shopee
// theo phiên (GPM của Shopee chia cho Total Views, Live List không có).
export const SHOPEE_METRICS: ShopeeMetricDef[] = [
  { key: "gmv", label: METRIC.gmv, kind: "money", goodWhenUp: true, group: "result" },
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", goodWhenUp: true, group: "result" },
  { key: "hours", label: METRIC.liveHours, kind: "hours", goodWhenUp: null, group: "result" },
  { key: "orders", label: METRIC.orders, kind: "int", goodWhenUp: true, group: "result" },
  { key: "abs", label: METRIC.abs, kind: "money", goodWhenUp: true, group: "result" },
  { key: "items", label: METRIC.itemsSoldShopee, kind: "int", goodWhenUp: true, group: "result" },
  { key: "viewers", label: METRIC.viewers, kind: "int", goodWhenUp: true, group: "traffic" },
  { key: "viewersPerHour", label: METRIC.viewersPerHour, kind: "int", goodWhenUp: true, group: "traffic" },
  { key: "atc", label: METRIC.atc, kind: "int", goodWhenUp: true, group: "traffic" }
];

/** Giá trị một chỉ số; kỳ không có ca ⇒ null. Chỉ số cộng dồn của trường thiếu hẳn (0 ca khai) cũng ⇒ null, không hiện "0". */
export function shopeeMetricValue(m: ShopeeKeyMetrics, key: ShopeeMetricKey): number | null {
  if (m.sessions === 0) return null;
  switch (key) {
    case "atc": return m.atcViewers > 0 || m.atc > 0 ? m.atc : null;
    case "orders": return m.orders > 0 ? m.orders : null;
    case "abs": return m.orders > 0 ? m.abs : null;
    case "items": return m.itemsOrders > 0 ? m.items : null;
    // Ca gõ tay / chưa có số người xem: 0 là "chưa có số", không phải 0 người xem.
    case "viewers": return m.viewers > 0 ? m.viewers : null;
    case "viewersPerHour": return m.viewers > 0 ? m.viewersPerHour : null;
    default: return m[key];
  }
}

export function fmtShopeeMetric(kind: Kind | ShopeeMetricDef, v: number | null | undefined): string {
  const k = typeof kind === "string" ? kind : kind.kind;
  if (v == null || Number.isNaN(v)) return "—";
  switch (k) {
    case "money": return fmtVndShort(v);
    case "int": return Math.round(v).toLocaleString("vi-VN");
    case "hours": return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
  }
}

// ---------- tách nguyên nhân ----------

export type ShopeeDriverKey = "hours" | "viewersPerHour" | "atcRate" | "gmvPerAtc";
export const SHOPEE_DRIVER_LABEL: Record<ShopeeDriverKey, string> = {
  hours: METRIC.liveHours,
  viewersPerHour: METRIC.viewersPerHour,
  atcRate: METRIC.atcRate,
  gmvPerAtc: METRIC.gmvPerAtc
};

/**
 * GMV = Giờ live × Viewers/giờ × ATC/Viewer × GMV/ATC (giờ × viewers/giờ = viewers; × ATC/viewer = ATC; × GMV/ATC = GMV).
 * Chỉ tính trên phần ca CÓ số ATC (atcGmv/atcHours/atcViewers) để tích đúng bằng GMV của phần đó; thiếu ATC một bên ⇒ null.
 * Không có CTOR/ABS như TikTok: Live List không có Product Clicks theo phiên, và ABS cần số đơn (cũng chỉ có sau đối soát).
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
