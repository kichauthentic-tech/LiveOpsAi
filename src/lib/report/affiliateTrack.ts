import type { AffiliateActualEntry } from "../../types";
import { entryStatus, parseDayLabel, planBudget, planHours, sortPlanRows } from "../affiliate/plan";

// Bảng dọc "Theo dõi" của trang Affiliate trong Report Tháng (demo CROCS T10 28/10): mỗi phiên là một cột, hàng xếp theo phễu live,
// cùng tên hàng với tab Theo dõi của app (BrandAffiliateTable). Chỉ phiên đã live của tháng report; số tính một chỗ ở đây.

export interface AffiliateTrackColumn {
  key: string;
  creator: string;
  date: string | null;
  camp?: string;
  hasPlan: boolean;
  timeline?: string;
  /** Khung giờ trong kế hoạch (dòng KẾ HOẠCH), vd "09:00 - 17:00". */
  planTimeline?: string;
  targetGmv?: number;
  planHours?: number;
  directGmv?: number;
  hours?: number;
  gmvPerHour: number | null;
  pctTarget: number | null;
  impressions?: number;
  ctr?: number;
  ctor?: number;
  adsCost?: number;
  budgetAds?: number;
  adsOverBudget: number | null;
  roas: number | null;
  orders?: number;
  items?: number;
  avgPrice?: number;
  viewers?: number;
}

const pos = (v?: number) => (v != null && v > 0 ? v : undefined);

export function affiliateTrackColumns(entries: AffiliateActualEntry[]): AffiliateTrackColumn[] {
  const done = sortPlanRows(entries.filter((e) => entryStatus(e) === "done" && (e.directGmv ?? 0) > 0));
  return done.map((e, i) => {
    const gmv = e.directGmv ?? 0;
    const hours = pos(e.durationHours);
    const ads = pos(e.adsCost);
    const target = pos(e.targetGmv);
    const budget = planBudget(e);
    return {
      key: e.id ?? `${i}`,
      creator: e.creatorName,
      date: parseDayLabel(e.liveDateLabel),
      camp: e.campName,
      hasPlan: !!(e.planTimelineLabel || e.targetGmv != null || e.planBudgetAds != null),
      timeline: e.timelineLabel,
      planTimeline: e.planTimelineLabel,
      targetGmv: target,
      planHours: planHours(e),
      directGmv: gmv,
      hours,
      gmvPerHour: hours ? gmv / hours : null,
      pctTarget: target ? (gmv / target) * 100 : null,
      impressions: e.liveImpressions,
      ctr: e.ctr,
      ctor: e.ctor,
      adsCost: ads,
      budgetAds: budget,
      adsOverBudget: ads && budget ? (ads / budget) * 100 : null,
      roas: ads ? gmv / ads : null,
      orders: e.orders,
      items: e.itemsSold,
      avgPrice: e.avgPrice,
      viewers: e.viewer
    };
  });
}

export interface AffiliateTrackTotals {
  sessions: number;
  directGmv: number;
  hours: number;
  gmvPerHour: number | null;
  targetGmv: number;
  pctTarget: number | null;
  adsCost: number;
  roas: number | null;
}

/** Tổng cả tháng: GMV/giờ chỉ tính trên phiên có giờ, % Target chỉ trên phiên có target, ROAS chỉ trên phiên có Ads cost. */
export function affiliateTrackTotals(cols: AffiliateTrackColumn[]): AffiliateTrackTotals {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const withHours = cols.filter((c) => c.hours);
  const withTarget = cols.filter((c) => c.targetGmv);
  const withAds = cols.filter((c) => c.adsCost);
  const hours = sum(withHours.map((c) => c.hours!));
  const target = sum(withTarget.map((c) => c.targetGmv!));
  const ads = sum(withAds.map((c) => c.adsCost!));
  return {
    sessions: cols.length,
    directGmv: sum(cols.map((c) => c.directGmv ?? 0)),
    hours,
    gmvPerHour: hours > 0 ? sum(withHours.map((c) => c.directGmv ?? 0)) / hours : null,
    targetGmv: target,
    pctTarget: target > 0 ? (sum(withTarget.map((c) => c.directGmv ?? 0)) / target) * 100 : null,
    adsCost: ads,
    roas: ads > 0 ? sum(withAds.map((c) => c.directGmv ?? 0)) / ads : null
  };
}

export type TrackTone = "good" | "bad" | "warn" | undefined;
export interface TrackCell {
  text: string;
  tone?: TrackTone;
}
export interface TrackRow {
  label: string;
  /** Hàng khoá: Target GMV, Direct GMV, GMV/giờ, % Target, ROAS. */
  key?: boolean;
  cell: (c: AffiliateTrackColumn) => TrackCell;
}
export interface TrackGroup {
  group: string;
  rows: TrackRow[];
}

export interface TrackFmt {
  money: (v: number) => string;
  int: (v: number) => string;
  fixed: (v: number, d?: number) => string;
}

const dash: TrackCell = { text: "—" };
const opt = (v: number | undefined, f: (v: number) => string): TrackCell => (v == null ? dash : { text: f(v) });

/** % Target: xanh từ 100%, đỏ dưới 50% (cùng ngưỡng demo). */
export const pctTargetTone = (p: number | null): TrackTone => (p == null ? undefined : p >= 100 ? "good" : p < 50 ? "bad" : undefined);

/** Hàng theo phễu live: kế hoạch → kết quả → lưu lượng → chuyển đổi → giỏ hàng → chi phí Ads. */
export function affiliateTrackGroups(f: TrackFmt): TrackGroup[] {
  return [
    {
      group: "Kế hoạch",
      rows: [
        { label: "Camp", cell: (c) => ({ text: c.camp || "—" }) },
        { label: "Kế hoạch", cell: (c) => ({ text: c.hasPlan ? c.planTimeline || "—" : "Ngoài kế hoạch", tone: c.hasPlan ? undefined : "warn" }) },
        { label: "Giờ kế hoạch", cell: (c) => opt(c.planHours, (v) => f.fixed(v, 1)) },
        { label: "Budget Ads", cell: (c) => opt(c.budgetAds, f.money) }
      ]
    },
    {
      group: "Kết quả",
      rows: [
        { label: "Target GMV", key: true, cell: (c) => opt(c.targetGmv, f.money) },
        { label: "Direct GMV", key: true, cell: (c) => opt(c.directGmv, f.money) },
        { label: "% Target", key: true, cell: (c) => (c.pctTarget == null ? dash : { text: `${f.fixed(c.pctTarget, 1)}%`, tone: pctTargetTone(c.pctTarget) }) },
        { label: "Giờ live", cell: (c) => opt(c.hours, (v) => f.fixed(v, 1)) },
        { label: "Giờ live thực tế", cell: (c) => ({ text: c.timeline || "—" }) },
        { label: "GMV/giờ", key: true, cell: (c) => opt(c.gmvPerHour ?? undefined, f.money) }
      ]
    },
    {
      group: "Lưu lượng",
      rows: [
        { label: "LIVE impressions", cell: (c) => opt(c.impressions, f.int) },
        { label: "Viewers", cell: (c) => opt(c.viewers, f.int) }
      ]
    },
    {
      group: "Chuyển đổi",
      rows: [
        { label: "LIVE CTR", cell: (c) => opt(c.ctr, (v) => `${f.fixed(v, 2)}%`) },
        { label: "CTOR", cell: (c) => opt(c.ctor, (v) => `${f.fixed(v, 2)}%`) }
      ]
    },
    {
      group: "Giỏ hàng",
      rows: [
        { label: "Orders", cell: (c) => opt(c.orders, f.int) },
        { label: "Items sold", cell: (c) => opt(c.items, f.int) },
        { label: "Avg. price", cell: (c) => opt(c.avgPrice, f.int) }
      ]
    },
    {
      group: "Chi phí Ads",
      rows: [
        { label: "Ads cost", cell: (c) => opt(c.adsCost, f.money) },
        { label: "Ads / Budget", cell: (c) => (c.adsOverBudget == null ? dash : { text: `${f.fixed(c.adsOverBudget, 0)}%`, tone: c.adsOverBudget > 100 ? "bad" : undefined }) },
        { label: "ROAS", key: true, cell: (c) => opt(c.roas ?? undefined, (v) => `${f.fixed(v, 1)}x`) }
      ]
    }
  ];
}
