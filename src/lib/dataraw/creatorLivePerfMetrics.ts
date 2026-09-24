import { CreatorLivePerfRow, vnDateOf } from "./creatorLivePerfSlice";

// Report Tháng Tab 02 — lớp tính toán thuần JS trên nguồn Creator-Live-Performance (thay
// live_analysis). Không nhóm theo host (không có cột tên host trong file) — chỉ tổng hợp theo
// tháng/khung camp/từng phiên. Cùng convention "null khi mẫu số = 0" như monthlyLiveMetrics.ts.

export interface CreatorLivePerfAgg {
  sessionCount: number;
  gmv: number;
  itemsSold: number;
  orders: number;
  skuOrders: number;
  hours: number;
  views: number;
  impressions: number;
  productImpressions: number;
  productClicks: number;
  newFollowers: number;
  comments: number;
  shares: number;
  likes: number;
  upt: number | null;
  avgPrice: number | null;
  gmvPerHour: number | null;
  viewsPerHour: number | null;
  ctr: number | null; // = productClicks / productImpressions — tính lại từ số đếm, KHÔNG lấy trung bình cột % có sẵn (sai lệch khi phiên to/nhỏ khác nhau)
  // = skuOrders / productClicks. FIX (audit module 3, 2026-09-25): trước đây dùng `orders` (Attributed
  // orders) — sai định nghĩa của chính TikTok, cột gốc là "CTOR (SKU order)" (xem deepDiveSource.ts /
  // metrics.ts đã dùng đúng skuOrders từ đầu). Report Tháng Tab 02 (brand-facing, dùng agg này) và
  // Report Chuyên Sâu Tab 05 (ops-only, dùng metrics.ts) vì vậy từng hiện 2 con số CTOR khác nhau cho
  // cùng một tháng — đúng kiểu lệch số hai trang mà liveUnits.ts đã ghi nhận suýt vá hụt.
  ctor: number | null;
  liveCtr: number | null; // = views / impressions
}

export function aggregateCreatorLivePerfRows(rows: CreatorLivePerfRow[]): CreatorLivePerfAgg {
  let gmv = 0,
    itemsSold = 0,
    orders = 0,
    skuOrders = 0,
    hours = 0,
    views = 0,
    impressions = 0,
    productImpressions = 0,
    productClicks = 0,
    newFollowers = 0,
    comments = 0,
    shares = 0,
    likes = 0;
  for (const r of rows) {
    gmv += r.gmv;
    itemsSold += r.itemsSold;
    orders += r.orders;
    skuOrders += r.skuOrders;
    hours += r.hours;
    views += r.views;
    impressions += r.impressions;
    productImpressions += r.productImpressions;
    productClicks += r.productClicks;
    newFollowers += r.newFollowers;
    comments += r.comments;
    shares += r.shares;
    likes += r.likes;
  }
  return {
    sessionCount: rows.length,
    gmv,
    itemsSold,
    orders,
    skuOrders,
    hours,
    views,
    impressions,
    productImpressions,
    productClicks,
    newFollowers,
    comments,
    shares,
    likes,
    upt: orders > 0 ? itemsSold / orders : null,
    avgPrice: itemsSold > 0 ? gmv / itemsSold : null,
    gmvPerHour: hours > 0 ? gmv / hours : null,
    viewsPerHour: hours > 0 ? views / hours : null,
    ctr: productImpressions > 0 ? (productClicks / productImpressions) * 100 : null,
    ctor: productClicks > 0 ? (skuOrders / productClicks) * 100 : null,
    liveCtr: impressions > 0 ? (views / impressions) * 100 : null
  };
}

// CampDayBucket / CampOverrides / resolveCampBucketType đã chuyển sang lib/campaignDays.ts (thuần,
// không kéo supabaseClient) để lib/performance/targetAllocation.ts dùng chung — re-export để các
// import cũ không đổi.
export { CAMP_DAY_BUCKET_ORDER, CAMP_DAY_BUCKET_LABEL, resolveCampBucketType } from "../campaignDays";
export type { CampDayBucket, CampRangeOverride, CampOverrides } from "../campaignDays";
import { CampDayBucket, CampOverrides, resolveCampBucketType } from "../campaignDays";

export function bucketByCampaignDay(rows: CreatorLivePerfRow[], overrides?: CampOverrides): Record<CampDayBucket, CreatorLivePerfRow[]> {
  const out: Record<CampDayBucket, CreatorLivePerfRow[]> = { dday: [], midmonth: [], payday: [], daily: [] };
  for (const r of rows) {
    out[resolveCampBucketType(vnDateOf(r.startTime), overrides)].push(r);
  }
  return out;
}

// Actual GMV theo khung camp cho chart "Target vs Actual" (brief Module 2: SUM(gmv_live_session)
// từ File 1 "Live Performance Core Stats", KHÔNG phải File 3 dùng ở bucketByCampaignDay trên —
// 2 file GMV lệch nhau ~15% do nguồn khác nhau, giữ đúng nguồn brief chỉ định cho phần này).
export function sumDailyGmvByBucket(daily: { date: string; gmvLiveSession: number }[], overrides?: CampOverrides): Record<CampDayBucket, number> {
  const out: Record<CampDayBucket, number> = { dday: 0, midmonth: 0, payday: 0, daily: 0 };
  for (const d of daily) {
    out[resolveCampBucketType(d.date, overrides)] += d.gmvLiveSession;
  }
  return out;
}

// Phễu chuyển đổi Module 2 (brief): Live Impressions -> Views -> Product Views -> Product Clicks
// -> Orders, cộng dồn cả tháng.
export interface FunnelStage {
  label: string;
  value: number;
}

export function buildFunnel(rows: CreatorLivePerfRow[]): FunnelStage[] {
  const agg = aggregateCreatorLivePerfRows(rows);
  return [
    { label: "Live Impressions", value: agg.impressions },
    { label: "Views", value: agg.views },
    { label: "Product Views", value: agg.productImpressions },
    { label: "Product Clicks", value: agg.productClicks },
    { label: "Orders", value: agg.orders }
  ];
}

export function topSessionsByGmv(rows: CreatorLivePerfRow[], limit = 10): CreatorLivePerfRow[] {
  return [...rows].sort((a, b) => b.gmv - a.gmv).slice(0, limit);
}
