import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { LiveSession, TikTokLiveImport, TikTokLiveImportRow, LiveSessionReconciliation } from "../../types";
import { fetchSessionById } from "./sessions";

// Đối soát TikTok (migration 0050) — xem thảo luận thiết kế trong phiên làm việc. Nguồn dữ liệu
// v1 là file "Live Analysis" export tay từ TikTok Shop (không có cột Room ID), nên khớp session
// dựa vào ngày + tên host + thời gian bắt đầu gần nhất, KHÔNG dựa vào tiktokRoomId (để dành khi
// có pipeline API tự động sau này, lúc đó TikTok trả room_id thật, match sẽ chính xác tuyệt đối).

// ---- Parse file Excel "Live Analysis" ----

// Cột trong file export thật (xem sample đã xem qua trong phiên trước) — tên cột tiếng Việt do
// TikTok đặt, có thể đổi nhẹ theo version export nên match theo substring thay vì exact string.
const COLUMN_PATTERNS: Record<string, RegExp> = {
  creatorName: /^Nhà sáng tạo$/i,
  startTime: /Thời gian bắt đầu/i,
  duration: /Thời lượng$/i,
  gmvLive: /^GMV LIVE/i,
  ordersPaid: /Đơn hàng đã thanh toán/i,
  itemsSoldLive: /Số món bán ra từ LIVE/i,
  customers: /Số khách hàng độc nhất/i,
  avgPrice: /Giá trung bình/i,
  ctor: /^CTOR$/i,
  viewers: /^Người xem$/i,
  views: /^Lượt xem$/i,
  avgWatchTime: /Thời lượng xem trung bình/i,
  newFollowers: /Người theo dõi mới/i,
  productImpressions: /Lượt hiển thị sản phẩm/i,
  productClicks: /Lượt nhấp Sản phẩm/i,
  ctr: /^CTR$/i
};

function toNum(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return v;
  const cleaned = String(v).replace(/[,₫\s]/g, "").replace("%", "");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? undefined : n;
}

function toPercent(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "string" && v.includes("%")) {
    const n = parseFloat(v.replace("%", "").trim());
    return Number.isNaN(n) ? undefined : n;
  }
  const n = toNum(v);
  if (n === undefined) return undefined;
  // TikTok đôi khi trả tỉ lệ dạng phân số (0.0097) thay vì phần trăm (0.97) tuỳ export —
  // giá trị < 1 gần chắc là phân số, nhân 100 cho đồng nhất với các % khác trong cùng file.
  return n < 1 ? n * 100 : n;
}

// "2026/07/31/ 21:03" -> Date (giờ địa phương trình duyệt, đủ dùng cho việc match theo ngày/giờ)
function parseStartTime(v: unknown): Date | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  const m = s.match(/(\d{4})\/(\d{2})\/(\d{2})\/?\s*(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

// "2h 57min" / "0h 9min" -> số phút
function parseDurationMinutes(v: unknown): number {
  if (!v) return 0;
  const s = String(v);
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*min/);
  return (h ? parseInt(h[1], 10) * 60 : 0) + (m ? parseInt(m[1], 10) : 0);
}

export interface ParsedImportRow {
  tiktokRoomId?: string;
  creatorName?: string;
  startTime: string; // ISO
  endTime?: string; // ISO
  gmv?: number;
  itemsSold?: number;
  orders?: number;
  customers?: number;
  avgPrice?: number;
  ctor?: number;
  ctr?: number;
  viewers?: number;
  views?: number;
  avgWatchTimeSeconds?: number;
  newFollowers?: number;
  productImpressions?: number;
  productClicks?: number;
  raw: Record<string, unknown>;
}

export async function parseLiveAnalysisExcel(file: File): Promise<ParsedImportRow[]> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });

  const headerRowIdx = rows.findIndex((r) => Array.isArray(r) && r.some((c) => typeof c === "string" && /^Nhà sáng tạo$/i.test(c.trim())));
  if (headerRowIdx === -1) {
    throw new Error("Không tìm thấy dòng tiêu đề (Nhà sáng tạo) — file có đúng định dạng export \"Live Analysis\" từ TikTok Shop không?");
  }
  const header = (rows[headerRowIdx] as unknown[]).map((c) => (typeof c === "string" ? c.trim() : ""));
  const colIndex: Record<string, number> = {};
  for (const [key, pattern] of Object.entries(COLUMN_PATTERNS)) {
    const idx = header.findIndex((h) => pattern.test(h));
    if (idx !== -1) colIndex[key] = idx;
  }

  const out: ParsedImportRow[] = [];
  for (let i = headerRowIdx + 1; i < rows.length; i++) {
    const r = rows[i] as unknown[];
    if (!r || r.every((c) => c === null || c === "")) continue;
    const start = parseStartTime(r[colIndex.startTime]);
    if (!start) continue; // dòng rác/không có thời gian bắt đầu — bỏ qua thay vì báo lỗi cả file
    const durationMin = parseDurationMinutes(r[colIndex.duration]);
    const end = durationMin > 0 ? new Date(start.getTime() + durationMin * 60000) : undefined;
    const raw: Record<string, unknown> = {};
    header.forEach((h, idx) => { if (h) raw[h] = r[idx]; });

    out.push({
      creatorName: colIndex.creatorName !== undefined ? String(r[colIndex.creatorName] ?? "").trim() : undefined,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      gmv: toNum(r[colIndex.gmvLive]),
      itemsSold: toNum(r[colIndex.itemsSoldLive]),
      orders: toNum(r[colIndex.ordersPaid]),
      customers: toNum(r[colIndex.customers]),
      avgPrice: toNum(r[colIndex.avgPrice]),
      ctor: toPercent(r[colIndex.ctor]),
      ctr: toPercent(r[colIndex.ctr]),
      viewers: toNum(r[colIndex.viewers]),
      views: toNum(r[colIndex.views]),
      avgWatchTimeSeconds: toNum(r[colIndex.avgWatchTime]),
      newFollowers: toNum(r[colIndex.newFollowers]),
      productImpressions: toNum(r[colIndex.productImpressions]),
      productClicks: toNum(r[colIndex.productClicks]),
      raw
    });
  }
  return out;
}

// ---- CRUD import batch + rows ----

interface DbImport {
  id: string; period_start: string; period_end: string; source: string; status: string; imported_at: string;
}
function importFromDb(row: DbImport): TikTokLiveImport {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: row.source as TikTokLiveImport["source"],
    status: row.status as TikTokLiveImport["status"],
    importedAt: row.imported_at
  };
}

interface DbImportRow {
  id: string; import_id: string; tiktok_room_id: string | null; creator_name: string | null;
  start_time: string; end_time: string | null; gmv: number | null; items_sold: number | null;
  orders: number | null; customers: number | null; avg_price: number | null; ctor: number | null;
  ctr: number | null; viewers: number | null; views: number | null; avg_watch_time_seconds: number | null;
  new_followers: number | null; product_impressions: number | null; product_clicks: number | null;
  matched_session_id: string | null; match_confidence: string | null;
}
function importRowFromDb(row: DbImportRow): TikTokLiveImportRow {
  return {
    id: row.id,
    importId: row.import_id,
    tiktokRoomId: row.tiktok_room_id ?? undefined,
    creatorName: row.creator_name ?? undefined,
    startTime: row.start_time,
    endTime: row.end_time ?? undefined,
    gmv: row.gmv ?? undefined,
    itemsSold: row.items_sold ?? undefined,
    orders: row.orders ?? undefined,
    customers: row.customers ?? undefined,
    avgPrice: row.avg_price ?? undefined,
    ctor: row.ctor ?? undefined,
    ctr: row.ctr ?? undefined,
    viewers: row.viewers ?? undefined,
    views: row.views ?? undefined,
    avgWatchTimeSeconds: row.avg_watch_time_seconds ?? undefined,
    newFollowers: row.new_followers ?? undefined,
    productImpressions: row.product_impressions ?? undefined,
    productClicks: row.product_clicks ?? undefined,
    matchedSessionId: row.matched_session_id ?? undefined,
    matchConfidence: (row.match_confidence as TikTokLiveImportRow["matchConfidence"]) ?? undefined
  };
}

export async function fetchImports(): Promise<TikTokLiveImport[]> {
  const { data, error } = await supabase.from("tiktok_live_imports").select("*").order("imported_at", { ascending: false });
  if (error) throw error;
  return ((data as DbImport[]) ?? []).map(importFromDb);
}

export async function fetchImportRows(importId: string): Promise<TikTokLiveImportRow[]> {
  const { data, error } = await supabase.from("tiktok_live_import_rows").select("*").eq("import_id", importId).order("start_time", { ascending: true });
  if (error) throw error;
  return ((data as DbImportRow[]) ?? []).map(importRowFromDb);
}

export async function createImport(periodStart: string, periodEnd: string, rows: ParsedImportRow[]): Promise<{ batch: TikTokLiveImport; rows: TikTokLiveImportRow[] }> {
  const { data: batchData, error: batchError } = await supabase
    .from("tiktok_live_imports")
    .insert({ period_start: periodStart, period_end: periodEnd, source: "csv_export", status: "staged" })
    .select()
    .single();
  if (batchError) throw batchError;
  const batch = importFromDb(batchData as DbImport);

  const payload = rows.map((r) => ({
    import_id: batch.id,
    tiktok_room_id: r.tiktokRoomId ?? null,
    creator_name: r.creatorName ?? null,
    start_time: r.startTime,
    end_time: r.endTime ?? null,
    gmv: r.gmv ?? null,
    items_sold: r.itemsSold ?? null,
    orders: r.orders ?? null,
    customers: r.customers ?? null,
    avg_price: r.avgPrice ?? null,
    ctor: r.ctor ?? null,
    ctr: r.ctr ?? null,
    viewers: r.viewers ?? null,
    views: r.views ?? null,
    avg_watch_time_seconds: r.avgWatchTimeSeconds ?? null,
    new_followers: r.newFollowers ?? null,
    product_impressions: r.productImpressions ?? null,
    product_clicks: r.productClicks ?? null,
    match_confidence: "unmatched",
    raw: r.raw
  }));
  const { data: rowsData, error: rowsError } = await supabase.from("tiktok_live_import_rows").insert(payload).select();
  if (rowsError) throw rowsError;
  return { batch, rows: ((rowsData as DbImportRow[]) ?? []).map(importRowFromDb) };
}

// Đơn giản hoá tên host tiếng Việt để so khớp gần đúng (bỏ dấu, thường hoá) — file TikTok đặt
// tên "biệt danh"/kênh, không nhất thiết khớp 100% ký tự với host_name trong hệ thống.
function normalizeName(s: string | undefined): string {
  if (!s) return "";
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Match client-side theo NGÀY + tên host gần đúng + giờ bắt đầu gần nhất — file export không có
// Room ID nên đây là best-effort, luôn cần ops xác nhận/đổi lại trên UI trước khi apply.
export function matchImportRows(rows: TikTokLiveImportRow[], sessions: LiveSession[]): TikTokLiveImportRow[] {
  const tiktokSessions = sessions.filter((s) => s.platform === "TikTok");
  return rows.map((row) => {
    if (row.matchedSessionId) return row;
    const rowDate = row.startTime.slice(0, 10);
    const rowStartMs = new Date(row.startTime).getTime();
    const normalizedCreator = normalizeName(row.creatorName);

    const candidates = tiktokSessions.filter((s) => s.date === rowDate);
    if (candidates.length === 0) return { ...row, matchConfidence: "unmatched" };

    const byName = normalizedCreator
      ? candidates.filter((s) => normalizeName(s.hostName).includes(normalizedCreator) || normalizedCreator.includes(normalizeName(s.hostName)))
      : [];
    const pool = byName.length > 0 ? byName : candidates;

    const best = pool.reduce((closest, s) => {
      const sessionStartMs = new Date(`${s.date}T${s.startTime}:00`).getTime();
      const diff = Math.abs(sessionStartMs - rowStartMs);
      const closestDiff = closest ? Math.abs(new Date(`${closest.date}T${closest.startTime}:00`).getTime() - rowStartMs) : Infinity;
      return diff < closestDiff ? s : closest;
    }, undefined as LiveSession | undefined);

    if (!best) return { ...row, matchConfidence: "unmatched" };
    return { ...row, matchedSessionId: best.id, matchConfidence: "time_overlap" };
  });
}

export async function updateRowMatch(rowId: string, sessionId: string | null, confidence: TikTokLiveImportRow["matchConfidence"]): Promise<void> {
  const { error } = await supabase.from("tiktok_live_import_rows").update({ matched_session_id: sessionId, match_confidence: confidence }).eq("id", rowId);
  if (error) throw error;
}

// Ghi đè số liệu 1 session bằng số TikTok đã match — gọi RPC apply_tiktok_reconciliation
// (migration 0050), RPC tự lưu cặp giá trị manual/tiktok vào live_session_reconciliations rồi
// ghi đè live_sessions, trả về row thô nên cần fetchSessionById lại để có LiveSession đầy đủ
// (kèm .report, .skus...) — cùng pattern submitSessionReport ở sessionReports.ts.
export async function applyReconciliation(importRowId: string, sessionId: string): Promise<LiveSession> {
  const { error } = await supabase.rpc("apply_tiktok_reconciliation", { p_import_row_id: importRowId, p_session_id: sessionId });
  if (error) throw error;
  return fetchSessionById(sessionId);
}

interface DbReconciliation {
  id: string; session_id: string; import_row_id: string | null;
  manual_actual_gmv: number | null; tiktok_actual_gmv: number | null; gmv_delta_pct: number | null;
  manual_total_views: number | null; tiktok_total_views: number | null;
  manual_ctr_avg: number | null; tiktok_ctr_avg: number | null;
  flagged: boolean; note: string | null; reconciled_at: string;
}
function reconciliationFromDb(row: DbReconciliation): LiveSessionReconciliation {
  return {
    id: row.id,
    sessionId: row.session_id,
    importRowId: row.import_row_id ?? undefined,
    manualActualGmv: row.manual_actual_gmv ?? undefined,
    tiktokActualGmv: row.tiktok_actual_gmv ?? undefined,
    gmvDeltaPct: row.gmv_delta_pct ?? undefined,
    manualTotalViews: row.manual_total_views ?? undefined,
    tiktokTotalViews: row.tiktok_total_views ?? undefined,
    manualCtrAvg: row.manual_ctr_avg ?? undefined,
    tiktokCtrAvg: row.tiktok_ctr_avg ?? undefined,
    flagged: row.flagged,
    note: row.note ?? undefined,
    reconciledAt: row.reconciled_at
  };
}

export async function fetchFlaggedReconciliations(): Promise<LiveSessionReconciliation[]> {
  const { data, error } = await supabase.from("live_session_reconciliations").select("*").eq("flagged", true).order("reconciled_at", { ascending: false });
  if (error) throw error;
  return ((data as DbReconciliation[]) ?? []).map(reconciliationFromDb);
}
