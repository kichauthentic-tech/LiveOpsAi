import { ADS_PARTS, ADS_PART_LABEL, sideTotal, type AdsDayRow, type AdsMonthSummary, type AdsPart } from "../ads/adsTracking";
import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";

// Số cho trang Quảng cáo theo slide "Daily Ads Spending" của Crocs (demo CROCS T10 28/10): bảng theo loại chi, bảng theo giai đoạn,
// biểu đồ cột chồng theo ngày. Nguồn = brand_ads_daily (AdsDayRow). "Luỹ kế" cắt ở ngày cuối có số thực (cùng quy ước adsTrackingMonth);
// Chênh lệch = thực tế ÷ Target − 1.

export type AdsTypeKey = AdsPart | "total";

export interface AdsTypeRow {
  key: AdsTypeKey;
  label: string;
  mtdTarget: number;
  mtdActual: number;
  /** Chênh lệch (%) = thực tế ÷ Target luỹ kế − 1. */
  delta: number | null;
  monthTarget: number;
  /** % Target tháng = thực tế luỹ kế ÷ Target cả tháng. */
  pctMonth: number | null;
}

const inMonth = (rows: AdsDayRow[], month: string) => rows.filter((r) => r.date.startsWith(month)).sort((a, b) => a.date.localeCompare(b.date));
const lastActualOf = (rows: AdsDayRow[]) => rows.filter((r) => r.actual).map((r) => r.date).sort().pop() ?? null;
const pctDelta = (a: number, t: number) => (t > 0 ? (a / t - 1) * 100 : null);

/** Live / Product / Creator / TOTAL: Target luỹ kế, thực tế luỹ kế, chênh lệch, Target cả tháng, % Target tháng. */
export function adsTypeRows(rows: AdsDayRow[], month: string): AdsTypeRow[] {
  const days = inMonth(rows, month);
  const last = lastActualOf(days);
  const keys: AdsTypeKey[] = [...ADS_PARTS, "total"];
  return keys.map((key) => {
    let mtdTarget = 0, mtdActual = 0, monthTarget = 0;
    for (const r of days) {
      const t = key === "total" ? sideTotal(r.target) : r.target[key] ?? 0;
      monthTarget += t;
      if (!last || r.date > last) continue;
      mtdTarget += t;
      mtdActual += r.actual ? (key === "total" ? sideTotal(r.actual) : r.actual[key] ?? 0) : 0;
    }
    return { key, label: key === "total" ? "TOTAL ADS" : ADS_PART_LABEL[key], mtdTarget, mtdActual, delta: pctDelta(mtdActual, mtdTarget), monthTarget, pctMonth: monthTarget > 0 && last ? (mtdActual / monthTarget) * 100 : null };
  });
}

export interface AdsPhaseRow {
  bucket: CampDayBucket;
  days: number;
  target: number;
  actual: number;
  delta: number | null;
  /** Tỷ trọng trong tổng Ads cost thực tế luỹ kế (%). */
  share: number | null;
}

/** Theo giai đoạn (Daily / D-Day / Mid-Month / Pay Day), chỉ các ngày đã có số thực. */
export function adsPhaseRows(rows: AdsDayRow[], month: string, bucketOf: (date: string) => CampDayBucket): AdsPhaseRow[] {
  const known = inMonth(rows, month).filter((r) => r.actual);
  const total = known.reduce((a, r) => a + sideTotal(r.actual!), 0);
  return CAMP_DAY_BUCKET_ORDER.map((bucket) => {
    const rs = known.filter((r) => bucketOf(r.date) === bucket);
    const target = rs.reduce((a, r) => a + sideTotal(r.target), 0);
    const actual = rs.reduce((a, r) => a + sideTotal(r.actual!), 0);
    return { bucket, days: rs.length, target, actual, delta: pctDelta(actual, target), share: total > 0 ? (actual / total) * 100 : null };
  }).filter((r) => r.days > 0);
}

export interface AdsDayPoint {
  day: number;
  date: string;
  bucket: CampDayBucket;
  target: number | null;
  live: number | null;
  product: number | null;
  creator: number | null;
  total: number | null;
  hasActual: boolean;
}

/** Mọi ngày của tháng (kể cả ngày chưa có dòng) để vẽ cột chồng + vạch Target; ngày chưa có số ⇒ hasActual=false. */
export function adsDayPoints(rows: AdsDayRow[], month: string, bucketOf: (date: string) => CampDayBucket): AdsDayPoint[] {
  const [y, m] = month.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const by = new Map(rows.map((r) => [r.date, r]));
  return Array.from({ length: n }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    const r = by.get(date);
    const a = r?.actual ?? null;
    return {
      day: i + 1,
      date,
      bucket: bucketOf(date),
      target: r ? sideTotal(r.target) : null,
      live: a ? a.live ?? 0 : null,
      product: a ? a.product ?? 0 : null,
      creator: a ? a.creator ?? 0 : null,
      total: a ? sideTotal(a) : null,
      hasActual: !!a
    };
  });
}

/** Dải ngày liên tiếp theo `pick` (để tô nền camp / "chưa có số"). */
export function dayRuns(points: AdsDayPoint[], pick: (p: AdsDayPoint) => string | null): { from: number; to: number; label: string }[] {
  const runs: { from: number; to: number; label: string }[] = [];
  for (const p of points) {
    const label = pick(p);
    const last = runs[runs.length - 1];
    if (label == null) continue;
    if (last && last.label === label && last.to === p.day - 1) last.to = p.day;
    else runs.push({ from: p.day, to: p.day, label });
  }
  return runs;
}

export interface AdsRoasRow {
  bucket: CampDayBucket;
  days: number;
  liveAds: number;
  liveGmv: number;
  roas: number | null;
}

/** ROAS Live theo loại ngày (LIVE GMV YFB ÷ Ads Live cùng ngày) lấy từ AdsMonthSummary; chỉ khi có LIVE GMV. */
export function adsRoasRows(s: AdsMonthSummary): AdsRoasRow[] {
  return CAMP_DAY_BUCKET_ORDER.flatMap((bucket) => {
    const b = s.buckets[bucket];
    return b && b.liveGmv > 0 ? [{ bucket, days: b.days, liveAds: b.liveAds, liveGmv: b.liveGmv, roas: b.liveAds > 0 ? b.liveGmv / b.liveAds : null }] : [];
  });
}
