import { supabase } from "../supabaseClient";
import { AffiliatePlanEntry } from "../../types";

// Kế hoạch Affiliate theo creator cho tháng sau (migration 0065, Report Tháng Tab 05). Nhập tay
// hoàn toàn, không đọc Dataraw/LiveSession (dữ liệu về tương lai). Lưu theo kiểu "replace toàn bộ
// danh sách" mỗi lần ops bấm Lưu — đơn giản hơn diff-per-row, chấp nhận được vì đây là dữ liệu kế
// hoạch nội bộ (không phải actual tài chính cần audit trail từng thay đổi).

interface DbAffiliatePlan {
  id: string;
  brand_id: string;
  period_month: string;
  creator_name: string;
  camp_tag: string | null;
  schedule_label: string | null;
  timeline_label: string | null;
  duration_hours: number | null;
  target_gmv: number | null;
  budget_ads: number | null;
  sort_order: number;
}

function fromDb(row: DbAffiliatePlan): AffiliatePlanEntry {
  return {
    id: row.id,
    brandId: row.brand_id,
    periodMonth: row.period_month,
    creatorName: row.creator_name,
    campTag: row.camp_tag ?? undefined,
    scheduleLabel: row.schedule_label ?? undefined,
    timelineLabel: row.timeline_label ?? undefined,
    durationHours: row.duration_hours ?? undefined,
    targetGmv: row.target_gmv ?? undefined,
    budgetAds: row.budget_ads ?? undefined,
    sortOrder: row.sort_order
  };
}

// periodMonth: "YYYY-MM-01" — tháng KẾ HOẠCH (tháng sau tháng report đang xem).
export async function fetchAffiliatePlans(brandId: string, periodMonth: string): Promise<AffiliatePlanEntry[]> {
  const { data, error } = await supabase
    .from("brand_affiliate_plans")
    .select("*")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return ((data as DbAffiliatePlan[]) ?? []).map(fromDb);
}

export async function replaceAffiliatePlans(brandId: string, periodMonth: string, entries: AffiliatePlanEntry[]): Promise<AffiliatePlanEntry[]> {
  const { error: deleteError } = await supabase
    .from("brand_affiliate_plans")
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
      camp_tag: e.campTag || null,
      schedule_label: e.scheduleLabel || null,
      timeline_label: e.timelineLabel || null,
      duration_hours: e.durationHours ?? null,
      target_gmv: e.targetGmv ?? null,
      budget_ads: e.budgetAds ?? null,
      sort_order: idx
    }));
  if (rows.length === 0) return [];

  const { data, error } = await supabase.from("brand_affiliate_plans").insert(rows).select();
  if (error) throw error;
  return ((data as DbAffiliatePlan[]) ?? []).sort((a, b) => a.sort_order - b.sort_order).map(fromDb);
}
