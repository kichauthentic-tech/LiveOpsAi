import { supabase } from "../supabaseClient";
import { DataRawColumn, DataRawReportType } from "../../types";
import { eachDay } from "./weeklySlice";

// Deep Dive Report Tháng — report "Live Performance Core Stats" (migration 0064): bảng phẳng 1
// dòng/ngày, header anchored ở cột "Thời gian"/"Time". Report thứ 2 của migration đó
// ("Product Card Traffic Stats") đã gỡ 2026-09-22 — xem comment ở types.ts. Cùng pattern overlap-batch như
// monthlyLiveSlice.ts/weeklySlice.ts nhưng không cần map qua ParsedImportRow (không có khái niệm
// phiên live ở đây, mỗi dòng đã là 1 ngày sẵn).

function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

interface DbImportLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

async function fetchDailyRows(
  brandId: string,
  reportType: DataRawReportType,
  monthStart: string,
  monthEnd: string
): Promise<{ raws: { date: string; raw: Record<string, unknown> }[]; columns: DataRawColumn[]; missingDays: string[]; hasAnyBatch: boolean }> {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, report_type, period_start, period_end, columns")
    .eq("brand_id", brandId)
    .eq("report_type", reportType);
  if (error) throw error;

  const overlapping = ((imports as DbImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= monthEnd && i.period_end >= monthStart
  );
  if (overlapping.length === 0) {
    return { raws: [], columns: [], missingDays: eachDay(monthStart, monthEnd), hasAnyBatch: false };
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

  const dateCol = findCol(overlapping[0].columns, /^(?:Thời gian|Time)$/i);
  const raws: { date: string; raw: Record<string, unknown> }[] = [];
  const coveredDays = new Set<string>();
  for (const imp of overlapping) {
    const dc = findCol(imp.columns, /^(?:Thời gian|Time)$/i);
    // Không dò được cột ngày (import nhầm report type, hoặc TikTok đổi tên cột — đã xảy ra thật,
    // xem affiliateCreatorListSlice trong WORKSPACE_DESIGN.md) -> KHÔNG coi kỳ batch là "đã phủ".
    // Mark covered trước rồi mới check dc (bản cũ) làm missingDays im lặng báo sai "đã có dữ liệu"
    // cho một batch 0 dòng đọc được — đúng kiểu lỗi mà trường này sinh ra để tránh.
    if (!dc) continue;
    for (
      const d of eachDay(
        imp.period_start! > monthStart ? imp.period_start! : monthStart,
        imp.period_end! < monthEnd ? imp.period_end! : monthEnd
      )
    ) {
      coveredDays.add(d);
    }
    for (const raw of rowsByImport.get(imp.id) ?? []) {
      const date = String(raw[dc] ?? "").slice(0, 10);
      if (!date || date < monthStart || date > monthEnd) continue;
      raws.push({ date, raw });
    }
  }
  raws.sort((a, b) => a.date.localeCompare(b.date));

  return {
    raws,
    columns: dateCol ? overlapping[0].columns : [],
    missingDays: eachDay(monthStart, monthEnd).filter((d) => !coveredDays.has(d)),
    hasAnyBatch: true
  };
}

export interface DailyLivePerformance {
  date: string;
  gmvLiveSession: number;
  gmvLive: number;
  gmvIndirect: number;
  gpm: number;
  sessions: number;
  itemsSoldLive: number;
  ordersSkuLive: number;
  views: number;
  ctrLive: number;
  ctorLive: number;
}

export interface LivePerformanceMonthSlice {
  daily: DailyLivePerformance[];
  missingDays: string[];
  hasAnyBatch: boolean;
}

export async function fetchLivePerformanceCoreMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<LivePerformanceMonthSlice> {
  const { raws, columns, missingDays, hasAnyBatch } = await fetchDailyRows(brandId, "live_performance_core_stats", monthStart, monthEnd);
  if (!hasAnyBatch) return { daily: [], missingDays, hasAnyBatch };

  const c = {
    // Nhận cả bản tiếng Việt lẫn tiếng Anh (xem parseLivePerformanceCoreStats). Tên tiếng Anh
    // chồng tiền tố nhau nhiều nên phải neo chặt: "LIVE GMV" ≠ "LIVE-attributed GMV" ≠
    // "LIVE indirect GMV"; "LIVE items sold" ≠ "LIVE-attributed/indirect items sold";
    // "LIVE SKU orders" ≠ "Attributed/LIVE indirect SKU orders".
    gmvLiveSession: findCol(columns, /^(?:GMV đến từ buổi LIVE|LIVE-attributed GMV)/i),
    gmvLive: findCol(columns, /^(?:GMV LIVE|LIVE GMV) \(/i),
    gmvIndirect: findCol(columns, /^(?:GMV gián tiếp của LIVE|LIVE indirect GMV)/i),
    gpm: findCol(columns, /^(?:Hiển thị GPM|Show GPM)/i),
    sessions: findCol(columns, /^(?:Buổi LIVE|LIVE streams)$/i),
    itemsSoldLive: findCol(columns, /^(?:Số món bán ra từ LIVE|LIVE items sold)$/i),
    ordersSkuLive: findCol(columns, /^(?:Đơn hàng SKU từ LIVE|LIVE SKU orders)$/i),
    views: findCol(columns, /^(?:Lượt xem phiên LIVE|LIVE Views)$/i),
    ctrLive: findCol(columns, /^(?:Tỷ lệ nhấp|Click-through rate) \(LIVE\)$/i),
    ctorLive: findCol(columns, /^CTOR \((?:đơn hàng SKU|SKU order)\) \(LIVE\)$/i)
  };

  const daily: DailyLivePerformance[] = raws.map(({ date, raw }) => ({
    date,
    gmvLiveSession: num(c.gmvLiveSession && raw[c.gmvLiveSession]),
    gmvLive: num(c.gmvLive && raw[c.gmvLive]),
    gmvIndirect: num(c.gmvIndirect && raw[c.gmvIndirect]),
    gpm: num(c.gpm && raw[c.gpm]),
    sessions: num(c.sessions && raw[c.sessions]),
    itemsSoldLive: num(c.itemsSoldLive && raw[c.itemsSoldLive]),
    ordersSkuLive: num(c.ordersSkuLive && raw[c.ordersSkuLive]),
    views: num(c.views && raw[c.views]),
    ctrLive: num(c.ctrLive && raw[c.ctrLive]),
    ctorLive: num(c.ctorLive && raw[c.ctorLive])
  }));

  return { daily, missingDays, hasAnyBatch };
}
