import { supabase } from "../supabaseClient";
import { LiveSession } from "../../types";
import { parseSnapshotFile } from "../liveSnapshot/extractRooms";
import { fetchSessionById } from "./sessions";

export interface SessionSnapshotRoom {
  roomId: string;
  roomTitle?: string;
  startedAt?: string;
  endedAt?: string;
  durationMinutes: number;
  gmv: number;
  orders: number;
  views: number;
}

export interface SessionSnapshot {
  id: string;
  sessionId: string;
  fileName?: string;
  periodLabel?: string;
  capturedAt: string;
  rowCount: number;
  rooms: SessionSnapshotRoom[];
}

interface DbSnapshot {
  id: string;
  session_id: string;
  file_name: string | null;
  period_label: string | null;
  captured_at: string;
  row_count: number;
}

interface DbSnapshotRow {
  room_id: string;
  room_title: string | null;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number;
  gmv: number;
  orders: number;
  views: number;
}

export async function fetchSessionSnapshot(sessionId: string): Promise<SessionSnapshot | null> {
  const { data, error } = await supabase
    .from("session_live_snapshots")
    .select("*")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const snap = data as DbSnapshot;

  const { data: rowData, error: rowError } = await supabase
    .from("session_live_snapshot_rows")
    .select("room_id, room_title, started_at, ended_at, duration_minutes, gmv, orders, views")
    .eq("snapshot_id", snap.id)
    .order("started_at", { ascending: true });
  if (rowError) throw rowError;

  return {
    id: snap.id,
    sessionId: snap.session_id,
    fileName: snap.file_name ?? undefined,
    periodLabel: snap.period_label ?? undefined,
    capturedAt: snap.captured_at,
    rowCount: snap.row_count,
    rooms: ((rowData ?? []) as DbSnapshotRow[]).map((r) => ({
      roomId: r.room_id,
      roomTitle: r.room_title ?? undefined,
      startedAt: r.started_at ?? undefined,
      endedAt: r.ended_at ?? undefined,
      durationMinutes: Number(r.duration_minutes) || 0,
      gmv: Number(r.gmv) || 0,
      orders: Number(r.orders) || 0,
      views: Number(r.views) || 0
    }))
  };
}

// Toàn bộ "trừ snapshot trước của cùng Room ID" chạy trong RPC (migration 0078) để mọi ca bị ảnh
// hưởng được tính lại trong cùng một transaction — client chỉ parse file và đẩy dòng thô lên.
export async function applySessionLiveSnapshot(sessionId: string, file: File): Promise<LiveSession> {
  const parsed = await parseSnapshotFile(file);
  const { error } = await supabase.rpc("apply_session_live_snapshot", {
    p_session_id: sessionId,
    p_file_name: file.name,
    p_period_label: parsed.periodLabel ?? null,
    p_rows: parsed.rows
  });
  if (error) throw error;
  return fetchSessionById(sessionId);
}

export async function deleteSessionLiveSnapshot(sessionId: string): Promise<LiveSession> {
  const { error } = await supabase.rpc("delete_session_live_snapshot", { p_session_id: sessionId });
  if (error) throw error;
  return fetchSessionById(sessionId);
}
