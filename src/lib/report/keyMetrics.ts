import type { LiveSession } from "../../types";
import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import { fmtFixed, fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";

// Key Metrics — MỘT bộ chỉ số live cho mọi report (user chốt 2026-09-29): Report Tháng (xu hướng, host, Excel),
// Report Tuần, Dashboard brand, cửa sổ ca, Hiệu Suất Host, Bản Tin CEO đều hiện đủ 18 chỉ số theo đúng thứ tự dưới,
// cộng AOV làm dòng bổ sung (phần "Vì sao" tách GMV/giờ = Views/giờ × LIVE CTR × CTOR × AOV). Tên giữ chuẩn
// metricGlossary. Trước đó mỗi màn tự cộng số và tự chọn 5–13 chỉ số, nên màn nào cũng thiếu một kiểu.
//
// Luật ca thiếu trường: ca tự khai / số lúc giao ca có Views nhưng LIVE impressions = 0 hoặc Avg. view = 0 (RPC giao
// ca chưa ghi thời gian xem — lỗi E2E #3). Cộng thẳng thì ERR và Avg. view bị kéo tụt ⇒ ERR, LIVE impressions/giờ,
// Avg. view chỉ tính trên các ca CÓ số của trường đó.

export interface KeyCounts {
  sessions: number;
  gmv: number;
  itemsSold: number;
  orders: number;
  views: number;
  hours: number;
  impressions: number; // LIVE impressions
  productImpressions: number;
  productClicks: number;
  /** Σ Views của các ca có LIVE impressions — tử số ERR. */
  errViews: number;
  /** Σ giờ của các ca có LIVE impressions — mẫu số LIVE impressions/giờ. */
  impressionHours: number;
  /** Σ (Avg. view × Views) của các ca có Avg. view. */
  watchSecViews: number;
  /** Σ Views của các ca có Avg. view — mẫu số Avg. view. */
  watchViews: number;
}

/** Số của một ca / một dòng file trước khi cộng. */
export interface KeyInput {
  gmv: number;
  itemsSold: number;
  orders: number;
  views: number;
  hours: number;
  impressions: number;
  productImpressions: number;
  productClicks: number;
  avgViewSec: number;
}

export const emptyKeyCounts = (): KeyCounts => ({
  sessions: 0, gmv: 0, itemsSold: 0, orders: 0, views: 0, hours: 0, impressions: 0, productImpressions: 0, productClicks: 0,
  errViews: 0, impressionHours: 0, watchSecViews: 0, watchViews: 0
});

/** Cộng một ca vào `c` (sửa tại chỗ, trả lại `c`). */
export function addKeyInput(c: KeyCounts, x: KeyInput): KeyCounts {
  c.sessions += 1;
  c.gmv += x.gmv;
  c.itemsSold += x.itemsSold;
  c.orders += x.orders;
  c.views += x.views;
  c.hours += x.hours;
  c.impressions += x.impressions;
  c.productImpressions += x.productImpressions;
  c.productClicks += x.productClicks;
  if (x.impressions > 0) {
    c.errViews += x.views;
    c.impressionHours += x.hours;
  }
  if (x.avgViewSec > 0 && x.views > 0) {
    c.watchSecViews += x.avgViewSec * x.views;
    c.watchViews += x.views;
  }
  return c;
}

export function sumKeyCounts(list: KeyCounts[]): KeyCounts {
  const out = emptyKeyCounts();
  for (const c of list) for (const k of Object.keys(out) as (keyof KeyCounts)[]) out[k] += c[k];
  return out;
}

/** `hours` truyền vào để khỏi vòng import với hostPerformance (sessionHours). */
export function keyInputFromSession(s: LiveSession, hours: number): KeyInput {
  return {
    gmv: s.actualGmv ?? 0,
    itemsSold: s.attributedItemsSold ?? 0,
    orders: s.totalOrders ?? 0,
    views: s.totalViews ?? 0,
    hours,
    impressions: s.impressions ?? 0,
    productImpressions: s.productImpressions ?? 0,
    productClicks: s.productClicks ?? 0,
    avgViewSec: s.avgWatchTimeSeconds ?? 0
  };
}

export function keyInputFromRow(r: CreatorLivePerfRow): KeyInput {
  return {
    gmv: r.gmv,
    itemsSold: r.itemsSold,
    orders: r.orders,
    views: r.views,
    hours: r.hours,
    impressions: r.impressions ?? 0,
    productImpressions: r.productImpressions,
    productClicks: r.productClicks,
    avgViewSec: r.avgViewDurationSec ?? 0
  };
}

/** Tỷ lệ là giá trị PHẦN TRĂM (2,4 = 2,4%); thiếu mẫu số ⇒ null. */
export interface KeyMetrics extends KeyCounts {
  upt: number | null; // Items sold ÷ Orders
  err: number | null; // Views ÷ LIVE impressions (%)
  avgPrice: number | null; // GMV ÷ Items sold
  ctr: number | null; // Product CTR = Product clicks ÷ Product impressions (%)
  liveCtr: number | null; // Product clicks ÷ Views (%)
  ctor: number | null; // Orders ÷ Product clicks (%)
  avgViewSec: number | null;
  viewsPerHour: number | null;
  impressionsPerHour: number | null;
  gmvPerHour: number | null;
  aov: number | null; // GMV ÷ Orders
}

export function keyMetrics(c: KeyCounts): KeyMetrics {
  const div = (a: number, b: number) => (b > 0 ? a / b : null);
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  return {
    ...c,
    upt: div(c.itemsSold, c.orders),
    err: pct(c.errViews, c.impressions),
    avgPrice: div(c.gmv, c.itemsSold),
    ctr: pct(c.productClicks, c.productImpressions),
    liveCtr: pct(c.productClicks, c.views),
    ctor: pct(c.orders, c.productClicks),
    avgViewSec: div(c.watchSecViews, c.watchViews),
    viewsPerHour: div(c.views, c.hours),
    impressionsPerHour: div(c.impressions, c.impressionHours),
    gmvPerHour: div(c.gmv, c.hours),
    aov: div(c.gmv, c.orders)
  };
}

export const keyMetricsOfSessions = (sessions: LiveSession[], hoursOf: (s: LiveSession) => number): KeyMetrics =>
  keyMetrics(sessions.reduce((c, s) => addKeyInput(c, keyInputFromSession(s, hoursOf(s))), emptyKeyCounts()));

export const keyMetricsOfRows = (rows: CreatorLivePerfRow[]): KeyMetrics =>
  keyMetrics(rows.reduce((c, r) => addKeyInput(c, keyInputFromRow(r)), emptyKeyCounts()));

// ---------- danh sách hiển thị ----------

export type KeyMetricKey =
  | "gmv" | "itemsSold" | "orders" | "upt" | "err" | "avgPrice" | "productImpressions" | "productClicks" | "ctr" | "liveCtr"
  | "ctor" | "avgViewSec" | "views" | "impressions" | "hours" | "viewsPerHour" | "impressionsPerHour" | "gmvPerHour" | "aov";

type Kind = "money" | "int" | "dec2" | "pct1" | "pct2" | "sec" | "hours";

export interface KeyMetricDef {
  key: KeyMetricKey;
  label: string;
  kind: Kind;
  /** true = tăng là tốt; null = trung tính (không tô màu). */
  goodWhenUp: boolean | null;
  /** Dòng bổ sung ngoài 18 chỉ số (AOV). */
  extra?: boolean;
}

/** 18 chỉ số đúng thứ tự user chốt 2026-09-29, rồi AOV (bổ sung). */
export const KEY_METRICS: KeyMetricDef[] = [
  { key: "gmv", label: METRIC.gmv, kind: "money", goodWhenUp: true },
  { key: "itemsSold", label: METRIC.itemsSold, kind: "int", goodWhenUp: true },
  { key: "orders", label: METRIC.orders, kind: "int", goodWhenUp: true },
  // UPT live đổi theo quà tặng kèm ⇒ trung tính (Report Tháng có thêm dòng UPT bỏ quà).
  { key: "upt", label: METRIC.upt, kind: "dec2", goodWhenUp: null },
  { key: "err", label: METRIC.err, kind: "pct2", goodWhenUp: true },
  { key: "avgPrice", label: METRIC.avgPrice, kind: "money", goodWhenUp: null },
  { key: "productImpressions", label: METRIC.productImpressions, kind: "int", goodWhenUp: true },
  { key: "productClicks", label: METRIC.productClicks, kind: "int", goodWhenUp: true },
  { key: "ctr", label: METRIC.productCtr, kind: "pct2", goodWhenUp: true },
  { key: "liveCtr", label: METRIC.liveCtr, kind: "pct1", goodWhenUp: true },
  { key: "ctor", label: METRIC.ctor, kind: "pct2", goodWhenUp: true },
  { key: "avgViewSec", label: METRIC.avgView, kind: "sec", goodWhenUp: true },
  { key: "views", label: METRIC.views, kind: "int", goodWhenUp: true },
  { key: "impressions", label: METRIC.liveImpressions, kind: "int", goodWhenUp: true },
  { key: "hours", label: METRIC.liveHours, kind: "hours", goodWhenUp: null },
  { key: "viewsPerHour", label: METRIC.viewsPerHour, kind: "int", goodWhenUp: true },
  { key: "impressionsPerHour", label: METRIC.impressionsPerHour, kind: "int", goodWhenUp: true },
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", goodWhenUp: true },
  { key: "aov", label: METRIC.aov, kind: "money", goodWhenUp: true, extra: true }
];

export const keyMetricDef = (key: KeyMetricKey): KeyMetricDef => KEY_METRICS.find((d) => d.key === key)!;

/** Giá trị của một chỉ số; kỳ không có ca ⇒ null (không hiện "0" cho kỳ trống). */
export function keyMetricValue(m: KeyMetrics, key: KeyMetricKey): number | null {
  if (m.sessions === 0) return null;
  return m[key];
}

export function fmtKeyMetric(kind: Kind | KeyMetricDef, v: number | null | undefined): string {
  const k = typeof kind === "string" ? kind : kind.kind;
  if (v == null || Number.isNaN(v)) return "—";
  switch (k) {
    case "money": return fmtVndShort(v);
    case "int": return Math.round(v).toLocaleString("vi-VN");
    case "dec2": return fmtFixed(v, 2);
    case "pct1": return `${fmtFixed(v, 1)}%`;
    case "pct2": return `${fmtFixed(v, 2)}%`;
    case "sec": return `${Math.round(v)}s`;
    case "hours": return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
  }
}

/** Nhãn cột Excel: chỉ số tỷ lệ ghi rõ (%) / (s) vì ô Excel là số trần. */
export function keyMetricSheetLabel(d: KeyMetricDef): string {
  if (d.kind === "pct1" || d.kind === "pct2") return `${d.label} (%)`;
  if (d.kind === "sec") return `${d.label} (s)`;
  return d.label;
}

/** Số cho ô Excel (làm tròn 2 chữ số, thiếu ⇒ ""). */
export function keyMetricSheetValue(m: KeyMetrics, key: KeyMetricKey): number | "" {
  const v = keyMetricValue(m, key);
  return v == null ? "" : Math.round(v * 100) / 100;
}

/** Các cột Key Metrics cho một dòng Excel, đúng thứ tự KEY_METRICS. */
export function keyMetricSheetColumns(m: KeyMetrics): Record<string, number | ""> {
  return Object.fromEntries(KEY_METRICS.map((d) => [keyMetricSheetLabel(d), keyMetricSheetValue(m, d.key)]));
}
