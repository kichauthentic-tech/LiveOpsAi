import { supabase } from "../supabaseClient";
import { DataRawColumn } from "../../types";
import { eachDay } from "./weeklySlice";

// Report Tháng Tab 02/04 (2026-08-22) — thay thế live_analysis bằng "Creator-Live-Performance"
// (TikTok Creator Center, tiếng Anh, theo Room ID) làm nguồn duy nhất cho GMV/CTR/CTOR/phễu
// chuyển đổi Livestream. Quyết định của user: file này đầy đủ chỉ số deep-dive hơn (Impressions,
// Watch time, Follow/Comment/Share/Like) dù GMV tổng đổi ~15% so với live_analysis (khác hệ thống
// TikTok xuất số) và KHÔNG có cột tên host — Host Performance/Affiliate chuyển sang nhập tay
// (xem monthlyLiveMetrics.ts đã bỏ dùng creatorName-based aggregateByHost cho report tháng).

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

const COLUMN_PATTERNS: Record<string, RegExp> = {
  roomId: /^Room ID$/i,
  roomTitle: /^Room Title$/i,
  startTime: /^Start Time$/i,
  endTime: /^End Time$/i,
  duration: /^Duration$/i,
  gmv: /^Attributed GMV$/i,
  itemsSold: /^Attributed items sold$/i,
  orders: /^Attributed orders$/i,
  skuOrders: /^Attributed SKU orders$/i,
  customers: /^Customers$/i,
  aov: /^AOV$/i,
  views: /^Views$/i,
  impressions: /^Impressions$/i,
  gmvPerHour: /^GMV per hour$/i,
  avgViewDuration: /^Avg\. viewing duration$/i,
  liveCtr: /^LIVE CTR$/i,
  productImpressions: /^Product Impressions$/i,
  productClicks: /^Product clicks$/i,
  ctr: /^CTR$/i,
  ctor: /^CTOR$/i,
  newFollowers: /^New followers$/i,
  comments: /^Comments$/i,
  shares: /^Shares$/i,
  likes: /^Likes$/i
};

function toNum(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  // "65,498,875.96₫" — dấu PHẨY phân cách nghìn (khác product_list dùng dấu CHẤM), giữ nguyên dấu
  // chấm cho phần thập phân thật. "51.326504%" strip ký tự % là ra đúng số phần trăm, KHÔNG chia
  // thêm 100 (đã là dạng điểm % sẵn, giống mọi field %/CTR/CTOR khác trong hệ thống).
  const n = parseFloat(String(v).replace(/[,₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

// "3h01m" -> số giờ thập phân
function parseDurationHours(v: unknown): number {
  const s = String(v ?? "");
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*m/);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
}

// "2026-07-01 10:59:09" giờ VN wall-clock -> instant ISO đúng, cùng convention VN_OFFSET_MS đã
// dùng cho live_analysis (tiktokReconciliation.ts) — đảm bảo ngày dùng để bucket khung camp khớp
// đúng ngày VN thật, không lệch theo múi giờ máy chạy trình duyệt.
function parseVnDateTime(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(se)) - VN_OFFSET_MS).toISOString();
}

export function vnDateOf(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + VN_OFFSET_MS);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${p(shifted.getUTCMonth() + 1)}-${p(shifted.getUTCDate())}`;
}

export interface CreatorLivePerfRow {
  roomId?: string;
  roomTitle?: string;
  startTime: string; // ISO
  endTime?: string;
  hours: number;
  gmv: number;
  itemsSold: number;
  orders: number;
  skuOrders: number;
  customers: number;
  aov: number;
  views: number;
  impressions: number;
  gmvPerHour: number;
  avgViewDurationSec: number;
  liveCtr: number;
  productImpressions: number;
  productClicks: number;
  ctr: number;
  ctor: number;
  newFollowers: number;
  comments: number;
  shares: number;
  likes: number;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

export function mapCreatorLivePerfRows(columns: DataRawColumn[], rawRows: Record<string, unknown>[]): CreatorLivePerfRow[] {
  const colKey: Record<string, string> = {};
  for (const [key, pattern] of Object.entries(COLUMN_PATTERNS)) {
    const col = findCol(columns, pattern);
    if (col) colKey[key] = col;
  }
  if (!colKey.startTime) {
    throw new Error('Batch Dữ Liệu Gốc này không có cột "Start Time" — chọn đúng report Creator-Live-Performance.');
  }

  const out: CreatorLivePerfRow[] = [];
  for (const raw of rawRows) {
    const startTime = parseVnDateTime(raw[colKey.startTime]);
    if (!startTime) continue;
    out.push({
      roomId: colKey.roomId ? String(raw[colKey.roomId] ?? "").trim() : undefined,
      roomTitle: colKey.roomTitle ? String(raw[colKey.roomTitle] ?? "").trim() : undefined,
      startTime,
      endTime: colKey.endTime ? parseVnDateTime(raw[colKey.endTime]) : undefined,
      hours: parseDurationHours(colKey.duration && raw[colKey.duration]),
      gmv: toNum(colKey.gmv && raw[colKey.gmv]),
      itemsSold: toNum(colKey.itemsSold && raw[colKey.itemsSold]),
      orders: toNum(colKey.orders && raw[colKey.orders]),
      skuOrders: toNum(colKey.skuOrders && raw[colKey.skuOrders]),
      customers: toNum(colKey.customers && raw[colKey.customers]),
      aov: toNum(colKey.aov && raw[colKey.aov]),
      views: toNum(colKey.views && raw[colKey.views]),
      impressions: toNum(colKey.impressions && raw[colKey.impressions]),
      gmvPerHour: toNum(colKey.gmvPerHour && raw[colKey.gmvPerHour]),
      avgViewDurationSec: toNum(colKey.avgViewDuration && raw[colKey.avgViewDuration]),
      liveCtr: toNum(colKey.liveCtr && raw[colKey.liveCtr]),
      productImpressions: toNum(colKey.productImpressions && raw[colKey.productImpressions]),
      productClicks: toNum(colKey.productClicks && raw[colKey.productClicks]),
      ctr: toNum(colKey.ctr && raw[colKey.ctr]),
      ctor: toNum(colKey.ctor && raw[colKey.ctor]),
      newFollowers: toNum(colKey.newFollowers && raw[colKey.newFollowers]),
      comments: toNum(colKey.comments && raw[colKey.comments]),
      shares: toNum(colKey.shares && raw[colKey.shares]),
      likes: toNum(colKey.likes && raw[colKey.likes])
    });
  }
  return out;
}

interface DbImportLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

export interface CreatorLivePerfMonthSlice {
  rows: CreatorLivePerfRow[];
  missingDays: string[];
  hasAnyBatch: boolean;
}

export async function fetchCreatorLivePerfMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<CreatorLivePerfMonthSlice> {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, report_type, period_start, period_end, columns")
    .eq("brand_id", brandId)
    .eq("report_type", "creator_live_performance");
  if (error) throw error;

  const overlapping = ((imports as DbImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= monthEnd && i.period_end >= monthStart
  );
  if (overlapping.length === 0) {
    return { rows: [], missingDays: eachDay(monthStart, monthEnd), hasAnyBatch: false };
  }

  const { data: rowsData, error: rowsError } = await supabase
    .from("brand_dataraw_rows")
    .select("import_id, raw")
    .in("import_id", overlapping.map((i) => i.id))
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  const rowsByImport = new Map<string, Record<string, unknown>[]>();
  for (const r of (rowsData as { import_id: string; raw: Record<string, unknown> }[]) ?? []) {
    const list = rowsByImport.get(r.import_id) ?? [];
    list.push(r.raw ?? {});
    rowsByImport.set(r.import_id, list);
  }

  const rows: CreatorLivePerfRow[] = [];
  const coveredDays = new Set<string>();
  for (const imp of overlapping) {
    for (
      const d of eachDay(
        imp.period_start! > monthStart ? imp.period_start! : monthStart,
        imp.period_end! < monthEnd ? imp.period_end! : monthEnd
      )
    ) {
      coveredDays.add(d);
    }

    const raws = rowsByImport.get(imp.id) ?? [];
    try {
      for (const parsed of mapCreatorLivePerfRows(imp.columns, raws)) {
        const date = vnDateOf(parsed.startTime);
        if (date < monthStart || date > monthEnd) continue;
        rows.push(parsed);
      }
    } catch {
      // Batch thiếu cột "Start Time" (sai report type lúc import) — bỏ qua batch này thay vì làm
      // chết toàn bộ Report Tháng.
    }
  }

  rows.sort((a, b) => a.startTime.localeCompare(b.startTime));

  return {
    rows,
    missingDays: eachDay(monthStart, monthEnd).filter((d) => !coveredDays.has(d)),
    hasAnyBatch: true
  };
}
