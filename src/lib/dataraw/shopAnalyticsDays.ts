import type { DataRawColumn } from "../../types";

// Đọc file Shop Analytics thành 1 dòng/ngày — toàn shop, mọi kênh. Tách ra từ deepDiveSource.ts (tầng nguồn
// riêng của "Phân tích sâu") khi gộp Phân tích sâu vào Report Tháng (2026-09-27): report chỉ còn cần đúng
// phần này (piece shopDays của bản chụp, qua fetchShopDaysMonthSlice).
//
// Shop Analytics ghi số TRẦN không phân cách ("215737974") — khác product_list/shop_promotion (dấu chấm
// nghìn). Đọc sai dialect là lệch 1000 lần mà không có lỗi nào bắn ra.

/** Số trần không phân cách: "215737974" (shop_analytics, live_performance_core_stats). */
function numRaw(v: unknown): number {
  if (v === null || v === undefined || v === "" || v === "-") return 0;
  if (typeof v === "number") return v;
  const n = parseFloat(String(v).replace(/[₫%\s,]/g, ""));
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
