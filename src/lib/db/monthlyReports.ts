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
        account_health_notes: input.accountHealthNotes ?? null
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
