import { supabase } from "../supabaseClient";
import { LiveSession } from "../../types";
import { HandoverInput, PreviousHandover } from "../handover";
import { fetchSessionById } from "./sessions";

// Giao ca (0144). Một RPC ghi report + số của ca và tính lại cả chuỗi ca nối cùng phòng; trả về mọi ca đã đổi số
// (ca nối phía sau cũng đổi khi ca giữa được giao/sửa) để App thay đúng các ca đó trong state.

interface DbPrevious {
  session_id: string;
  start_time: string;
  end_time: string;
  cum_gmv: number;
  cum_orders: number | null;
  cum_views: number | null;
  cum_atc: number | null;
}

export async function fetchPreviousHandover(sessionId: string, link: string): Promise<PreviousHandover | null> {
  const { data, error } = await supabase.rpc("handover_previous", { p_session_id: sessionId, p_link: link });
  if (error) throw error;
  const r = ((data as DbPrevious[]) ?? [])[0];
  if (!r) return null;
  return {
    sessionId: r.session_id,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    cumGmv: Number(r.cum_gmv),
    cumOrders: r.cum_orders,
    cumViews: r.cum_views,
    cumAtc: r.cum_atc
  };
}

export async function submitHandover(sessionId: string, input: HandoverInput): Promise<LiveSession[]> {
  const { data, error } = await supabase.rpc("submit_session_handover", {
    p_session_id: sessionId,
    p_link: input.link.trim(),
    p_cum_gmv: input.cumGmv,
    p_cum_views: input.cumViews,
    p_cum_orders: input.cumOrders,
    p_cum_atc: input.cumAtc,
    p_coin_spent: input.coinSpent,
    p_ot_minutes: input.otMinutes,
    p_early_leave_minutes: input.earlyLeaveMinutes,
    p_restart_count: input.restartCount,
    p_host_late: input.hostLate,
    p_status_note: input.statusNote
  });
  if (error) throw error;
  const ids = [...new Set(((data as { id: string }[]) ?? []).map((r) => r.id).concat(sessionId))];
  return Promise.all(ids.map((id) => fetchSessionById(id)));
}

/** Giao ca TikTok (0145): file Creator-Live-Performance đã up ở bước 1 (apply_session_live_snapshot) — bước này chỉ ghi
 *  sự cố/OT/ghi chú và đánh dấu đã giao. DB từ chối khi ca chưa có file. */
export async function submitTikTokHandover(
  sessionId: string,
  v: { otMinutes: number; earlyLeaveMinutes: number; restartCount: number; hostLate: boolean; statusNote: string }
): Promise<LiveSession> {
  const { error } = await supabase.rpc("submit_tiktok_handover", {
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
