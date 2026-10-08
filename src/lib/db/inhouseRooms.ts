import { supabase } from "../supabaseClient";
import type { BackfillRoomPayload } from "../backfill/roomsToSessions";
import type { ReportPlatform } from "../reportPlatform";

// Room do brand tự live (inhouse), Ops phân loại ở khối Nạp bù ca — migration 0157. Khác rổ 'inhouse' của Đối soát (0080):
// rổ đó gắn với một lô đối soát, bảng này gắn với brand + room nên không phụ thuộc đã nạp lô đối soát hay chưa.

export interface InhouseRoom {
  roomId: string;
  roomTitle?: string;
  startedAt?: string;
  endedAt?: string;
  gmv: number;
  orders: number;
}

interface DbInhouseRoom {
  room_id: string;
  room_title: string | null;
  started_at: string | null;
  ended_at: string | null;
  gmv: number;
  orders: number;
}

export async function fetchInhouseRooms(brandId: string, platform: ReportPlatform): Promise<InhouseRoom[]> {
  const { data, error } = await supabase
    .from("brand_inhouse_rooms")
    .select("room_id, room_title, started_at, ended_at, gmv, orders")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DbInhouseRoom[]).map((r) => ({
    roomId: r.room_id,
    roomTitle: r.room_title ?? undefined,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0
  }));
}

export async function markInhouseRooms(brandId: string, platform: ReportPlatform, rows: BackfillRoomPayload[]): Promise<number> {
  if (rows.length === 0) return 0;
  const { data, error } = await supabase.rpc("mark_inhouse_rooms", { p_brand_id: brandId, p_platform: platform, p_rows: rows });
  if (error) throw error;
  return data as number;
}

export async function unmarkInhouseRooms(brandId: string, roomIds: string[]): Promise<number> {
  if (roomIds.length === 0) return 0;
  const { data, error } = await supabase.rpc("unmark_inhouse_rooms", { p_brand_id: brandId, p_room_ids: roomIds });
  if (error) throw error;
  return data as number;
}
