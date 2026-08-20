import { supabase } from "../supabaseClient";
import { DataRawColumn, LiveSession, TikTokLiveImport, TikTokLiveImportRow, LiveSessionReconciliation, ReconciliationFlagReason } from "../../types";
import { fetchSessionById } from "./sessions";
import { fetchDataRawRows } from "./brandDataRaw";

// Đối soát TikTok (migration 0050 + 0053) — xem thảo luận thiết kế trong phiên làm việc. Nguồn
// dữ liệu là report "Live Analysis" đã lưu trong kho Dataraw của brand (module Dữ Liệu Gốc,
// migration 0052), KHÔNG upload lại file ở đây nữa: cùng một file mà upload 2 nơi thì 2 bản dễ
// lệch nhau. File export không có cột Room ID nên khớp session dựa vào ngày + tên host + thời
// gian bắt đầu gần nhất, KHÔNG dựa vào tiktokRoomId (để dành khi có pipeline API tự động sau
// này, lúc đó TikTok trả room_id thật, match sẽ chính xác tuyệt đối).

// ---- Đọc bảng "Live Analysis" từ Dataraw ----

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

// TikTok Seller Center export giờ theo múi giờ của shop (VN, UTC+7) dưới dạng wall-clock, KHÔNG
// kèm offset. Trước đây parse bằng new Date(y,mo,d,h,mi) = giờ địa phương của trình duyệt ops —
// sai instant nếu máy ops không ở VN, và tệ hơn là ngày dùng để match bị lệch với live_sessions
// (phiên 03:05 VN nếu quy về UTC sẽ rơi sang ngày hôm trước). Nay cố định UTC+7 cả lúc parse lẫn
// lúc đọc lại, nên ngày/giờ hiển thị + ngày dùng để match luôn là wall-clock VN đúng như file gốc.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

// "2026/07/31/ 21:03" (giờ VN) -> Date đúng instant
function parseStartTime(v: unknown): Date | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  const m = s.match(/(\d{4})\/(\d{2})\/(\d{2})\/?\s*(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - VN_OFFSET_MS);
}

// Tách ISO instant về wall-clock VN — dùng cho cả match (ngày phải khớp live_sessions.date, vốn
// là ngày VN) lẫn hiển thị, không phụ thuộc múi giờ máy ops.
export function vnParts(iso: string): { date: string; time: string; label: string } {
  const shifted = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
  const time = `${p(shifted.getUTCHours())}:${p(shifted.getUTCMinutes())}`;
  return { date, time, label: `${p(shifted.getUTCDate())}/${p(shifted.getUTCMonth() + 1)} ${time}` };
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

// Dataraw lưu nguyên trạng: columns = [{key,label}] theo đúng thứ tự cột file gốc, mỗi dòng là
// raw jsonb keyed theo columns[].key. Ở đây map ngược về ParsedImportRow có kiểu để match session:
// dò key của từng cột cần dùng bằng COLUMN_PATTERNS trên label (label = tên cột gốc TikTok).
export function mapDataRawToImportRows(columns: DataRawColumn[], rawRows: Record<string, unknown>[]): ParsedImportRow[] {
  const colKey: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(COLUMN_PATTERNS)) {
    const col = columns.find((c) => pattern.test(c.label.trim()));
    if (col) colKey[key] = col.key;
  }
  if (!colKey.startTime) {
    throw new Error('Batch Dữ Liệu Gốc này không có cột "Thời gian bắt đầu" — chọn đúng report Live Analysis.');
  }
  const get = (raw: Record<string, unknown>, key: string): unknown => (colKey[key] ? raw[colKey[key]] : undefined);

  const out: ParsedImportRow[] = [];
  for (const raw of rawRows) {
    const start = parseStartTime(get(raw, "startTime"));
    if (!start) continue; // dòng rác/không có thời gian bắt đầu — bỏ qua thay vì báo lỗi cả batch
    const durationMin = parseDurationMinutes(get(raw, "duration"));
    const end = durationMin > 0 ? new Date(start.getTime() + durationMin * 60000) : undefined;

    out.push({
      creatorName: colKey.creatorName ? String(get(raw, "creatorName") ?? "").trim() : undefined,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      gmv: toNum(get(raw, "gmvLive")),
      itemsSold: toNum(get(raw, "itemsSoldLive")),
      orders: toNum(get(raw, "ordersPaid")),
      customers: toNum(get(raw, "customers")),
      avgPrice: toNum(get(raw, "avgPrice")),
      ctor: toPercent(get(raw, "ctor")),
      ctr: toPercent(get(raw, "ctr")),
      viewers: toNum(get(raw, "viewers")),
      views: toNum(get(raw, "views")),
      avgWatchTimeSeconds: toNum(get(raw, "avgWatchTime")),
      newFollowers: toNum(get(raw, "newFollowers")),
      productImpressions: toNum(get(raw, "productImpressions")),
      productClicks: toNum(get(raw, "productClicks")),
      raw
    });
  }
  return out;
}

// ---- CRUD import batch + rows ----

interface DbImport {
  id: string; period_start: string; period_end: string; source: string; status: string; imported_at: string;
  brand_id?: string | null; dataraw_import_id?: string | null; brands?: { name: string } | null;
}
function importFromDb(row: DbImport): TikTokLiveImport {
  return {
    id: row.id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    source: row.source as TikTokLiveImport["source"],
    status: row.status as TikTokLiveImport["status"],
    brandId: row.brand_id ?? undefined,
    brandName: row.brands?.name ?? undefined,
    datarawImportId: row.dataraw_import_id ?? undefined,
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
  const { data, error } = await supabase
    .from("tiktok_live_imports")
    .select("*, brands(name)")
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return ((data as DbImport[]) ?? []).map(importFromDb);
}

// Danh sách batch "Live Analysis" trong kho Dataraw của TẤT CẢ brand — nguồn để ops chọn nạp
// vào đối soát. Dataraw gộp 1 batch/tháng/brand (xem brandDataRaw.ts) nên danh sách này đúng
// bằng số tháng đã upload, không phình theo số lần upload trong tháng.
export interface DataRawLiveAnalysisOption {
  id: string;
  brandId: string;
  brandName: string;
  periodStart?: string;
  periodEnd?: string;
  periodLabel?: string;
  rowCount: number;
  columns: DataRawColumn[];
  importedAt: string;
}

export async function fetchDataRawLiveAnalysisBatches(): Promise<DataRawLiveAnalysisOption[]> {
  const { data, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, brand_id, period_start, period_end, period_label, row_count, columns, imported_at, brands(name)")
    .eq("report_type", "live_analysis")
    .order("period_start", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return ((data as any[]) ?? []).map((r) => ({
    id: r.id,
    brandId: r.brand_id,
    brandName: r.brands?.name ?? "—",
    periodStart: r.period_start ?? undefined,
    periodEnd: r.period_end ?? undefined,
    periodLabel: r.period_label ?? undefined,
    rowCount: r.row_count ?? 0,
    columns: r.columns ?? [],
    importedAt: r.imported_at
  }));
}

// "Đủ dữ liệu cả tháng": period bắt đầu ngày 01 và kết thúc đúng ngày cuối tháng đó. TikTok
// export cộng dồn từ đầu tháng nên trong tháng đang chạy period_end sẽ là ngày tải gần nhất —
// lúc đó chỉ đối soát tạm được, chưa dùng để chốt report tháng.
export function isFullMonthPeriod(periodStart?: string, periodEnd?: string): boolean {
  if (!periodStart || !periodEnd) return false;
  if (periodStart.slice(0, 7) !== periodEnd.slice(0, 7)) return false;
  if (!periodStart.endsWith("-01")) return false;
  const [y, m] = periodStart.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return Number(periodEnd.slice(8, 10)) === lastDay;
}

export async function fetchImportRows(importId: string): Promise<TikTokLiveImportRow[]> {
  const { data, error } = await supabase.from("tiktok_live_import_rows").select("*").eq("import_id", importId).order("start_time", { ascending: true });
  if (error) throw error;
  return ((data as DbImportRow[]) ?? []).map(importRowFromDb);
}

// Nạp 1 batch Dataraw "Live Analysis" vào staging đối soát. Nạp lại cùng batch Dataraw (sau khi
// ops upload đè Dataraw giữa tháng) sẽ GHI ĐÈ batch staging cũ — xoá rows staging cũ rồi insert
// lại theo dữ liệu mới, nên các match ops đã sửa tay ở lần nạp trước sẽ mất và cần match lại.
// Các session đã áp dụng đối soát trước đó KHÔNG bị ảnh hưởng (live_sessions + audit
// live_session_reconciliations giữ nguyên, import_row_id chỉ bị set null).
export async function createImportFromDataRaw(option: DataRawLiveAnalysisOption): Promise<{ batch: TikTokLiveImport; rows: TikTokLiveImportRow[] }> {
  const datarawRows = await fetchDataRawRows(option.id);
  const parsed = mapDataRawToImportRows(option.columns, datarawRows.map((r) => r.raw));
  if (parsed.length === 0) {
    throw new Error("Batch Dữ Liệu Gốc này không có dòng phiên live nào đọc được (thiếu thời gian bắt đầu).");
  }

  const dates = parsed.map((r) => r.startTime.slice(0, 10)).sort();
  const periodStart = option.periodStart ?? dates[0];
  const periodEnd = option.periodEnd ?? dates[dates.length - 1];

  const { data: existingData, error: existingError } = await supabase
    .from("tiktok_live_imports")
    .select("id")
    .eq("dataraw_import_id", option.id)
    .maybeSingle();
  if (existingError) throw existingError;

  let batch: TikTokLiveImport;
  if (existingData) {
    const { error: delError } = await supabase.from("tiktok_live_import_rows").delete().eq("import_id", existingData.id);
    if (delError) throw delError;
    const { data: updated, error: updError } = await supabase
      .from("tiktok_live_imports")
      .update({ period_start: periodStart, period_end: periodEnd, status: "staged", imported_at: new Date().toISOString() })
      .eq("id", existingData.id)
      .select("*, brands(name)")
      .single();
    if (updError) throw updError;
    batch = importFromDb(updated as DbImport);
  } else {
    const { data: batchData, error: batchError } = await supabase
      .from("tiktok_live_imports")
      .insert({
        period_start: periodStart,
        period_end: periodEnd,
        source: "dataraw",
        status: "staged",
        brand_id: option.brandId,
        dataraw_import_id: option.id
      })
      .select("*, brands(name)")
      .single();
    if (batchError) throw batchError;
    batch = importFromDb(batchData as DbImport);
  }

  const payload = parsed.map((r) => ({
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

// "14:00" / "14:00:00" -> số phút trong ngày
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

// Ngưỡng cảnh báo lệch — phải khớp với hàm reconciliation_thresholds() ở migration 0054, vì UI
// cảnh báo TRƯỚC khi apply còn RPC gắn cờ SAU khi apply; 2 nơi lệch ngưỡng thì ops thấy mâu thuẫn.
export const RECONCILE_THRESHOLDS = { gmvPct: 10, startMinutes: 30, durationMinutes: 30 };

export interface SessionTimeDelta {
  startDeltaMinutes: number; // tiktok - khai báo (dương = TikTok bắt đầu muộn hơn)
  manualDurationMinutes?: number;
  tiktokDurationMinutes?: number;
  durationDeltaMinutes?: number;
  startFlagged: boolean;
  durationFlagged: boolean;
}

// So giờ live TikTok với giờ ca host khai báo — CHỈ để cảnh báo, không dùng để sửa giờ công.
// Cả 2 vế quy về wall-clock VN (xem chú thích VN_OFFSET_MS).
export function compareSessionTimes(row: TikTokLiveImportRow, session: LiveSession): SessionTimeDelta {
  const rowVn = vnParts(row.startTime);
  // Lệch ngày (TikTok ghi phiên sang ngày hôm sau so với ca đã khai) vẫn phải quy ra phút, không
  // chỉ so giờ-trong-ngày — nếu không, 23:50 hôm trước vs 00:10 hôm sau sẽ ra lệch 1430 phút.
  const dayOffset = Math.round((Date.parse(`${rowVn.date}T00:00:00Z`) - Date.parse(`${session.date}T00:00:00Z`)) / 86400000);
  const startDeltaMinutes = toMinutes(rowVn.time) + dayOffset * 1440 - toMinutes(session.startTime);

  let manualDurationMinutes: number | undefined;
  if (session.startTime && session.endTime) {
    const raw = toMinutes(session.endTime) - toMinutes(session.startTime);
    manualDurationMinutes = raw >= 0 ? raw : raw + 1440; // ca qua nửa đêm
  }
  const tiktokDurationMinutes = row.endTime
    ? Math.round((new Date(row.endTime).getTime() - new Date(row.startTime).getTime()) / 60000)
    : undefined;
  const durationDeltaMinutes =
    manualDurationMinutes !== undefined && tiktokDurationMinutes !== undefined
      ? tiktokDurationMinutes - manualDurationMinutes
      : undefined;

  return {
    startDeltaMinutes,
    manualDurationMinutes,
    tiktokDurationMinutes,
    durationDeltaMinutes,
    startFlagged: Math.abs(startDeltaMinutes) > RECONCILE_THRESHOLDS.startMinutes,
    durationFlagged: durationDeltaMinutes !== undefined && Math.abs(durationDeltaMinutes) > RECONCILE_THRESHOLDS.durationMinutes
  };
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

// Ngưỡng tự khớp: quá khoảng này thì để "Chưa Khớp" cho ops tự chọn, thay vì gán bừa. Trước đây
// hễ trong ngày có 1 session ứng viên là khớp bất kể lệch bao nhiêu giờ (thực tế gặp cặp 11:00 vs
// 20:00 vẫn tự khớp), rất dễ ghi đè nhầm phiên.
const MAX_AUTO_MATCH_MINUTES = 180;

// Match client-side theo NGÀY + tên host gần đúng + giờ bắt đầu gần nhất — file export không có
// Room ID nên đây là best-effort, luôn cần ops xác nhận/đổi lại trên UI trước khi apply.
// brandId: batch nạp từ Dataraw luôn thuộc đúng 1 brand (migration 0053) nên chỉ xét session của
// brand đó — tránh vơ nhầm session brand khác trùng ngày/giờ.
//
// Ghép 1-1 (mỗi session chỉ nhận đúng 1 dòng TikTok): duyệt greedy toàn bộ cặp hợp lệ theo độ
// lệch giờ tăng dần. Nếu để mỗi dòng tự chọn "session gần nhất" độc lập như trước, cả 3 phiên
// TikTok trong cùng ngày sẽ cùng trỏ vào 1 session duy nhất và apply lần lượt sẽ ghi đè chồng
// lên nhau (bản cuối thắng), sinh 3 bản đối soát rác cho cùng 1 session.
export function matchImportRows(rows: TikTokLiveImportRow[], sessions: LiveSession[], brandId?: string): TikTokLiveImportRow[] {
  const tiktokSessions = sessions.filter((s) => s.platform === "TikTok" && (!brandId || s.brandId === brandId));

  // Match ops đã chốt tay (đã lưu DB) được giữ nguyên và giữ chỗ session đó khỏi vòng greedy.
  const takenSessions = new Set(rows.map((r) => r.matchedSessionId).filter(Boolean) as string[]);
  const takenRows = new Set(rows.filter((r) => r.matchedSessionId).map((r) => r.id));

  const pairs: { rowId: string; sessionId: string; diff: number }[] = [];
  for (const row of rows) {
    if (row.matchedSessionId) continue;
    const rowVn = vnParts(row.startTime);
    const rowMinutes = toMinutes(rowVn.time);
    const normalizedCreator = normalizeName(row.creatorName);

    const candidates = tiktokSessions.filter((s) => s.date === rowVn.date);
    const byName = normalizedCreator
      ? candidates.filter((s) => normalizeName(s.hostName).includes(normalizedCreator) || normalizedCreator.includes(normalizeName(s.hostName)))
      : [];
    const pool = byName.length > 0 ? byName : candidates;

    for (const s of pool) {
      const diff = Math.abs(toMinutes(s.startTime) - rowMinutes);
      if (diff <= MAX_AUTO_MATCH_MINUTES) pairs.push({ rowId: row.id, sessionId: s.id, diff });
    }
  }

  pairs.sort((a, b) => a.diff - b.diff);
  const assigned = new Map<string, string>();
  for (const p of pairs) {
    if (takenRows.has(p.rowId) || takenSessions.has(p.sessionId)) continue;
    assigned.set(p.rowId, p.sessionId);
    takenRows.add(p.rowId);
    takenSessions.add(p.sessionId);
  }

  return rows.map((row) => {
    if (row.matchedSessionId) return row;
    const sessionId = assigned.get(row.id);
    if (!sessionId) return { ...row, matchedSessionId: undefined, matchConfidence: "unmatched" };
    return { ...row, matchedSessionId: sessionId, matchConfidence: "time_overlap" };
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
  manual_start_time: string | null; tiktok_start_time: string | null;
  manual_duration_minutes: number | null; tiktok_duration_minutes: number | null;
  start_delta_minutes: number | null; duration_delta_minutes: number | null;
  flag_reasons: ReconciliationFlagReason[] | null;
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
    manualStartTime: row.manual_start_time ?? undefined,
    tiktokStartTime: row.tiktok_start_time ?? undefined,
    manualDurationMinutes: row.manual_duration_minutes ?? undefined,
    tiktokDurationMinutes: row.tiktok_duration_minutes ?? undefined,
    startDeltaMinutes: row.start_delta_minutes ?? undefined,
    durationDeltaMinutes: row.duration_delta_minutes ?? undefined,
    flagReasons: row.flag_reasons ?? [],
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

// Bản đối soát của đúng các session trong batch đang xem — dùng cho bảng cảnh báo sau khi áp dụng.
export async function fetchReconciliationsForSessions(sessionIds: string[]): Promise<LiveSessionReconciliation[]> {
  if (sessionIds.length === 0) return [];
  const { data, error } = await supabase
    .from("live_session_reconciliations")
    .select("*")
    .in("session_id", sessionIds)
    .order("reconciled_at", { ascending: false });
  if (error) throw error;
  return ((data as DbReconciliation[]) ?? []).map(reconciliationFromDb);
}
