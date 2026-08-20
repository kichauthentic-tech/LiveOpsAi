import { supabase } from "../supabaseClient";
import { DataRawColumn } from "../../types";
import { mapDataRawToImportRows, vnParts } from "../db/tiktokReconciliation";

// Giai đoạn 4 — Report Tuần lấy dữ liệu bằng cách LỌC từ batch tháng của Dataraw, không thêm
// batch theo tuần (quyết định của user): TikTok export luôn cộng dồn từ đầu tháng nên batch
// tháng đã chứa đủ mọi ngày đã tải, chỉ cần cắt lát theo khoảng ngày của tuần.
//
// Chỉ 2 trong 4 report có chiều NGÀY để cắt lát được:
//   - live_analysis: mỗi dòng là 1 phiên live, có "Thời gian bắt đầu".
//   - shop_analytics: khối "Dữ liệu theo ngày", mỗi dòng là 1 ngày.
// shop_promotion và product_list là số tổng hợp cả kỳ, không có cột ngày theo dòng → không thể
// quy về tuần, nên Report Tuần không dùng 2 loại đó.

// Thứ Hai của tuần chứa `date` (ISO week, tuần bắt đầu thứ Hai).
export function isoWeekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = CN
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Số tuần ISO — dùng cho nhãn "Tuần 34/2026". Thuật toán chuẩn ISO-8601: tuần chứa thứ Năm
// quyết định năm của tuần đó.
export function isoWeekNumber(date: string): { week: number; year: number } {
  const d = new Date(`${date}T00:00:00Z`);
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year };
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

// "dd/mm/yyyy" -> "yyyy-mm-dd"
function vnDateToIso(s: unknown): string | undefined {
  const m = String(s ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

export interface DailyShopRow {
  date: string;
  gmv: number;
  orders: number;
  customers: number;
  itemsSold: number;
  visitors: number;
  pageViews: number;
  aov: number;
  conversionRate: number; // %
  gmvFromLive: number;
}

export interface WeeklyLiveRow {
  date: string;
  time: string;
  creatorName?: string;
  durationMinutes?: number;
  gmv: number;
  views: number;
  ctr: number;
}

export interface DataRawWeekSlice {
  daily: DailyShopRow[];
  live: WeeklyLiveRow[];
  // Ngày trong tuần KHÔNG được batch Dataraw nào phủ (chưa tải file tới ngày đó) — khác với
  // "ngày có dữ liệu nhưng bằng 0". Phân biệt 2 cái này quan trọng: thiếu file mà đọc thành 0
  // sẽ ra report tuần sai lệch mà không ai biết.
  missingDays: string[];
  hasAnyBatch: boolean;
}

interface DbImportLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

export async function fetchDataRawWeekSlice(brandId: string, weekStart: string, weekEnd: string): Promise<DataRawWeekSlice> {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, report_type, period_start, period_end, columns")
    .eq("brand_id", brandId)
    .in("report_type", ["live_analysis", "shop_analytics"]);
  if (error) throw error;

  // Tuần có thể vắt qua 2 tháng → phải lấy MỌI batch có kỳ giao với tuần, không chỉ batch của
  // tháng chứa thứ Hai.
  const overlapping = ((imports as DbImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= weekEnd && i.period_end >= weekStart
  );
  if (overlapping.length === 0) {
    return { daily: [], live: [], missingDays: eachDay(weekStart, weekEnd), hasAnyBatch: false };
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

  const daily: DailyShopRow[] = [];
  const live: WeeklyLiveRow[] = [];
  const coveredDays = new Set<string>();

  for (const imp of overlapping) {
    const rows = rowsByImport.get(imp.id) ?? [];
    // Ngày được phủ = giao của kỳ batch với tuần, tính theo METADATA kỳ chứ không theo dòng có
    // mặt: shop_analytics luôn có đủ dòng mọi ngày trong kỳ, còn live_analysis thì ngày không
    // live sẽ không có dòng nào — không thể suy "thiếu file" từ "thiếu dòng".
    for (const d of eachDay(imp.period_start! > weekStart ? imp.period_start! : weekStart, imp.period_end! < weekEnd ? imp.period_end! : weekEnd)) {
      coveredDays.add(d);
    }

    if (imp.report_type === "shop_analytics") {
      const c = {
        date: findCol(imp.columns, /^Ngày$/i),
        gmv: findCol(imp.columns, /^GMV$/i),
        orders: findCol(imp.columns, /^Đơn hàng$/i),
        customers: findCol(imp.columns, /^Khách hàng$/i),
        itemsSold: findCol(imp.columns, /^Số món bán ra$/i),
        visitors: findCol(imp.columns, /^Khách truy cập$/i),
        pageViews: findCol(imp.columns, /^Lượt xem trang$/i),
        aov: findCol(imp.columns, /^AOV$/i),
        cvr: findCol(imp.columns, /^Tỷ lệ chuyển đổi$/i),
        gmvLiveSeller: findCol(imp.columns, /^GMV LIVE của người bán$/i),
        gmvLiveCreator: findCol(imp.columns, /^GMV LIVE của nhà sáng tạo$/i)
      };
      if (!c.date) continue;
      for (const raw of rows) {
        const date = vnDateToIso(raw[c.date]);
        if (!date || date < weekStart || date > weekEnd) continue;
        daily.push({
          date,
          gmv: num(c.gmv && raw[c.gmv]),
          orders: num(c.orders && raw[c.orders]),
          customers: num(c.customers && raw[c.customers]),
          itemsSold: num(c.itemsSold && raw[c.itemsSold]),
          visitors: num(c.visitors && raw[c.visitors]),
          pageViews: num(c.pageViews && raw[c.pageViews]),
          aov: num(c.aov && raw[c.aov]),
          // TikTok trả tỉ lệ chuyển đổi dạng phân số (0.0175) trong report này, khác các cột %
          // khác — nhân 100 để đồng nhất đơn vị hiển thị.
          conversionRate: num(c.cvr && raw[c.cvr]) * 100,
          gmvFromLive: num(c.gmvLiveSeller && raw[c.gmvLiveSeller]) + num(c.gmvLiveCreator && raw[c.gmvLiveCreator])
        });
      }
    } else {
      // Dùng lại mapper của module Đối Soát để không lặp logic dò cột "Thời gian bắt đầu"/
      // "GMV LIVE"/"Lượt xem"/"CTR" của file Live Analysis.
      for (const parsed of mapDataRawToImportRows(imp.columns, rows)) {
        const vn = vnParts(parsed.startTime);
        if (vn.date < weekStart || vn.date > weekEnd) continue;
        live.push({
          date: vn.date,
          time: vn.time,
          creatorName: parsed.creatorName,
          durationMinutes: parsed.endTime
            ? Math.round((new Date(parsed.endTime).getTime() - new Date(parsed.startTime).getTime()) / 60000)
            : undefined,
          gmv: parsed.gmv ?? 0,
          views: parsed.views ?? 0,
          ctr: parsed.ctr ?? 0
        });
      }
    }
  }

  daily.sort((a, b) => a.date.localeCompare(b.date));
  live.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  return {
    daily,
    live,
    missingDays: eachDay(weekStart, weekEnd).filter((d) => !coveredDays.has(d)),
    hasAnyBatch: true
  };
}
