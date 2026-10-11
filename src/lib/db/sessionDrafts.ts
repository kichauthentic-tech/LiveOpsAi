import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import type { ReportPlatform } from "../reportPlatform";

// Ca nháp của Phòng Điều Hành (migration 0170). Sa bàn "Tự xếp" chỉ tạo NHÁP — OP xác nhận (có thể sửa giờ, người, phòng) thì
// RPC accept_session_draft mới tạo ca chờ đăng ký + chốt người trong MỘT transaction (đường của ca OP mở tay ⇒ chặn trùng người,
// sinh dòng ca tăng cường 0165 nếu kênh đã chốt Kế Hoạch Tháng). Chỉ ceo/operations/admin (RLS).

export type SessionDraftStatus = "draft" | "accepted" | "dismissed";

export interface SessionDraft {
  id: string;
  brandId: string;
  platform: ReportPlatform;
  date: string;
  startTime: string;
  endTime: string;
  hostId: string | null;
  coHostId: string | null;
  studioId: string | null;
  expectedGmv: number;
  reason: string;
  status: SessionDraftStatus;
  sessionId: string | null;
  createdAt: string;
}

export type SessionDraftInput = Pick<SessionDraft, "brandId" | "platform" | "date" | "startTime" | "endTime" | "hostId" | "coHostId" | "studioId" | "expectedGmv" | "reason">;

const MISSING = new Set(["PGRST202", "PGRST205", "42P01", "42883"]);
export const DRAFTS_MISSING_TEXT = "DB chưa chạy migration 0170 (ca nháp Phòng Điều Hành) — chạy SQL trong Supabase rồi thử lại.";

interface Row {
  id: string;
  brand_id: string;
  platform: ReportPlatform;
  date: string;
  start_time: string;
  end_time: string;
  host_id: string | null;
  co_host_id: string | null;
  studio_id: string | null;
  expected_gmv: number | string;
  reason: string;
  status: SessionDraftStatus;
  session_id: string | null;
  created_at: string;
}
const fromDb = (r: Row): SessionDraft => ({
  id: r.id,
  brandId: r.brand_id,
  platform: r.platform,
  date: r.date,
  startTime: r.start_time.slice(0, 5),
  endTime: r.end_time.slice(0, 5),
  hostId: r.host_id,
  coHostId: r.co_host_id,
  studioId: r.studio_id,
  expectedGmv: Number(r.expected_gmv) || 0,
  reason: r.reason ?? "",
  status: r.status,
  sessionId: r.session_id,
  createdAt: r.created_at
});

/** Ca nháp đang chờ (status draft) từ `fromDate` trở đi. `missing` = DB chưa chạy 0170. */
export async function fetchSessionDrafts(fromDate: string): Promise<{ drafts: SessionDraft[]; missing: boolean }> {
  const { data, error } = await supabase
    .from("session_drafts")
    .select("id,brand_id,platform,date,start_time,end_time,host_id,co_host_id,studio_id,expected_gmv,reason,status,session_id,created_at")
    .eq("status", "draft")
    .gte("date", fromDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(500);
  if (error) {
    if (MISSING.has(error.code ?? "")) return { drafts: [], missing: true };
    throw error;
  }
  return { drafts: ((data as Row[]) ?? []).map(fromDb), missing: false };
}

export async function createSessionDrafts(items: SessionDraftInput[]): Promise<SessionDraft[]> {
  if (items.length === 0) return [];
  const { data, error } = await supabase
    .from("session_drafts")
    .insert(
      items.map((d) => ({
        brand_id: d.brandId,
        platform: d.platform,
        date: d.date,
        start_time: d.startTime,
        end_time: d.endTime,
        host_id: d.hostId,
        co_host_id: d.coHostId,
        studio_id: d.studioId,
        expected_gmv: Math.max(0, Math.round(d.expectedGmv)),
        reason: d.reason
      }))
    )
    .select("id,brand_id,platform,date,start_time,end_time,host_id,co_host_id,studio_id,expected_gmv,reason,status,session_id,created_at");
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new Error(DRAFTS_MISSING_TEXT);
    throw error;
  }
  return ((data as Row[]) ?? []).map(fromDb);
}

/** OP xác nhận: tạo ca thật (giờ / người / phòng đã sửa). Trả id ca. */
export async function acceptSessionDraft(d: Pick<SessionDraft, "id" | "date" | "startTime" | "endTime" | "hostId" | "coHostId" | "studioId">): Promise<string> {
  const { data, error } = await supabase.rpc("accept_session_draft", {
    p_draft_id: d.id,
    p_date: d.date,
    p_start: d.startTime,
    p_end: d.endTime,
    p_host_id: d.hostId,
    p_co_host_id: d.coHostId,
    p_studio_id: d.studioId
  });
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new Error(DRAFTS_MISSING_TEXT);
    throw error;
  }
  return String(data);
}

export async function dismissSessionDrafts(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { data, error } = await supabase
    .from("session_drafts")
    .update({ status: "dismissed", decided_at: new Date().toISOString() })
    .in("id", ids)
    .eq("status", "draft")
    .select("id");
  if (error) {
    if (MISSING.has(error.code ?? "")) throw new Error(DRAFTS_MISSING_TEXT);
    throw error;
  }
  assertAffected(data, "bỏ ca nháp");
}
