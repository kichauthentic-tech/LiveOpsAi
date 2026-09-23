import { supabase } from "../supabaseClient";
import { AffiliateActualEntry } from "../../types";

// Affiliate thực tế tháng đang xem (migration 0067, Report Tháng Tab 04) — nhập tay hoàn toàn, cùng
// pattern "replace toàn bộ danh sách mỗi lần lưu" như brand_affiliate_plans (affiliatePlans.ts).

interface DbAffiliateActual {
  id: string;
  brand_id: string;
  period_month: string;
  creator_name: string;
  live_date_label: string | null;
  target_gmv: number | null;
  direct_gmv: number | null;
  duration_hours: number | null;
  ads_cost: number | null;
  items_sold: number | null;
  avg_price: number | null;
  viewer: number | null;
  ctr: number | null;
  ctor: number | null;
  campaign_type: string | null;
  timeline_label: string | null;
  live_impressions: number | null;
  orders: number | null;
  sort_order: number;
}

function fromDb(row: DbAffiliateActual): AffiliateActualEntry {
  return {
    id: row.id,
    brandId: row.brand_id,
    periodMonth: row.period_month,
    creatorName: row.creator_name,
    liveDateLabel: row.live_date_label ?? undefined,
    targetGmv: row.target_gmv ?? undefined,
    directGmv: row.direct_gmv ?? undefined,
    durationHours: row.duration_hours ?? undefined,
    adsCost: row.ads_cost ?? undefined,
    itemsSold: row.items_sold ?? undefined,
    avgPrice: row.avg_price ?? undefined,
    viewer: row.viewer ?? undefined,
    ctr: row.ctr ?? undefined,
    ctor: row.ctor ?? undefined,
    campaignType: row.campaign_type ?? undefined,
    timelineLabel: row.timeline_label ?? undefined,
    liveImpressions: row.live_impressions ?? undefined,
    orders: row.orders ?? undefined,
    sortOrder: row.sort_order
  };
}

// periodMonth: "YYYY-MM-01" — trùng tháng report đang xem.
export async function fetchAffiliateActuals(brandId: string, periodMonth: string): Promise<AffiliateActualEntry[]> {
  const { data, error } = await supabase
    .from("brand_affiliate_actuals")
    .select("*")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data as DbAffiliateActual[]) ?? []).map(fromDb);
}

export async function replaceAffiliateActuals(brandId: string, periodMonth: string, entries: AffiliateActualEntry[]): Promise<AffiliateActualEntry[]> {
  const { error: deleteError } = await supabase
    .from("brand_affiliate_actuals")
    .delete()
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth);
  if (deleteError) throw deleteError;

  const rows = entries
    .filter((e) => e.creatorName.trim())
    .map((e, idx) => ({
      brand_id: brandId,
      period_month: periodMonth,
      creator_name: e.creatorName.trim(),
      live_date_label: e.liveDateLabel || null,
      target_gmv: e.targetGmv ?? null,
      direct_gmv: e.directGmv ?? null,
      duration_hours: e.durationHours ?? null,
      ads_cost: e.adsCost ?? null,
      items_sold: e.itemsSold ?? null,
      avg_price: e.avgPrice ?? null,
      viewer: e.viewer ?? null,
      ctr: e.ctr ?? null,
      ctor: e.ctor ?? null,
      campaign_type: e.campaignType?.trim() || null,
      timeline_label: e.timelineLabel?.trim() || null,
      live_impressions: e.liveImpressions ?? null,
      orders: e.orders ?? null,
      sort_order: idx
    }));
  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("brand_affiliate_actuals").insert(rows).select();
  if (error) throw error;
  return ((data as DbAffiliateActual[]) ?? []).sort((a, b) => a.sort_order - b.sort_order).map(fromDb);
}
