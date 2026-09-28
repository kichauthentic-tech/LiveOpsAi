import { CreatorLivePerfRow, vnDateOf } from "./creatorLivePerfSlice";

// Tiện ích trên nguồn Creator-Live-Performance. Cộng chỉ số (Key Metrics) nằm ở lib/report/keyMetrics.ts — bản cộng
// riêng trước đây (aggregateCreatorLivePerfRows, không màn nào gọi) đã bỏ 2026-09-29.

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

export function topSessionsByGmv(rows: CreatorLivePerfRow[], limit = 10): CreatorLivePerfRow[] {
  return [...rows].sort((a, b) => b.gmv - a.gmv).slice(0, limit);
}
