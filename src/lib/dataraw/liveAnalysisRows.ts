import { DataRawColumn } from "../../types";

// Parse dòng Dataraw "Live Analysis" / "Creator-Live-Performance" về dạng có kiểu (thuần, không
// gọi DB). Tách ra từ lib/db/tiktokReconciliation.ts ngày 2026-09-18 khi gỡ module đối soát cũ
// (TikTokLiveReconciliation): phần match/apply đã bị thay bởi tầng snapshot (0078) + Đối Soát
// Số Liệu (0080), chỉ còn Report Tuần (dataraw/weeklySlice.ts) cần phần parse này.

// ---- Đọc bảng "Live Analysis" (cũ) hoặc "Creator-Live-Performance" (mới, từ 2026-08-22) từ Dataraw ----

// Live Analysis không có Room ID nên khớp session dựa vào ngày + tên host + thời gian bắt đầu gần
// nhất. Creator-Live-Performance CÓ Room ID nhưng KHÔNG có tên host — creatorName để trống,
// matchImportRows() tự động rơi về khớp theo ngày+giờ (xem comment ở matchImportRows bên dưới),
// không cần sửa gì logic match cả.

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

// FIX L7 (audit 2026-08-21): trước đây MỌI giá trị < 1 (bất kể string hay number) đều bị nhân
// 100 với giả định luôn là dạng phân số — CTR thật "0.8" (đã là điểm %, ví dụ 0.8%) bị đọc nhầm
// thành 80%. Excel chỉ cho ra number dạng phân số (0.008 nghĩa là 0.8%) khi cell được ĐỊNH DẠNG
// Percent (đọc bằng XLSX {raw:true}) — cell dạng text không có ngữ cảnh định dạng đó nên không
// thể là phân số ẩn, phải hiểu đúng nghĩa đen theo giá trị đã ghi.
function toPercent(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "string") {
    const trimmed = v.trim();
    if (trimmed.includes("%")) {
      const n = parseFloat(trimmed.replace("%", ""));
      return Number.isNaN(n) ? undefined : n;
    }
    return toNum(trimmed);
  }
  if (typeof v !== "number") return undefined;
  return v < 1 ? v * 100 : v;
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

// Creator-Live-Performance (TikTok Creator Center, tiếng Anh, theo Room ID) — cột khác hẳn Live
// Analysis: có Room ID, KHÔNG có tên host, "Start Time"/"End Time" đủ cả 2 mốc (không cần suy ra
// từ duration như Live Analysis).
const COLUMN_PATTERNS_CLP: Record<string, RegExp> = {
  tiktokRoomId: /^Room ID$/i,
  startTime: /^Start Time$/i,
  endTime: /^End Time$/i,
  gmv: /^Attributed GMV$/i,
  itemsSold: /^Attributed items sold$/i,
  orders: /^Attributed orders$/i,
  customers: /^Customers$/i,
  avgPrice: /^AOV$/i,
  views: /^Views$/i,
  avgWatchTime: /^Avg\. viewing duration$/i,
  newFollowers: /^New followers$/i,
  productImpressions: /^Product Impressions$/i,
  productClicks: /^Product clicks$/i,
  ctr: /^CTR$/i,
  ctor: /^CTOR$/i
};

// "2026-07-01 10:59:09" (giờ VN, khác định dạng "yyyy/mm/dd/ hh:mm" của Live Analysis) -> Date
// đúng instant, cùng convention VN_OFFSET_MS.
function parseStartTimeClp(v: unknown): Date | undefined {
  if (!v) return undefined;
  const s = String(v).trim();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se)) - VN_OFFSET_MS);
}

function mapCreatorLivePerformanceToImportRows(columns: DataRawColumn[], rawRows: Record<string, unknown>[]): ParsedImportRow[] {
  const colKey: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(COLUMN_PATTERNS_CLP)) {
    const col = columns.find((c) => pattern.test(c.label.trim()));
    if (col) colKey[key] = col.key;
  }
  if (!colKey.startTime) {
    throw new Error('Batch Dữ Liệu Gốc này không có cột "Start Time" — chọn đúng report Creator-Live-Performance.');
  }
  const get = (raw: Record<string, unknown>, key: string): unknown => (colKey[key] ? raw[colKey[key]] : undefined);

  const out: ParsedImportRow[] = [];
  for (const raw of rawRows) {
    const start = parseStartTimeClp(get(raw, "startTime"));
    if (!start) continue;
    const end = parseStartTimeClp(get(raw, "endTime"));

    out.push({
      tiktokRoomId: colKey.tiktokRoomId ? String(get(raw, "tiktokRoomId") ?? "").trim() : undefined,
      // File này không có cột tên host — để trống, matchImportRows() tự rơi về khớp theo
      // ngày+giờ (đã hỗ trợ sẵn, không cần sửa logic match).
      creatorName: undefined,
      startTime: start.toISOString(),
      endTime: end?.toISOString(),
      gmv: toNum(get(raw, "gmv")),
      itemsSold: toNum(get(raw, "itemsSold")),
      orders: toNum(get(raw, "orders")),
      customers: toNum(get(raw, "customers")),
      avgPrice: toNum(get(raw, "avgPrice")),
      ctor: toPercent(get(raw, "ctor")),
      ctr: toPercent(get(raw, "ctr")),
      // Không có field "viewer duy nhất" riêng như Live Analysis (Người xem) — chỉ có "Views",
      // để viewers trống thay vì gán bừa = views (2 khái niệm khác nhau).
      viewers: undefined,
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
// reportType mặc định "live_analysis" (nguồn cũ) — truyền "creator_live_performance" khi batch
// đang nạp là nguồn mới (từ 2026-08-22, xem COLUMN_PATTERNS_CLP).
export function mapDataRawToImportRows(
  columns: DataRawColumn[],
  rawRows: Record<string, unknown>[],
  reportType: "live_analysis" | "creator_live_performance" = "live_analysis"
): ParsedImportRow[] {
  if (reportType === "creator_live_performance") {
    return mapCreatorLivePerformanceToImportRows(columns, rawRows);
  }
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

