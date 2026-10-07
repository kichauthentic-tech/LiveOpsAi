import { supabase } from "../supabaseClient";
import { AffiliateActualEntry, AffiliateEntryStatus } from "../../types";

// Affiliate thực tế tháng đang xem (migration 0067, Report Tháng Tab 04) — nhập tay hoàn toàn, cùng
// pattern "replace toàn bộ danh sách mỗi lần lưu" như brand_affiliate_plans (affiliatePlans.ts).
// Từ 0155 cùng bảng này giữ luôn KẾ HOẠCH: một dòng = một phiên, status 'planned' → 'done' khi file thực tế khớp vào
// (xem lib/affiliate/plan.ts). Trạng thái chốt/tỷ giá theo tháng ở affiliatePlanMonths.ts.

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
  // 0155 — thiếu khi DB chưa chạy migration: fromDb coi là dòng 'done'.
  status?: AffiliateEntryStatus | null;
  camp_name?: string | null;
  plan_timeline_label?: string | null;
  plan_duration_hours?: number | null;
  plan_budget_ads?: number | null;
  note?: string | null;
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
    sortOrder: row.sort_order,
    status: row.status ?? "done",
    campName: row.camp_name ?? undefined,
    planTimelineLabel: row.plan_timeline_label ?? undefined,
    planDurationHours: row.plan_duration_hours ?? undefined,
    planBudgetAds: row.plan_budget_ads ?? undefined,
    note: row.note ?? undefined
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

// Thay cả tháng: CHÈN dòng mới trước, XOÁ dòng cũ (theo id đã đọc lúc đầu) sau. Thứ tự cũ (xoá rồi chèn) mất sạch tháng khi
// lệnh chèn lỗi giữa chừng — vd DB chưa chạy migration thêm cột (0155), RLS từ chối, mất mạng. Giờ chèn lỗi thì dòng cũ còn
// nguyên; xoá lỗi thì tháng tạm có dòng trùng (ném lỗi để UI báo, lần lưu sau dọn tiếp).
export async function replaceAffiliateActuals(brandId: string, periodMonth: string, entries: AffiliateActualEntry[]): Promise<AffiliateActualEntry[]> {
  const { data: oldRows, error: readError } = await supabase
    .from("brand_affiliate_actuals")
    .select("id")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth);
  if (readError) throw readError;
  const oldIds = ((oldRows as { id: string }[]) ?? []).map((r) => r.id);

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
      status: e.status ?? "done",
      camp_name: e.campName?.trim() || null,
      plan_timeline_label: e.planTimelineLabel?.trim() || null,
      plan_duration_hours: e.planDurationHours ?? null,
      plan_budget_ads: e.planBudgetAds ?? null,
      note: e.note?.trim() || null,
      sort_order: idx
    }));

  let inserted: DbAffiliateActual[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase.from("brand_affiliate_actuals").insert(rows).select();
    if (error) throw error;
    inserted = (data as DbAffiliateActual[]) ?? [];
  }
  if (oldIds.length > 0) {
    const { error: deleteError } = await supabase.from("brand_affiliate_actuals").delete().in("id", oldIds);
    if (deleteError) throw deleteError;
  }
  return inserted.sort((a, b) => a.sort_order - b.sort_order).map(fromDb);
}

/** Dòng tối giản cho khối "Việc cần làm" (ops): không kéo số liệu, chỉ đủ biết phiên nào chưa có số / tháng nào chưa chốt. */
export interface AffiliateTodoRow {
  brandId: string;
  periodMonth: string; // "YYYY-MM-01"
  status: AffiliateEntryStatus;
  liveDateLabel?: string;
}

export interface AffiliateTodoData {
  rows: AffiliateTodoRow[];
  /** `${brandId}|YYYY-MM` của tháng ops đã Chốt gửi brand. */
  published: Set<string>;
}

/** months: ["YYYY-MM", …]. Ném lỗi khi DB chưa chạy 0155 (thiếu cột status / bảng tháng) — nơi gọi nuốt để khối việc vẫn hiện. */
export async function fetchAffiliateTodoData(months: string[]): Promise<AffiliateTodoData> {
  const periods = months.map((m) => `${m}-01`);
  const [rowsRes, monthsRes] = await Promise.all([
    supabase.from("brand_affiliate_actuals").select("brand_id, period_month, status, live_date_label").in("period_month", periods),
    supabase.from("brand_affiliate_plan_months").select("brand_id, period_month, published_at").in("period_month", periods)
  ]);
  if (rowsRes.error) throw rowsRes.error;
  if (monthsRes.error) throw monthsRes.error;
  return {
    rows: ((rowsRes.data as { brand_id: string; period_month: string; status: AffiliateEntryStatus | null; live_date_label: string | null }[]) ?? []).map((r) => ({
      brandId: r.brand_id,
      periodMonth: r.period_month,
      status: r.status ?? "done",
      liveDateLabel: r.live_date_label ?? undefined
    })),
    published: new Set(
      ((monthsRes.data as { brand_id: string; period_month: string; published_at: string | null }[]) ?? [])
        .filter((m) => m.published_at)
        .map((m) => `${m.brand_id}|${m.period_month.slice(0, 7)}`)
    )
  };
}
