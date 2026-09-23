import { supabase } from "../supabaseClient";
import { DataRawColumn, DataRawReportType } from "../../types";
import { vnDateToIso } from "./weeklySlice";

// Deep Dive Report Tháng — Top SKU (product_list) + Top khuyến mãi (shop_promotion). Cả 2 report
// này KHÔNG có chiều ngày theo dòng (product_list là tổng cả kỳ/SKU, shop_promotion là tổng cả kỳ
// chạy chương trình) — khác live_analysis/shop_analytics/2 report mới nên không cắt lát theo
// tháng được, chỉ lấy batch có period overlap với tháng đang xem (giống cách Report Tuần/Đối Soát
// đã chấp nhận với 2 report loại "tổng hợp cả kỳ" này — xem comment trong weeklySlice.ts).

// product_list ghi GMV/AOV dạng TEXT có dấu CHẤM phân cách nghìn kèm "₫" (vd "627.840.078₫" =
// 627.840.828 đ, không phải 627,84) — khác live_analysis/shop_analytics/shop_promotion vốn ghi số
// thô không định dạng. Coi mọi ký tự "," và "." đều là phân cách nghìn (an toàn vì GMV/đơn hàng
// VNĐ trong các report này luôn là số nguyên, không có phần thập phân thật).
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

// Chọn batch "overlap nhiều nhất, không cộng dồn nhiều batch" cho report loại "tổng cả kỳ, không
// có chiều ngày theo dòng" (product_list, shop_promotion).
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
    // Song ngữ — neo ^...$ vì "Seller LIVE GMV" ≠ "Seller LIVE-attributed GMV" ≠ "Seller LIVE
    // indirect GMV", và "Orders" ≠ "SKU orders".
    name: findCol(columns, /^(?:Tên|Product Name)$/i),
    gmv: findCol(columns, /^GMV$/i),
    gmvLive: findCol(columns, /^(?:GMV LIVE của người bán|Seller LIVE GMV)$/i),
    orders: findCol(columns, /^(?:Đơn hàng|Orders)$/i)
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
  /** Số chương trình bị loại vì kỳ chạy vắt qua tháng khác — UI phải nói ra, nếu không ops tưởng
   *  tháng đó chỉ có bấy nhiêu chương trình. */
  excludedMultiMonth: number;
}

/** "2026-06-08 09:22 - 2026-07-05 23:58" -> {start,end}. */
function promoPeriodBounds(label: string): { start?: string; end?: string } {
  const m = label.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
  return { start: m?.[1], end: m?.[2] };
}

export async function fetchTopPromotionsMonthSlice(brandId: string, monthStart: string, monthEnd: string, limit = 10): Promise<PromotionMonthSlice> {
  const { rows, columns, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "shop_promotion", monthStart, monthEnd);
  if (!hasAnyBatch) return { items: [], hasAnyBatch: false, excludedMultiMonth: 0 };

  const c = {
    // Song ngữ — 14 cột của 2 bản khớp 1:1 đúng thứ tự.
    name: findCol(columns, /^(?:Tên khuyến mãi|Promotion name)$/i),
    status: findCol(columns, /^(?:Trạng thái|Status)$/i),
    period: findCol(columns, /^(?:Thời gian khuyến mãi|Promotion period)$/i),
    gmv: findCol(columns, /^GMV/i),
    orders: findCol(columns, /^(?:Đơn hàng|Orders)$/i),
    aov: findCol(columns, /^(?:Giá trị trung bình đơn|Avg\. order value)/i),
    itemsSold: findCol(columns, /^(?:Số món bán ra|Items sold)$/i)
  };
  if (!c.name || !c.gmv) return { items: [], hasAnyBatch: true, excludedMultiMonth: 0 };

  const parsed = rows
    .map((raw) => ({
      name: String(raw[c.name!] ?? "").trim(),
      status: String((c.status && raw[c.status]) ?? "").trim(),
      period: String((c.period && raw[c.period]) ?? "").trim(),
      gmv: num(raw[c.gmv!]),
      orders: num(c.orders && raw[c.orders]),
      aov: num(c.aov && raw[c.aov]),
      itemsSold: num(c.itemsSold && raw[c.itemsSold])
    }))
    .filter((r) => r.name && r.gmv > 0);

  // FIX 2026-09-23: cột GMV của file Shop Promotion List là **LUỸ KẾ CẢ CHƯƠNG TRÌNH**, TikTok
  // không cắt theo kỳ export. Bằng chứng: "1-12.2026 - VC 10K MS 50K" hiện đúng 24.746.378.275đ ở
  // cả 4 file T6/T7/T8/T9 của CROCS — lớn hơn cả GMV 4 tháng của shop.
  //
  // Bộ lọc cũ chỉ bỏ status "ongoing" nên vẫn lọt chương trình ĐÃ KẾT THÚC mà chạy vắt 2 tháng:
  // "MD July 6.7 - TBU (1)" đứng đầu bảng cả T7 lẫn T8 với CÙNG một con số 2.148.591.440đ.
  //
  // Mốc đúng là KỲ CHẠY nằm TRỌN trong tháng — khi đó luỹ kế chính là số của tháng. Chương trình
  // vắt qua tháng khác thì không có cách nào tách phần thuộc tháng này từ file, nên loại hẳn khỏi
  // bảng xếp hạng và báo số lượng để ops biết đã bỏ bao nhiêu.
  const insideMonth = parsed.filter((r) => {
    const { start, end } = promoPeriodBounds(r.period);
    return !!start && !!end && start >= monthStart && end <= monthEnd;
  });

  return {
    items: insideMonth.sort((a, b) => b.gmv - a.gmv).slice(0, limit),
    hasAnyBatch: true,
    excludedMultiMonth: parsed.length - insideMonth.length
  };
}

// "Video GMV" + "Product Card GMV" của Report Tháng (dải so sánh kênh + biểu đồ tỷ trọng). Trước
// đây 2 số này đọc từ report riêng "Product Card Traffic Stats" (migration 0064) nhưng loại report
// đó CHƯA TỪNG có file thật nào được upload nên 2 dòng luôn hiện 0. Nay lấy từ 2 file ops vẫn
// upload hằng tháng, khỏi phải export thêm loại report thứ 8:
//   - Video GMV = shop_analytics: "GMV đến từ video liên kết" + "GMV nhờ video của tài khoản kết nối"
//   - Card GMV  = product_list:   tổng cột "GMV thẻ sản phẩm của người bán" trên mọi SKU
// Đã đối chiếu với file "Product Traffic — Shop [total]" của CROCS kỳ 01/06–22/09/2026:
// video 1.431.260.521 vs 1.430.022.521 (lệch 0,09%), thẻ SP 5.293.989.509 vs 5.284.560.473 (0,18%)
// — chênh do 2 file được tải lệch nhau vài tiếng trong ngày 22/9 vốn còn đang chạy.
export interface ChannelGmvMonthSlice {
  videoGmv: number;
  cardGmv: number;
  hasVideoBatch: boolean;
  hasCardBatch: boolean;
}

export async function fetchChannelGmvMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<ChannelGmvMonthSlice> {
  const [video, card] = await Promise.all([
    fetchOverlappingBatchRows(brandId, "shop_analytics", monthStart, monthEnd),
    fetchOverlappingBatchRows(brandId, "product_list", monthStart, monthEnd)
  ]);

  let videoGmv = 0;
  if (video.hasAnyBatch) {
    const dateCol = findCol(video.columns, /^(?:Ngày|Date)$/i);
    const creatorVideo = findCol(video.columns, /^(?:GMV đến từ video liên kết|Creator video-attributed GMV)$/i);
    const linkedVideo = findCol(video.columns, /^(?:GMV nhờ video của tài khoản kết nối|Linked account video-attributed GMV)$/i);
    for (const raw of video.rows) {
      // shop_analytics là bảng theo NGÀY nên phải lọc dòng về đúng tháng đang xem (batch có thể
      // phủ rộng hơn 1 tháng) — khác product_list vốn đã là tổng cả kỳ, cộng thẳng mọi dòng.
      const d = dateCol ? vnDateToIso(raw[dateCol]) : undefined;
      if (!d || d < monthStart || d > monthEnd) continue;
      videoGmv += num(creatorVideo && raw[creatorVideo]) + num(linkedVideo && raw[linkedVideo]);
    }
  }

  let cardGmv = 0;
  if (card.hasAnyBatch) {
    const cardCol = findCol(card.columns, /^(?:GMV thẻ sản phẩm của người bán|Seller product card GMV)$/i);
    if (cardCol) for (const raw of card.rows) cardGmv += num(raw[cardCol]);
  }

  return { videoGmv, cardGmv, hasVideoBatch: video.hasAnyBatch, hasCardBatch: card.hasAnyBatch };
}
