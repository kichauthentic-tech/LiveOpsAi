import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";

// Talent bấm "Đã nhận" lịch ca (migration 0169, app talent T2). Một dòng = một người đã nhận MỘT phiên bản giờ của ca (ngày/giờ
// lúc bấm) — đối chiếu với giờ hiện tại của ca ở lib/talent/acks.ts. Ghi chỉ qua RPC `ack_my_shifts`; RLS: talent đọc dòng của
// mình, ops đọc hết.

export interface ShiftAck {
  sessionId: string;
  talentId: string;
  ackedAt: string;
  /** Ngày/giờ của ca lúc người này bấm "Đã nhận". */
  date: string;
  startTime: string;
  endTime: string;
}

interface DbShiftAck {
  session_id: string;
  talent_id: string;
  acked_at: string;
  acked_date: string;
  acked_start: string;
  acked_end: string;
}

const fromDb = (r: DbShiftAck): ShiftAck => ({
  sessionId: r.session_id,
  talentId: r.talent_id,
  ackedAt: r.acked_at,
  date: r.acked_date,
  startTime: r.acked_start.slice(0, 5),
  endTime: r.acked_end.slice(0, 5)
});

/** Migration 0169 chưa chạy: bảng/hàm chưa tồn tại ⇒ UI ẩn phần "Đã nhận" thay vì báo lỗi. */
export function isShiftAcksBackendMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01";
}

/** Dòng nhận của ca từ `fromDate` (theo ngày lúc nhận). Ca đã dời sang ngày khác thì dòng cũ không khớp giờ mới nữa — không cần đọc. */
export async function fetchShiftAcks(fromDate: string): Promise<ShiftAck[]> {
  const rows = await fetchAllPages<DbShiftAck>((from, to) =>
    supabase
      .from("shift_acks")
      .select("session_id, talent_id, acked_at, acked_date, acked_start, acked_end")
      .gte("acked_date", fromDate)
      .order("session_id", { ascending: true })
      .order("talent_id", { ascending: true })
      .range(from, to)
  );
  return rows.map(fromDb);
}

/** Talent nhận một loạt ca của mình. Ca không phải của mình / đã huỷ DB bỏ qua. Trả về số ca đã ghi. */
export async function ackMyShifts(sessionIds: string[]): Promise<number> {
  const { data, error } = await supabase.rpc("ack_my_shifts", { p_session_ids: sessionIds });
  if (error) throw error;
  return (data as number) ?? 0;
}
