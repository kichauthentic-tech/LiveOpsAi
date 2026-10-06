import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { BrandMonthlyReport } from "../../types";
import { prefetchable } from "./prefetch";
import type { ReportPlatform } from "../reportPlatform";

// Report tháng Brand Workspace (migration 0051) — số liệu vận hành (GMV/Host/SKU) không lưu ở
// đây, luôn tính live từ LiveSession[] phía component. Bảng chỉ giữ phần nhập tay + trạng thái
// phát hành. Xem publishMonthlyReport() cho cơ chế cảnh báo/chặn khi còn session chưa đối soát.

interface DbMonthlyReport {
  id: string;
  brand_id: string;
  period_month: string;
  platform?: ReportPlatform | null;
  status: string;
  summary_text: string | null;
  next_steps_text: string | null;
  summary_saved_at: string | null;
  section_notes?: Record<string, { text: string; savedAt: string }> | null;
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
    platform: row.platform ?? "TikTok",
    status: row.status as BrandMonthlyReport["status"],
    summaryText: row.summary_text ?? undefined,
    nextStepsText: row.next_steps_text ?? undefined,
    summarySavedAt: row.summary_saved_at ?? undefined,
    sectionNotes: row.section_notes ?? undefined,
    publishedAt: row.published_at ?? undefined,
    publishedBy: row.published_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// Mọi dòng report (RLS tự cắt theo brand cho role brand) — App dùng để phân bổ target xuống từng
// ca (lib/performance/targetAllocation.ts). Khoá map là "brandId|YYYY-MM".
export async function fetchAllMonthlyReports(): Promise<Map<string, BrandMonthlyReport>> {
  // 1 dòng / brand / tháng — tăng chậm nhưng không bao giờ giảm. Xem src/lib/db/fetchAllPages.ts.
  const data = await fetchAllPages<DbMonthlyReport>((from, to) =>
    supabase.from("brand_monthly_reports").select("*").order("id", { ascending: true }).range(from, to)
  );
  const out = new Map<string, BrandMonthlyReport>();
  for (const row of data) {
    const r = reportFromDb(row);
    // Khoá TikTok giữ nguyên "brandId|YYYY-MM" (mọi nơi đọc target/kế hoạch hiện có đều là của TikTok); report Shopee
    // (0139) có hậu tố riêng để không đè lên.
    out.set(`${r.brandId}|${r.periodMonth.slice(0, 7)}${r.platform === "Shopee" ? "|Shopee" : ""}`, r);
  }
  return out;
}

// periodMonth: "YYYY-MM-01". Lấy report hiện có nếu đã tạo, không tự tạo mới — UI gọi
// upsertMonthlyReport() khi ops lưu nháp lần đầu.
export async function fetchMonthlyReport(brandId: string, periodMonth: string, platform: ReportPlatform = "TikTok"): Promise<BrandMonthlyReport | null> {
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .select("*")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .eq("platform", platform)
    .maybeSingle();
  if (error) throw error;
  return data ? reportFromDb(data as DbMonthlyReport) : null;
}

// Tạo dòng report nháp (chưa có thì tạo, có rồi thì giữ nguyên) — để phát hành tháng chưa từng có dòng. Chỉ ghi cột
// định danh: mọi nội dung report (tóm tắt, Insight) có đường ghi riêng bên dưới, bản chụp số ở monthlyReportSnapshots.
export async function upsertMonthlyReport(brandId: string, periodMonth: string, platform: ReportPlatform = "TikTok"): Promise<BrandMonthlyReport> {
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .upsert({ brand_id: brandId, period_month: periodMonth, platform }, { onConflict: "brand_id,period_month,platform" })
    .select()
    .single();
  if (error) throw error;
  return reportFromDb(data as DbMonthlyReport);
}

// Đoạn tóm tắt + việc tháng sau (0120) — đường ghi RIÊNG, không đi qua upsertMonthlyReport() (hàm đó
// gửi đủ mọi cột nhập tay, ai gọi thiếu field là null hoá). Upsert ở đây chỉ mang 3 cột này nên dòng
// đã có giữ nguyên Ads/kế hoạch/trạng thái; tháng chưa có dòng thì tạo dòng nháp. null = bỏ bản đã
// sửa, quay về bản tự sinh.
export async function saveMonthlyReportNarrative(
  brandId: string,
  periodMonth: string,
  narrative: { summaryText: string | null; nextStepsText: string | null },
  platform: ReportPlatform = "TikTok"
): Promise<BrandMonthlyReport> {
  const cleared = narrative.summaryText === null && narrative.nextStepsText === null;
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .upsert(
      {
        brand_id: brandId,
        period_month: periodMonth,
        platform,
        summary_text: narrative.summaryText,
        next_steps_text: narrative.nextStepsText,
        summary_saved_at: cleared ? null : new Date().toISOString()
      },
      { onConflict: "brand_id,period_month,platform" }
    )
    .select()
    .single();
  if (error) throw error;
  return reportFromDb(data as DbMonthlyReport);
}

// Insight từng phần (0121) — cũng đi đường riêng như tóm tắt. Đọc lại cột hiện có rồi ghi đè ĐÚNG 1 khoá,
// để sửa phần "Người" không xoá mất bản đã sửa của phần "Hàng". text null = bỏ bản đã sửa của phần đó.
export async function saveMonthlyReportSectionNote(brandId: string, periodMonth: string, section: string, text: string | null, platform: ReportPlatform = "TikTok"): Promise<BrandMonthlyReport> {
  const { data: cur, error: readErr } = await supabase
    .from("brand_monthly_reports")
    .select("section_notes")
    .eq("brand_id", brandId)
    .eq("period_month", periodMonth)
    .eq("platform", platform)
    .maybeSingle();
  if (readErr) throw readErr;
  const notes = { ...(((cur as { section_notes: DbMonthlyReport["section_notes"] } | null)?.section_notes ?? {}) as Record<string, { text: string; savedAt: string }>) };
  if (text == null) delete notes[section];
  else notes[section] = { text, savedAt: new Date().toISOString() };
  const { data, error } = await supabase
    .from("brand_monthly_reports")
    .upsert({ brand_id: brandId, period_month: periodMonth, platform, section_notes: Object.keys(notes).length ? notes : null }, { onConflict: "brand_id,period_month,platform" })
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

// Lượt đọc nạp-trước-được (lib/db/prefetch.ts) — Report Tháng và Nhập Ads cùng đọc dòng này.
export const monthlyReportRead = prefetchable("monthlyReport", fetchMonthlyReport);
