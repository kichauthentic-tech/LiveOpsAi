import { supabase } from "../supabaseClient";
import { BackfillRoomPayload } from "../backfill/roomsToSessions";

// 3 RPC của migration 0086 — nạp bù ca từ file Creator-Live-Performance. Guard role nằm trong
// thân hàm (ceo/admin/operations), client không cần chặn thêm nhưng UI ẩn với role khác.

export interface BackfillResult {
  inserted: number;
  skipped_existing: number;
  skipped_invalid: number;
}

// Gửi theo lô để 1 tháng 60–70 room không thành 1 payload quá lớn khi ops up nhiều tháng liền.
const BATCH = 200;

export async function createBackfillSessions(brandId: string, rows: BackfillRoomPayload[]): Promise<BackfillResult> {
  const total: BackfillResult = { inserted: 0, skipped_existing: 0, skipped_invalid: 0 };
  for (let i = 0; i < rows.length; i += BATCH) {
    const { data, error } = await supabase.rpc("create_backfill_sessions", {
      p_brand_id: brandId,
      p_rows: rows.slice(i, i + BATCH)
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
