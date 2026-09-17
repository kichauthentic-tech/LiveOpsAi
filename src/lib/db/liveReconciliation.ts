import { supabase } from "../supabaseClient";
import { parseSnapshotFile } from "../liveSnapshot/extractRooms";

export type ReconciliationBucket = "agency" | "review" | "unassigned" | "inhouse";

export interface ReconciliationBatch {
  id: string;
  fileName?: string;
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  rowCount: number;
  appliedAt?: string;
  createdAt: string;
}

export interface ReconciliationRow {
  id: string;
  roomId: string;
  roomTitle?: string;
  startedAt?: string;
  endedAt?: string;
  gmv: number;
  orders: number;
  views: number;
  durationMinutes: number;
  bucket: ReconciliationBucket;
  matchedSessionIds: string[];
}

interface DbBatch {
  id: string;
  file_name: string | null;
  period_label: string | null;
  period_start: string | null;
  period_end: string | null;
  row_count: number;
  applied_at: string | null;
  created_at: string;
}

interface DbRow {
  id: string;
  room_id: string;
  room_title: string | null;
  started_at: string | null;
  ended_at: string | null;
  gmv: number;
  orders: number;
  views: number;
  duration_minutes: number;
  bucket: ReconciliationBucket;
  matched_session_ids: string[] | null;
}

function batchFromDb(b: DbBatch): ReconciliationBatch {
  return {
    id: b.id,
    fileName: b.file_name ?? undefined,
    periodLabel: b.period_label ?? undefined,
    periodStart: b.period_start ?? undefined,
    periodEnd: b.period_end ?? undefined,
    rowCount: b.row_count,
    appliedAt: b.applied_at ?? undefined,
    createdAt: b.created_at
  };
}

export async function fetchReconciliationBatches(limit = 10): Promise<ReconciliationBatch[]> {
  const { data, error } = await supabase
    .from("live_reconciliation_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as DbBatch[]).map(batchFromDb);
}

export async function fetchReconciliationRows(batchId: string): Promise<ReconciliationRow[]> {
  const { data, error } = await supabase
    .from("live_reconciliation_rows")
    .select("id, room_id, room_title, started_at, ended_at, gmv, orders, views, duration_minutes, bucket, matched_session_ids")
    .eq("batch_id", batchId)
    .order("started_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as DbRow[]).map((r) => ({
    id: r.id,
    roomId: r.room_id,
    roomTitle: r.room_title ?? undefined,
    startedAt: r.started_at ?? undefined,
    endedAt: r.ended_at ?? undefined,
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    views: Number(r.views) || 0,
    durationMinutes: Number(r.duration_minutes) || 0,
    bucket: r.bucket,
    matchedSessionIds: r.matched_session_ids ?? []
  }));
}

// Chỉ nạp + tự khớp room với ca, CHƯA ghi gì vào live_sessions — ops xem rổ rồi mới bấm áp dụng.
export async function importReconciliationFile(file: File): Promise<string> {
  const parsed = await parseSnapshotFile(file);
  const { data, error } = await supabase.rpc("import_live_reconciliation", {
    p_file_name: file.name,
    p_period_label: parsed.periodLabel ?? null,
    p_period_start: parsed.periodStart ?? null,
    p_period_end: parsed.periodEnd ?? null,
    p_rows: parsed.rows
  });
  if (error) throw error;
  return data as string;
}

export async function setReconciliationBucket(
  batchId: string,
  from: ReconciliationBucket,
  to: ReconciliationBucket
): Promise<number> {
  const { data, error } = await supabase.rpc("set_reconciliation_bucket", {
    p_batch_id: batchId,
    p_from_bucket: from,
    p_to_bucket: to
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function applyReconciliation(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("apply_live_reconciliation", { p_batch_id: batchId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function deleteReconciliationBatch(batchId: string): Promise<void> {
  const { error } = await supabase.from("live_reconciliation_batches").delete().eq("id", batchId);
  if (error) throw error;
}
