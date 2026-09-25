import { DataRawColumn } from "../../types";

// Tổng hợp SẴN file product_list ngay lúc upload (2026-09-25) — Report Tháng/SKU Showcase chỉ cần 4
// cột (tên, GMV, GMV LIVE, đơn) + tổng "GMV thẻ sản phẩm", nhưng trước đây mỗi lần mở report đều tải
// lại NGUYÊN dòng 175 cột (~5,3 MB/tháng, đo thật CROCS) rồi mới cộng — và PostgREST cắt ở 1.000 dòng
// nên file 1.080–1.181 dòng bị mất SKU âm thầm. Giờ tính 1 lần trên máy người upload (file đang nằm
// sẵn trong bộ nhớ, không tốn egress) rồi lưu vào `brand_dataraw_imports.summary.productAgg`.
//
// File này THUẦN (không import supabase) để parser upload dùng được mà không kéo client DB theo.
// Đổi công thức/cách làm sạch tên ở đây ⇒ TĂNG PRODUCT_AGG_VERSION: bản tổng hợp cũ lệch version sẽ
// bị bỏ qua và tính lại từ dòng gốc (monthlyProductSlice.fetchProductListAgg).

// v2 (2026-09-26): thêm đơn SKU, số món bán, lượt hiển thị + lượt click sản phẩm (phễu TỔNG của SKU — khối
// cột đầu tiên, đúng số deck report Crocs dùng: 32.503 / 1.181.278 = CTR 2,75%) cho bảng Top SKU có phễu.
export const PRODUCT_AGG_VERSION = 2;

/** [tên đã làm sạch, GMV, GMV LIVE của người bán, đơn hàng, đơn SKU, số món bán, lượt hiển thị SP, lượt
 *  click SP] — mảng thay vì object cho gọn JSON (vài trăm SKU × 8 khoá lặp lại là phần lớn dung lượng).
 *  Thêm cột thì NỐI VÀO CUỐI — chỗ khác destructure 4 phần tử đầu. */
export type ProductAggSku = [string, number, number, number, number, number, number, number];

export interface ProductListAgg {
  v: number;
  skus: ProductAggSku[];
  cardGmv: number;
  /** false = file không có cột tên/GMV (sai loại report hoặc TikTok đổi tên cột) — khác "0 SKU". */
  hasSkuCols: boolean;
  hasCardCol: boolean;
  rowCount: number;
}

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

export function findCol(columns: DataRawColumn[], pattern: RegExp): string | undefined {
  return columns.find((c) => pattern.test(c.label.trim()))?.key;
}

// Brief Module 3: rút gọn tên sản phẩm để hiển thị gọn trong bảng/chart Top SKU — bỏ tag ngoặc
// vuông kiểu marketing (vd "[SẢN PHẨM ĐỘC QUYỀN ONLINE]", áp dụng chung mọi brand vì TikTok Shop
// hay chèn tag dạng này) và bỏ prefix danh mục lặp lại đầu tên riêng của Crocs (no-op với brand
// khác, không match thì giữ nguyên tên gốc).
export function cleanProductName(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/^Giày Clog (Nữ|Unisex)\s+Crocs\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildProductListAgg(columns: DataRawColumn[], rows: Record<string, unknown>[]): ProductListAgg {
  const c = {
    // Song ngữ — neo ^...$ vì "Seller LIVE GMV" ≠ "Seller LIVE-attributed GMV" ≠ "Seller LIVE
    // indirect GMV", và "Orders" ≠ "SKU orders".
    name: findCol(columns, /^(?:Tên|Product Name)$/i),
    gmv: findCol(columns, /^GMV$/i),
    gmvLive: findCol(columns, /^(?:GMV LIVE của người bán|Seller LIVE GMV)$/i),
    orders: findCol(columns, /^(?:Đơn hàng|Orders)$/i),
    // Tên cột lặp lại theo từng khối (tổng / LIVE người bán / video / nhà sáng tạo / thẻ SP) — findCol lấy
    // cột ĐẦU TIÊN = khối tổng của SKU.
    skuOrders: findCol(columns, /^(?:Đơn hàng SKU|SKU orders)$/i),
    itemsSold: findCol(columns, /^(?:Số món bán ra|Items sold)$/i),
    impressions: findCol(columns, /^(?:Lượt hiển thị sản phẩm|Product impressions)$/i),
    clicks: findCol(columns, /^(?:Lượt nhấp vào sản phẩm|Product clicks)$/i),
    card: findCol(columns, /^(?:GMV thẻ sản phẩm của người bán|Seller product card GMV)$/i)
  };

  let cardGmv = 0;
  if (c.card) for (const raw of rows) cardGmv += num(raw[c.card]);

  // product_list có nhiều dòng trùng "Tên" (mỗi biến thể/ID sản phẩm tách dòng riêng dù cùng tên
  // hiển thị) — PHẢI gộp theo tên rồi cộng dồn GMV trước khi xếp hạng, nếu không thứ hạng Top SKU
  // sẽ sai (1 sản phẩm bán chạy bị chia lẻ GMV qua nhiều dòng, tụt hạng so với thực tế).
  const byName = new Map<string, ProductAggSku>();
  if (c.name && c.gmv) {
    for (const raw of rows) {
      const name = cleanProductName(String(raw[c.name] ?? ""));
      if (!name) continue;
      const cur = byName.get(name) ?? [name, 0, 0, 0, 0, 0, 0, 0];
      cur[1] += num(raw[c.gmv]);
      cur[2] += num(c.gmvLive && raw[c.gmvLive]);
      cur[3] += num(c.orders && raw[c.orders]);
      cur[4] += num(c.skuOrders && raw[c.skuOrders]);
      cur[5] += num(c.itemsSold && raw[c.itemsSold]);
      cur[6] += num(c.impressions && raw[c.impressions]);
      cur[7] += num(c.clicks && raw[c.clicks]);
      byName.set(name, cur);
    }
  }

  return {
    v: PRODUCT_AGG_VERSION,
    // Giữ cả SKU bán 0đ: SKU Showcase phân biệt "khớp tên, 0 đơn" với "không khớp được tên" (gợi ý
    // ops đổi tên) — bỏ dòng 0 thì SKU bán ế bị báo nhầm thành lỗi đặt tên.
    skus: [...byName.values()],
    cardGmv,
    hasSkuCols: !!(c.name && c.gmv),
    hasCardCol: !!c.card,
    rowCount: rows.length
  };
}

export function isCurrentProductAgg(v: unknown): v is ProductListAgg {
  return !!v && typeof v === "object" && (v as ProductListAgg).v === PRODUCT_AGG_VERSION && Array.isArray((v as ProductListAgg).skus);
}
