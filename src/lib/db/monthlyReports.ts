import { supabase } from "../supabaseClient";
import { BrandMonthlyReport } from "../../types";

// Report tháng Brand Workspace (migration 0051) — số liệu vận hành (GMV/Host/SKU) không lưu ở
// đây, luôn tính live từ LiveSession[] phía component. Bảng chỉ giữ phần nhập tay + trạng thái
// phát hành. Xem publishMonthlyReport() cho cơ chế cảnh báo/chặn khi còn session chưa đối soát.

interface DbMonthlyReport {
  id: string;
  brand_id: string;
  period_month: string;
  status: string;
  ads_spend: number | null;
  roas: number | null;
  promotion_notes: string | null;
  customer_insight_notes: string | null;
  account_health_notes: string | null;
  plan_target_gmv: number | null;
  plan_target_nmv: number | null;
  plan_target_hours: number | null;
  plan_pct_daily: number | null;
  plan_pct_dday: number | null;
  plan_pct_midmonth: number | null;
  plan_pct_payday: number | null;
  camp_dday_start: string | null;
  camp_dday_end: string | null;
  camp_dday_target_gmv: number | null;
  camp_midmonth_start: string | null;
  camp_midmonth_end: string | null;
  camp_midmonth_target_gmv: number | null;
  camp_payday_start: string | null;
  camp_payday_end: string | null;
  camp_payday_target_gmv: number | null;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

function reportFromDb(row: DbMonthlyReport): BrandMonthlyReport {
  return {
    id: row.id,
    brandId: row.brand_id,
    periodMonth: row.period_month,
    status: row.status as BrandMonthlyReport["status"],
    adsSpend: row.ads_spend ?? undefined,
    roas: row.roas ?? undefined,
    promotionNotes: row.promotion_notes ?? undefined,
    customerInsightNotes: row.customer_insight_notes ?? undefined,
    accountHealthNotes: row.account_health_notes ?? undefined,
    planTargetGmv: row.plan_target_gmv ?? undefined,
    planTargetNmv: row.plan_target_nmv ?? undefined,
    planTargetHours: row.plan_target_hours ?? undefined,
    planPctDaily: row.plan_pct_daily ?? undefined,
    planPctDday: row.plan_pct_dday ?? undefined,
    planPctMidmonth: row.plan_pct_midmonth ?? undefined,
    planPctPayday: row.plan_pct_payday ?? undefined,
    campDdayStart: row.camp_dday_start ?? undefined,
    campDdayEnd: row.camp_dday_end ?? undefined,
    campDdayTargetGmv: row.camp_dday_target_gmv ?? undefined,
    campMidmonthStart: row.camp_midmonth_start ?? undefined,
    campMidmonthEnd: row.camp_midmonth_end ?? undefined,
    campMidmonthTargetGmv: row.camp_midmonth_target_gmv ?? undefined,
    campPaydayStart: row.camp_payday_start ?? undefined,
    campPaydayEnd: row.camp_payday_end ?? undefined,
    campPaydayTargetGmv: row.camp_payday_target_gmv ?? undefined,
    publishedAt: row.published_at ?? undefined,
    publishedBy: row.published_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export interface MonthlyReportManualInput {
  adsSpend?: number;
  roas?: number;
  promotionNotes?: string;
  customerInsightNotes?: string;
  accountHealthNotes?: string;
  planTargetGmv?: number;
  planTargetNmv?: number;
  planTargetHours?: number;
  planPctDaily?: number;
  planPctDday?: number;
  planPctMidmonth?: number;
  planPctPayday?: number;
  campDdayStart?: string;
  campDdayEnd?: string;
  campDdayTargetGmv?: number;
  campMidmonthStart?: string;
  campMidmonthEnd?: string;
  campMidmonthTargetGmv?: number;
  campPaydayStart?: string;
  campPaydayEnd?: string;
  campPaydayTargetGmv?: number;
}

// Mọi dòng report (RLS tự cắt theo brand cho role brand) — App dùng để phân bổ target xuống từng
// ca (lib/performance/targetAllocation.ts). Khoá map là "brandId|YYYY-MM".
export async function fetchAllMonthlyReports(): Promise<Map<string, BrandMonthlyReport>> {
  const { data, error } = await supabase.from("brand_monthly_reports").select("*");
  if (error) throw error;
  const out = new Map<string, BrandMonthlyReport>();
  for (const row of (data as DbMonthlyReport[]) ?? []) {
    const r = reportFromDb(row);
    out.set(`${r.brandId}|${r.periodMonth.slice(0, 7)}`, r);
  }
  return out;
}

// periodMonth: "YYYY-MM-01". Lấy report hiện có nếu đã tạo, không tự tạo mới — UI gọi
// upsertMonthlyReport() khi ops lưu nháp lần đầu.
export async function fetchMonthlyReport(brandId: string, periodMonth: string): Promise<BrandMonthlyReport | null> {
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .select("*")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .maybeSingle();
  if (error) throw error;
  return data ? reportFromDb(data as DbMonthlyReport) : null;
}

export async function fetchPublishedMonthlyReports(brandId: string): Promise<BrandMonthlyReport[]> {
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .select("*")
    .eq("brand_id", brandId)
    .eq("status", "published")
    .order("period_month", { ascending: false });
  if (error) throw error;
  return ((data as DbMonthlyReport[]) ?? []).map(reportFromDb);
}

export async function upsertMonthlyReport(brandId: string, periodMonth: string, input: MonthlyReportManualInput): Promise<BrandMonthlyReport> {
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .upsert(
      {
        brand_id: brandId,
        period_month: periodMonth,
        ads_spend: input.adsSpend ?? null,
        roas: input.roas ?? null,
        promotion_notes: input.promotionNotes ?? null,
        customer_insight_notes: input.customerInsightNotes ?? null,
        account_health_notes: input.accountHealthNotes ?? null,
        // Đã sửa: các field kế hoạch dưới đây từng bị THIẾU khỏi payload upsert dù có trong
        // MonthlyReportManualInput — Tab 05 "Kế hoạch tháng sau" tưởng đã lưu nhưng chưa từng ghi
        // xuống DB (mọi field plan_* luôn bị null hoá lại mỗi lần upsert vì không có mặt trong object).
        plan_target_gmv: input.planTargetGmv ?? null,
        plan_target_nmv: input.planTargetNmv ?? null,
        plan_target_hours: input.planTargetHours ?? null,
        plan_pct_daily: input.planPctDaily ?? null,
        plan_pct_dday: input.planPctDday ?? null,
        plan_pct_midmonth: input.planPctMidmonth ?? null,
        plan_pct_payday: input.planPctPayday ?? null,
        camp_dday_start: input.campDdayStart ?? null,
        camp_dday_end: input.campDdayEnd ?? null,
        camp_dday_target_gmv: input.campDdayTargetGmv ?? null,
        camp_midmonth_start: input.campMidmonthStart ?? null,
        camp_midmonth_end: input.campMidmonthEnd ?? null,
        camp_midmonth_target_gmv: input.campMidmonthTargetGmv ?? null,
        camp_payday_start: input.campPaydayStart ?? null,
        camp_payday_end: input.campPaydayEnd ?? null,
        camp_payday_target_gmv: input.campPaydayTargetGmv ?? null
      },
      { onConflict: "brand_id,period_month" }
    )
    .select()
    .single();
  if (error) throw error;
  return reportFromDb(data as DbMonthlyReport);
}

// force=true khi ops đã xác nhận qua checkbox "vẫn phát hành dù còn session chưa đối soát".
// RPC tự đếm lại session Completed/data_source=manual trong kỳ ở DB (không tin client) — nếu có
// và force=false thì raise lỗi "unreconciled_sessions:N", bắt ở UI để hiện cảnh báo cụ thể.
export async function publishMonthlyReport(reportId: string, force: boolean): Promise<BrandMonthlyReport> {
  const { data, error } = await supabase.rpc("publish_brand_monthly_report", { p_report_id: reportId, p_force: force });
  if (error) throw error;
  return reportFromDb(data as DbMonthlyReport);
}

export async function unpublishMonthlyReport(reportId: string): Promise<BrandMonthlyReport> {
  const { data, error } = await supabase.rpc("unpublish_brand_monthly_report", { p_report_id: reportId });
  if (error) throw error;
  return reportFromDb(data as DbMonthlyReport);
}
