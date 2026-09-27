import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import type { ShopDayLite } from "../dataraw/monthlyProductSlice";
import { vnDateOf } from "../dataraw/vnDate";
import { METRIC } from "../metricGlossary";
import type { CompareWindow } from "./monthlyReportInsights";

// Ba khối chuyển từ "Phân tích sâu (nội bộ ops)" vào Report Tháng khi gộp 2 nơi làm một (2026-09-27).
// Phân tích sâu tải thẳng Dữ Liệu Gốc (~11 MB/lần mở) và tự chọn nguồn/kỳ so riêng nên ra số lệch report
// (GMV −42,8% vs −22,8% cùng kỳ; campaign đoán từ tiêu đề phòng thay vì lịch camp). Ở đây chỉ giữ phần report
// chưa có, và tính từ CHÍNH đầu vào của report (bản chụp: shopDays + dòng ca) với cùng kỳ so `cmp`.
// Mọi hàm thuần, không đọc DB.

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);

// ---------- Nhịp bán theo ngày (phần 2) ----------

export interface RhythmPoint {
  date: string;
  label: string; // "07/09"
  gmv: number; // Total GMV cả shop trong ngày (Shop Analytics)
  ma7: number | null; // trung bình trượt 7 ngày của gmv
  live: number; // LIVE GMV agency trong ngày (ca có số)
}

export interface WeekdayIndex {
  label: string; // T2..CN
  days: number;
  avgGmv: number;
  /** 100 = ngày trung bình của kỳ. */
  index: number | null;
}

export interface DailyRhythm {
  points: RhythmPoint[];
  /** % Total GMV nằm ở 5 ngày cao nhất. */
  top5Pct: number | null;
  /** Số ngày cao nhất cộng lại đủ 80% Total GMV của kỳ. */
  daysFor80: number | null;
  best: RhythmPoint | null;
  worst: RhythmPoint | null;
  weekday: WeekdayIndex[];
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEKDAY_LABEL = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/** Ngày của kỳ `start..end` có trong Shop Analytics, kèm LIVE GMV agency theo ngày từ dòng ca. */
export function dailyRhythm(days: ShopDayLite[] | undefined, liveRows: CreatorLivePerfRow[], start: string, end: string): DailyRhythm | null {
  const inRange = (days ?? []).filter((d) => d.date >= start && d.date <= end).sort((a, b) => a.date.localeCompare(b.date));
  if (inRange.length === 0) return null;
  const liveByDate = new Map<string, number>();
  for (const r of liveRows) {
    const d = vnDateOf(r.startTime);
    if (d >= start && d <= end) liveByDate.set(d, (liveByDate.get(d) ?? 0) + r.gmv);
  }
  const points: RhythmPoint[] = inRange.map((d, i) => ({
    date: d.date,
    label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`,
    gmv: d.gmv,
    ma7: i >= 6 ? sum(inRange.slice(i - 6, i + 1), (x) => x.gmv) / 7 : null,
    live: liveByDate.get(d.date) ?? 0
  }));

  const total = sum(points, (p) => p.gmv);
  const sorted = [...points].sort((a, b) => b.gmv - a.gmv);
  let acc = 0;
  let daysFor80: number | null = null;
  for (let i = 0; i < sorted.length && total > 0; i++) {
    acc += sorted[i].gmv;
    if (acc / total >= 0.8) {
      daysFor80 = i + 1;
      break;
    }
  }
  const mean = total / points.length;
  const weekday = WEEKDAY_ORDER.map((w) => {
    const ds = points.filter((p) => new Date(`${p.date}T00:00:00Z`).getUTCDay() === w);
    const avg = ds.length ? sum(ds, (p) => p.gmv) / ds.length : 0;
    return { label: WEEKDAY_LABEL[w], days: ds.length, avgGmv: avg, index: ds.length && mean > 0 ? (avg / mean) * 100 : null };
  });
  return {
    points,
    top5Pct: total > 0 ? (sum(sorted.slice(0, 5), (p) => p.gmv) / total) * 100 : null,
    daysFor80,
    best: sorted[0] ?? null,
    worst: sorted.at(-1) ?? null,
    weekday
  };
}

// ---------- Phễu LIVE (phần 3) ----------

export interface FunnelStage {
  label: string;
  prev: number;
  cur: number;
  /** Tỷ lệ từ bậc trên xuống bậc này (%), cùng tên chỉ số với report: ERR, Product CTR, CTOR. */
  rateLabel: string | null;
  ratePrev: number | null;
  rateCur: number | null;
}

interface FunnelTotals {
  impressions: number;
  views: number;
  productImpressions: number;
  productClicks: number;
  orders: number;
  gmv: number;
}

function funnelTotals(rows: CreatorLivePerfRow[], start: string, end: string): FunnelTotals {
  const t: FunnelTotals = { impressions: 0, views: 0, productImpressions: 0, productClicks: 0, orders: 0, gmv: 0 };
  for (const r of rows) {
    const d = vnDateOf(r.startTime);
    if (d < start || d > end) continue;
    t.impressions += r.impressions;
    t.views += r.views;
    t.productImpressions += r.productImpressions;
    t.productClicks += r.productClicks;
    t.orders += r.orders;
    t.gmv += r.gmv;
  }
  return t;
}

const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

/** LIVE impressions → Views (ERR) → Product impressions → Product clicks (Product CTR) → Orders (CTOR), cùng kỳ
 *  `cmp`. CTOR = Orders ÷ Product clicks — đúng định nghĩa report (Phân tích sâu cũ dùng SKU orders nên lệch). */
export function liveFunnel(prevRows: CreatorLivePerfRow[], curRows: CreatorLivePerfRow[], cmp: CompareWindow): FunnelStage[] | null {
  const p = funnelTotals(prevRows, cmp.prevStart, cmp.prevEnd);
  const c = funnelTotals(curRows, cmp.curStart, cmp.curEnd);
  if (c.views === 0 && p.views === 0) return null;
  const stage = (label: string, k: keyof FunnelTotals, rateLabel: string | null, from: keyof FunnelTotals | null): FunnelStage => ({
    label,
    prev: p[k],
    cur: c[k],
    rateLabel,
    ratePrev: from ? pct(p[k], p[from]) : null,
    rateCur: from ? pct(c[k], c[from]) : null
  });
  return [
    stage(METRIC.liveImpressions, "impressions", null, null),
    stage(METRIC.views, "views", METRIC.err, "impressions"),
    // Product impressions ÷ Views là SỐ LẦN (một người xem thấy nhiều sản phẩm), không phải tỷ lệ chuyển.
    stage(METRIC.productImpressions, "productImpressions", null, null),
    stage(METRIC.productClicks, "productClicks", METRIC.productCtr, "productImpressions"),
    stage(METRIC.orders, "orders", METRIC.ctor, "productClicks")
  ];
}

// ---------- Phân bố GMV/giờ từng phiên (phần 6) ----------

export interface SessionSpreadPoint {
  label: string; // "07/09 19:00"
  hours: number;
  gmvPerHour: number;
  gmv: number;
}

export interface SessionSpread {
  count: number;
  worst: number;
  p25: number;
  median: number;
  p75: number;
  best: number;
  points: SessionSpreadPoint[];
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Phiên dưới 6 phút bỏ khỏi phân bố — GMV/giờ của phiên vài phút phóng đại vô nghĩa. */
export function sessionSpread(rows: CreatorLivePerfRow[], start: string, end: string): SessionSpread | null {
  const points: SessionSpreadPoint[] = [];
  for (const r of rows) {
    const d = vnDateOf(r.startTime);
    if (d < start || d > end || r.hours <= 0.1) continue;
    const t = new Date(r.startTime);
    const hh = String((t.getUTCHours() + 7) % 24).padStart(2, "0");
    const mm = String(t.getUTCMinutes()).padStart(2, "0");
    points.push({ label: `${d.slice(8, 10)}/${d.slice(5, 7)} ${hh}:${mm}`, hours: r.hours, gmvPerHour: r.gmv / r.hours, gmv: r.gmv });
  }
  if (points.length === 0) return null;
  const gph = points.map((p) => p.gmvPerHour).sort((a, b) => a - b);
  return { count: points.length, worst: gph[0], p25: quantile(gph, 0.25), median: quantile(gph, 0.5), p75: quantile(gph, 0.75), best: gph[gph.length - 1], points };
}
