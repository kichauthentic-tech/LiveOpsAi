import { supabase } from "../supabaseClient";
import { DataRawColumn } from "../../types";
import { mapDataRawToImportRows, vnParts } from "./liveAnalysisRows";

// Giai đoạn 4 — Report Tuần lấy dữ liệu bằng cách LỌC từ batch tháng của Dataraw, không thêm
// batch theo tuần (quyết định của user): TikTok export luôn cộng dồn từ đầu tháng nên batch
// tháng đã chứa đủ mọi ngày đã tải, chỉ cần cắt lát theo khoảng ngày của tuần.
//
// Chỉ 2 trong 4 report có chiều NGÀY để cắt lát được:
//   - live_analysis: mỗi dòng là 1 phiên live, có "Thời gian bắt đầu".
//   - shop_analytics: khối "Dữ liệu theo ngày", mỗi dòng là 1 ngày.
// shop_promotion và product_list là số tổng hợp cả kỳ, không có cột ngày theo dòng → không thể
// quy về tuần, nên Report Tuần không dùng 2 loại đó.

// 4 hàm ngày thuần (isoWeekStart/addDays/isoWeekNumber/eachDay) đã chuyển về lib/dateUtils.ts
// (2026-09-24) để module không đụng Supabase dùng lại được — file này import supabaseClient nên
// không chạy được dưới `tsx`. Re-export nguyên tên để mọi nơi đang import từ đây không phải đổi.
import { addDays, eachDay, isoWeekNumber, isoWeekStart } from "../dateUtils";
export { addDays, eachDay, isoWeekNumber, isoWeekStart };

function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

// "dd/mm/yyyy" -> "yyyy-mm-dd". Export để monthlyProductSlice.ts dùng lại cho bảng theo ngày của
// shop_analytics.
export function vnDateToIso(s: unknown): string | undefined {
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
    // live sẽ không có dòng nào — không thể suy "thiếu file" từ "thiếu dòng". Nhưng CHỈ mark phủ
    // SAU KHI xác nhận đọc được cột mốc của batch (date/startTime) — mark trước khi biết batch có
    // đọc được không (bản cũ) làm một batch sai report type/TikTok đổi tên cột bị coveredDays
    // "nuốt" mất dù 0 dòng đọc được, missingDays báo sai là đã có dữ liệu.
    const markCovered = () => {
      for (const d of eachDay(imp.period_start! > weekStart ? imp.period_start! : weekStart, imp.period_end! < weekEnd ? imp.period_end! : weekEnd)) {
        coveredDays.add(d);
      }
    };

    if (imp.report_type === "shop_analytics") {
      // Shop Analytics xuất được cả tiếng Việt lẫn tiếng Anh (xem parseShopAnalytics) — cột lưu
      // trong DB giữ nguyên tên gốc của file nên phải dò cả 2 tên, neo ^...$ vì nhiều tên tiếng
      // Anh là tiền tố của nhau ("Creator LIVE GMV" vs "Creator LIVE-attributed GMV").
      const c = {
        date: findCol(imp.columns, /^(?:Ngày|Date)$/i),
        gmv: findCol(imp.columns, /^GMV$/i),
        orders: findCol(imp.columns, /^(?:Đơn hàng|Orders)$/i),
        customers: findCol(imp.columns, /^(?:Khách hàng|Customers)$/i),
        itemsSold: findCol(imp.columns, /^(?:Số món bán ra|Items sold)$/i),
        visitors: findCol(imp.columns, /^(?:Khách truy cập|Visitors)$/i),
        pageViews: findCol(imp.columns, /^(?:Lượt xem trang|Page views)$/i),
        aov: findCol(imp.columns, /^AOV$/i),
        cvr: findCol(imp.columns, /^(?:Tỷ lệ chuyển đổi|Conversion rate)$/i),
        gmvLiveSeller: findCol(imp.columns, /^(?:GMV LIVE của người bán|Seller LIVE GMV)$/i),
        gmvLiveCreator: findCol(imp.columns, /^(?:GMV LIVE của nhà sáng tạo|Creator LIVE GMV)$/i)
      };
      if (!c.date) continue;
      markCovered();
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
      //
      // try/catch: mapDataRawToImportRows() NÉM lỗi khi batch không dò ra cột thời gian bắt đầu
      // (import nhầm report type, hoặc bản export có tên cột lạ). Trước đây không bọc nên 1 batch
      // hỏng là chết cả trang Report Tuần — giờ bỏ qua đúng batch đó, như creatorLivePerfSlice.ts
      // vẫn làm.
      try {
        const parsedRows = mapDataRawToImportRows(imp.columns, rows); // ném lỗi nếu thiếu cột mốc
        markCovered();
        for (const parsed of parsedRows) {
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
      } catch {
        // Batch thiếu cột "Thời gian bắt đầu" — bỏ qua batch này thay vì làm chết Report Tuần.
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
