import { supabase } from "../supabaseClient";
import { BackfillRoomPayload } from "../backfill/roomsToSessions";
import { LEGACY_PLATFORM, type ReportPlatform } from "../reportPlatform";

// 3 RPC của migration 0086 (create_backfill_sessions thêm p_platform ở 0156) — nạp bù ca từ file Creator-Live-Performance (TikTok) / Live List (Shopee). Guard role nằm trong
// thân hàm (ceo/admin/operations), client không cần chặn thêm nhưng UI ẩn với role khác.

export interface BackfillResult {
  inserted: number;
  skipped_existing: number;
  skipped_invalid: number;
}

// Gửi theo lô để 1 tháng 60–70 room không thành 1 payload quá lớn khi ops up nhiều tháng liền.
const BATCH = 200;

export async function createBackfillSessions(brandId: string, rows: BackfillRoomPayload[], platform: ReportPlatform = LEGACY_PLATFORM): Promise<BackfillResult> {
  const total: BackfillResult = { inserted: 0, skipped_existing: 0, skipped_invalid: 0 };
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase.rpc("create_backfill_sessions", {
      p_brand_id: brandId,
      p_rows: rows.slice(i, i + BATCH),
      // Sàn mặc định (TikTok) không gửi p_platform: DB chưa chạy 0156 vẫn nạp bù TikTok được như cũ; Shopee cần 0156 (DB cũ báo lỗi hàm không tồn tại).
      ...(platform === LEGACY_PLATFORM ? {} : { p_platform: platform })
    });
    if (error) throw error;
    const r = data as BackfillResult;
    total.inserted += r.inserted;
    total.skipped_existing += r.skipped_existing;
    total.skipped_invalid += r.skipped_invalid;
  }
  return total;
}

export async function bulkAssignSessionHosts(
  assignments: { session_id: string; host_id: string | null; co_host_id: string | null }[]
): Promise<number> {
  if (assignments.length === 0) return 0;
  const { data, error } = await supabase.rpc("bulk_assign_session_hosts", { p_assignments: assignments });
  if (error) throw error;
  return data as number;
}

// splitAt: ISO timestamp (UTC) nằm giữa actualStartAt và actualEndAt của ca. Trả về id ca phần 2.
export async function splitBackfillSession(sessionId: string, splitAt: string): Promise<string> {
  const { data, error } = await supabase.rpc("split_backfill_session", { p_session_id: sessionId, p_split_at: splitAt });
  if (error) throw error;
  return data as string;
}

// Xoá ca do nạp bù sinh ra (0159) — chỉ ca is_backfill. Rổ đối soát tự trả phiên về "chưa gán nhãn" nên phiên đó sinh ca lại được.
export async function deleteBackfillSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc("delete_backfill_session", { p_session_id: sessionId });
  if (error) throw error;
}
