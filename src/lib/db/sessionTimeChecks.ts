import { supabase } from "../supabaseClient";
import type { SessionTimeCheck } from "../shiftTime";

// Giờ ca đã tính theo luật 0213 (giờ room bật + đủ giờ lịch, ca sau nối tiếp) — bảng `session_time_checks`, chỉ DB ghi.
// DB chưa chạy 0213 (bảng chưa có) ⇒ trả rỗng, màn hình giữ như cũ.

interface Row {
  session_id: string;
  head_session_id: string;
  prev_session_id: string | null;
  is_last: boolean;
  start_at: string;
  end_at: string;
  live_minutes: number;
  target_minutes: number;
  end_pending: boolean;
  file_late_minutes: number | null;
  end_gap_minutes: number | null;
}

const fromRow = (r: Row): SessionTimeCheck => ({
  sessionId: r.session_id,
  headSessionId: r.head_session_id,
  prevSessionId: r.prev_session_id ?? undefined,
  isLast: r.is_last,
  startAt: r.start_at,
  endAt: r.end_at,
  liveMinutes: Number(r.live_minutes),
  targetMinutes: Number(r.target_minutes),
  endPending: r.end_pending,
  fileLateMinutes: r.file_late_minutes ?? undefined,
  endGapMinutes: r.end_gap_minutes ?? undefined
});

const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

export async function fetchSessionTimeCheck(sessionId: string): Promise<SessionTimeCheck | null> {
  const { data, error } = await supabase.from("session_time_checks").select("*").eq("session_id", sessionId).maybeSingle();
  if (error) {
    if (missingTable(error.code)) return null;
    throw error;
  }
  return data ? fromRow(data as Row) : null;
}

/** Giờ ca của các ca bắt đầu từ `sinceIso` trở đi (Cần xử lý ở Bảng Vận Hành). */
export async function fetchSessionTimeChecksSince(sinceIso: string): Promise<SessionTimeCheck[]> {
  const { data, error } = await supabase.from("session_time_checks").select("*").gte("start_at", sinceIso).limit(2000);
  if (error) {
    if (missingTable(error.code)) return [];
    throw error;
  }
  return (data as Row[]).map(fromRow);
}
