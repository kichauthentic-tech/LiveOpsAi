import { supabase } from "../supabaseClient";
import { LiveSession } from "../../types";
import { fetchSessionById } from "./sessions";

// Field trực tiếp trên live_sessions mà report được phép cập nhật (khớp "GMV Live"/"View"/
// "CTR LIVE hoặc CTR"/"AVG.view" trong file Excel gốc) — phần còn lại đi vào sidecar
// live_session_reports. Xem migration 0046 cho lý do tách RPC riêng thay vì tái dùng
// update_session_with_children.
export interface SessionReportInput {
  actualGmv: number;
  totalViews: number;
  ctrAvg: number;
  avgWatchTimeSeconds: number;
  restartCount: number;
  crossLive: boolean;
  hostLate: boolean;
  // Giai đoạn 3 (migration 0055) — host khai OT / off sớm, cộng-trừ vào giờ tính lương ở pnl.ts.
  otMinutes: number;
  earlyLeaveMinutes: number;
  statusNote: string;
  gmvTotal?: number;
  dashboardLink1?: string;
  dashboardLink2?: string;
  impressionCount?: number;
  adsCost?: number;
  enterRoomRate?: number;
  ctor?: number;
  avgOrderValue?: number;
  atcCount?: number;
  gpm?: number;
  checkoutCount?: number;
  coinSpent?: number;
}

export async function submitSessionReport(sessionId: string, input: SessionReportInput): Promise<LiveSession> {
  const { error } = await supabase.rpc("submit_live_session_report", {
    p_session_id: sessionId,
    p_actual_gmv: input.actualGmv,
    p_total_views: input.totalViews,
    p_ctr_avg: input.ctrAvg,
    p_avg_watch_time_seconds: input.avgWatchTimeSeconds,
    p_restart_count: input.restartCount,
    p_cross_live: input.crossLive,
    p_host_late: input.hostLate,
    p_ot_minutes: input.otMinutes,
    p_early_leave_minutes: input.earlyLeaveMinutes,
    p_status_note: input.statusNote,
    p_gmv_total: input.gmvTotal ?? null,
    p_dashboard_link_1: input.dashboardLink1 ?? null,
    p_dashboard_link_2: input.dashboardLink2 ?? null,
    p_impression_count: input.impressionCount ?? null,
    p_ads_cost: input.adsCost ?? null,
    p_enter_room_rate: input.enterRoomRate ?? null,
    p_ctor: input.ctor ?? null,
    p_avg_order_value: input.avgOrderValue ?? null,
    p_atc_count: input.atcCount ?? null,
    p_gpm: input.gpm ?? null,
    p_checkout_count: input.checkoutCount ?? null,
    p_coin_spent: input.coinSpent ?? null
  });
  if (error) throw error;
  return fetchSessionById(sessionId);
}
