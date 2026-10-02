import { supabase } from "../supabaseClient";
import { DataRawColumn, DataRawReportType } from "../../types";
import { dedupeInFlight } from "../db/dedupeInFlight";
import { fetchRowsPaged } from "./fetchRowsPaged";
import { readShopDays } from "./shopAnalyticsDays";
import { buildProductListAgg, cleanProductName, findCol, isCurrentProductAgg, num, PRODUCT_AGG_VERSION, ProductListAgg } from "./productListAgg";

// Deep Dive Report Tháng — Top SKU (product_list) + Top khuyến mãi (shop_promotion). Cả 2 report
// này KHÔNG có chiều ngày theo dòng (product_list là tổng cả kỳ/SKU, shop_promotion là tổng cả kỳ
// chạy chương trình) — khác live_analysis/shop_analytics/2 report mới nên không cắt lát theo
// tháng được, chỉ lấy batch có period overlap với tháng đang xem (giống cách Report Tuần/Đối Soát
// đã chấp nhận với 2 report loại "tổng hợp cả kỳ" này — xem comment trong weeklySlice.ts).

interface DbImportLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
}

// Chọn batch "overlap nhiều nhất, không cộng dồn nhiều batch" cho report loại "tổng cả kỳ, không
// có chiều ngày theo dòng" (product_list, shop_promotion).
//
// Chọn batch trên danh sách KHÔNG kèm `columns` (product_list có 175 cột × mỗi batch) rồi mới đọc
// `columns` của đúng 1 batch được chọn. Dòng đọc theo trang (fetchRowsPaged) — PostgREST cắt ở 1.000
// dòng mà không báo lỗi.
// Danh sách batch của (brand, loại report) — KHÔNG lọc theo kỳ (lọc kỳ làm ở JS bên dưới). Vì không
// có bộ lọc kỳ, hai lần gọi cho hai THÁNG KHÁC NHAU sinh ra đúng một URL: BrandDashboard gọi
// `fetchShopDaysMonthSlice` cho tháng này VÀ tháng trước, nên trước khi gộp thì mỗi lần mở màn tốn 2
// request giống nhau từng ký tự (đo 2026-10-01 trên bản build production, tái lập 5/5 lượt).
// `dedupeInFlight` chỉ gộp khi hai lời gọi còn CHỒNG NHAU về thời gian, không giữ cache — xem đầu file
// dedupeInFlight.ts. Trả mảng dùng chung; bên dưới `.filter(...)` tạo mảng mới nên `.sort(...)` không
// sửa vào mảng gốc.
async function fetchImportsLite(brandId: string, reportType: DataRawReportType): Promise<DbImportLite[]> {
  return dedupeInFlight(`brand_dataraw_imports.lite|${brandId}|${reportType}`, async () => {
    const { data, error } = await supabase
      .from("brand_dataraw_imports")
      .select("id, report_type, period_start, period_end")
      .eq("brand_id", brandId)
      .eq("report_type", reportType);
    if (error) throw error;
    return ((data as DbImportLite[]) ?? []);
  });
}

async function pickOverlappingBatch(brandId: string, reportType: DataRawReportType, monthStart: string, monthEnd: string): Promise<DbImportLite | null> {
  const imports = await fetchImportsLite(brandId, reportType);

  // Chọn batch overlap NHIỀU NHẤT với tháng (không cộng dồn nhiều batch — mỗi batch đã là tổng cả
  // kỳ upload, cộng lại sẽ nhân đôi số).
  const overlapping = imports.filter(
    (i) => i.period_start && i.period_end && i.period_start <= monthEnd && i.period_end >= monthStart
  );
  if (overlapping.length === 0) return null;
  return overlapping.sort((a, b) => (b.period_end! < a.period_end! ? -1 : 1))[0];
}

async function readBatch(batchId: string): Promise<{ rows: Record<string, unknown>[]; columns: DataRawColumn[] }> {
  const [{ data: meta, error }, byImport] = await Promise.all([
    supabase.from("brand_dataraw_imports").select("columns").eq("id", batchId).single(),
    fetchRowsPaged([batchId])
  ]);
  if (error) throw error;
  return { rows: byImport.get(batchId) ?? [], columns: ((meta as { columns: DataRawColumn[] | null }).columns ?? []) };
}

export async function fetchOverlappingBatchRows(brandId: string, reportType: DataRawReportType, monthStart: string, monthEnd: string) {
  const best = await pickOverlappingBatch(brandId, reportType, monthStart, monthEnd);
  if (!best) return { rows: [] as Record<string, unknown>[], columns: [] as DataRawColumn[], hasAnyBatch: false };
  const { rows, columns } = await readBatch(best.id);
  return { rows, columns, hasAnyBatch: true };
}

// product_list của tháng ở dạng ĐÃ TỔNG HỢP (xem productListAgg.ts). Đọc `summary.productAgg` của batch
// (vài chục KB) thay vì 1.000+ dòng × 175 cột (~5,3 MB). Batch cũ upload trước khi có bản tổng hợp,
// hoặc lệch PRODUCT_AGG_VERSION, thì tính lại từ dòng gốc MỘT lần rồi ghi ngược vào `summary` — lần
// sau về đường rẻ. Ghi ngược hỏng (vd role không có quyền ghi) thì bỏ qua, số trả về vẫn đúng.
export async function fetchProductListAgg(brandId: string, monthStart: string, monthEnd: string): Promise<ProductListAgg | null> {
  return (await fetchProductListAggWithPeriod(brandId, monthStart, monthEnd))?.agg ?? null;
}

/** Như fetchProductListAgg, kèm kỳ của batch đã chọn (cắt về trong tháng) — file Sản Phẩm là tổng cả kỳ,
 *  không cắt theo ngày được, nên so 2 tháng phải biết mỗi bên phủ bao nhiêu ngày. */
export async function fetchProductListAggWithPeriod(
  brandId: string,
  monthStart: string,
  monthEnd: string
): Promise<{ agg: ProductListAgg; periodStart: string; periodEnd: string } | null> {
  const best = await pickOverlappingBatch(brandId, "product_list", monthStart, monthEnd);
  if (!best) return null;
  const period = {
    periodStart: best.period_start! < monthStart ? monthStart : best.period_start!,
    periodEnd: best.period_end! > monthEnd ? monthEnd : best.period_end!
  };

  const { data, error } = await supabase.from("brand_dataraw_imports").select("agg:summary->productAgg").eq("id", best.id).single();
  if (error) throw error;
  const stored = (data as { agg: unknown }).agg;
  if (isCurrentProductAgg(stored)) return { agg: stored, ...period };

  const { rows, columns } = await readBatch(best.id);
  const agg = buildProductListAgg(columns, rows);
  const { data: cur } = await supabase.from("brand_dataraw_imports").select("summary").eq("id", best.id).single();
  const summary = ((cur as { summary: Record<string, unknown> | null } | null)?.summary ?? {}) as Record<string, unknown>;
  await supabase.from("brand_dataraw_imports").update({ summary: { ...summary, productAgg: agg } }).eq("id", best.id);
  return { agg, ...period };
}

export interface TopSkuRow {
  name: string;
  gmv: number;
  gmvLive: number;
  orders: number;
  /** Từ bản tổng hợp v2 — bản chụp cũ (v1) không có ⇒ undefined. */
  skuOrders?: number;
  itemsSold?: number;
  impressions?: number;
  clicks?: number;
}

export interface TopSkuMonthSlice {
  items: TopSkuRow[];
  hasAnyBatch: boolean;
}

// Gộp mọi dòng product_list của tháng theo TÊN đã làm sạch → 1 dòng GMV/dòng SKU. Dùng chung cho
// Top SKU (xếp hạng, cắt limit) và SKU gắn hiệu suất (khớp theo tên với brand_skus, cần ĐỦ SKU
// chứ không chỉ top N).
export function skuPerfFromAgg(agg: ProductListAgg | null): { byName: Map<string, TopSkuRow>; hasAnyBatch: boolean } {
  const byName = new Map<string, TopSkuRow>();
  if (!agg) return { byName, hasAnyBatch: false };
  for (const [name, gmv, gmvLive, orders, skuOrders, itemsSold, impressions, clicks] of agg.skus)
    byName.set(name, { name, gmv, gmvLive, orders, skuOrders, itemsSold, impressions, clicks });
  return { byName, hasAnyBatch: true };
}

export function topSkuFromAgg(agg: ProductListAgg | null, limit = 10): TopSkuMonthSlice {
  const { byName, hasAnyBatch } = skuPerfFromAgg(agg);
  if (!hasAnyBatch) return { items: [], hasAnyBatch: false };
  return { items: Array.from(byName.values()).sort((a, b) => b.gmv - a.gmv).slice(0, limit), hasAnyBatch: true };
}

/** Xếp hạng SKU của 1 tháng (Report Tháng "Hàng": hạng tháng trước → tháng này + phễu từng SKU). Giữ top
 *  `limit` theo GMV kèm hạng; SKU tháng này nằm ngoài top `limit` tháng trước thì hiện "ngoài top N". */
export interface SkuRankSlice {
  items: (TopSkuRow & { rank: number })[];
  /** Số SKU có GMV > 0 trong tháng. */
  sellingSkus: number;
  /** Bao nhiêu SKU đầu bảng cộng lại đủ 80% GMV của mọi SKU (độ tập trung). undefined = bản chụp trước 2026-09-27. */
  skusFor80Pct?: number | null;
  limit: number;
  hasAnyBatch: boolean;
  /** Kỳ file phủ trong tháng (vd 2026-09-01..2026-09-22). */
  periodStart?: string;
  periodEnd?: string;
}

export function skuRankFromAgg(src: { agg: ProductListAgg; periodStart: string; periodEnd: string } | null, limit = 30): SkuRankSlice {
  const { byName, hasAnyBatch } = skuPerfFromAgg(src?.agg ?? null);
  const selling = Array.from(byName.values()).filter((r) => r.gmv > 0).sort((a, b) => b.gmv - a.gmv);
  const total = selling.reduce((a, r) => a + r.gmv, 0);
  let acc = 0;
  let skusFor80Pct: number | null = null;
  for (let i = 0; i < selling.length && total > 0; i++) {
    acc += selling[i].gmv;
    if (acc / total >= 0.8) {
      skusFor80Pct = i + 1;
      break;
    }
  }
  return {
    items: selling.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    sellingSkus: selling.length,
    skusFor80Pct,
    limit,
    hasAnyBatch,
    periodStart: src?.periodStart,
    periodEnd: src?.periodEnd
  };
}

// SKU gắn hiệu suất (Đợt C, 2026-09-23): khớp catalog `brand_skus` với GMV/đơn hàng tháng này của
// product_list, theo TÊN đã làm sạch (cùng chuẩn hoá `cleanProductName` dùng cho Top SKU — 2 màn
// không được nói 2 con số khác nhau về cùng một sản phẩm). CHỈ khớp CHÍNH XÁC (không suy đoán gần
// đúng): tên catalog do ops gõ tay thường ngắn hơn tên đầy đủ TikTok đặt, khớp gần đúng dễ gán
// nhầm hiệu suất của SKU này cho SKU khác — sai một con số tiền còn tệ hơn không có con số.
export interface SkuPerfSlice {
  byNormalizedName: Map<string, TopSkuRow>;
  hasAnyBatch: boolean;
}

export function normalizeSkuName(name: string): string {
  return cleanProductName(name).toLowerCase();
}

export async function fetchSkuPerfMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<SkuPerfSlice> {
  const { byName, hasAnyBatch } = skuPerfFromAgg(await fetchProductListAgg(brandId, monthStart, monthEnd));
  const byNormalizedName = new Map<string, TopSkuRow>();
  for (const [name, row] of byName) byNormalizedName.set(name.toLowerCase(), row);
  return { byNormalizedName, hasAnyBatch };
}

export interface PromotionRow {
  name: string;
  status: string;
  period: string;
  gmv: number;
  orders: number;
  aov: number;
  itemsSold: number;
  /** "Discount amount" và "ROI" của TikTok — undefined ở bản chụp trước 2026-09-27. */
  discount?: number;
  roi?: number;
}

export interface PromotionMonthSlice {
  items: PromotionRow[];
  hasAnyBatch: boolean;
  /** Số chương trình bị loại vì kỳ chạy vắt qua tháng khác — UI phải nói ra, nếu không ops tưởng
   *  tháng đó chỉ có bấy nhiêu chương trình. */
  excludedMultiMonth: number;
  /** Tổng "Discount amount" của các chương trình chạy trọn trong tháng (không chỉ top). */
  totalDiscount?: number;
  /** Top chương trình vắt qua nhiều tháng theo GMV LUỸ KẾ — không xếp hạng cùng bảng chính vì không cắt được theo tháng. */
  longTerm?: PromotionRow[];
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
    itemsSold: findCol(columns, /^(?:Số món bán ra|Items sold)$/i),
    discount: findCol(columns, /^(?:Số tiền giảm giá|Discount amount)/i),
    roi: findCol(columns, /^(?:Tỉ suất lợi nhuận|ROI)$/i)
  };
  if (!c.name || !c.gmv) return { items: [], hasAnyBatch: true, excludedMultiMonth: 0 };
  // ROI là số thập phân kiểu "7.02" — `num` bỏ cả dấu chấm (nghìn) nên đọc riêng.
  const decimal = (v: unknown) => {
    if (typeof v === "number") return v;
    const n = parseFloat(String(v ?? "").replace(/[,%\s]/g, ""));
    return Number.isNaN(n) ? 0 : n;
  };

  const parsed = rows
    .map((raw) => ({
      name: String(raw[c.name!] ?? "").trim(),
      status: String((c.status && raw[c.status]) ?? "").trim(),
      period: String((c.period && raw[c.period]) ?? "").trim(),
      gmv: num(raw[c.gmv!]),
      orders: num(c.orders && raw[c.orders]),
      aov: num(c.aov && raw[c.aov]),
      itemsSold: num(c.itemsSold && raw[c.itemsSold]),
      discount: num(c.discount && raw[c.discount]),
      roi: c.roi ? decimal(raw[c.roi]) : undefined
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

  const inside = new Set(insideMonth);
  return {
    items: insideMonth.sort((a, b) => b.gmv - a.gmv).slice(0, limit),
    hasAnyBatch: true,
    excludedMultiMonth: parsed.length - insideMonth.length,
    totalDiscount: insideMonth.reduce((a, r) => a + (r.discount ?? 0), 0),
    longTerm: parsed.filter((r) => !inside.has(r)).sort((a, b) => b.gmv - a.gmv).slice(0, 5)
  };
}

// ---------------------------------------------------------------------------------------------------
// Toàn shop theo ngày + GMV thẻ sản phẩm — phần 3 "Toàn shop & kênh" và các so sánh cùng số ngày của
// Report Tháng (2026-09-25). Shop Analytics tách GMV cả shop thành kênh: LIVE tài khoản shop / LIVE
// creator (affiliate) / video; cộng thêm GMV thẻ SP từ product_list thì khớp 99,95–99,99% tổng shop
// (đo CROCS T6–T9). Lưu gọn — chỉ các cột report dùng, không mang nguyên 28 cột vào bản chụp.

export interface ShopDayLite {
  date: string;
  gmv: number;
  refunds: number;
  orders: number;
  visitors: number;
  /** "Linked account LIVE-attributed GMV" — LIVE của tài khoản shop/tài khoản kết nối (agency vận hành). */
  liveLinked: number;
  /** "Creator LIVE-attributed GMV" — LIVE của creator affiliate. */
  affiliate: number;
  /** Video: creator + tài khoản kết nối, đều "attributed". */
  video: number;
}

export interface ShopDaysMonthSlice {
  days: ShopDayLite[];
  hasAnyBatch: boolean;
}

export async function fetchShopDaysMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<ShopDaysMonthSlice> {
  const { rows, columns, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "shop_analytics", monthStart, monthEnd);
  if (!hasAnyBatch) return { days: [], hasAnyBatch: false };
  const days = readShopDays(columns, rows, monthStart, monthEnd)
    .map((d) => ({
      date: d.date,
      gmv: d.gmv,
      refunds: d.refunds,
      orders: d.orders,
      visitors: d.visitors,
      liveLinked: d.linkedLiveAttr,
      affiliate: d.creatorLiveAttr,
      video: d.creatorVideoAttr + d.linkedVideoAttr
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
  return { days, hasAnyBatch: true };
}

export interface CardGmvMonthSlice {
  cardGmv: number;
  hasAnyBatch: boolean;
}

/** Chỉ đọc `summary.productAgg.cardGmv` (vài chục byte) — không kéo cả danh sách SKU như fetchProductListAgg.
 *  Batch chưa có bản tổng hợp (upload trước 2026-09-25) thì rơi về fetchProductListAgg (tự ghi ngược). */
export async function fetchCardGmvMonthSlice(brandId: string, monthStart: string, monthEnd: string): Promise<CardGmvMonthSlice> {
  const best = await pickOverlappingBatch(brandId, "product_list", monthStart, monthEnd);
  if (!best) return { cardGmv: 0, hasAnyBatch: false };
  const { data, error } = await supabase
    .from("brand_dataraw_imports")
    .select("v:summary->productAgg->v, card:summary->productAgg->cardGmv")
    .eq("id", best.id)
    .single();
  if (error) throw error;
  const row = data as { v: unknown; card: unknown };
  if (row.v === PRODUCT_AGG_VERSION && typeof row.card === "number") return { cardGmv: row.card, hasAnyBatch: true };
  const agg = await fetchProductListAgg(brandId, monthStart, monthEnd);
  return { cardGmv: agg?.cardGmv ?? 0, hasAnyBatch: !!agg };
}
