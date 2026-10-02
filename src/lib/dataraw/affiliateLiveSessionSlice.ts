import { supabase } from "../supabaseClient";
import { DataRawColumn } from "../../types";
import { AffiliateBatch, AffiliateLiveSessionRow, buildAffiliateRows } from "./affiliateLiveRows";
import { fetchRowsPaged } from "./fetchRowsPaged";

// Đường ĐỌC DB cho trang Affiliate (migration 0102). Toàn bộ phần biến dòng thô thành phiên nằm ở
// affiliateLiveRows.ts (thuần, có unit test); file này chỉ lo chọn batch + đọc dòng.
export interface AffiliateLiveSessionSlice {
  rows: AffiliateLiveSessionRow[];
  /** Không có batch Live Analysis nào phủ dải ngày -> UI chỉ dẫn ops import file. */
  hasAnyBatch: boolean;
}

interface DbImportLite {
  id: string;
  period_start: string | null;
  period_end: string | null;
  imported_at: string;
  columns: DataRawColumn[];
}

/**
 * rangeStart/rangeEnd: "YYYY-MM-DD" (bao gồm cả 2 đầu), lọc theo NGÀY VN của giờ bắt đầu phiên.
 * shopHandle: nickname tài khoản shop (vd "crocs.officialstore") để đánh dấu dòng không phải
 * affiliate — batch Live Analysis xuất ở view mặc định chỉ toàn dòng của shop.
 */
export async function fetchAffiliateLiveSessions(
  brandId: string,
  rangeStart: string,
  rangeEnd: string,
  shopHandle?: string
): Promise<AffiliateLiveSessionSlice> {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, period_start, period_end, imported_at, columns")
    .eq("brand_id", brandId)
    .eq("report_type", "live_analysis");
  if (error) throw error;

  const overlapping = ((imports as DbImportLite[]) ?? [])
    .filter((i) => i.period_start && i.period_end && i.period_start <= rangeEnd && i.period_end >= rangeStart)
    // Xếp theo giờ NẠP, cũ trước — `buildAffiliateRows` cho batch sau ghi đè batch trước khi hai
    // batch cùng chứa một phiên, nên thứ tự này là phần quyết định bản số liệu nào thắng. Bản cũ
    // không `.order(...)` gì cả: PostgREST trả theo thứ tự tuỳ Postgres, nên bản ĐÃ SỬA hoàn/huỷ
    // có thể bị bản cũ ghi đè lại, và kết quả còn đổi giữa hai lần mở trang.
    .sort((a, b) => a.imported_at.localeCompare(b.imported_at) || a.id.localeCompare(b.id));
  if (overlapping.length === 0) return { rows: [], hasAnyBatch: false };

  // Phải cuộn trang: PostgREST cắt ở 1.000 dòng và KHÔNG báo lỗi (xem fetchRowsPaged.ts). Dải mặc
  // định của trang Affiliate là 4 THÁNG, tức 4 batch — đúng hình dạng đã làm mất dữ liệu thật
  // ngày 2026-09-23 (4 tháng product_list: 4.601 dòng đọc ra 120 SKU).
  const rowsByImport = await fetchRowsPaged(overlapping.map((i) => i.id));

  const batches: AffiliateBatch[] = overlapping.map((i) => ({ columns: i.columns, rows: rowsByImport.get(i.id) ?? [] }));
  return { rows: buildAffiliateRows(batches, rangeStart, rangeEnd, shopHandle), hasAnyBatch: true };
}
