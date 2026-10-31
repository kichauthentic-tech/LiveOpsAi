import type { ParsedDataRawImport } from "./parseDataRawExcel";
import { shopeeNum } from "./shopeeFiles";

// Ads Shopee — 3 file Seller Centre (Quảng cáo Shopee → xuất dữ liệu, chọn đúng MỘT tháng). Mỗi file là MỘT DÒNG / chiến dịch
// (hoặc sản phẩm) cho CẢ KỲ — khác file TikTok Ads (theo ngày) nên Report Shopee có chi phí, ROAS, chi phí/đơn của tháng,
// KHÔNG tách được theo ngày hay loại ngày.
//
//   shopee_ads          Livestream Ads. Tiêu đề tiếng Anh "Shopee Live Ads Report" (0142) hoặc tiếng Việt "Báo cáo chi tiết
//                       Dịch vụ Hiển thị Livestream" (31/10, Franklin — shop để giao diện tiếng Việt xuất cột tiếng Việt).
//   shopee_shop_ads     Shop+ Ads: "Báo cáo chiến dịch Tìm kiếm Từ khóa ngành hàng" (tự động / thủ công, 0192). Có cột "trực tiếp".
//   shopee_product_ads  Product Ads CPC / GMV Max: "Báo cáo Dịch vụ Hiển thị trả theo CPC" — một dòng / sản phẩm (0192).
//
// Chặn: kỳ không trọn trong MỘT tháng (Report theo tháng), thiếu cột, ROAS lệch GMV ÷ chi phí (đọc nhầm dấu chấm/phẩy nghìn —
// số tiền sai 1.000 lần mà vẫn "trông hợp lý"). Mã shop của file KHÔNG chặn: chỉ hiện để ops tự đối chiếu.

export type ShopeeAdsKind = "shopee_ads" | "shopee_shop_ads" | "shopee_product_ads";
export const SHOPEE_ADS_KINDS: ShopeeAdsKind[] = ["shopee_ads", "shopee_shop_ads", "shopee_product_ads"];
export const SHOPEE_ADS_KIND_LABEL: Record<ShopeeAdsKind, string> = {
  shopee_ads: "Livestream Ads",
  shopee_shop_ads: "Shop+ Ads",
  shopee_product_ads: "Product Ads"
};

export interface ShopeeAdsCampaign {
  name: string;
  id: string;
  status: string;
  objective: string;
  budget: number;
  views: number;
  orders: number;
  conversionPct: number;
  gmv: number;
  expense: number;
  roas: number | null;
}

export interface ShopeeAdsStats {
  shopName: string | null;
  shopId: string | null;
  campaigns: ShopeeAdsCampaign[];
  expense: number;
  gmv: number;
  orders: number;
  views: number;
  /** GMV từ Ads ÷ chi phí — cùng cách Shopee tính ROAS. */
  roas: number | null;
  costPerOrder: number | null;
}

/** Một dòng Shop+ Ads (chiến dịch tìm kiếm). `gmvDirect` = doanh số đơn mua trực tiếp từ quảng cáo. */
export interface ShopeeSearchAd {
  name: string;
  status: string;
  bidding: string;
  keyword: string;
  startDate: string;
  views: number;
  clicks: number;
  conversions: number;
  directConversions: number;
  itemsSold: number;
  gmv: number;
  gmvDirect: number;
  expense: number;
}

/** Một dòng Product Ads (một sản phẩm). */
export interface ShopeeProductAd {
  name: string;
  status: string;
  productId: string;
  bidding: string;
  startDate: string;
  views: number;
  clicks: number;
  addToCart: number;
  conversions: number;
  directConversions: number;
  itemsSold: number;
  gmv: number;
  gmvDirect: number;
  expense: number;
}

export interface ShopeeAdsGroup<T> {
  rows: T[];
  expense: number;
  gmv: number;
  gmvDirect: number;
  conversions: number;
  views: number;
  clicks: number;
}

/** Bộ 3 loại Ads của một tháng — null = chưa tải file loại đó. */
export interface ShopeeAdsSuite {
  live: ShopeeAdsStats | null;
  shop: ShopeeAdsGroup<ShopeeSearchAd> | null;
  product: ShopeeAdsGroup<ShopeeProductAd> | null;
}

export interface ShopeeAdsTotals {
  expense: number;
  gmv: number;
  /** Doanh số đơn trực tiếp: Shop+ và Product Ads có cột trực tiếp; Livestream Ads không tách nên tính cả GMV của nó. */
  gmvDirect: number;
  conversions: number;
  roas: number | null;
  roasDirect: number | null;
  acos: number | null;
  costPerConversion: number | null;
}

const LIVE_COLS = ["Campaign Name", "Campaign ID", "Status", "Objective", "Budget", "Views", "Orders", "Conversion Rate", "GMV", "Expense", "ROAS"] as const;
const META_KEYS: Record<string, string> = {
  "Shop Name": "shopName", "Shop ID": "shopId", "Report Creation Time": "createdAt", "Date Period": "period",
  "Tên gian hàng": "shopName", "Mã Người bán": "shopId", "Thời gian tạo báo cáo": "createdAt", "Khoảng thời gian": "period"
};
// Livestream Ads xuất tiếng Việt → đổi về tên tiếng Anh ngay lúc đọc, dữ liệu lưu cùng một khuôn với file tiếng Anh.
const VI_LIVE_HEADERS: Record<string, string> = {
  "Thứ tự": "Sequence", "Tên chiến dịch": "Campaign Name", "ID chiến dịch": "Campaign ID", "Trạng thái": "Status", "Mục tiêu": "Objective",
  "Ngày bắt đầu": "Start Date", "Ngày kết thúc": "End Date", "Giờ bắt đầu hàng ngày": "Daily Start Time", "Giờ kết thúc hàng ngày": "Daily End Time",
  "Ngân sách": "Budget", "Lượt xem": "Views", "Số đơn hàng": "Orders", "Tỷ lệ chuyển đổi": "Conversion Rate", "Doanh số": "GMV", "Chi phí": "Expense"
};
const SHOP_COLS = ["Tên Dịch vụ Hiển thị", "Trạng thái", "Phương thức đấu thầu", "Từ khóa", "Số lượt xem", "Số lượt click", "Lượt chuyển đổi", "Lượt chuyển đổi trực tiếp", "Sản phẩm đã bán", "Doanh số", "Doanh số trực tiếp", "Chi phí"] as const;
const PRODUCT_COLS = ["Tên Dịch vụ Hiển thị", "Trạng thái", "Mã sản phẩm", "Phương thức đấu thầu", "Số lượt xem", "Số lượt click", "Thêm vào giỏ hàng", "Lượt chuyển đổi", "Lượt chuyển đổi trực tiếp", "Sản phẩm đã bán", "Doanh số", "Doanh số trực tiếp", "Chi phí"] as const;

// NFC: Seller Centre xuất vài tiêu đề ở dạng tổ hợp (vd "ID chiến dịch") — không chuẩn hoá thì không khớp tên cột.
const cell = (v: unknown) => String(v ?? "").trim().normalize("NFC");
const isRunning = (status: string) => /đang diễn ra|ongoing/i.test(status);
export const shopeeAdsRunning = isRunning;

/** "01/09/2026" → "2026-09-01". */
function dmy(s: string): string | null {
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function monthEnd(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${iso.slice(0, 7)}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const SEQ = ["Sequence", "Thứ tự"];
const EXPENSE = ["Expense", "Chi phí"];

interface AdsTable {
  meta: Record<string, string>;
  header: string[];
  records: Record<string, unknown>[];
  periodStart: string;
  periodEnd: string;
}

/** Đọc phần đầu (thông tin shop, kỳ) + bảng; chặn kỳ không trọn một tháng. `headerMap` đổi tên cột (Livestream Ads tiếng Việt). */
function readAdsTable(rows: unknown[][], headerMap: Record<string, string> = {}): AdsTable | null {
  const meta: Record<string, string> = {};
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const first = cell(rows[i]?.[0]);
    if (SEQ.includes(first) && rows[i].some((c) => EXPENSE.includes(cell(c)))) {
      headerIdx = i;
      break;
    }
    if (META_KEYS[first]) meta[META_KEYS[first]] = cell(rows[i][1]);
  }
  if (headerIdx < 0) return null;
  const header = rows[headerIdx].map((c) => {
    const h = cell(c);
    return headerMap[h] ?? h;
  });
  const [a, b] = (meta.period ?? "").split(/\s+-\s+/);
  const periodStart = a ? dmy(a) : null;
  const periodEnd = b ? dmy(b) : null;
  if (!periodStart || !periodEnd) throw new Error('Không đọc được dòng "Khoảng thời gian" của file Ads Shopee.');
  if (periodStart.slice(0, 7) !== periodEnd.slice(0, 7) || !periodStart.endsWith("-01")) {
    throw new Error(`File Ads Shopee phải là MỘT tháng, từ ngày 1 (file đang là ${a} – ${b}). Chọn lại kỳ khi xuất file.`);
  }
  if (periodEnd > monthEnd(periodStart)) throw new Error("Kỳ của file Ads Shopee vượt quá cuối tháng.");
  const records: Record<string, unknown>[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    if (!r || r.every((c) => cell(c) === "")) continue;
    const rec: Record<string, unknown> = {};
    header.forEach((h, i) => {
      if (h) rec[h] = r[i] ?? "";
    });
    records.push(rec);
  }
  return { meta, header, records, periodStart, periodEnd };
}

function toParsed(t: AdsTable): ParsedDataRawImport {
  return {
    periodLabel: [t.meta.shopName, t.meta.shopId ? `Shop ID ${t.meta.shopId}` : ""].filter(Boolean).join(" · ") || undefined,
    periodStart: t.periodStart,
    periodEnd: t.periodEnd,
    summary: { shopName: t.meta.shopName ?? null, shopId: t.meta.shopId ?? null, createdAt: t.meta.createdAt ?? null },
    columns: t.header.filter(Boolean).map((h) => ({ key: h, label: h })),
    rows: t.records
  };
}

function needColumns(header: string[], cols: readonly string[]) {
  const missing = cols.filter((c) => !header.includes(c));
  if (missing.length) throw new Error(`File Ads Shopee thiếu cột: ${missing.join(", ")}.`);
}

/** Nhận loại file Ads theo tên cột (không dựa vào tên file). null = không phải 1 trong 3 file Ads Shopee. */
export function detectShopeeAdsKind(rows: unknown[][]): ShopeeAdsKind | null {
  for (const r of rows) {
    const first = cell(r?.[0]);
    if (!SEQ.includes(first)) continue;
    const h = r.map(cell);
    if (!h.some((c) => EXPENSE.includes(c))) continue;
    if (h.includes("Mã sản phẩm")) return "shopee_product_ads";
    if (h.includes("Từ khóa")) return "shopee_shop_ads";
    if (h.includes("Campaign Name") || h.includes("Tên chiến dịch")) return "shopee_ads";
  }
  return null;
}

export function parseShopeeAdsRows(rows: unknown[][]): ParsedDataRawImport {
  const t = readAdsTable(rows, VI_LIVE_HEADERS);
  if (!/Shopee/i.test(cell(rows[0]?.[0])) || !t) {
    throw new Error('Không phải file "Shopee Live Ads Report" (Livestream Ads) — tải ở Quảng cáo Shopee → Quảng cáo Livestream → Xuất dữ liệu.');
  }
  needColumns(t.header, LIVE_COLS);
  for (const rec of t.records) {
    const gmv = shopeeNum(rec.GMV);
    const expense = shopeeNum(rec.Expense);
    const roas = shopeeNum(rec.ROAS);
    // ROAS trong file làm tròn 2 số lẻ ⇒ với ROAS nhỏ (0,05) sai số tuyệt đối cho phép 0,011.
    if (expense > 0 && roas > 0 && Math.abs(gmv / expense - roas) > Math.max(0.011, roas * 0.02)) {
      throw new Error(
        `Chiến dịch "${cell(rec["Campaign Name"])}": ROAS ghi ${roas} nhưng GMV ÷ chi phí = ${(gmv / expense).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} — file có thể đã bị đổi định dạng số (dấu chấm/phẩy). Tải lại file gốc từ Shopee, đừng mở-lưu bằng Excel.`
      );
    }
  }
  if (t.records.length === 0) throw new Error("File Ads Shopee không có chiến dịch nào.");
  return toParsed(t);
}

/** Cả hai file tiếng Việt cùng khuôn: kiểm cột, ROAS ≈ doanh số ÷ chi phí (cột "ROAS" của file làm tròn 2 số lẻ). */
function parseVnAds(rows: unknown[][], cols: readonly string[], what: string): ParsedDataRawImport {
  const t = readAdsTable(rows);
  if (!t) throw new Error(`Không phải file ${what} của Shopee (không thấy dòng tiêu đề cột).`);
  needColumns(t.header, cols);
  for (const rec of t.records) {
    const gmv = shopeeNum(rec["Doanh số"]);
    const expense = shopeeNum(rec["Chi phí"]);
    const roas = shopeeNum(rec.ROAS);
    if (expense > 0 && roas > 0 && Math.abs(gmv / expense - roas) > Math.max(0.011, roas * 0.02)) {
      throw new Error(`"${cell(rec["Tên Dịch vụ Hiển thị"])}": ROAS ghi ${roas} nhưng Doanh số ÷ Chi phí = ${(gmv / expense).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} — file có thể đã bị đổi định dạng số. Tải lại file gốc từ Shopee, đừng mở-lưu bằng Excel.`);
    }
  }
  if (t.records.length === 0) throw new Error(`File ${what} không có dòng nào.`);
  return toParsed(t);
}

export const parseShopeeShopAdsRows = (rows: unknown[][]) => parseVnAds(rows, SHOP_COLS, "Shop+ Ads");
export const parseShopeeProductAdsRows = (rows: unknown[][]) => parseVnAds(rows, PRODUCT_COLS, "Product Ads");

export function readShopeeAdsCampaigns(rows: Record<string, unknown>[]): ShopeeAdsCampaign[] {
  return rows.map((r) => {
    const expense = shopeeNum(r.Expense);
    const gmv = shopeeNum(r.GMV);
    return {
      name: cell(r["Campaign Name"]),
      id: cell(r["Campaign ID"]),
      status: cell(r.Status),
      objective: cell(r.Objective),
      budget: shopeeNum(r.Budget),
      views: shopeeNum(r.Views),
      orders: shopeeNum(r.Orders),
      conversionPct: shopeeNum(r["Conversion Rate"]),
      gmv,
      expense,
      roas: expense > 0 ? gmv / expense : null
    };
  });
}

export function shopeeAdsStats(rows: Record<string, unknown>[], summary?: Record<string, unknown> | null): ShopeeAdsStats {
  const campaigns = readShopeeAdsCampaigns(rows);
  const expense = campaigns.reduce((s, c) => s + c.expense, 0);
  const gmv = campaigns.reduce((s, c) => s + c.gmv, 0);
  const orders = campaigns.reduce((s, c) => s + c.orders, 0);
  return {
    shopName: (summary?.shopName as string | null | undefined) ?? null,
    shopId: (summary?.shopId as string | null | undefined) ?? null,
    campaigns,
    expense,
    gmv,
    orders,
    views: campaigns.reduce((s, c) => s + c.views, 0),
    roas: expense > 0 ? gmv / expense : null,
    costPerOrder: orders > 0 ? expense / orders : null
  };
}

const group = <T extends { expense: number; gmv: number; gmvDirect: number; conversions: number; views: number; clicks: number }>(rows: T[]): ShopeeAdsGroup<T> => ({
  rows,
  expense: rows.reduce((s, r) => s + r.expense, 0),
  gmv: rows.reduce((s, r) => s + r.gmv, 0),
  gmvDirect: rows.reduce((s, r) => s + r.gmvDirect, 0),
  conversions: rows.reduce((s, r) => s + r.conversions, 0),
  views: rows.reduce((s, r) => s + r.views, 0),
  clicks: rows.reduce((s, r) => s + r.clicks, 0)
});

/** "21/10/2026 00:00:00" → "21/10"; "Không giới hạn" giữ nguyên. */
const shortDate = (v: unknown) => {
  const m = cell(v).match(/^(\d{2})\/(\d{2})\//);
  return m ? `${m[1]}/${m[2]}` : cell(v);
};

export function readShopeeSearchAds(rows: Record<string, unknown>[]): ShopeeSearchAd[] {
  return rows.map((r) => ({
    name: cell(r["Tên Dịch vụ Hiển thị"]),
    status: cell(r["Trạng thái"]),
    bidding: cell(r["Phương thức đấu thầu"]),
    keyword: cell(r["Từ khóa"]),
    startDate: shortDate(r["Ngày bắt đầu"]),
    views: shopeeNum(r["Số lượt xem"]),
    clicks: shopeeNum(r["Số lượt click"]),
    conversions: shopeeNum(r["Lượt chuyển đổi"]),
    directConversions: shopeeNum(r["Lượt chuyển đổi trực tiếp"]),
    itemsSold: shopeeNum(r["Sản phẩm đã bán"]),
    gmv: shopeeNum(r["Doanh số"]),
    gmvDirect: shopeeNum(r["Doanh số trực tiếp"]),
    expense: shopeeNum(r["Chi phí"])
  }));
}

export function readShopeeProductAds(rows: Record<string, unknown>[]): ShopeeProductAd[] {
  return rows.map((r) => ({
    name: cell(r["Tên Dịch vụ Hiển thị"]),
    status: cell(r["Trạng thái"]),
    productId: cell(r["Mã sản phẩm"]),
    bidding: cell(r["Phương thức đấu thầu"]),
    startDate: shortDate(r["Ngày bắt đầu"]),
    views: shopeeNum(r["Số lượt xem"]),
    clicks: shopeeNum(r["Số lượt click"]),
    addToCart: shopeeNum(r["Thêm vào giỏ hàng"]),
    conversions: shopeeNum(r["Lượt chuyển đổi"]),
    directConversions: shopeeNum(r["Lượt chuyển đổi trực tiếp"]),
    itemsSold: shopeeNum(r["Sản phẩm đã bán"]),
    gmv: shopeeNum(r["Doanh số"]),
    gmvDirect: shopeeNum(r["Doanh số trực tiếp"]),
    expense: shopeeNum(r["Chi phí"])
  }));
}

export const shopeeSearchAdsGroup = (rows: Record<string, unknown>[]) => group(readShopeeSearchAds(rows));
export const shopeeProductAdsGroup = (rows: Record<string, unknown>[]) => group(readShopeeProductAds(rows));

export const hasShopeeAds = (a: ShopeeAdsSuite | null | undefined): boolean => !!a && (!!a.live || !!a.shop || !!a.product);

/**
 * Tổng 3 loại. Doanh số của Shop+ và Product Ads có thể trùng đơn (một đơn được nhiều quảng cáo cùng nhận công) nên luôn trả
 * thêm ROAS đơn trực tiếp để so thận trọng; Livestream Ads không có cột trực tiếp ⇒ tính cả GMV của nó vào số trực tiếp.
 */
export function shopeeAdsTotals(a: ShopeeAdsSuite): ShopeeAdsTotals {
  const expense = (a.live?.expense ?? 0) + (a.shop?.expense ?? 0) + (a.product?.expense ?? 0);
  const gmv = (a.live?.gmv ?? 0) + (a.shop?.gmv ?? 0) + (a.product?.gmv ?? 0);
  const gmvDirect = (a.live?.gmv ?? 0) + (a.shop?.gmvDirect ?? 0) + (a.product?.gmvDirect ?? 0);
  const conversions = (a.live?.orders ?? 0) + (a.shop?.conversions ?? 0) + (a.product?.conversions ?? 0);
  return {
    expense,
    gmv,
    gmvDirect,
    conversions,
    roas: expense > 0 ? gmv / expense : null,
    roasDirect: expense > 0 ? gmvDirect / expense : null,
    acos: gmv > 0 ? (expense / gmv) * 100 : null,
    costPerConversion: conversions > 0 ? expense / conversions : null
  };
}
