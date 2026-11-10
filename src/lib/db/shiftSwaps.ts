import { supabase } from "../supabaseClient";
import type { ShiftSwapRequest, SwapKind, SwapPart, SwapStatus } from "../shiftSwap/swap";

// Yêu cầu nhường/đổi ca giữa talent (migration 0212). Bảng chỉ mở SELECT (người trong cuộc + người xếp lịch);
// mọi thao tác ghi đi qua RPC — DB kiểm lại luật ở từng bước, client chỉ lọc trước để giao diện gọn.

interface DbSwap {
  id: string;
  kind: SwapKind;
  status: SwapStatus;
  from_talent: string;
  to_talent: string;
  from_name: string;
  to_name: string;
  session_id: string;
  from_min: number;
  to_min: number;
  swap_session_id: string | null;
  swap_from_min: number | null;
  swap_to_min: number | null;
  reason: string;
  peer_answered_at: string | null;
  decided_at: string | null;
  decision_note: string;
  created_at: string;
}

const COLUMNS =
  "id, kind, status, from_talent, to_talent, from_name, to_name, session_id, from_min, to_min, swap_session_id, swap_from_min, swap_to_min, reason, peer_answered_at, decided_at, decision_note, created_at";

function fromDb(r: DbSwap): ShiftSwapRequest {
  return {
    id: r.id,
    kind: r.kind,
    status: r.status,
    fromTalent: r.from_talent,
    toTalent: r.to_talent,
    fromName: r.from_name,
    toName: r.to_name,
    give: { sessionId: r.session_id, fromMin: r.from_min, toMin: r.to_min },
    take: r.swap_session_id ? { sessionId: r.swap_session_id, fromMin: r.swap_from_min ?? 0, toMin: r.swap_to_min ?? 0 } : undefined,
    reason: r.reason,
    peerAnsweredAt: r.peer_answered_at ?? undefined,
    decidedAt: r.decided_at ?? undefined,
    decisionNote: r.decision_note,
    createdAt: r.created_at
  };
}

/** Yêu cầu của tôi (RLS đã lọc: talent thấy yêu cầu có tên mình; ceo/admin/ops/trainer thấy tất cả). 120 dòng gần nhất là đủ. */
export async function fetchShiftSwaps(limit = 120): Promise<ShiftSwapRequest[]> {
  const { data, error } = await supabase.from("shift_swap_requests").select(COLUMNS).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as DbSwap[]).map(fromDb);
}

export interface CreateSwapInput {
  kind: SwapKind;
  give: SwapPart;
  toTalent: string;
  take?: SwapPart;
  reason: string;
}

export async function createShiftSwap(input: CreateSwapInput): Promise<string> {
  const { data, error } = await supabase.rpc("shift_swap_create", {
    p_kind: input.kind,
    p_session_id: input.give.sessionId,
    p_from_min: input.give.fromMin,
    p_to_min: input.give.toMin,
    p_to_talent: input.toTalent,
    p_swap_session_id: input.take?.sessionId ?? null,
    p_swap_from_min: input.take?.fromMin ?? null,
    p_swap_to_min: input.take?.toMin ?? null,
    p_reason: input.reason
  });
  if (error) throw error;
  return data as string;
}

export async function respondShiftSwap(id: string, accept: boolean): Promise<void> {
  const { error } = await supabase.rpc("shift_swap_respond", { p_id: id, p_accept: accept });
  if (error) throw error;
}

export async function cancelShiftSwap(id: string): Promise<void> {
  const { error } = await supabase.rpc("shift_swap_cancel", { p_id: id });
  if (error) throw error;
}

export async function decideShiftSwap(id: string, approve: boolean, note: string): Promise<void> {
  const { error } = await supabase.rpc("shift_swap_decide", { p_id: id, p_approve: approve, p_note: note });
  if (error) throw error;
}
