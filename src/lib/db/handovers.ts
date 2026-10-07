import { supabase } from "../supabaseClient";
import { LiveSession } from "../../types";
import { fetchSessionById } from "./sessions";
import type { SnapshotRoomRow } from "../liveSnapshot/extractRooms";

// Giao ca + số lúc đổi host: CẢ HAI SÀN bằng file (TikTok Creator-Live-Performance, Shopee Live List — migration 0154). Phần gõ tay
// (0144/0147: submit_session_handover, submit_segment_checkpoint, handover_previous) còn trong DB nhưng client không gọi nữa.

/** Giao ca: file số liệu đã up ở bước 1 (apply_session_live_snapshot) — bước này chỉ ghi sự cố/OT/ghi chú và đánh dấu đã giao.
 *  DB từ chối khi ca chưa có file. */
export async function submitFileHandover(
  sessionId: string,
  v: { otMinutes: number; earlyLeaveMinutes: number; restartCount: number; hostLate: boolean; statusNote: string }
): Promise<LiveSession> {
  const { error } = await supabase.rpc("submit_file_handover", {
    p_session_id: sessionId,
    p_ot_minutes: v.otMinutes,
    p_early_leave_minutes: v.earlyLeaveMinutes,
    p_restart_count: v.restartCount,
    p_host_late: v.hostLate,
    p_status_note: v.statusNote
  });
  if (error) throw error;
  return fetchSessionById(sessionId);
}

/** Số lúc đổi host giữa ca: up file số liệu tải đúng lúc host xuống — không gõ tay. atMin = phút kể từ giờ bắt đầu ca. */
export async function applySegmentCheckpointFile(sessionId: string, atMin: number, fileName: string, rows: SnapshotRoomRow[]): Promise<LiveSession> {
  const { error } = await supabase.rpc("apply_segment_checkpoint_file", {
    p_session_id: sessionId,
    p_at_min: atMin,
    p_file_name: fileName,
    p_rows: rows
  });
  if (error) throw error;
  return fetchSessionById(sessionId);
}
