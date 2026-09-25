import { supabase } from "../supabaseClient";
import { DataRawColumn, DataRawReportType } from "../../types";
import { mapCreatorLivePerfRows, CreatorLivePerfRow, vnDateOf } from "./creatorLivePerfSlice";
import { fetchRowsPaged } from "./fetchRowsPaged";

// ---------------------------------------------------------------------------
// Tầng nguồn cho Report Tháng Chuyên Sâu (2026-09-23).
//
// Vì sao KHÔNG dùng lại các slice cũ (weeklySlice/monthlyProductSlice/monthlyDailySlice): mỗi
// slice cũ chỉ bóc đúng vài cột mà màn hình của nó cần (weeklySlice đọc 11/28 cột shop_analytics,
// monthlyProductSlice đọc 4/175 cột product_list). Report chuyên sâu cần gần như TOÀN BỘ cột, và
// cần cùng một lần fetch cho nhiều tháng để so MoM — nên khai riêng tầng nguồn này. Các slice cũ
// giữ nguyên, không đụng tới, để 2 report không kéo nhau khi sửa.
//
// Quy ước số của TikTok khác nhau theo từng loại file — xem numDot/numComma/pct bên dưới. Đọc sai
// dialect là lệch 1000 lần mà không có lỗi nào bắn ra, nên mỗi loại file buộc phải chỉ rõ dùng hàm
// nào thay vì có một num() dùng chung.
// ---------------------------------------------------------------------------

/** "627.840.078₫" / "1.164" — dấu CHẤM là phân cách nghìn (product_list, shop_promotion). */
function numDot(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,.₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** "143,225,839.12₫" — dấu PHẨY là phân cách nghìn, CHẤM là thập phân thật (creator_live_performance). */
function numComma(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[,₫%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** Số trần không phân cách: "215737974" (shop_analytics, live_performance_core_stats). */
function numRaw(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[₫%\s,]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** "2.45%" -> 2.45. Không nhân/chia 100 — toàn hệ thống dùng đơn vị "điểm %". */
function pct(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[%\s]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** "dd/mm/yyyy" hoặc "yyyy-mm-dd" -> "yyyy-mm-dd". */
function toIsoDate(v: unknown): string | undefined {
  const s = String(v ?? "").trim();
  const vn = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (vn) return `${vn[3]}-${vn[2]}-${vn[1]}`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : undefined;
}

function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

/**
 * Lấy key của cột theo VỊ TRÍ, có kiểm tra nhãn. Dùng cho product_list: 175 cột chia 5 nhóm kênh
 * lặp lại y hệt tên nhau ("Attributed GMV" xuất hiện 4 lần) nên dò theo nhãn là mơ hồ, còn dò theo
 * khoá dedupe ("Attributed GMV__3") thì không ai đọc hiểu nổi. Vị trí là thứ ổn định và đọc được,
 * kèm nhãn kỳ vọng để nếu TikTok đổi thứ tự cột thì trả undefined (field về 0) thay vì âm thầm
 * đọc nhầm sang cột khác.
 */
function colAt(columns: DataRawColumn[], index: number, expectedLabel: string): string | undefined {
  const c = columns[index];
  if (!c) return undefined;
  return c.label.trim().toLowerCase() === expectedLabel.toLowerCase() ? c.key : undefined;
}

// --- Kiểu dòng đã chuẩn hoá ------------------------------------------------

/** 1 dòng/ngày từ shop_analytics — toàn shop, mọi kênh. */
export interface ShopDayRow {
  date: string;
  gmv: number;
  orders: number;
  customers: number;
  itemsSold: number;
  refunds: number;
  skuOrders: number;
  grossRevenue: number;
  pageViews: number;
  visitors: number;
  /** TikTok trả dạng phân số (0.0175) ở report này -> đã nhân 100 thành điểm %. */
  conversionRate: number;
  productImpressions: number;
  uniqueProductImpressions: number;
  productClicks: number;
  uniqueClicks: number;
  aov: number;
  /** GMV theo kênh — "attributed" = trực tiếp + gián tiếp. */
  creatorLiveAttr: number;
  creatorLiveDirect: number;
  creatorLiveIndirect: number;
  linkedLiveAttr: number;
  sellerLiveDirect: number;
  sellerLiveIndirect: number;
  creatorVideoAttr: number;
  linkedVideoAttr: number;
}

/** 1 dòng/ngày từ live_performance_core_stats — chỉ mảng LIVE. */
export interface LiveDayRow {
  date: string;
  liveAttrGmv: number;
  liveGmv: number;
  liveIndirectGmv: number;
  showGpm: number;
  streams: number;
  streamsWithGmv: number;
  attrItemsSold: number;
  attrSkuOrders: number;
  ctr: number;
  ctor: number;
  views: number;
  avgViewSeconds: number;
}

/** 1 dòng/SKU từ product_list. */
export interface ProductRow {
  name: string;
  productId: string;
  gmv: number;
  orders: number;
  skuOrders: number;
  itemsSold: number;
  customers: number;
  aov: number;
  impressions: number;
  clicks: number;
  ctr: number;
  ctorSku: number;
  atcRate: number;
  refunds: number;
  /** GMV theo kênh (đều là "attributed" = trực tiếp + gián tiếp). */
  sellerLiveGmv: number;
  creatorLiveGmv: number;
  sellerVideoGmv: number;
  creatorVideoGmv: number;
  cardGmv: number;
  /** Phễu riêng của kênh LIVE người bán. */
  liveImpressions: number;
  liveClicks: number;
  liveCtr: number;
  liveCtorSku: number;
}

/** 1 dòng/chương trình từ shop_promotion. */
export interface PromotionRow {
  id: string;
  name: string;
  status: string;
  periodLabel: string;
  periodStart?: string;
  periodEnd?: string;
  /** CẢNH BÁO: đây là GMV LUỸ KẾ CẢ CHƯƠNG TRÌNH, không phải GMV trong tháng xuất file. */
  gmvLifetime: number;
  orders: number;
  aov: number;
  discountAmount: number;
  roi: number;
  itemsSold: number;
  avgDiscountRate: number;
  gmvPerCustomer: number;
  /** Chương trình nằm trọn trong tháng đang xem -> GMV luỹ kế CHÍNH LÀ GMV của tháng. */
  fullyInsideMonth: boolean;
}

export interface MonthSource {
  month: string; // "YYYY-MM"
  start: string;
  end: string;
  shopDays: ShopDayRow[];
  liveDays: LiveDayRow[];
  sessions: CreatorLivePerfRow[];
  products: ProductRow[];
  promotions: PromotionRow[];
  present: Record<DataRawReportType, boolean>;
  /** Đã NẠP dòng product_list cho tháng này chưa (khác với "brand đã upload file chưa" ở present).
   *  UI nạp 2 pha nên pha 1 luôn false — khối Sản Phẩm phải hiện "đang tải" chứ không phải "0 SKU". */
  productsLoaded: boolean;
  /** Ngày trong kỳ mà shop_analytics không có dòng nào. */
  missingShopDays: string[];
}

// --- Fetch -----------------------------------------------------------------

interface BatchLite {
  id: string;
  report_type: string;
  period_start: string | null;
  period_end: string | null;
  columns: DataRawColumn[];
}

export function monthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, "0")}` };
}

export function eachDateOf(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  while (d <= e) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}


/**
 * Batch có đọc được không, chỉ dựa vào `columns` (không cần tải `rows`) — dùng để tính `present`
 * đúng thay vì chỉ theo metadata kỳ (xem comment ở chỗ gọi). Mỗi nhánh dùng ĐÚNG cột mốc mà hàm đọc
 * dòng tương ứng bên dưới tự kiểm (`c.date`/`c.name`+`c.gmv`), cộng cột mốc "Start Time" của
 * `mapCreatorLivePerfRows` (creatorLivePerfSlice.ts) — không tự tạo thêm quy tắc thứ hai.
 * `live_analysis` không nằm trong danh sách "Thiếu file" của `quality` (metrics.ts) nên không ảnh
 * hưởng cảnh báo gì — trả `true` để giữ nguyên hành vi cũ (present chỉ theo metadata) cho loại này.
 */
function canReadReportType(reportType: string, columns: DataRawColumn[]): boolean {
  switch (reportType as DataRawReportType) {
    case "shop_analytics":
      return !!findCol(columns, /^(?:Ngày|Date)$/i);
    case "live_performance_core_stats":
      return !!findCol(columns, /^(?:Thời gian|Time)$/i);
    case "creator_live_performance":
      return !!findCol(columns, /^Start Time$/i);
    case "product_list":
      return !!(colAt(columns, 0, "Product Name") ?? colAt(columns, 0, "Tên")) && !!colAt(columns, 3, "GMV");
    case "shop_promotion":
      return !!findCol(columns, /^(?:Tên khuyến mãi|Promotion name)$/i);
    case "live_analysis":
      return true;
    default:
      // report_type lạ (dữ liệu cũ/hỏng) — không khớp key nào trong `present` nên không quan trọng.
      return false;
  }
}

/**
 * Nạp nguồn cho NHIỀU tháng trong một lần truy vấn. Report chuyên sâu luôn cần ít nhất tháng này +
 * tháng trước (MoM) và thường 4-6 tháng cho đường xu hướng; gọi từng tháng sẽ thành N×6 round-trip.
 *
 * opts.promotionMonths / opts.productMonths: 2 report "tổng cả kỳ" chỉ có nghĩa với ĐÚNG tháng của
 * chúng, nên phải chỉ rõ tháng nào cần. Tách riêng 2 danh sách vì chênh lệch chi phí rất lớn:
 * shop_promotion ~40 dòng/tháng, còn product_list là 175 cột × ~1.200 dòng = **5,2 MB/1.000 dòng**
 * (đo trên CROCS T8/2026). Nạp product_list cho 2 tháng là ~12 MB — quá nặng để chặn lần render
 * đầu, nên UI nạp 2 pha: pha 1 bỏ product_list cho ra màn hình ngay, pha 2 nạp nền rồi tính lại.
 */
export interface DeepDiveFetchOptions {
  promotionMonths?: string[];
  productMonths?: string[];
}

export async function fetchDeepDiveSources(brandId: string, months: string[], opts: DeepDiveFetchOptions = {}): Promise<Map<string, MonthSource>> {
  const promoMonths = new Set(opts.promotionMonths ?? months);
  const productMonths = new Set(opts.productMonths ?? []);
  const spans = months.map((m) => ({ month: m, ...monthBounds(m) }));
  const rangeStart = spans.reduce((a, s) => (s.start < a ? s.start : a), spans[0].start);
  const rangeEnd = spans.reduce((a, s) => (s.end > a ? s.end : a), spans[0].end);

  const { data: batchData, error } = await supabase
    .from("brand_dataraw_imports")
    .select("id, report_type, period_start, period_end, columns")
    .eq("brand_id", brandId);
  if (error) throw error;

  const batches = ((batchData as BatchLite[]) ?? []).filter(
    (b) => b.period_start && b.period_end && b.period_start <= rangeEnd && b.period_end >= rangeStart
  );
  const out = new Map<string, MonthSource>();
  for (const s of spans) {
    out.set(s.month, {
      month: s.month,
      start: s.start,
      end: s.end,
      shopDays: [],
      liveDays: [],
      sessions: [],
      products: [],
      promotions: [],
      present: {
        shop_promotion: false,
        product_list: false,
        live_analysis: false,
        shop_analytics: false,
        live_performance_core_stats: false,
        creator_live_performance: false
      },
      missingShopDays: [],
      productsLoaded: productMonths.has(s.month)
    });
  }
  if (batches.length === 0) return out;

  // Bỏ hẳn batch của tháng không cần chi tiết TRƯỚC khi đọc dòng — lọc sau khi tải thì đã tốn băng thông.
  const needed = batches.filter((b) => {
    const mk = b.period_start!.slice(0, 7);
    if (b.report_type === "product_list") return productMonths.has(mk);
    if (b.report_type === "shop_promotion") return promoMonths.has(mk);
    return true;
  });
  const byImport = await fetchRowsPaged(needed.map((b) => b.id));

  // present = "brand ĐÃ upload loại report này cho tháng đó", tính trên TOÀN BỘ batch chứ không
  // chỉ batch được nạp dòng — nếu không, tháng chỉ dùng cho đường xu hướng (không nạp product_list)
  // sẽ bị báo nhầm là "thiếu file".
  //
  // FIX (audit module 3, 2026-09-25): trước đây chỉ xét METADATA kỳ (period_start/period_end) —
  // cùng họ lỗi với `missingDays` đã vá ở weeklySlice/monthlyDailySlice/creatorLivePerfSlice. Một
  // batch bị import nhầm report type, hoặc TikTok đổi tên cột (đã xảy ra thật — xem
  // affiliateCreatorListSlice trong WORKSPACE_DESIGN.md), sẽ đọc ra 0 dòng ở vòng lặp bên dưới
  // (readShopDays/readLiveDays/... đều tự trả [] khi thiếu cột mốc) nhưng `present` vẫn báo "đã có
  // file", nên cảnh báo "Thiếu file X" ở `quality` không bao giờ bắn — khối đó lặng lẽ hiện rỗng mà
  // không ai biết vì sao. `canReadReportType` dùng ĐÚNG cột mốc mà từng hàm đọc dòng bên dưới tự
  // kiểm, nhưng chỉ cần `b.columns` (đã có sẵn từ câu SELECT, không cần tải `rows`) nên vẫn tính
  // được cho cả những tháng cố tình không nạp dòng (đường xu hướng, xem comment `needed` ở trên).
  for (const b of batches) {
    if (!canReadReportType(b.report_type, b.columns)) continue;
    for (const s of spans) {
      if (!(b.period_start! <= s.end && b.period_end! >= s.start)) continue;
      if ((b.report_type === "product_list" || b.report_type === "shop_promotion") && b.period_start!.slice(0, 7) !== s.month) continue;
      const p = out.get(s.month)!.present as Record<string, boolean>;
      if (b.report_type in p) p[b.report_type] = true;
    }
  }

  for (const b of needed) {
    const rows = byImport.get(b.id) ?? [];
    for (const s of spans) {
      if (!(b.period_start! <= s.end && b.period_end! >= s.start)) continue;
      const dst = out.get(s.month)!;
      switch (b.report_type) {
        case "shop_analytics":
          dst.shopDays.push(...readShopDays(b.columns, rows, s.start, s.end));
          break;
        case "live_performance_core_stats":
          dst.liveDays.push(...readLiveDays(b.columns, rows, s.start, s.end));
          break;
        case "creator_live_performance": {
          let mapped: CreatorLivePerfRow[] = [];
          try {
            mapped = mapCreatorLivePerfRows(b.columns, rows);
          } catch {
            // Batch import nhầm loại -> bỏ qua batch, không làm chết cả report.
          }
          dst.sessions.push(...mapped.filter((r) => {
            const d = vnDateOf(r.startTime);
            return d >= s.start && d <= s.end;
          }));
          break;
        }
        case "product_list":
          // Báo cáo tổng cả kỳ, không có chiều ngày -> chỉ nhận batch của ĐÚNG tháng này, không
          // nhận batch tháng khác chạm vào (nhận sẽ thành cộng 2 tháng vào nhau).
          if (b.period_start!.slice(0, 7) !== s.month) break;
          dst.products.push(...readProducts(b.columns, rows));
          break;
        case "shop_promotion":
          if (b.period_start!.slice(0, 7) !== s.month) break;
          dst.promotions.push(...readPromotions(b.columns, rows, s.start, s.end));
          break;
        default:
          break;
      }
    }
  }

  for (const s of out.values()) {
    s.shopDays.sort((a, b) => a.date.localeCompare(b.date));
    s.liveDays.sort((a, b) => a.date.localeCompare(b.date));
    s.sessions.sort((a, b) => a.startTime.localeCompare(b.startTime));
    const have = new Set(s.shopDays.map((d) => d.date));
    s.missingShopDays = s.present.shop_analytics ? eachDateOf(s.start, s.end).filter((d) => !have.has(d)) : [];
  }
  return out;
}

// --- Bóc từng loại ---------------------------------------------------------

export function readShopDays(columns: DataRawColumn[], rows: Record<string, unknown>[], start: string, end: string): ShopDayRow[] {
  const c = {
    date: findCol(columns, /^(?:Ngày|Date)$/i),
    gmv: findCol(columns, /^GMV$/i),
    orders: findCol(columns, /^(?:Đơn hàng|Orders)$/i),
    customers: findCol(columns, /^(?:Khách hàng|Customers)$/i),
    itemsSold: findCol(columns, /^(?:Số món bán ra|Items sold)$/i),
    refunds: findCol(columns, /^(?:Hoàn tiền|Refunds)$/i),
    skuOrders: findCol(columns, /^(?:Đơn hàng SKU|SKU orders)$/i),
    grossRevenue: findCol(columns, /^(?:Tổng doanh thu|Gross revenue)$/i),
    pageViews: findCol(columns, /^(?:Lượt xem trang|Page views)$/i),
    visitors: findCol(columns, /^(?:Khách truy cập|Visitors)$/i),
    cvr: findCol(columns, /^(?:Tỷ lệ chuyển đổi|Conversion rate)$/i),
    impressions: findCol(columns, /^(?:Lượt hiển thị sản phẩm|Product impressions)$/i),
    uniqueImpressions: findCol(columns, /^(?:Lượt hiển thị sản phẩm độc nhất|Unique product impressions)$/i),
    clicks: findCol(columns, /^(?:Lượt nhấp vào sản phẩm|Product clicks)$/i),
    uniqueClicks: findCol(columns, /^(?:Lượt nhấp độc nhất|Unique clicks)$/i),
    aov: findCol(columns, /^AOV$/i),
    creatorLiveAttr: findCol(columns, /^(?:GMV nhờ buổi LIVE của nhà sáng tạo|Creator LIVE-attributed GMV)$/i),
    creatorLiveDirect: findCol(columns, /^(?:GMV LIVE của nhà sáng tạo|Creator LIVE GMV)$/i),
    creatorLiveIndirect: findCol(columns, /^(?:GMV gián tiếp từ buổi LIVE của nhà sáng tạo|Creator LIVE indirect GMV)$/i),
    linkedLiveAttr: findCol(columns, /^(?:GMV nhờ buổi LIVE của tài khoản kết nối|Linked account LIVE-attributed GMV)$/i),
    sellerLiveDirect: findCol(columns, /^(?:GMV LIVE của người bán|Seller LIVE GMV)$/i),
    sellerLiveIndirect: findCol(columns, /^(?:GMV gián tiếp từ buổi LIVE của người bán|Seller LIVE indirect GMV)$/i),
    creatorVideoAttr: findCol(columns, /^(?:GMV đến từ video liên kết|Creator video-attributed GMV)$/i),
    linkedVideoAttr: findCol(columns, /^(?:GMV nhờ video của tài khoản kết nối|Linked account video-attributed GMV)$/i)
  };
  if (!c.date) return [];
  const out: ShopDayRow[] = [];
  for (const raw of rows) {
    const date = toIsoDate(raw[c.date]);
    if (!date || date < start || date > end) continue;
    const g = (k?: string) => (k ? numRaw(raw[k]) : 0);
    out.push({
      date,
      gmv: g(c.gmv),
      orders: g(c.orders),
      customers: g(c.customers),
      itemsSold: g(c.itemsSold),
      refunds: g(c.refunds),
      skuOrders: g(c.skuOrders),
      grossRevenue: g(c.grossRevenue),
      pageViews: g(c.pageViews),
      visitors: g(c.visitors),
      // Report này trả tỉ lệ chuyển đổi dạng phân số (0.0175), khác mọi cột % khác -> ×100.
      conversionRate: (c.cvr ? numRaw(raw[c.cvr]) : 0) * 100,
      productImpressions: g(c.impressions),
      uniqueProductImpressions: g(c.uniqueImpressions),
      productClicks: g(c.clicks),
      uniqueClicks: g(c.uniqueClicks),
      aov: g(c.aov),
      creatorLiveAttr: g(c.creatorLiveAttr),
      creatorLiveDirect: g(c.creatorLiveDirect),
      creatorLiveIndirect: g(c.creatorLiveIndirect),
      linkedLiveAttr: g(c.linkedLiveAttr),
      sellerLiveDirect: g(c.sellerLiveDirect),
      sellerLiveIndirect: g(c.sellerLiveIndirect),
      creatorVideoAttr: g(c.creatorVideoAttr),
      linkedVideoAttr: g(c.linkedVideoAttr)
    });
  }
  return out;
}

function readLiveDays(columns: DataRawColumn[], rows: Record<string, unknown>[], start: string, end: string): LiveDayRow[] {
  const c = {
    date: findCol(columns, /^(?:Thời gian|Time)$/i),
    liveAttrGmv: findCol(columns, /^(?:GMV đến từ buổi LIVE|LIVE-attributed GMV)/i),
    liveGmv: findCol(columns, /^(?:GMV LIVE|LIVE GMV) \(/i),
    liveIndirectGmv: findCol(columns, /^(?:GMV gián tiếp của LIVE|LIVE indirect GMV)/i),
    showGpm: findCol(columns, /^(?:Hiển thị GPM|Show GPM)/i),
    streams: findCol(columns, /^(?:Buổi LIVE|LIVE streams)$/i),
    streamsWithGmv: findCol(columns, /^(?:Số buổi LIVE tạo ra GMV\.|The number of LIVE streams that generated GMV\.)$/i),
    attrItemsSold: findCol(columns, /^(?:Số món bán ra ghi nhận vào buổi LIVE|LIVE-attributed items sold)$/i),
    attrSkuOrders: findCol(columns, /^(?:Đơn hàng SKU đã ghi nhận|Attributed SKU orders)$/i),
    ctr: findCol(columns, /^(?:Tỷ lệ nhấp|Click-through rate) \(LIVE\)$/i),
    ctor: findCol(columns, /^CTOR \((?:đơn hàng SKU|SKU order)\) \(LIVE\)$/i),
    views: findCol(columns, /^(?:Lượt xem phiên LIVE|LIVE Views)$/i),
    avgView: findCol(columns, /^(?:Thời lượng xem trung bình \(Buổi LIVE\)|Average viewing duration \(LIVE streams\))$/i)
  };
  if (!c.date) return [];
  const out: LiveDayRow[] = [];
  for (const raw of rows) {
    const date = toIsoDate(raw[c.date]);
    if (!date || date < start || date > end) continue;
    const g = (k?: string) => (k ? numRaw(raw[k]) : 0);
    out.push({
      date,
      liveAttrGmv: g(c.liveAttrGmv),
      liveGmv: g(c.liveGmv),
      liveIndirectGmv: g(c.liveIndirectGmv),
      showGpm: g(c.showGpm),
      streams: g(c.streams),
      streamsWithGmv: g(c.streamsWithGmv),
      attrItemsSold: g(c.attrItemsSold),
      attrSkuOrders: g(c.attrSkuOrders),
      ctr: c.ctr ? pct(raw[c.ctr]) : 0,
      ctor: c.ctor ? pct(raw[c.ctor]) : 0,
      views: g(c.views),
      avgViewSeconds: g(c.avgView)
    });
  }
  return out;
}

function readProducts(columns: DataRawColumn[], rows: Record<string, unknown>[]): ProductRow[] {
  // Vị trí cột theo bản export 2026-09 (175 cột, 5 nhóm kênh). colAt() kiểm nhãn nên TikTok đổi
  // thứ tự sẽ làm field về 0 chứ không đọc nhầm cột khác.
  const c = {
    name: colAt(columns, 0, "Product Name") ?? colAt(columns, 0, "Tên"),
    id: colAt(columns, 1, "Product ID") ?? colAt(columns, 1, "ID sản phẩm"),
    gmv: colAt(columns, 3, "GMV"),
    sellerLiveGmv: colAt(columns, 4, "Seller LIVE-attributed GMV"),
    sellerVideoGmv: colAt(columns, 7, "Seller video-attributed GMV"),
    creatorLiveGmv: colAt(columns, 11, "Creator LIVE-attributed GMV"),
    creatorVideoGmv: colAt(columns, 14, "Creator video-attributed GMV"),
    cardGmv: colAt(columns, 17, "Seller product card GMV"),
    orders: colAt(columns, 18, "Orders"),
    skuOrders: colAt(columns, 19, "SKU orders"),
    itemsSold: colAt(columns, 20, "Items sold"),
    customers: colAt(columns, 21, "Est. customers"),
    aov: colAt(columns, 22, "AOV (SKU orders)"),
    impressions: colAt(columns, 23, "Product impressions"),
    clicks: colAt(columns, 24, "Product clicks"),
    ctr: colAt(columns, 25, "CTR"),
    atcRate: colAt(columns, 27, "Add-to-cart rate"),
    ctorSku: colAt(columns, 28, "CTOR (SKU order)"),
    refunds: colAt(columns, 39, "Refunds"),
    liveImpressions: colAt(columns, 63, "Product impressions"),
    liveClicks: colAt(columns, 64, "Product clicks"),
    liveCtr: colAt(columns, 65, "CTR"),
    liveCtorSku: colAt(columns, 68, "CTOR (SKU order)")
  };
  if (!c.name || !c.gmv) return [];
  const out: ProductRow[] = [];
  for (const raw of rows) {
    const name = String(raw[c.name] ?? "").trim();
    if (!name) continue;
    const g = (k?: string) => (k ? numDot(raw[k]) : 0);
    const p = (k?: string) => (k ? pct(raw[k]) : 0);
    out.push({
      name,
      productId: c.id ? String(raw[c.id] ?? "") : "",
      gmv: g(c.gmv),
      orders: g(c.orders),
      skuOrders: g(c.skuOrders),
      itemsSold: g(c.itemsSold),
      customers: g(c.customers),
      aov: g(c.aov),
      impressions: g(c.impressions),
      clicks: g(c.clicks),
      ctr: p(c.ctr),
      ctorSku: p(c.ctorSku),
      atcRate: p(c.atcRate),
      refunds: g(c.refunds),
      sellerLiveGmv: g(c.sellerLiveGmv),
      creatorLiveGmv: g(c.creatorLiveGmv),
      sellerVideoGmv: g(c.sellerVideoGmv),
      creatorVideoGmv: g(c.creatorVideoGmv),
      cardGmv: g(c.cardGmv),
      liveImpressions: g(c.liveImpressions),
      liveClicks: g(c.liveClicks),
      liveCtr: p(c.liveCtr),
      liveCtorSku: p(c.liveCtorSku)
    });
  }
  return out;
}

function readPromotions(columns: DataRawColumn[], rows: Record<string, unknown>[], start: string, end: string): PromotionRow[] {
  const c = {
    id: findCol(columns, /^ID$/i),
    name: findCol(columns, /^(?:Tên khuyến mãi|Promotion name)$/i),
    status: findCol(columns, /^(?:Trạng thái|Status)$/i),
    period: findCol(columns, /^(?:Thời gian khuyến mãi|Promotion period)$/i),
    gmv: findCol(columns, /^GMV/i),
    orders: findCol(columns, /^(?:Đơn hàng|Orders)$/i),
    aov: findCol(columns, /^(?:Giá trị trung bình đơn|Avg\. order value)/i),
    discount: findCol(columns, /^(?:Số tiền giảm giá|Discount amount)/i),
    roi: findCol(columns, /^(?:Tỉ suất lợi nhuận|ROI)$/i),
    itemsSold: findCol(columns, /^(?:Số món bán ra|Items sold)$/i),
    discountRate: findCol(columns, /^(?:Tỷ lệ giảm giá trung bình|Avg\. discount rate)$/i),
    gmvPerCustomer: findCol(columns, /^(?:GMV trung bình\/khách|Avg\. GMV per customer)/i)
  };
  if (!c.name) return [];
  const out: PromotionRow[] = [];
  for (const raw of rows) {
    const name = String(raw[c.name] ?? "").trim();
    if (!name) continue;
    const periodLabel = c.period ? String(raw[c.period] ?? "").trim() : "";
    // "2026-06-08 09:22 - 2026-07-05 23:58"
    const m = periodLabel.match(/(\d{4}-\d{2}-\d{2}).*?(\d{4}-\d{2}-\d{2})/);
    const ps = m?.[1];
    const pe = m?.[2];
    const g = (k?: string) => (k ? numDot(raw[k]) : 0);
    out.push({
      id: c.id ? String(raw[c.id] ?? "") : name,
      name,
      status: c.status ? String(raw[c.status] ?? "").trim() : "",
      periodLabel,
      periodStart: ps,
      periodEnd: pe,
      gmvLifetime: g(c.gmv),
      orders: g(c.orders),
      aov: g(c.aov),
      discountAmount: g(c.discount),
      roi: c.roi ? numComma(raw[c.roi]) : 0,
      itemsSold: g(c.itemsSold),
      avgDiscountRate: c.discountRate ? pct(raw[c.discountRate]) : 0,
      gmvPerCustomer: g(c.gmvPerCustomer),
      fullyInsideMonth: !!ps && !!pe && ps >= start && pe <= end
    });
  }
  return out;
}
