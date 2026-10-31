import type { LiveSession } from "../../types";
import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { vnDateOf } from "../dataraw/vnDate";
import { estimateSessionCv, noiseBand, SESSION_CV } from "./brandReport";
import { logShareBreakdown, type DriverBreakdown } from "./monthlyReportInsights";
import { keyMetricsBlocks, nextBlocks, peopleBlocks, productsBlocks, summaryBlocks, whyBlocks, type InsightBlocks } from "./pageInsights";
import { keyMetricsHeadline, observeHeadline, summaryHeadline } from "./pageHeadlines";
import { bridgePoints, targetBridge, type BridgePoint, type PlanHourRow } from "./reportVisuals";
import { skuMoves, type SkuMoves } from "./monthlyReportInsights";
import type { ScoreRow } from "./brandReport";
import type { SkuRankSlice } from "../dataraw/monthlyProductSlice";
import type { SessionSpread } from "./rhythm";
import type { CampDayBucket } from "../campaignDays";
import { hasShopeeAds } from "../dataraw/shopeeAds";
import { shopeeAdsHeadline, shopeeAdsSuiteBlocks } from "./shopeeAdsInsight";
import { monthDays, type ShopeeReportSnapshot, type ShopeeStreamRow } from "./shopeeSnapshot";

// Report Tháng SHOPEE theo khung trang của report TikTok (29/10/2026, làm lại tối 29/10 cho trùng TikTok): Tổng quan & KPI → Key Metrics
// → Đơn huỷ → Nguyên nhân → Sản phẩm & khuyến mãi → Host & khung giờ → Quảng cáo (theo phạm vi dịch vụ) → Tháng sau. Trang dùng
// chung component của TikTok (SummaryDemoPage, ProductsPageBody, HostPageBody) và chung hàm Insight/tiêu đề (pageInsights.ts,
// pageHeadlines.ts); file này chỉ đổi số Shopee sang đúng kiểu dữ liệu các component đó nhận. Hàm thuần đọc bản chụp (lib/report/shopeeSnapshot.ts) — không import supabaseClient.
//
// Khác TikTok (luật đa sàn, WORKSPACE §5.6): không mượn chỉ số TikTok. Live List của Shopee theo phiên chỉ có Viewers, Engaged
// Viewers, Comments, ATC, Avg. Viewing Duration, Orders, Items Sold, Sales ⇒ phép tách GMV là
// Giờ live × Viewers/giờ × ATC/Viewer × GMV/ATC (không có LIVE impressions / CTR / CTOR theo phiên như TikTok).
// Cùng TikTok: so cùng kỳ (tháng còn dở thì mọi tháng cắt cùng số ngày), ngưỡng dao động 1,96 × CV × √(1/n₁ + 1/n₂) với CV đo trên
// phiên của chính brand, loại ngày theo khung camp của từng tháng, Insight 4 khối Quan sát / Nguyên nhân / Tác động / Đề xuất.

export type ShopeeBucket = "daily" | "dday" | "midmonth" | "payday";
export type ShopeeTab = "all" | ShopeeBucket;
export const SHOPEE_TABS: ShopeeTab[] = ["all", "daily", "dday", "midmonth", "payday"];
export const SHOPEE_BUCKETS: ShopeeBucket[] = ["daily", "dday", "midmonth", "payday"];
export const SHOPEE_TAB_LABEL: Record<ShopeeTab, string> = { all: "Cả tháng", daily: "Daily", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day" };

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export const pctChange = (from: number | null | undefined, to: number | null | undefined): number | null => (from != null && to != null && from > 0 ? (to / from - 1) * 100 : null);

// ---------- các tháng so sánh ----------

export interface ShopeeMonthData {
  month: string;
  campDays: Record<string, "dday" | "midmonth" | "payday">;
  streams: ShopeeStreamRow[];
}

export interface ShopeeMonthsModel {
  /** Cũ → mới, tháng cuối là tháng report. Chỉ tháng có phiên. */
  months: ShopeeMonthData[];
  /** Tháng report còn dở lúc chốt số ⇒ mọi tháng cắt tới ngày này (cùng kỳ); null = so cả tháng. */
  cutDay: number | null;
}

export function shopeeMonths(s: ShopeeReportSnapshot): ShopeeMonthsModel {
  const cur: ShopeeMonthData = { month: s.month, campDays: s.campDays ?? {}, streams: s.streams };
  // Ba tháng như Key Metrics của report TikTok (tháng report + 2 tháng trước).
  const months = [...(s.history ?? []).filter((h) => h.streams.length > 0), cur].slice(-3);
  const days = monthDays(s.month);
  const monthEnd = days[days.length - 1];
  const last = s.streams.reduce<string | null>((a, x) => (a == null || x.date > a ? x.date : a), null);
  // Chốt số trước khi hết tháng ⇒ tháng còn dở (cùng luật cmp.partial của report TikTok).
  const partial = vnDateOf(s.computedAt) <= monthEnd && last != null && last < monthEnd;
  return { months, cutDay: partial && last ? Number(last.slice(8)) : null };
}

export const bucketOfDate = (m: Pick<ShopeeMonthData, "campDays">, date: string): ShopeeBucket => m.campDays[date] ?? "daily";

export function streamsOf(m: ShopeeMonthData, tab: ShopeeTab, cutDay: number | null): ShopeeStreamRow[] {
  return m.streams.filter((x) => (cutDay == null || Number(x.date.slice(8)) <= cutDay) && (tab === "all" || bucketOfDate(m, x.date) === tab));
}

// ---------- cộng dồn + chỉ số ----------

export interface ShopeeCounts {
  sessions: number;
  hours: number;
  gmv: number;
  confirmed: number;
  orders: number;
  viewers: number;
  /** Phần các phiên có số ATC/Engaged/Items (bản chụp 5) — tỷ lệ chỉ tính trên phần này. */
  rich: { sessions: number; hours: number; gmv: number; viewers: number; atc: number; engaged: number; items: number; orders: number; viewSec: number };
}

export function shopeeCounts(rows: ShopeeStreamRow[]): ShopeeCounts {
  const rich = rows.filter((r) => r.atc != null);
  return {
    sessions: rows.length,
    hours: sum(rows, (r) => r.hours),
    gmv: sum(rows, (r) => r.gmv),
    confirmed: sum(rows, (r) => r.confirmed),
    orders: sum(rows, (r) => r.orders),
    viewers: sum(rows, (r) => r.viewers),
    rich: {
      sessions: rich.length,
      hours: sum(rich, (r) => r.hours),
      gmv: sum(rich, (r) => r.gmv),
      viewers: sum(rich, (r) => r.viewers),
      atc: sum(rich, (r) => r.atc ?? 0),
      engaged: sum(rich, (r) => r.engaged ?? 0),
      items: sum(rich, (r) => r.items ?? 0),
      orders: sum(rich, (r) => r.orders),
      viewSec: sum(rich, (r) => (r.avgViewSec ?? 0) * r.viewers)
    }
  };
}

export type ShopeeKmKey =
  | "gmv" | "hours" | "gmvPerHour" | "orders" | "abs" | "items" | "confirmedRate"
  | "viewers" | "viewersPerHour" | "engagedRate" | "avgView"
  | "atc" | "atcRate" | "ordersPerAtc" | "gmvPerAtc";
type Kind = "money" | "int" | "hours" | "pct" | "dur";

export interface ShopeeKmDef {
  key: ShopeeKmKey;
  label: string;
  kind: Kind;
  /** true = tăng là tốt; null = không đánh giá tốt/xấu (Giờ live). */
  goodWhenUp: boolean | null;
  group: "result" | "traffic" | "cart";
  /** Chỉ số kết quả (là hệ quả, không làm nguyên nhân). */
  result?: boolean;
  /** Chỉ số quy mô (cộng dồn) — tăng/giảm theo Giờ live, Insight không đọc là cải thiện/suy giảm hiệu suất. */
  volume?: boolean;
  value: (c: ShopeeCounts) => number | null;
}

const richOk = (c: ShopeeCounts) => c.rich.sessions > 0;

export const SHOPEE_KM_GROUPS: { group: ShopeeKmDef["group"]; label: string }[] = [
  { group: "result", label: "Kết quả" },
  { group: "traffic", label: "Người xem" },
  { group: "cart", label: "Giỏ hàng & chuyển đổi" }
];

export const SHOPEE_KM: ShopeeKmDef[] = [
  { key: "gmv", label: METRIC.gmv, kind: "money", goodWhenUp: true, group: "result", result: true, volume: true, value: (c) => (c.sessions ? c.gmv : null) },
  { key: "hours", label: METRIC.liveHours, kind: "hours", goodWhenUp: null, group: "result", value: (c) => (c.sessions ? c.hours : null) },
  { key: "gmvPerHour", label: METRIC.gmvPerHour, kind: "money", goodWhenUp: true, group: "result", result: true, value: (c) => ratio(c.gmv, c.hours) },
  { key: "orders", label: METRIC.orders, kind: "int", goodWhenUp: true, group: "result", result: true, volume: true, value: (c) => (c.sessions ? c.orders : null) },
  { key: "abs", label: METRIC.abs, kind: "money", goodWhenUp: true, group: "result", value: (c) => ratio(c.gmv, c.orders) },
  { key: "items", label: METRIC.itemsSoldShopee, kind: "int", goodWhenUp: true, group: "result", result: true, volume: true, value: (c) => (richOk(c) && c.rich.items > 0 ? c.rich.items : null) },
  { key: "confirmedRate", label: `${METRIC.salesConfirmed} / ${METRIC.gmv}`, kind: "pct", goodWhenUp: true, group: "result", value: (c) => (c.gmv > 0 && c.confirmed > 0 ? (c.confirmed / c.gmv) * 100 : null) },
  { key: "viewers", label: METRIC.viewers, kind: "int", goodWhenUp: true, group: "traffic", volume: true, value: (c) => (c.viewers > 0 ? c.viewers : null) },
  { key: "viewersPerHour", label: METRIC.viewersPerHour, kind: "int", goodWhenUp: true, group: "traffic", value: (c) => (c.viewers > 0 ? ratio(c.viewers, c.hours) : null) },
  { key: "engagedRate", label: `${METRIC.engagedViewers} / ${METRIC.viewers}`, kind: "pct", goodWhenUp: true, group: "traffic", value: (c) => (richOk(c) && c.rich.viewers > 0 && c.rich.engaged > 0 ? (c.rich.engaged / c.rich.viewers) * 100 : null) },
  { key: "avgView", label: METRIC.avgViewingDuration, kind: "dur", goodWhenUp: true, group: "traffic", value: (c) => (richOk(c) && c.rich.viewers > 0 && c.rich.viewSec > 0 ? c.rich.viewSec / c.rich.viewers : null) },
  { key: "atc", label: METRIC.atc, kind: "int", goodWhenUp: true, group: "cart", volume: true, value: (c) => (richOk(c) && c.rich.atc > 0 ? c.rich.atc : null) },
  { key: "atcRate", label: METRIC.atcRate, kind: "pct", goodWhenUp: true, group: "cart", value: (c) => (richOk(c) && c.rich.viewers > 0 && c.rich.atc > 0 ? (c.rich.atc / c.rich.viewers) * 100 : null) },
  { key: "ordersPerAtc", label: `${METRIC.orders}/${METRIC.atc}`, kind: "pct", goodWhenUp: true, group: "cart", value: (c) => (richOk(c) && c.rich.atc > 0 ? (c.rich.orders / c.rich.atc) * 100 : null) },
  { key: "gmvPerAtc", label: METRIC.gmvPerAtc, kind: "money", goodWhenUp: true, group: "cart", value: (c) => (richOk(c) && c.rich.atc > 0 ? c.rich.gmv / c.rich.atc : null) }
];

export function fmtShopeeKm(kind: Kind, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (kind) {
    case "money": return fmtVndShort(v);
    case "int": return Math.round(v).toLocaleString("vi-VN");
    case "hours": return `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h`;
    case "pct": return `${v.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    case "dur": return v >= 60 ? `${Math.floor(v / 60)}m${String(Math.round(v % 60)).padStart(2, "0")}s` : `${Math.round(v)}s`;
  }
}

/** CV GMV/giờ một phiên đo trên Live List của brand (mọi tháng có trong bản chụp); thiếu phiên ⇒ mặc định. */
export function shopeeSessionCv(model: ShopeeMonthsModel): { cv: number; measured: boolean } {
  const rows = model.months.flatMap((m) => m.streams.map((x) => ({ startTime: `${x.date}T${x.time || "00:00"}:00+07:00`, gmv: x.gmv, hours: x.hours, m })));
  const byDate = new Map(model.months.flatMap((m) => m.streams.map((x) => [x.date, m] as const)));
  const cv = estimateSessionCv(rows, (d) => {
    const m = byDate.get(d);
    return m ? bucketOfDate(m, d) : "daily";
  });
  return cv != null ? { cv, measured: true } : { cv: SESSION_CV, measured: false };
}

export interface ShopeeKmRow {
  def: ShopeeKmDef;
  values: (number | null)[];
  /** % đổi so với tháng liền trước (phần tử 0 = null). */
  changes: (number | null)[];
  /** "up"/"down" = tốt lên / xấu đi vượt ngưỡng; "noise" = trong ngưỡng; "neutral" = không đánh giá. */
  tones: ("up" | "down" | "noise" | "neutral" | null)[];
}

export interface ShopeeKmTable {
  sessions: number[];
  bands: (number | null)[];
  rows: ShopeeKmRow[];
}

export function shopeeKmTable(model: ShopeeMonthsModel, tab: ShopeeTab, cv: number): ShopeeKmTable {
  const counts = model.months.map((m) => shopeeCounts(streamsOf(m, tab, model.cutDay)));
  const sessions = counts.map((c) => c.sessions);
  const bands = sessions.map((n, i) => (i === 0 ? null : noiseBand(sessions[i - 1], n, cv)));
  const rows = SHOPEE_KM.map((def) => {
    const values = counts.map((c) => def.value(c));
    const changes = values.map((v, i) => (i === 0 ? null : pctChange(values[i - 1], v)));
    const tones = changes.map((c, i) => {
      if (c == null) return null;
      // Chỉ số quy mô (GMV, Orders, Viewers…) đi theo Giờ live ⇒ như Giờ live, không đánh giá tốt/xấu (VERA T10: GMV +21% chỉ vì giờ +26%).
      if (def.goodWhenUp == null || def.volume) return "neutral" as const;
      const b = bands[i];
      if (b == null || Math.abs(c) <= b) return "noise" as const;
      return (c > 0) === def.goodWhenUp ? ("up" as const) : ("down" as const);
    });
    return { def, values, changes, tones };
  }).filter((r) => r.values.some((v) => v != null));
  return { sessions, bands, rows };
}

// ---------- tách nguyên nhân ----------

export type ShopeeFactor = "hours" | "viewersPerHour" | "atcRate" | "gmvPerAtc" | "gmvPerViewer";
export const SHOPEE_FACTOR_LABEL: Record<ShopeeFactor, string> = {
  hours: METRIC.liveHours,
  viewersPerHour: METRIC.viewersPerHour,
  atcRate: METRIC.atcRate,
  gmvPerAtc: METRIC.gmvPerAtc,
  gmvPerViewer: `GMV/${METRIC.viewers}`
};

/**
 * GMV = Giờ live × Viewers/giờ × ATC/Viewer × GMV/ATC — tính trên phần phiên có số ATC ở CẢ hai kỳ để tích đúng bằng GMV phần đó.
 * Bản chụp cũ (chưa lưu ATC theo phiên) ⇒ 3 thừa số Giờ live × Viewers/giờ × GMV/Viewer. Thiếu số một bên ⇒ null.
 */
export function shopeeDrivers(a: ShopeeCounts, b: ShopeeCounts): DriverBreakdown<ShopeeFactor> | null {
  const full = a.rich.sessions === a.sessions && b.rich.sessions === b.sessions && a.rich.atc > 0 && b.rich.atc > 0;
  if (full) {
    return logShareBreakdown<ShopeeFactor>(a.gmv, b.gmv, [
      ["hours", a.hours, b.hours],
      ["viewersPerHour", a.viewers / a.hours, b.viewers / b.hours],
      ["atcRate", a.rich.atc / a.viewers, b.rich.atc / b.viewers],
      ["gmvPerAtc", a.gmv / a.rich.atc, b.gmv / b.rich.atc]
    ]);
  }
  if (!(a.hours > 0 && b.hours > 0 && a.viewers > 0 && b.viewers > 0)) return null;
  return logShareBreakdown<ShopeeFactor>(a.gmv, b.gmv, [
    ["hours", a.hours, b.hours],
    ["viewersPerHour", a.viewers / a.hours, b.viewers / b.hours],
    ["gmvPerViewer", a.gmv / a.viewers, b.gmv / b.viewers]
  ]);
}

export interface ShopeeDayFactorRow {
  key: ShopeeBucket;
  sessionsPrev: number;
  sessionsCur: number;
  change: Partial<Record<ShopeeFactor | "gmvPerHour", number | null>>;
  band: number | null;
  significant: boolean;
}

/** Thay đổi các yếu tố theo loại ngày, tháng report so với tháng trước (cùng kỳ, mỗi tháng theo khung camp của nó). */
export function shopeeDayFactorRows(model: ShopeeMonthsModel, cv: number): ShopeeDayFactorRow[] {
  const n = model.months.length;
  if (n < 2) return [];
  const [pm, cm] = [model.months[n - 2], model.months[n - 1]];
  return SHOPEE_BUCKETS.flatMap((k) => {
    const a = shopeeCounts(streamsOf(pm, k, model.cutDay));
    const b = shopeeCounts(streamsOf(cm, k, model.cutDay));
    if (a.sessions === 0 || b.sessions === 0) return [];
    const ra = (c: ShopeeCounts) => (c.rich.sessions === c.sessions && c.rich.atc > 0 ? c : null);
    const ca = ra(a), cb = ra(b);
    const gph = pctChange(ratio(a.gmv, a.hours), ratio(b.gmv, b.hours));
    const band = noiseBand(a.sessions, b.sessions, cv);
    return [{
      key: k,
      sessionsPrev: a.sessions,
      sessionsCur: b.sessions,
      change: {
        hours: pctChange(a.hours, b.hours),
        viewersPerHour: pctChange(ratio(a.viewers, a.hours), ratio(b.viewers, b.hours)),
        atcRate: ca && cb ? pctChange(ca.rich.atc / ca.viewers, cb.rich.atc / cb.viewers) : null,
        gmvPerAtc: ca && cb ? pctChange(ca.gmv / ca.rich.atc, cb.gmv / cb.rich.atc) : null,
        gmvPerHour: gph
      },
      band,
      significant: gph != null && band != null && Math.abs(gph) > band
    }];
  });
}

// ---------- bảng điểm Target ----------

export interface ShopeeScoreRow {
  key: ShopeeTab;
  target: number | null;
  /** Target tới ngày cuối có số (tháng còn dở); null = tháng đủ. */
  targetToDate: number | null;
  actual: number;
  pct: number | null;
  planHours: number | null;
  /** Giờ kế hoạch của các ca tới ngày cuối có số (tháng còn dở) — mẫu số "% Giờ live kế hoạch" ở Insight trang 1. */
  planHoursToDate: number | null;
  hours: number;
  sessions: number;
  requiredPerHour: number | null;
  gmvPerHour: number | null;
}

export function shopeeScore(s: ShopeeReportSnapshot, model: ShopeeMonthsModel): ShopeeScoreRow[] {
  const cur = model.months[model.months.length - 1];
  const slots = s.planSlots ?? [];
  const cutDate = model.cutDay != null ? `${s.month}-${String(model.cutDay).padStart(2, "0")}` : null;
  const slotTotal = sum(slots, (x) => x.target);
  const row = (key: ShopeeTab): ShopeeScoreRow | null => {
    const rows = streamsOf(cur, key, null);
    const sl = key === "all" ? slots : slots.filter((x) => bucketOfDate(cur, x.date) === key);
    let target: number | null = sum(sl, (x) => x.target);
    if (key === "all" && s.planTarget && s.planTarget.total > 0) target = s.planTarget.total;
    if (!(target > 0)) target = null;
    if (key !== "all" && slotTotal <= 0) target = null;
    // Target tới nay = target các ca kế hoạch tới ngày cuối có số (phần "all" lấy tổng ca, không theo số tổng nhập tay).
    const td = cutDate != null && target != null ? sum(sl.filter((x) => x.date <= cutDate), (x) => x.target) || null : null;
    const planHours = sl.length ? sum(sl, (x) => x.hours) : null;
    const planHoursToDate = sl.length ? (cutDate != null ? sum(sl.filter((x) => x.date <= cutDate), (x) => x.hours) : planHours) : null;
    const actual = sum(rows, (x) => x.gmv);
    const hours = sum(rows, (x) => x.hours);
    if (key !== "all" && rows.length === 0 && target == null) return null;
    const base = td ?? target;
    return {
      key,
      target,
      targetToDate: td,
      actual,
      pct: base ? (actual / base) * 100 : null,
      planHours,
      planHoursToDate,
      hours,
      sessions: rows.length,
      requiredPerHour: target != null && planHours ? target / planHours : null,
      gmvPerHour: ratio(actual, hours)
    };
  };
  return SHOPEE_TABS.map(row).filter((x): x is ShopeeScoreRow => x != null);
}

// ---------- Tổng quan: bảng điểm, cầu Target, GMV/giờ so với kế hoạch ----------

/** Bảng điểm theo kiểu ScoreRow của report TikTok (SummaryDemoPage). */
export function shopeeScoreRows(p: ShopeePageModel): ScoreRow[] {
  return p.score.map((r) => ({ key: r.key, target: r.target, actual: r.actual, targetToDate: r.targetToDate, pct: r.pct }));
}

export function shopeeTargetBridge(p: ShopeePageModel): BridgePoint[] | null {
  const b = targetBridge(shopeeScoreRows(p), (k) => SHOPEE_TAB_LABEL[k]);
  return b ? bridgePoints(p.model.cutDay != null ? "Target tới nay" : "Target tháng", b.start, b.steps, `${METRIC.gmv} thực tế`, b.end) : null;
}

/** GMV/giờ kế hoạch từng loại ngày = Σ target ca ÷ Σ giờ ca (Kế Hoạch Tháng Shopee), cạnh GMV/giờ thực tế. */
export function shopeePlanHours(s: ShopeeReportSnapshot, p: ShopeePageModel): PlanHourRow[] {
  const slots = s.planSlots ?? [];
  const total = sum(slots, (x) => x.target);
  if (slots.length === 0 || total <= 0) return [];
  const cur = lastOf(p.model.months);
  return SHOPEE_BUCKETS.map((k) => {
    const mine = slots.filter((x) => bucketOfDate(cur, x.date) === k);
    const target = sum(mine, (x) => x.target);
    const hours = sum(mine, (x) => x.hours);
    const actual = p.score.find((r) => r.key === k)?.gmvPerHour ?? null;
    return { key: k, planGmvPerHour: hours > 0 && target > 0 ? target / hours : null, actualGmvPerHour: actual, planHours: hours, planTarget: target, share: target / total };
  });
}

/** "7–9/10" cho từng loại ngày campaign của tháng (nhãn bảng Kết quả so với Target). */
export function shopeeSpans(s: ShopeeReportSnapshot): Partial<Record<CampDayBucket, string>> {
  const m = Number(s.month.slice(5));
  const out: Partial<Record<CampDayBucket, string>> = {};
  for (const b of ["dday", "midmonth", "payday"] as const) {
    const ds = Object.entries(s.campDays ?? {}).filter(([, v]) => v === b).map(([d]) => Number(d.slice(8))).sort((x, y) => x - y);
    if (ds.length) out[b] = ds.length === 1 ? `${ds[0]}/${m}` : `${ds[0]}–${ds[ds.length - 1]}/${m}`;
  }
  return out;
}

// ---------- Đơn huỷ: Sales(Placed Order) so với Sales(Confirmed Order) ----------

export interface ShopeeCancelMonth {
  month: string;
  gmv: number;
  confirmed: number;
  /** % giá trị đơn đặt chưa thành đơn xác nhận (huỷ/chưa thanh toán) tại lúc tải Live List. null = file chưa có cột Confirmed. */
  cancelRate: number | null;
  byBucket: Record<ShopeeBucket, { gmv: number; confirmed: number; sessions: number }>;
}

export function shopeeCancelMonths(p: ShopeePageModel): ShopeeCancelMonth[] {
  return p.model.months.map((m) => {
    const rows = streamsOf(m, "all", p.model.cutDay);
    const gmv = sum(rows, (x) => x.gmv);
    const confirmed = sum(rows, (x) => x.confirmed);
    const byBucket = Object.fromEntries(
      SHOPEE_BUCKETS.map((b) => {
        const r = rows.filter((x) => bucketOfDate(m, x.date) === b);
        return [b, { gmv: sum(r, (x) => x.gmv), confirmed: sum(r, (x) => x.confirmed), sessions: r.length }];
      })
    ) as ShopeeCancelMonth["byBucket"];
    return { month: m.month, gmv, confirmed, cancelRate: gmv > 0 && confirmed > 0 ? (1 - confirmed / gmv) * 100 : null, byBucket };
  });
}

// ---------- Sản phẩm: Top SKU + hạng so với tháng trước (cùng bảng của TikTok) ----------

/** Product List Shopee → kiểu SkuRankSlice của TikTok; gmv = Sales(Placed Order), clicks = Product Clicks (Shopee không có Product Impressions theo sản phẩm). */
export function shopeeSkuSlices(s: ShopeeReportSnapshot, cutDay: number | null): { cur: SkuRankSlice | null; prev: SkuRankSlice | null } {
  const p = s.products;
  if (p.count === 0) return { cur: null, prev: null };
  const sorted = [...p.top].filter((x) => x.salesPlaced > 0).sort((a, b) => b.salesPlaced - a.salesPlaced);
  let run = 0;
  let for80: number | null = null;
  sorted.forEach((x, i) => {
    run += x.salesPlaced;
    if (for80 == null && p.totalSales > 0 && run >= p.totalSales * 0.8) for80 = i + 1;
  });
  const end = cutDay != null ? `${s.month}-${String(cutDay).padStart(2, "0")}` : monthDays(s.month).slice(-1)[0];
  const cur: SkuRankSlice = {
    items: sorted.map((x, i) => ({ name: x.name, gmv: x.salesPlaced, gmvLive: x.salesPlaced, orders: x.ordersPlaced, itemsSold: x.itemsPlaced, clicks: x.clicks, rank: i + 1 })),
    sellingSkus: p.withSales,
    skusFor80Pct: for80,
    limit: sorted.length,
    hasAnyBatch: true,
    periodStart: `${s.month}-01`,
    periodEnd: end
  };
  const pm = prevMonthOf(s.month);
  const prev: SkuRankSlice | null = s.prevProducts?.length
    ? { items: s.prevProducts.map((x) => ({ name: x.name, gmv: x.sales, gmvLive: x.sales, orders: 0, rank: x.rank })), sellingSkus: s.prevProducts.length, limit: s.prevProducts.length, hasAnyBatch: true, periodStart: `${pm}-01`, periodEnd: monthDays(pm).slice(-1)[0] }
    : null;
  return { cur, prev };
}

export function shopeeSkuMoves(s: ShopeeReportSnapshot, cutDay: number | null): SkuMoves | null {
  const { cur, prev } = shopeeSkuSlices(s, cutDay);
  const m = skuMoves(cur, prev);
  if (!m) return null;
  // Shopee: tỷ lệ chuyển đổi theo sản phẩm = Orders ÷ Product Clicks (không có Product Impressions ⇒ không có CTR).
  return { ...m, rows: m.rows.map((r) => ({ ...r, ctr: null })) };
}

// ---------- Host & khung giờ: khung giờ / phân bố / top phiên theo Live List ----------

const SLOT_DEFS = [
  { key: "morning", label: "Sáng (trước 12h)", test: (h: number) => h < 12 },
  { key: "afternoon", label: "Chiều (12h–17h)", test: (h: number) => h >= 12 && h < 17 },
  { key: "evening", label: "Tối (từ 17h)", test: (h: number) => h >= 17 }
];

export interface ShopeeSlotRow {
  key: string;
  label: string;
  prev: { n: number; gmvPerHour: number | null };
  cur: { n: number; gmvPerHour: number | null; index: number | null };
}

/** Khung giờ bắt đầu phiên (cùng 3 khung của report TikTok), tháng trước → tháng này cùng kỳ; `index` = GMV thực ÷ GMV kỳ vọng theo GMV/giờ trung bình của loại ngày (khử phiên nửa đêm D-Day). */
export function shopeeSlots(p: ShopeePageModel): ShopeeSlotRow[] {
  const n = p.model.months.length;
  const cm = p.model.months[n - 1];
  const pmo = n >= 2 ? p.model.months[n - 2] : null;
  const cur = streamsOf(cm, "all", p.model.cutDay);
  const prev = pmo ? streamsOf(pmo, "all", p.model.cutDay) : [];
  const mean = new Map<ShopeeBucket, number>();
  for (const b of SHOPEE_BUCKETS) {
    const r = cur.filter((x) => bucketOfDate(cm, x.date) === b);
    const h = sum(r, (x) => x.hours);
    if (h > 0) mean.set(b, sum(r, (x) => x.gmv) / h);
  }
  const hourOf = (x: ShopeeStreamRow) => Number((x.time || "00").slice(0, 2));
  return SLOT_DEFS.map((d) => {
    const c = cur.filter((x) => d.test(hourOf(x)));
    const q = prev.filter((x) => d.test(hourOf(x)));
    const expected = sum(c, (x) => x.hours * (mean.get(bucketOfDate(cm, x.date)) ?? 0));
    return {
      key: d.key,
      label: d.label,
      prev: { n: q.length, gmvPerHour: ratio(sum(q, (x) => x.gmv), sum(q, (x) => x.hours)) },
      cur: { n: c.length, gmvPerHour: ratio(sum(c, (x) => x.gmv), sum(c, (x) => x.hours)), index: expected > 0 ? sum(c, (x) => x.gmv) / expected : null }
    };
  }).filter((r) => r.cur.n > 0 || r.prev.n > 0);
}

const quant = (xs: number[], q: number) => {
  const pos = (xs.length - 1) * q;
  const lo = Math.floor(pos);
  return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (pos - lo);
};

/** Phân bố GMV/giờ các phiên trong tháng (bỏ phiên dưới 6 phút) — cùng luật sessionSpread của TikTok. */
export function shopeeSpread(s: ShopeeReportSnapshot): SessionSpread | null {
  const points = s.streams.filter((x) => x.hours > 0.1).map((x) => ({ label: `${x.date.slice(8, 10)}/${x.date.slice(5, 7)} ${x.time}`, hours: x.hours, gmvPerHour: x.gmv / x.hours, gmv: x.gmv }));
  if (points.length === 0) return null;
  const g = points.map((x) => x.gmvPerHour).sort((a, b) => a - b);
  return { count: points.length, worst: g[0], p25: quant(g, 0.25), median: quant(g, 0.5), p75: quant(g, 0.75), best: g[g.length - 1], points };
}

export interface ShopeeTopSession {
  startTime: string;
  hours: number;
  gmv: number;
  gmvPerHour: number;
  orders: number;
  views: number;
  /** ATC/Viewer (%) */
  ctr: number | null;
  /** Orders/ATC (%) */
  ctor: number | null;
}

export function shopeeTopSessions(s: ShopeeReportSnapshot, n = 10): ShopeeTopSession[] {
  return [...s.streams]
    .filter((x) => x.hours > 0)
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, n)
    .map((x) => ({
      startTime: `${x.date}T${x.time || "00:00"}:00+07:00`,
      hours: x.hours,
      gmv: x.gmv,
      gmvPerHour: x.gmv / x.hours,
      orders: x.orders,
      views: x.viewers,
      ctr: x.atc != null && x.viewers > 0 ? (x.atc / x.viewers) * 100 : null,
      ctor: x.atc ? (x.orders / x.atc) * 100 : null
    }));
}

// ---------- mô hình trang ----------

const money = (v: number) => fmtVndShort(v);
const signed = (v: number, d = 0) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("vi-VN", { maximumFractionDigits: d })}%`;
const pctTxt = (v: number, d = 0) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: d })}%`;
const NONE = "Chưa đủ số liệu của trang này để nêu nhận định.";
export const SHOPEE_EMPTY_BLOCKS: InsightBlocks = { observe: NONE, cause: "—", impact: "—", advise: "—" };

export const monthShortLabel = (m: string) => `T${Number(m.slice(5))}`;
const prevMonthOf = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export interface ShopeePageModel {
  model: ShopeeMonthsModel;
  cv: { cv: number; measured: boolean };
  score: ShopeeScoreRow[];
  km: Record<ShopeeTab, ShopeeKmTable>;
  drivers: DriverBreakdown<ShopeeFactor> | null;
  dayFactors: ShopeeDayFactorRow[];
  /** Nhãn kỳ so: "T9" hoặc "1–26/09". */
  prevLabel: string | null;
  curLabel: string;
}

export function shopeePageModel(s: ShopeeReportSnapshot): ShopeePageModel {
  const model = shopeeMonths(s);
  const cv = shopeeSessionCv(model);
  const km = Object.fromEntries(SHOPEE_TABS.map((t) => [t, shopeeKmTable(model, t, cv.cv)])) as Record<ShopeeTab, ShopeeKmTable>;
  const n = model.months.length;
  const win = (m: string) => (model.cutDay != null ? `1–${model.cutDay}/${m.slice(5)}` : monthShortLabel(m));
  const drivers = n >= 2 ? shopeeDrivers(shopeeCounts(streamsOf(model.months[n - 2], "all", model.cutDay)), shopeeCounts(streamsOf(model.months[n - 1], "all", model.cutDay))) : null;
  return {
    model,
    cv,
    score: shopeeScore(s, model),
    km,
    drivers,
    dayFactors: shopeeDayFactorRows(model, cv.cv),
    prevLabel: n >= 2 ? win(model.months[n - 2].month) : null,
    curLabel: win(s.month)
  };
}

const kmCell = (t: ShopeeKmTable, key: ShopeeKmKey) => t.rows.find((r) => r.def.key === key);
const lastOf = <T,>(xs: T[]) => xs[xs.length - 1];
/** Tông Key Metrics Shopee → tông của keyMetricsHeadline / keyMetricsBlocks (TikTok). */
const kmTone = (t: ShopeeKmRow["tones"][number]): "up" | "down" | "shift" | "noise" => (t === "up" ? "up" : t === "down" ? "down" : t === "neutral" ? "shift" : "noise");

// ---------- Insight 4 khối + tiêu đề kết luận (chung hàm với report TikTok) ----------

export type ShopeeInsightPage = "summary" | "keymetrics" | "nmv" | "why" | "products" | "people" | "ads" | "next";

export interface ShopeeInsightExtra {
  /** Host có live tháng này + kết luận so trung bình gộp nhiều tháng (hostReliability, như TikTok). */
  hosts: { name: string; verdict: "above" | "below" | "unclear"; ci: string; sessions: number; borderline: boolean }[];
  relMonths: number;
  nextLabel: string;
  hasNextPlan: boolean;
  /** YFB chạy Ads Shopee cho brand (phạm vi 0190) — tắt thì Insight không khuyên chỉnh Ads. */
  withAds?: boolean;
}

export function shopeeInsights(s: ShopeeReportSnapshot, p: ShopeePageModel, x: ShopeeInsightExtra): Record<ShopeeInsightPage, InsightBlocks> {
  const all = p.score.find((r) => r.key === "all");
  const days = p.score.filter((r) => r.key !== "all");
  const km = p.km.all;
  const last = p.model.months.length - 1;
  const sigDays = p.dayFactors.filter((r) => r.significant);
  // Yếu tố giảm mạnh nhất trong loại ngày có GMV/giờ đổi vượt ngưỡng (cùng tiêu chí worstFactor của TikTok).
  const worstSig = [...sigDays].sort((a, b) => (a.change.gmvPerHour ?? 0) - (b.change.gmvPerHour ?? 0))[0];
  const factorKeys = (["viewersPerHour", "atcRate", "gmvPerAtc"] as const).filter((k) => worstSig?.change[k] != null).sort((a, b) => worstSig!.change[a]! - worstSig!.change[b]!);
  const cancel = shopeeCancelMonths(p);
  const cc = lastOf(cancel);
  const cp = cancel.length >= 2 ? cancel[cancel.length - 2] : null;
  const cancelImpact = cc?.cancelRate != null ? `${METRIC.salesConfirmed} ${money(cc.confirmed)}: đơn huỷ chiếm ${pctTxt(cc.cancelRate, 1)} giá trị đặt${cp?.cancelRate != null ? ` (${monthShortLabel(cp.month)}: ${pctTxt(cp.cancelRate, 1)})` : ""}.` : "Chưa có Sales (Confirmed Order) để tính phần đơn huỷ.";
  const sku = shopeeSkuMoves(s, p.model.cutDay);
  const skuRows = sku?.rows ?? [];
  const gain = (r: (typeof skuRows)[number]) => (r.prevRank == null ? 99 : r.prevRank) - r.rank;
  const top10 = skuRows.reduce((a, r) => a + r.gmv, 0);
  const slots = shopeeSlots(p);
  const shortP = (n: string) => shortName(n, 40);
  return {
    summary: summaryBlocks({
      gmvLabel: METRIC.gmv,
      liveActual: all?.actual ?? s.headline.gmv,
      liveTarget: all ? all.targetToDate ?? all.target : null,
      // Cùng cách đọc của TikTok: thiếu do GMV/giờ hay Giờ live so với kế hoạch (tới ngày cuối có số).
      days: days.map((r) => {
        const tgt = r.targetToDate ?? r.target, ph = r.planHoursToDate;
        const planGph = tgt != null && ph ? tgt / ph : null;
        return { label: SHOPEE_TAB_LABEL[r.key], target: tgt, actual: r.actual, gphPct: planGph && r.gmvPerHour != null ? (r.gmvPerHour / planGph) * 100 : null, hoursPct: ph ? (r.hours / ph) * 100 : null };
      }),
      worstFactor: worstSig && factorKeys[0] ? { dayLabel: SHOPEE_TAB_LABEL[worstSig.key], factorLabel: SHOPEE_FACTOR_LABEL[factorKeys[0]], change: worstSig.change[factorKeys[0]]!, dayChange: worstSig.change.gmvPerHour ?? undefined, band: worstSig.band } : null,
      shopKpi: null,
      impact: cancelImpact,
      withAds: x.withAds
    }),
    keymetrics: keyMetricsBlocks({
      rows: km.rows.map((r) => ({ label: r.def.label, change: r.changes[last], tone: kmTone(r.tones[last]), result: r.def.group === "result" })),
      band: km.bands[last] ?? null,
      prevLabel: p.model.months.length >= 2 ? monthShortLabel(p.model.months[last - 1].month) : "tháng trước"
    }),
    nmv: shopeeCancelBlocks(cancel),
    why: whyBlocks({
      gmvLabel: METRIC.gmv,
      gmvPerHourChange: kmCell(km, "gmvPerHour") ? kmCell(km, "gmvPerHour")!.changes[last] : null,
      parts: p.drivers ? p.drivers.parts.map((d) => ({ key: d.key, label: SHOPEE_FACTOR_LABEL[d.key], value: d.value, change: d.change })) : [],
      significantDays: sigDays.map((r) => ({ label: SHOPEE_TAB_LABEL[r.key], change: r.change.gmvPerHour! })),
      band: sigDays[0]?.band ?? null,
      factorBand: km.bands[last] ?? null,
      mix: null
    }),
    products: s.products.count
      ? withoutPrevRank(s, skuRows, productsBlocks({
          topN: skuRows.length,
          risers: skuRows.filter((r) => r.prevRank != null && gain(r) >= 2).sort((a, b) => gain(b) - gain(a)).slice(0, 3).map((r) => ({ name: shortP(r.name), from: r.prevRank, to: r.rank, ctor: r.ctor })),
          fallers: skuRows.filter((r) => r.prevRank != null && r.rank - r.prevRank >= 2).sort((a, b) => b.rank - b.prevRank! - (a.rank - a.prevRank!)).slice(0, 3).map((r) => ({ name: shortP(r.name), from: r.prevRank, to: r.rank, ctor: r.ctor, ctr: null })),
          lead: skuRows[0] && top10 > 0 ? { name: shortP(skuRows[0].name), share: (skuRows[0].gmv / top10) * 100 } : null,
          promo: null,
          rateLabel: `${METRIC.orders}/Product Clicks`,
          promoNote: s.promo && s.promo.coins > 0 ? `${METRIC.coinsClaimed} ${s.promo.coins.toLocaleString("vi-VN")} (≈ ${money(s.promo.coins)}, ${s.headline.gmv > 0 ? pctTxt((s.promo.coins / s.headline.gmv) * 100, 2) : "—"} GMV); ${METRIC.shopVoucherClaimed} ${s.promo.vouchers.toLocaleString("vi-VN")}.` : "Chưa có số khuyến mãi (file overview) của tháng."
        }))
      : SHOPEE_EMPTY_BLOCKS,
    people: peopleBlocks({
      hosts: x.hosts,
      months: x.relMonths,
      slots: slots.filter((r) => r.cur.gmvPerHour != null).map((r) => ({ label: r.label.toLowerCase(), gmvPerHour: r.cur.gmvPerHour!, n: r.cur.n, index: r.cur.index ?? undefined, change: r.prev.gmvPerHour && r.cur.gmvPerHour != null ? (r.cur.gmvPerHour / r.prev.gmvPerHour - 1) * 100 : null, band: noiseBand(r.prev.n, r.cur.n, p.cv.cv) }))
    }),
    ads: shopeeAdsBlocks(s),
    next: nextBlocks({ nextLabel: x.nextLabel, hasLivePlan: x.hasNextPlan, hasCreatorPlan: false, withCreator: false })
  };
}

/** Chưa có Product List tháng trước (hoặc bản chụp trước bản 6) ⇒ không nói "0 mã tăng/giảm hạng" như thể đã so. */
function withoutPrevRank(s: ShopeeReportSnapshot, rows: SkuMoves["rows"], b: InsightBlocks): InsightBlocks {
  if (s.prevProducts?.length) return b;
  const lead = rows[0];
  const top = rows.reduce((a, r) => a + r.gmv, 0);
  const conv = rows.filter((r) => r.ctor != null).sort((a, z) => z.ctor! - a.ctor!);
  return {
    ...b,
    observe: lead && top > 0 ? `${shortName(lead.name, 40)} dẫn đầu Top ${rows.length} SKU, ${pctTxt((lead.gmv / top) * 100)} GMV nhóm top; chưa có Product List tháng trước để so hạng.` : NONE,
    cause: conv.length >= 2 ? `${METRIC.orders}/Product Clicks trong Top ${rows.length}: cao nhất ${shortName(conv[0].name, 40)} (${pctTxt(conv[0].ctor!, 1)}), thấp nhất ${shortName(conv[conv.length - 1].name, 40)} (${pctTxt(conv[conv.length - 1].ctor!, 1)}).` : "—",
    advise: conv.length >= 2 ? `Rà soát giá, voucher và cách giới thiệu ${shortName(conv[conv.length - 1].name, 40)} trong phiên; giữ nhóm sản phẩm dẫn đầu trong kịch bản.` : "Giữ nhóm sản phẩm dẫn đầu trong kịch bản."
  };
}

/** Tiêu đề kết luận: Tổng quan / Key Metrics / Nguyên nhân theo đúng câu mẫu của TikTok, trang khác = câu đầu khối Quan sát. */
export function shopeeHeadlines(s: ShopeeReportSnapshot, p: ShopeePageModel, blocks: Record<ShopeeInsightPage, InsightBlocks>, labels: Record<ShopeeInsightPage, string>): Record<ShopeeInsightPage, string> {
  const all = p.score.find((r) => r.key === "all");
  const km = p.km.all;
  const last = p.model.months.length - 1;
  const fb = (id: ShopeeInsightPage) => `${labels[id]}: chưa đủ số liệu để nêu kết luận.`;
  const out = Object.fromEntries((Object.keys(labels) as ShopeeInsightPage[]).map((id) => [id, observeHeadline(blocks[id], fb(id))])) as Record<ShopeeInsightPage, string>;
  out.summary = summaryHeadline({
    gmvLabel: METRIC.gmv,
    liveActual: all?.actual ?? s.headline.gmv,
    liveTarget: all ? all.targetToDate ?? all.target : null,
    days: p.score.filter((r) => r.key !== "all").map((r) => ({ label: SHOPEE_TAB_LABEL[r.key], target: r.targetToDate ?? r.target, actual: r.actual }))
  });
  out.keymetrics = p.model.months.length < 2
    ? "Chưa có tháng trước để so sánh chỉ số."
    : keyMetricsHeadline({ rows: km.rows.map((r) => ({ label: r.def.label, change: r.changes[last], tone: kmTone(r.tones[last]), result: r.def.group === "result" })), prevLabel: monthShortLabel(p.model.months[last - 1].month) });
  // Nguyên nhân: cùng câu của DemoWhyPage — bước nghẽn = yếu tố hiệu suất đóng góp âm lớn nhất.
  const gph = kmCell(km, "gmvPerHour")?.changes[last] ?? null;
  const worst = p.drivers ? [...p.drivers.parts].filter((d) => d.key !== "hours").sort((a, b) => a.value - b.value)[0] : null;
  if (p.drivers && worst && worst.value < 0 && gph != null) out.why = `${METRIC.gmvPerHour} ${signed(gph)}: yếu tố hiệu suất kéo giảm nhiều nhất là ${SHOPEE_FACTOR_LABEL[worst.key]} (${signed(worst.change)}, ${worst.value >= 0 ? "+" : "−"}${money(Math.abs(worst.value))})`;
  if (s.adsSuite && hasShopeeAds(s.adsSuite) && (s.adsSuite.shop || s.adsSuite.product)) out.ads = shopeeAdsHeadline(s.adsSuite) ?? out.ads;
  return out;
}

export function shopeeCancelBlocks(cancel: ShopeeCancelMonth[]): InsightBlocks {
  const c = lastOf(cancel);
  if (!c || c.cancelRate == null) return SHOPEE_EMPTY_BLOCKS;
  const p = cancel.length >= 2 ? cancel[cancel.length - 2] : null;
  const d = p?.cancelRate != null ? c.cancelRate - p.cancelRate : null;
  const worst = SHOPEE_BUCKETS.map((b) => ({ b, ...c.byBucket[b] })).filter((x) => x.gmv > 0 && x.confirmed > 0).map((x) => ({ ...x, rate: (1 - x.confirmed / x.gmv) * 100 })).sort((a, b) => b.rate - a.rate)[0];
  return {
    observe: `Đơn huỷ chiếm ${pctTxt(c.cancelRate, 1)} ${METRIC.gmv} kỳ này${p?.cancelRate != null ? ` (${monthShortLabel(p.month)}: ${pctTxt(p.cancelRate, 1)}${d != null ? `, ${d >= 0 ? "+" : "−"}${Math.abs(d).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm` : ""})` : ""}.`,
    cause: worst ? `Tỷ lệ huỷ cao nhất ở ${SHOPEE_TAB_LABEL[worst.b]} (${pctTxt(worst.rate, 1)}).` : "—",
    impact: `${METRIC.salesConfirmed} ${money(c.confirmed)} so với ${METRIC.gmv} ${money(c.gmv)}, chênh ${money(c.gmv - c.confirmed)}. Số xác nhận tính tới lúc tải Live List; đơn còn chờ thanh toán có thể thành đơn xác nhận sau.`,
    advise: "YFB cập nhật Sales (Confirmed Order) của tháng sau khi hết thời gian thanh toán/huỷ; file live của Shopee không có lý do huỷ, cần brand cung cấp file đơn hàng nếu muốn phân tích lý do."
  };
}

/** Cắt tên sản phẩm ở ranh giới từ. */
export const shortName = (name: string, n = 56) => (name.length <= n ? name : `${name.slice(0, name.lastIndexOf(" ", n) > n * 0.6 ? name.lastIndexOf(" ", n) : n)}…`);

export function shopeeAdsBlocks(s: ShopeeReportSnapshot): InsightBlocks {
  if (s.adsSuite && (s.adsSuite.shop || s.adsSuite.product) && hasShopeeAds(s.adsSuite)) return shopeeAdsSuiteBlocks(s.adsSuite);
  const a = s.ads;
  const g = s.headline.gmv;
  if (!a) return SHOPEE_EMPTY_BLOCKS;
  return {
    observe: `${METRIC.expense} ${money(a.expense)} cho ${a.campaigns} chiến dịch Live Ads; GMV trong file Ads ${money(a.gmv)} (${METRIC.roas} ${a.roas != null ? a.roas.toLocaleString("vi-VN", { maximumFractionDigits: 1 }) : "—"}x).`,
    cause: g > 0 ? `GMV từ Ads chiếm ${pctTxt((a.gmv / g) * 100)} GMV live; phần còn lại đến từ traffic tự nhiên và người theo dõi.` : "—",
    impact: a.costPerOrder != null ? `Chi phí mỗi đơn từ Ads ${money(a.costPerOrder)} so với ${METRIC.abs} ${money(s.headline.abs ?? 0)}.` : "—",
    advise: "Shopee chỉ cho số Ads cả tháng theo chiến dịch — đề xuất tải file Ads theo từng tuần để so ROAS giữa ngày campaign và Daily."
  };
}

// ---------- phiên ngoài ca YFB (brand tự live cùng tài khoản, 30/10) ----------
// Live List là MỌI phiên của tài khoản shop ⇒ số tổng có thể lẫn phiên brand tự live. Luật "không có ca trong lịch YFB = không
// phải YFB": phiên Live List bắt đầu ngoài mọi ca YFB (nới 30 phút hai đầu cho lên sóng sớm/trễ) là phiên ngoài ca. Không tách
// số, chỉ đo để đổi nhãn số tổng + dòng cho ops. Đo trên VERA T9/T10: 1/50 và 1/59 phiên (≤1% GMV live).

/** Từ ngưỡng này (% GMV Live List) số tổng mới đổi nhãn "gồm cả phiên brand tự live" — dưới đó coi như nhiễu ghép ca. */
export const OUTSIDE_YFB_LABEL_SHARE = 3;
const SLACK_MS = 30 * 60_000;

export interface OutsideYfb {
  streams: number;
  total: number;
  gmv: number;
  hours: number;
  /** % GMV Live List của tháng; null khi Live List không có GMV. */
  share: number | null;
}

export function shopeeOutsideYfb(streams: ShopeeStreamRow[], sessions: Pick<LiveSession, "date" | "startTime" | "endTime" | "status">[]): OutsideYfb {
  const at = (date: string, hm: string) => new Date(`${date}T${hm.slice(0, 5)}:00+07:00`).getTime();
  const spans = sessions
    .filter((x) => x.status !== "Cancelled" && x.startTime && x.endTime)
    .map((x) => {
      const a = at(x.date, x.startTime);
      let b = at(x.date, x.endTime);
      if (b <= a) b += 86_400_000; // ca qua nửa đêm
      return [a - SLACK_MS, b + SLACK_MS] as const;
    });
  const out = streams.filter((t) => {
    const st = at(t.date, t.time);
    return !spans.some(([a, b]) => st >= a && st < b);
  });
  const all = sum(streams, (t) => t.gmv);
  const gmv = sum(out, (t) => t.gmv);
  return { streams: out.length, total: streams.length, gmv, hours: sum(out, (t) => t.hours), share: all > 0 ? (gmv / all) * 100 : null };
}
