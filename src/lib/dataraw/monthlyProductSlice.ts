import { supabase } from "../supabaseClient";
import { DataRawColumn, DataRawReportType } from "../../types";

// Deep Dive Report Tháng — Top SKU (product_list) + Top khuyến mãi (shop_promotion). Cả 2 report
// này KHÔNG có chiều ngày theo dòng (product_list là tổng cả kỳ/SKU, shop_promotion là tổng cả kỳ
// chạy chương trình) — khác live_analysis/shop_analytics/2 report mới nên không cắt lát theo
// tháng được, chỉ lấy batch có period overlap với tháng đang xem (giống cách Report Tuần/Đối Soát
// đã chấp nhận với 2 report loại "tổng hợp cả kỳ" này — xem comment trong weeklySlice.ts).

// product_list ghi GMV/AOV dạng TEXT có dấu CHẤM phân cách nghìn kèm "₫" (vd "627.840.078₫" =
// 627.840.828 đ, không phải 627,84) — khác live_analysis/shop_analytics/shop_promotion vốn ghi số
// thô không định dạng. Coi mọi ký tự "," và "." đều là phân cách nghìn (an toàn vì GMV/đơn hàng
// VNĐ trong các report này luôn là số nguyên, không có phần thập phân thật).
// Export để affiliateCreatorListSlice.ts dùng lại — cùng dialect "chấm phân cách nghìn + ₫/%".
export function num(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,.₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

// Brief Module 3: rút gọn tên sản phẩm để hiển thị gọn trong bảng/chart Top SKU — bỏ tag ngoặc
// vuông kiểu marketing (vd "[SẢN PHẨM ĐỘC QUYỀN ONLINE]", áp dụng chung mọi brand vì TikTok Shop
// hay chèn tag dạng này) và bỏ prefix danh mục lặp lại đầu tên riêng của Crocs (no-op với brand
// khác, không match thì giữ nguyên tên gốc).
function cleanProductName(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^Giày Clog (Nữ|Unisex)\s+Crocs\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface DbImportLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

// Export để affiliateCreatorListSlice.ts dùng lại — cùng cách chọn batch "overlap nhiều nhất,
// không cộng dồn nhiều batch" cho report loại "tổng cả kỳ, không có chiều ngày theo dòng".
export async function fetchOverlappingBatchRows(brandId: string, reportType: DataRawReportType, monthStart: string, monthEnd: string) {
  const { data: imports, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, report_type, period_start, period_end, columns")
    .eq("brand_id", brandId)
    .eq("report_type", reportType);
  if (error) throw error;

  // Chọn batch overlap NHIỀU NHẤT với tháng (không cộng dồn nhiều batch — mỗi batch đã là tổng cả
  // kỳ upload, cộng lại sẽ nhân đôi số).
  const overlapping = ((imports as DbImportLite[]) ?? []).filter(
    (i) => i.period_start && i.period_end && i.period_start <= monthEnd && i.period_end >= monthStart
  );
  if (overlapping.length === 0) return { rows: [] as Record<string, unknown>[], columns: [] as DataRawColumn[], hasAnyBatch: false };

  const best = overlapping.sort((a, b) => (b.period_end! < a.period_end! ? -1 : 1))[0];
  const { data: rowsData, error: rowsError } = await supabase
    .from("brand_dataraw_rows")
    .select("raw")
    .eq("import_id", best.id)
    .order("row_index", { ascending: true });
  if (rowsError) throw rowsError;

  return { rows: ((rowsData as { raw: Record<string, unknown> }[]) ?? []).map((r) => r.raw ?? {}), columns: best.columns, hasAnyBatch: true };
}

export interface TopSkuRow {
  name: string;
  gmv: number;
  gmvLive: number;
  orders: number;
}

export interface TopSkuMonthSlice {
  items: TopSkuRow[];
  hasAnyBatch: boolean;
}

export async function fetchTopSkuMonthSlice(brandId: string, monthStart: string, monthEnd: string, limit = 10): Promise<TopSkuMonthSlice> {
  const { rows, columns, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "product_list", monthStart, monthEnd);
  if (!hasAnyBatch) return { items: [], hasAnyBatch: false };

  const c = {
    name: findCol(columns, /^Tên$/i),
    gmv: findCol(columns, /^GMV$/i),
    gmvLive: findCol(columns, /^GMV LIVE của người bán$/i),
    orders: findCol(columns, /^Đơn hàng$/i)
  };
  if (!c.name || !c.gmv) return { items: [], hasAnyBatch: true };

  // product_list có nhiều dòng trùng "Tên" (mỗi biến thể/ID sản phẩm tách dòng riêng dù cùng tên
  // hiển thị) — PHẢI gộp theo tên rồi cộng dồn GMV trước khi xếp hạng, nếu không thứ hạng Top SKU
  // sẽ sai (1 sản phẩm bán chạy bị chia lẻ GMV qua nhiều dòng, tụt hạng so với thực tế).
  const byName = new Map<string, TopSkuRow>();
  for (const raw of rows) {
    const name = cleanProductName(String(raw[c.name!] ?? ""));
    if (!name) continue;
    const existing = byName.get(name) ?? { name, gmv: 0, gmvLive: 0, orders: 0 };
    existing.gmv += num(raw[c.gmv!]);
    existing.gmvLive += num(c.gmvLive && raw[c.gmvLive]);
    existing.orders += num(c.orders && raw[c.orders]);
    byName.set(name, existing);
  }

  const items = Array.from(byName.values())
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, limit);

  return { items, hasAnyBatch: true };
}

export interface PromotionRow {
  name: string;
  status: string;
  period: string;
  gmv: number;
  orders: number;
  aov: number;
  itemsSold: number;
}

export interface PromotionMonthSlice {
  items: PromotionRow[];
  hasAnyBatch: boolean;
}

export async function fetchTopPromotionsMonthSlice(brandId: string, monthStart: string, monthEnd: string, limit = 10): Promise<PromotionMonthSlice> {
  const { rows, columns, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "shop_promotion", monthStart, monthEnd);
  if (!hasAnyBatch) return { items: [], hasAnyBatch: false };

  const c = {
    name: findCol(columns, /^Tên khuyến mãi$/i),
    status: findCol(columns, /^Trạng thái$/i),
    period: findCol(columns, /^Thời gian khuyến mãi$/i),
    gmv: findCol(columns, /^GMV/i),
    orders: findCol(columns, /^Đơn hàng$/i),
    aov: findCol(columns, /^Giá trị trung bình đơn/i),
    itemsSold: findCol(columns, /^Số món bán ra$/i)
  };
  if (!c.name || !c.gmv) return { items: [], hasAnyBatch: true };

  const items = rows
    .map((raw) => ({
      name: String(raw[c.name!] ?? "").trim(),
      status: String((c.status && raw[c.status]) ?? "").trim(),
      period: String((c.period && raw[c.period]) ?? "").trim(),
      gmv: num(raw[c.gmv!]),
      orders: num(c.orders && raw[c.orders]),
      aov: num(c.aov && raw[c.aov]),
      itemsSold: num(c.itemsSold && raw[c.itemsSold])
    }))
    // "ongoing" = voucher/khuyến mãi chạy nền quanh năm (freeship, giảm giá cố định) — luôn đứng
    // đầu bảng nếu không lọc vì cộng dồn GMV suốt nhiều tháng, làm sai lệch insight "khuyến mãi nổi
    // bật tháng này". Giá trị status xác nhận đúng tiếng Anh nguyên văn từ file export thật (không
    // phải tiếng Việt) — xem brief kỹ thuật + đối chiếu file thật 2026-08-22.
    .filter((r) => r.name && r.gmv > 0 && r.status.toLowerCase() !== "ongoing")
    .sort((a, b) => b.gmv - a.gmv)
    .slice(0, limit);

  return { items, hasAnyBatch: true };
}
