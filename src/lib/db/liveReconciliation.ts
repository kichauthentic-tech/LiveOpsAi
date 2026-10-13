import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { snapshotRowsFromParsed } from "../liveSnapshot/extractRooms";
import type { ParsedDataRawImport } from "../dataraw/parseDataRawExcel";
import { platformOf, type ReportPlatform } from "../reportPlatform";

export type ReconciliationBucket = "agency" | "review" | "unassigned" | "inhouse";

export interface ReconciliationBatch {
  id: string;
  /** Brand của tài khoản trong file (0133). Lô nạp trước 0133 không có ⇒ không áp dụng được nữa. */
  brandId?: string;
  /** Sàn của file (0139): file Creator-Live-Performance là TikTok, file Live List của Shopee là Shopee. */
  platform: ReportPlatform;
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
  /** 0166: dòng bị loại khỏi lần áp dụng — ca khớp với nó giữ nguyên số hiện có. */
  excluded: boolean;
}

interface DbBatch {
  id: string;
  brand_id: string | null;
  platform?: ReportPlatform | null;
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
  excluded?: boolean | null;
}

function batchFromDb(b: DbBatch): ReconciliationBatch {
  return {
    id: b.id,
    brandId: b.brand_id ?? undefined,
    platform: platformOf(b),
    fileName: b.file_name ?? undefined,
    periodLabel: b.period_label ?? undefined,
    periodStart: b.period_start ?? undefined,
    periodEnd: b.period_end ?? undefined,
    rowCount: b.row_count,
    appliedAt: b.applied_at ?? undefined,
    createdAt: b.created_at
  };
}

/** Các lô đối soát của MỘT brand trên MỘT sàn — màn Dữ Liệu Gốc của brand đó. */
export async function fetchReconciliationBatches(brandId: string, platform: ReportPlatform, limit = 12): Promise<ReconciliationBatch[]> {
  const { data, error } = await supabase
    .from("live_reconciliation_batches")
    .select("*")
    .eq("brand_id", brandId)
    .eq("platform", platform)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as DbBatch[]).map(batchFromDb);
}

const ROW_COLS = "id, room_id, room_title, started_at, ended_at, gmv, orders, views, duration_minutes, bucket, matched_session_ids";

const rowFromDb = (r: DbRow): ReconciliationRow => ({
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
  matchedSessionIds: r.matched_session_ids ?? [],
  excluded: r.excluded === true
});

export async function fetchReconciliationRows(batchId: string): Promise<ReconciliationRow[]> {
  const query = (cols: string) => supabase.from("live_reconciliation_rows").select(cols).eq("batch_id", batchId).order("started_at", { ascending: true });
  let res = await query(`${ROW_COLS}, excluded`);
  // Chưa chạy migration 0166 ⇒ chưa có cột `excluded`: đọc như cũ (mọi dòng được đối soát).
  if (res.error && res.error.code === "42703") res = await query(ROW_COLS);
  if (res.error) throw res.error;
  return ((res.data ?? []) as unknown as DbRow[]).map(rowFromDb);
}

/** Chọn / bỏ chọn các phiên cho lần Áp dụng (0166). `excluded = true` ⇒ phiên không đối soát. */
export async function setReconciliationRowsExcluded(batchId: string, rowIds: string[], excluded: boolean): Promise<void> {
  if (rowIds.length === 0) return;
  const { data, error } = await supabase
    .from("live_reconciliation_rows")
    .update({ excluded })
    .eq("batch_id", batchId)
    .in("id", rowIds)
    .select("id");
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") throw new Error("Chưa chạy migration 0166 nên chưa chọn được phiên đối soát.");
    throw error;
  }
  assertAffected(data, "chọn phiên đối soát");
}

// Chỉ nạp + tự khớp room với ca, CHƯA ghi gì vào live_sessions — ops xem rổ rồi mới bấm áp dụng.
// Nhận dữ liệu đã đọc (file vừa up ở Dữ Liệu Gốc, hoặc batch đã lưu ở đó): một file chỉ up MỘT lần.
// `brandId` bắt buộc (0133): file Creator-Live-Performance là của MỘT tài khoản; khớp theo giờ với mọi brand thì
// phiên của CROCS rơi vào ca JOCKEY cùng giờ và GMV bị chia sang đó.
export async function importReconciliationFromParsed(
  fileName: string | undefined,
  parsed: ParsedDataRawImport,
  brandId: string,
  platform: ReportPlatform
): Promise<string> {
  // Mỗi sàn một cách đọc dòng (TikTok: Room ID cộng dồn; Shopee: phiên Live List, GMV = doanh số đặt) — cùng đường với snapshot theo ca.
  const rows = snapshotRowsFromParsed(parsed, platform).rows;
  const { data, error } = await supabase.rpc("import_live_reconciliation", {
    p_file_name: fileName ?? null,
    p_period_label: parsed.periodLabel ?? null,
    p_period_start: parsed.periodStart ?? null,
    p_period_end: parsed.periodEnd ?? null,
    p_rows: rows,
    p_brand_id: brandId,
    p_platform: platform
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

/** Gộp các nhóm dòng (mỗi nhóm = ids của một ca bị restart/ngắt) thành một dòng/nhóm (0167). Trả số dòng đã gộp bỏ. */
export async function mergeReconciliationRows(batchId: string, groups: string[][]): Promise<number> {
  const { data, error } = await supabase.rpc("merge_reconciliation_rows", { p_batch_id: batchId, p_groups: groups });
  if (error) {
    if (error.code === "PGRST202") throw new Error("Chưa chạy migration 0167 nên chưa gộp được dòng đối soát.");
    throw error;
  }
  return (data as number) ?? 0;
}

/** Cách một phiên được chia cho một ca (0171): trọn phiên / theo mốc snapshot (ranh giới ca có mốc ±15 phút) / có phần ước lượng theo giờ. */
export type ReconShareMethod = "whole" | "snapshot" | "time";

export interface ReconShare {
  rowId: string;
  sessionId: string;
  method: ReconShareMethod;
  gmv: number;
  orders: number;
  /** Số đang ghi trên ca + nguồn số — để báo ca đã đối soát nhưng lệch bản chia mới (có snapshot mới sau lần Áp dụng). */
  currentGmv: number;
  currentSource?: string;
}

/** Bản chia mà Áp dụng sẽ ghi (cùng hàm private.recon_shares). DB chưa có 0171 ⇒ null (màn hiện như cũ, không số chia). */
export async function fetchReconciliationPreview(batchId: string): Promise<ReconShare[] | null> {
  const { data, error } = await supabase.rpc("preview_live_reconciliation", { p_batch_id: batchId });
  if (error) {
    if (error.code === "PGRST202") return null;
    throw error;
  }
  return ((data ?? []) as Array<{ row_id: string; session_id: string; method: ReconShareMethod; gmv: number; orders: number; current_gmv: number | null; current_source: string | null }>).map((r) => ({
    rowId: r.row_id,
    sessionId: r.session_id,
    method: r.method,
    gmv: Number(r.gmv) || 0,
    orders: Number(r.orders) || 0,
    currentGmv: Number(r.current_gmv) || 0,
    currentSource: r.current_source ?? undefined
  }));
}

export async function applyReconciliation(batchId: string): Promise<number> {
  const { data, error } = await supabase.rpc("apply_live_reconciliation", { p_batch_id: batchId });
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function deleteReconciliationBatch(batchId: string): Promise<void> {
  const { data, error } = await supabase.from("live_reconciliation_batches").delete().eq("id", batchId).select("id");
  if (error) throw error;
  assertAffected(data, "xoá batch đối soát");
}
