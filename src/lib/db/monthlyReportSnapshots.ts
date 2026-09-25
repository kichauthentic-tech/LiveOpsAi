import { supabase } from "../supabaseClient";
import type { MonthlyReportSnapshot, SnapshotPieces } from "../report/monthlySnapshot";

// Bản chụp số liệu Report Tháng (migration 0119). Nội dung dựng ở lib/report/monthlySnapshot.ts —
// file này chỉ đọc/ghi. `month` luôn là "YYYY-MM".

export interface StoredMonthlyReportSnapshot {
  snapshot: MonthlyReportSnapshot;
  computedAt: string;
}

export async function fetchMonthlyReportSnapshot(brandId: string, month: string): Promise<StoredMonthlyReportSnapshot | null> {
  const { data, error } = await supabase
    .from("brand_monthly_report_snapshots")
    .select("snapshot, computed_at")
    .eq("brand_id", brandId)
    .eq("period_month", `${month}-01`)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as { snapshot: MonthlyReportSnapshot; computed_at: string };
  return { snapshot: row.snapshot, computedAt: row.computed_at };
}

/** Chỉ phần `pieces` (số Dữ Liệu Gốc đã tổng hợp) của tháng khác — để tháng sau tái dùng số tháng trước
 *  làm cột so sánh mà không tải lại file, và không kéo theo danh sách ca của bản chụp đó. */
export async function fetchSnapshotPieces(brandId: string, month: string): Promise<SnapshotPieces | null> {
  const { data, error } = await supabase
    .from("brand_monthly_report_snapshots")
    .select("pieces:snapshot->pieces")
    .eq("brand_id", brandId)
    .eq("period_month", `${month}-01`)
    .maybeSingle();
  if (error) throw error;
  return ((data as { pieces: SnapshotPieces | null } | null)?.pieces ?? null) || null;
}

/** Tháng nào của brand đã có bản chụp (không tải nội dung) — Điều Phối Phát Hành cần biết để tự tạo
 *  trước khi phát hành. */
export async function snapshotExists(brandId: string, month: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("brand_monthly_report_snapshots")
    .select("period_month")
    .eq("brand_id", brandId)
    .eq("period_month", `${month}-01`)
    .maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function saveMonthlyReportSnapshot(brandId: string, month: string, snapshot: MonthlyReportSnapshot): Promise<string> {
  const { data: auth } = await supabase.auth.getSession();
  const { data, error } = await supabase
    .from("brand_monthly_report_snapshots")
    .upsert(
      {
        brand_id: brandId,
        period_month: `${month}-01`,
        snapshot,
        computed_at: snapshot.computedAt,
        computed_by: auth.session?.user.id ?? null
      },
      { onConflict: "brand_id,period_month" }
    )
    // Không trả lại cả jsonb vừa ghi — client đang giữ sẵn.
    .select("computed_at")
    .single();
  if (error) throw error;
  return (data as { computed_at: string }).computed_at;
}
