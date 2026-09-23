import { supabase } from "../supabaseClient";
import { DataRawColumn } from "../../types";
import { vnParts } from "./liveAnalysisRows";

// Nguồn số cho TRANG Affiliate riêng (migration 0102) — đọc batch Dataraw "Live Analysis" xuất ở
// view LINKED ACCOUNTS của Seller Center: mỗi dòng là 1 PHIÊN LIVE của 1 creator affiliate, đúng
// độ chi tiết bảng phân tích của ops (1 phiên = 1 dòng). Khác hẳn:
//   - creator_live_performance: phiên của tài khoản shop, không có creator affiliate.
//
// KHÔNG dùng lại mapDataRawToImportRows() của liveAnalysisRows.ts dù cùng file gốc: mapper đó
// đọc cột "GMV LIVE" (GMV trực tiếp) cho Report Tuần, còn bảng Affiliate cần "GMV đến từ buổi
// LIVE" = trực tiếp + gián tiếp (phiên 9/9: 45.610.277 vs 49.273.277 — lệch thật, không phải
// làm tròn). Nên khai riêng bộ dò cột ở đây thay vì sửa mapper cũ và kéo Report Tuần lệch theo.

// Nhận cả 2 ngôn ngữ — xem lý do ở parseLiveAnalysis (lib/dataraw/parseDataRawExcel.ts).
// Neo ^...$ cho các cột dễ match nhầm: "LIVE-attributed GMV" ≠ "LIVE GMV" ≠ "LIVE indirect GMV".
const COLS: Record<string, RegExp> = {
  creator: /^(?:Nhà sáng tạo|Creator)$/i,
  nickname: /^(?:Biệt danh|Nickname)$/i,
  startTime: /Thời gian bắt đầu|^Launched Time$/i,
  duration: /Thời lượng$|^Duration$/i,
  attributedGmv: /^GMV đến từ buổi LIVE|^LIVE-attributed GMV/i,
  itemsSold: /^Số món bán ra ghi nhận vào buổi LIVE$|^LIVE-attributed items sold$/i,
  ordersPaid: /Đơn hàng đã thanh toán|^Orders Paid$/i,
  avgPrice: /Giá trung bình|^Average Price/i,
  viewers: /^(?:Người xem|Viewers)$/i,
  views: /^(?:Lượt xem|Views)$/i,
  productImpressions: /Lượt hiển thị sản phẩm|^Product Impressions$/i,
  productClicks: /Lượt nhấp Sản phẩm|^Product Clicks$/i,
  ctor: /^CTOR$/i
};

export interface AffiliateLiveSessionRow {
  /** Khoá gộp khi 2 batch có kỳ chồng nhau cùng chứa 1 phiên. */
  key: string;
  creatorName: string;
  nickname: string;
  /** Ngày VN "YYYY-MM-DD". */
  date: string;
  /** "19:00 - 00:00" — suy từ giờ bắt đầu + thời lượng, ops sửa được ở trang Affiliate. */
  timelineLabel: string;
  /** Giờ thật theo file. TikTok gộp phiên nhiều ngày thành một (06→09/08 ra "74h 48min") nên
   *  đây chỉ là GỢI Ý, trang Affiliate vẫn để ops nhập tay đè lên. */
  durationHours: number;
  /** "GMV đến từ buổi LIVE" = trực tiếp + gián tiếp — khớp cột "Direct GMV" của bảng ops. */
  directGmv: number;
  orders: number;
  itemsSold: number;
  avgPrice: number;
  viewer: number;
  views: number;
  liveImpressions: number;
  productClicks: number;
  /** Product clicks ÷ Views. Đây mới là "CTR" trong bảng ops (dải 45-70%); cột CTR trong file là
   *  CTR SẢN PHẨM (clicks ÷ product impressions, dải 3-5%) — hai chỉ số khác nhau. */
  ctrLive: number | null;
  ctor: number;
  /** Phiên của chính tài khoản shop (không phải affiliate) — UI bỏ tick sẵn. */
  isShopAccount: boolean;
  /** Không phát sinh click lẫn đơn cho brand. Thường là buổi live RIÊNG của creator lọt vào báo
   *  cáo chỉ vì còn sót 1 sản phẩm của shop trong giỏ (phiên 7/7/2026 của Kiot Khói: 60h44, 89
   *  lượt hiển thị, 0 click, 0đ — trong khi phiên chạy thật 6/7 có 1.752.176 hiển thị). Viewer
   *  của phiên kiểu này là khán giả của creator chứ không phải của brand nên đưa vào bảng sẽ làm
   *  loãng mọi số trung bình. UI bỏ tick sẵn nhưng VẪN hiện để ops tự quyết — không lọc cứng,
   *  vì phiên chạy thật mà bán 0đ (có click, có hiển thị) vẫn phải vào bảng. */
  noBrandActivity: boolean;
}

export interface AffiliateLiveSessionSlice {
  rows: AffiliateLiveSessionRow[];
  /** Không có batch Live Analysis nào phủ dải ngày -> UI chỉ dẫn ops import file. */
  hasAnyBatch: boolean;
}

interface DbImportLite {
  id: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

function num(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  // File Live Analysis ghi số trần ("143887012") hoặc có "₫"/dấu phân cách tuỳ version export.
  const n = parseFloat(String(v).replace(/[₫\s,%]/g, "").replace(/\.(?=\d{3}\b)/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

// "2h 57min" -> 2.95
function durationToHours(v: unknown): number {
  const s = String(v ?? "");
  const h = s.match(/(\d+)\s*h/);
  const m = s.match(/(\d+)\s*min/);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) / 60 : 0);
}

// "2026/09/20/ 19:06" (giờ VN) -> Date; cùng convention UTC+7 với liveAnalysisRows.parseStartTime.
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
function parseStart(v: unknown): Date | undefined {
  const m = String(v ?? "").trim().match(/(\d{4})\/(\d{2})\/(\d{2})\/?\s*(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi] = m;
  return new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)) - VN_OFFSET_MS);
}

/**
 * rangeStart/rangeEnd: "YYYY-MM-DD" (bao gồm cả 2 đầu), lọc theo NGÀY VN của giờ bắt đầu phiên.
 * shopHandle: nickname tài khoản shop (vd "crocs.officialstore") để đánh dấu dòng không phải
 * affiliate — batch Live Analysis xuất ở view mặc định chỉ toàn dòng của shop.
 */
export async function fetchAffiliateLiveSessions(
  brandId: string,
  rangeStart: string,
  rangeEnd: string,
  shopHandle?: string
): Promise<AffiliateLiveSessionSlice> {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, period_start, period_end, columns")
    .eq("brand_id", brandId)
    .eq("report_type", "live_analysis");
  if (error) throw error;

  const overlapping = ((imports as DbImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= rangeEnd && i.period_end >= rangeStart
  );
  if (overlapping.length === 0) return { rows: [], hasAnyBatch: false };

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

  const handle = shopHandle?.trim().toLowerCase().replace(/^@/, "");
  // Gộp theo key: 2 batch có kỳ chồng nhau (vd bản 15-21/9 và bản cả tháng 9) chứa chung phiên —
  // giữ bản ĐỌC SAU CÙNG vì batch nạp sau thường là số đã cập nhật hoàn/huỷ.
  const byKey = new Map<string, AffiliateLiveSessionRow>();

  for (const imp of overlapping) {
    const c = {
      creator: findCol(imp.columns, COLS.creator),
      nickname: findCol(imp.columns, COLS.nickname),
      startTime: findCol(imp.columns, COLS.startTime),
      duration: findCol(imp.columns, COLS.duration),
      attributedGmv: findCol(imp.columns, COLS.attributedGmv),
      itemsSold: findCol(imp.columns, COLS.itemsSold),
      ordersPaid: findCol(imp.columns, COLS.ordersPaid),
      avgPrice: findCol(imp.columns, COLS.avgPrice),
      viewers: findCol(imp.columns, COLS.viewers),
      views: findCol(imp.columns, COLS.views),
      productImpressions: findCol(imp.columns, COLS.productImpressions),
      productClicks: findCol(imp.columns, COLS.productClicks),
      ctor: findCol(imp.columns, COLS.ctor)
    };
    // Batch import nhầm report type -> bỏ qua batch đó, không làm chết cả trang.
    if (!c.startTime || !c.attributedGmv) continue;

    for (const raw of rowsByImport.get(imp.id) ?? []) {
      const start = parseStart(raw[c.startTime]);
      if (!start) continue;
      const vn = vnParts(start.toISOString());
      if (vn.date < rangeStart || vn.date > rangeEnd) continue;

      const directGmv = num(raw[c.attributedGmv]);
      const durationHours = durationToHours(c.duration && raw[c.duration]);
      const endMs = start.getTime() + durationHours * 3600000;
      const endTime = vnParts(new Date(endMs).toISOString()).time;
      const views = c.views ? num(raw[c.views]) : 0;
      const productClicks = c.productClicks ? num(raw[c.productClicks]) : 0;
      const nickname = c.nickname ? String(raw[c.nickname] ?? "").trim() : "";
      const creatorName = c.creator ? String(raw[c.creator] ?? "").trim() : nickname;

      const key = `${nickname || creatorName}|${vn.date} ${vn.time}`;
      byKey.set(key, {
        key,
        creatorName,
        nickname,
        date: vn.date,
        timelineLabel: `${vn.time} - ${endTime}`,
        durationHours,
        directGmv,
        orders: c.ordersPaid ? num(raw[c.ordersPaid]) : 0,
        itemsSold: c.itemsSold ? num(raw[c.itemsSold]) : 0,
        avgPrice: c.avgPrice ? num(raw[c.avgPrice]) : 0,
        viewer: c.viewers ? num(raw[c.viewers]) : 0,
        views,
        liveImpressions: c.productImpressions ? num(raw[c.productImpressions]) : 0,
        productClicks,
        ctrLive: views > 0 ? (productClicks / views) * 100 : null,
        ctor: c.ctor ? num(raw[c.ctor]) : 0,
        isShopAccount: !!handle && nickname.toLowerCase() === handle,
        noBrandActivity: directGmv <= 0 && productClicks <= 0
      });
    }
  }

  const rows = [...byKey.values()].sort((a, b) => (a.date === b.date ? a.timelineLabel.localeCompare(b.timelineLabel) : a.date.localeCompare(b.date)));
  return { rows, hasAnyBatch: true };
}
