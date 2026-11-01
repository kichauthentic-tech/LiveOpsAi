// P&L tháng (01/11) — chỉ TRÌNH BÀY lại MonthClose: không công thức tiền mới. Thêm ba thứ kế toán cần khi đọc P&L:
// (1) độ phủ — số tiền mới tính được X/Y ca nên P&L chưa phải số cả tháng; (2) so với tháng trước theo brand × sàn;
// (3) các bước doanh thu → công talent → chi phí ca → lãi gộp cho biểu đồ thác nước.
import type { ReportPlatform } from "../reportPlatform";
import type { ContractRevenueRow, MonthClose } from "./monthClose";

export type PnlCoverage = "full" | "partial" | "none";

export interface PnlLine {
  revenue: number;
  talentPay: number;
  sessionCosts: number;
  grossProfit: number;
  /** Lãi gộp ÷ doanh thu, 0–100; undefined khi doanh thu = 0. */
  margin?: number;
  counted: number;
  total: number;
  /** Doanh thu của dòng còn phụ thuộc % hoàn dự kiến (NMV chưa chốt). */
  estimated: boolean;
  coverage: PnlCoverage;
}

export interface PnlRow extends PnlLine {
  key: string;
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  /** So với cùng brand × sàn tháng trước; vắng = tháng trước không có dòng. */
  prev?: PnlLine;
}

export interface WaterfallStep {
  key: "revenue" | "talentPay" | "sessionCosts" | "grossProfit";
  label: string;
  /** Giá trị có dấu: doanh thu và lãi gộp dương, chi phí âm. */
  value: number;
}

export interface PnlStatement {
  month: string;
  total: PnlLine;
  prevTotal?: PnlLine;
  rows: PnlRow[];
  waterfall: WaterfallStep[];
  /** Số ca chưa vào tiền (thiếu rate/giá) — P&L đứng trên phần còn lại. */
  uncountedSessions: number;
}

export function coverageOf(counted: number, total: number): PnlCoverage {
  if (total === 0 || counted === 0) return "none";
  return counted >= total ? "full" : "partial";
}

function isEstimate(c: ContractRevenueRow): boolean {
  const b = c.basis;
  if (b.kind === "nmv_estimate") return true;
  return b.kind === "terms" && b.state === "estimate";
}

function lineOf(contracts: ContractRevenueRow[]): PnlLine {
  const acc = contracts.reduce(
    (a, c) => ({
      revenue: a.revenue + c.revenue,
      talentPay: a.talentPay + c.hostPay + c.coHostPay,
      sessionCosts: a.sessionCosts + c.studioCost + c.adsCost,
      grossProfit: a.grossProfit + c.grossProfit,
      counted: a.counted + c.counted,
      total: a.total + c.total,
      estimated: a.estimated || (c.counted > 0 && isEstimate(c))
    }),
    { revenue: 0, talentPay: 0, sessionCosts: 0, grossProfit: 0, counted: 0, total: 0, estimated: false }
  );
  return { ...acc, margin: acc.revenue > 0 ? (acc.grossProfit / acc.revenue) * 100 : undefined, coverage: coverageOf(acc.counted, acc.total) };
}

/** Hợp đồng đổi giữa tháng tách thành nhiều dòng — P&L gộp lại theo brand × sàn. */
function groupByBrandPlatform(close: MonthClose): Map<string, ContractRevenueRow[]> {
  const m = new Map<string, ContractRevenueRow[]>();
  for (const c of close.contracts) {
    const k = `${c.brandId}|${c.platform}`;
    const arr = m.get(k);
    if (arr) arr.push(c);
    else m.set(k, [c]);
  }
  return m;
}

export function buildPnlStatement(close: MonthClose, prev?: MonthClose): PnlStatement {
  const prevGroups = prev ? groupByBrandPlatform(prev) : undefined;
  const rows: PnlRow[] = [...groupByBrandPlatform(close).entries()].map(([key, cs]) => ({
    ...lineOf(cs),
    key,
    brandId: cs[0].brandId,
    brandName: cs[0].brandName,
    platform: cs[0].platform,
    prev: prevGroups?.has(key) ? lineOf(prevGroups.get(key)!) : undefined
  }));
  // Dòng đã có tiền lên trước, trong đó lãi gộp lớn trước; dòng chưa tính được xuống cuối.
  rows.sort((a, b) => Number(b.coverage !== "none") - Number(a.coverage !== "none") || b.grossProfit - a.grossProfit || a.brandName.localeCompare(b.brandName));
  const total = lineOf(close.contracts);
  return {
    month: close.month,
    total,
    prevTotal: prev && prev.contracts.length > 0 ? lineOf(prev.contracts) : undefined,
    rows,
    waterfall: [
      { key: "revenue", label: "Doanh thu", value: total.revenue },
      { key: "talentPay", label: "Công talent", value: -total.talentPay },
      { key: "sessionCosts", label: "Chi phí ca", value: -total.sessionCosts },
      { key: "grossProfit", label: "Lãi gộp", value: total.grossProfit }
    ],
    uncountedSessions: total.total - total.counted
  };
}

/** Chênh lệch % so với kỳ trước (số mới ÷ số cũ − 1). undefined khi không có hoặc kỳ trước = 0 (không chia được). */
export function changePct(cur: number, prev: number | undefined): number | undefined {
  if (prev == null || prev === 0) return undefined;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

export interface PnlTrendPoint extends PnlLine {
  month: string;
}

/** Xu hướng nhiều tháng: mỗi tháng một dòng tổng; tháng chưa tính được ca nào thì bỏ (cột rỗng dễ đọc nhầm là lãi 0). */
export function buildPnlTrend(closes: MonthClose[]): PnlTrendPoint[] {
  return closes.map((c) => ({ month: c.month, ...lineOf(c.contracts) })).filter((t) => t.counted > 0);
}

export interface DailyAccountSeries {
  key: string;
  brandName: string;
  platform: ReportPlatform;
  /** Lãi gộp mỗi ngày (chỉ ngày có ca; ngày không ca = 0). */
  perDay: number[];
  /** Lãi gộp cộng dồn từ đầu tháng. */
  cumulative: number[];
}

export interface DailyTrend {
  /** Ngày trong tháng 1..N, N = ngày cuối có ca tính được. */
  days: number[];
  series: DailyAccountSeries[];
}

/** Lãi/lỗ từng account theo ngày trong tháng; xếp theo lãi cộng dồn cuối kỳ giảm dần. */
export function buildDailyTrend(close: MonthClose): DailyTrend {
  const last = close.daily.reduce((m, d) => Math.max(m, Number(d.date.slice(8, 10))), 0);
  const days = Array.from({ length: last }, (_, i) => i + 1);
  const map = new Map<string, DailyAccountSeries>();
  for (const d of close.daily) {
    const key = `${d.brandId}|${d.platform}`;
    let s = map.get(key);
    if (!s) {
      s = { key, brandName: d.brandName, platform: d.platform, perDay: days.map(() => 0), cumulative: [] };
      map.set(key, s);
    }
    s.perDay[Number(d.date.slice(8, 10)) - 1] += d.revenue - d.cost;
  }
  for (const s of map.values()) {
    let acc = 0;
    s.cumulative = s.perDay.map((v) => (acc += v));
  }
  return { days, series: [...map.values()].sort((a, b) => (b.cumulative.at(-1) ?? 0) - (a.cumulative.at(-1) ?? 0)) };
}
