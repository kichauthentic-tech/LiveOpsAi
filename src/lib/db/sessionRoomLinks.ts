import { supabase } from "../supabaseClient";
import { LiveSession } from "../../types";
import type { SnapshotRoomRow } from "../liveSnapshot/extractRooms";
import type { BreakReason } from "../liveSnapshot/roomCases";
import { fetchSessionById } from "./sessions";

// Ca NỐI (1 room → nhiều ca) và ca BỊ NGẮT ROOM (1 ca → nhiều room) — migration 0153. Phép trừ/cộng số nằm trong DB (view
// session_room_deltas + recompute_session_from_snapshot); client chỉ đọc trạng thái, gọi RPC rồi nạp lại các ca bị ảnh hưởng.

/** Migration 0153 chưa chạy trên DB: hàm/bảng chưa tồn tại (PostgREST PGRST202/PGRST205, Postgres 42883/42P01). UI ẩn phần "Room của
 *  ca" thay vì báo lỗi trên mọi ca TikTok. */
export function isRoomLinksBackendMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "PGRST205" || code === "42883" || code === "42P01";
}

export interface RoomLinkCandidate {
  sessionId: string;
  date: string;
  startTime: string;
  endTime: string;
  hostName: string;
  coHostName: string;
  studioName: string;
  /** Ca đã là ca sau của MỘT CA KHÁC (không phải ca đang xét) ⇒ không chọn được. */
  takenBy?: string;
  /** Chính là ca sau hiện tại của ca đang xét. */
  isLinked: boolean;
}

/** Một ca ở đầu kia của liên kết nối (ca trước hoặc ca sau). */
export interface LinkedSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  hostName: string;
  /** Ca đó đã có file số liệu (snapshot) chưa. */
  hasSnapshot: boolean;
}

export interface RoomLinks {
  /** Ca sau (room chạy tiếp sang). */
  next?: LinkedSession;
  /** Ca trước (ca này nối từ). */
  prev?: LinkedSession & {
    /** Snapshot của ca trước là bản ƯỚC LƯỢNG chia theo thời gian, không phải file thật. */
    isEstimated: boolean;
    /** Giờ kết thúc ca trước (ISO) và các phòng ca trước đã up — để cảnh báo phòng bị bỏ sót. */
    boundaryAt?: string;
    roomIds: string[];
  };
}

export interface SnapshotPart {
  id: string;
  partNo: number;
  reason: BreakReason;
  note?: string;
  fileName?: string;
  roomIds: string[];
  capturedAt: string;
}

interface DbCandidate {
  session_id: string;
  date: string;
  start_time: string;
  end_time: string;
  host_name: string | null;
  co_host_name: string | null;
  studio_name: string | null;
  taken_by: string | null;
  is_linked: boolean;
}

export async function fetchRoomLinkCandidates(sessionId: string): Promise<RoomLinkCandidate[]> {
  const { data, error } = await supabase.rpc("room_link_candidates", { p_session_id: sessionId });
  if (error) throw error;
  return ((data ?? []) as DbCandidate[]).map((r) => ({
    sessionId: r.session_id,
    date: r.date,
    startTime: r.start_time.slice(0, 5),
    endTime: r.end_time.slice(0, 5),
    hostName: r.host_name ?? "",
    coHostName: r.co_host_name ?? "",
    studioName: r.studio_name ?? "",
    takenBy: r.taken_by && r.taken_by !== sessionId ? r.taken_by : undefined,
    isLinked: r.is_linked
  }));
}

interface DbLinkState {
  prev_session_id: string | null;
  prev_date: string | null;
  prev_start_time: string | null;
  prev_end_time: string | null;
  prev_host_name: string | null;
  prev_has_snapshot: boolean | null;
  prev_is_estimated: boolean | null;
  prev_boundary_at: string | null;
  prev_room_ids: string[] | null;
  next_session_id: string | null;
  next_date: string | null;
  next_start_time: string | null;
  next_end_time: string | null;
  next_host_name: string | null;
  next_has_snapshot: boolean | null;
}

// Đọc qua RPC (không đọc bảng) vì trợ của ca B không đọc được snapshot của ca A — hàm trả đúng những gì cần hiển thị.
export async function fetchRoomLinks(sessionId: string): Promise<RoomLinks> {
  const { data, error } = await supabase.rpc("room_link_state", { p_session_id: sessionId });
  if (error) throw error;
  const row = ((data ?? []) as DbLinkState[])[0];
  const out: RoomLinks = {};
  if (!row) return out;
  if (row.prev_session_id) {
    out.prev = {
      id: row.prev_session_id,
      date: row.prev_date ?? "",
      startTime: (row.prev_start_time ?? "").slice(0, 5),
      endTime: (row.prev_end_time ?? "").slice(0, 5),
      hostName: row.prev_host_name ?? "",
      hasSnapshot: row.prev_has_snapshot === true,
      isEstimated: row.prev_is_estimated === true,
      boundaryAt: row.prev_boundary_at ?? undefined,
      roomIds: row.prev_room_ids ?? []
    };
  }
  if (row.next_session_id) {
    out.next = {
      id: row.next_session_id,
      date: row.next_date ?? "",
      startTime: (row.next_start_time ?? "").slice(0, 5),
      endTime: (row.next_end_time ?? "").slice(0, 5),
      hostName: row.next_host_name ?? "",
      hasSnapshot: row.next_has_snapshot === true
    };
  }
  return out;
}

export async function fetchSnapshotParts(sessionId: string): Promise<SnapshotPart[]> {
  const { data, error } = await supabase
    .from("session_snapshot_parts")
    .select("id, part_no, reason, note, file_name, room_ids, captured_at")
    .eq("session_id", sessionId)
    .order("part_no", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as { id: string; part_no: number; reason: BreakReason; note: string | null; file_name: string | null; room_ids: string[] | null; captured_at: string }[]).map((r) => ({
    id: r.id,
    partNo: r.part_no,
    reason: r.reason,
    note: r.note ?? undefined,
    fileName: r.file_name ?? undefined,
    roomIds: r.room_ids ?? [],
    capturedAt: r.captured_at
  }));
}

// Đổi liên kết kéo theo số của ca sau (và cả chuỗi sau nó) ⇒ trả về MỌI ca bị ảnh hưởng đã nạp lại để App thay vào state.
async function refetch(ids: (string | undefined)[]): Promise<LiveSession[]> {
  return Promise.all([...new Set(ids.filter((x): x is string => !!x))].map((id) => fetchSessionById(id)));
}

export async function linkSessionRoom(prevId: string, nextId: string): Promise<LiveSession[]> {
  const { error } = await supabase.rpc("link_session_room", { p_prev: prevId, p_next: nextId });
  if (error) throw error;
  return refetch([prevId, nextId]);
}

export async function unlinkSessionRoom(prevId: string, nextId: string): Promise<LiveSession[]> {
  const { error } = await supabase.rpc("unlink_session_room", { p_prev: prevId });
  if (error) throw error;
  return refetch([prevId, nextId]);
}

/** Chỉ OPS (DB guard). Ca A nối sang B nhưng không up file lúc giao ca ⇒ chia số cộng dồn của room theo thời gian. */
export async function estimateHandoverSplit(prevId: string, nextId: string): Promise<LiveSession[]> {
  const { error } = await supabase.rpc("estimate_handover_split", { p_prev: prevId });
  if (error) throw error;
  return refetch([prevId, nextId]);
}

/** Thêm mảnh sau cho ca bị ngắt room. rows rỗng = chỉ ghi nhận lý do (room đã nằm sẵn trong file đã up). */
export async function applySessionSnapshotPart(
  sessionId: string,
  reason: BreakReason,
  note: string,
  fileName: string | null,
  periodLabel: string | undefined,
  rows: SnapshotRoomRow[]
): Promise<LiveSession> {
  const { error } = await supabase.rpc("apply_session_snapshot_part", {
    p_session_id: sessionId,
    p_reason: reason,
    p_note: note,
    p_file_name: fileName,
    p_period_label: periodLabel ?? null,
    p_rows: rows
  });
  if (error) throw error;
  return fetchSessionById(sessionId);
}

export async function deleteSessionSnapshotPart(partId: string, sessionId: string): Promise<LiveSession> {
  const { error } = await supabase.rpc("delete_session_snapshot_part", { p_part_id: partId });
  if (error) throw error;
  return fetchSessionById(sessionId);
}
