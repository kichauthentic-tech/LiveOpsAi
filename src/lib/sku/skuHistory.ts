import { cleanProductName, type ProductListAgg } from "../dataraw/productListAgg";
import { shopeeNum } from "../dataraw/shopeeFiles";

// Danh mục SKU dựng từ các file Sản Phẩm ĐÃ TẢI (TikTok product_list, Shopee shopee_product_list). Mỗi sàn một danh sách
// riêng — GMV TikTok và Sales Shopee không bao giờ cộng chung. File Sản Phẩm là tổng cả kỳ, không cắt theo ngày được, nên
// cột thời gian là KỲ của từng file (thường = 1 tháng; file phủ nhiều tháng như FUJIWA 04/05–31/10 là một kỳ riêng, không
// chia nhỏ ra tháng để khỏi bịa số).

export type SkuPlatform = "TikTok" | "Shopee";

export interface SkuPeriod {
  key: string; // "2026-10-01~2026-10-29"
  start: string;
  end: string;
}

/** Hiệu suất 1 SKU trong 1 kỳ file. `sales` = GMV (TikTok) hoặc Sales đặt hàng (Shopee). */
export interface SkuPeriodPerf {
  sales: number;
  /** Phần bán trong LIVE: TikTok = "GMV LIVE của người bán"; Shopee = bằng sales (file Product List của Shopee Live chỉ có hàng bán trong live). */
  live: number;
  orders: number;
  items: number;
  /** Lượt hiển thị SP — chỉ TikTok có. */
  impressions?: number;
  clicks: number;
  /** Thêm vào giỏ — chỉ Shopee có. */
  atc?: number;
}

export interface SkuHistoryRow {
  platform: SkuPlatform;
  name: string;
  /** Khoá khớp với brand_skus.name (chữ thường). */
  key: string;
  perPeriod: Record<string, SkuPeriodPerf>;
  totalSales: number;
  totalOrders: number;
  /** Giá bán thực tế TB kỳ gần nhất có bán (sales / số món) — không phải giá niêm yết. */
  avgPrice: number;
}

export interface SkuHistory {
  platform: SkuPlatform;
  periods: SkuPeriod[]; // cũ → mới
  rows: SkuHistoryRow[]; // đã xếp theo totalSales giảm dần
}

export const skuKey = (name: string) => cleanProductName(name).toLowerCase();

export interface PeriodInput {
  period: SkuPeriod;
  /** Tên đã làm sạch (cleanProductName), mỗi tên một dòng trong kỳ. */
  items: { name: string; perf: SkuPeriodPerf }[];
}

export function periodKey(start: string, end: string): SkuPeriod {
  return { key: `${start}~${end}`, start, end };
}

export function tiktokPeriodInput(period: SkuPeriod, agg: ProductListAgg): PeriodInput {
  return {
    period,
    items: agg.skus.map(([name, gmv, gmvLive, orders, skuOrders, itemsSold, impressions, clicks]) => ({
      name,
      perf: { sales: gmv, live: gmvLive, orders: skuOrders || orders, items: itemsSold, impressions, clicks }
    }))
  };
}

export function shopeePeriodInput(period: SkuPeriod, rows: Record<string, unknown>[]): PeriodInput {
  const byName = new Map<string, SkuPeriodPerf>();
  for (const r of rows) {
    const name = cleanProductName(String(r["Product(s)"] ?? ""));
    if (!name) continue;
    const cur = byName.get(name) ?? { sales: 0, live: 0, orders: 0, items: 0, clicks: 0, atc: 0 };
    cur.sales += shopeeNum(r["Sales(Placed Order)"]);
    cur.live = cur.sales;
    cur.orders += shopeeNum(r["Orders(Placed Order)"]);
    cur.items += shopeeNum(r["Items Sold(Placed Order)"]);
    cur.clicks += shopeeNum(r["Product Clicks"]);
    cur.atc = (cur.atc ?? 0) + shopeeNum(r["ATC"]);
    byName.set(name, cur);
  }
  return { period, items: [...byName].map(([name, perf]) => ({ name, perf })) };
}

/** Gộp các kỳ file của một sàn thành danh mục. Giữ CẢ SKU chưa có đơn (file TikTok liệt kê mọi hàng đang niêm yết, CROCS ~1.000/kỳ) —
 *  bên gọi lọc theo `soldState`/`totalSales`. */
export function buildSkuHistory(platform: SkuPlatform, inputs: PeriodInput[]): SkuHistory {
  const sorted = [...inputs].sort((a, b) => a.period.start.localeCompare(b.period.start));
  const rows = new Map<string, SkuHistoryRow>();
  for (const { period, items } of sorted) {
    for (const { name, perf } of items) {
      const key = skuKey(name);
      if (!key) continue;
      const row = rows.get(key) ?? { platform, name, key, perPeriod: {}, totalSales: 0, totalOrders: 0, avgPrice: 0 };
      const prev = row.perPeriod[period.key];
      row.perPeriod[period.key] = prev
        ? {
            sales: prev.sales + perf.sales,
            live: prev.live + perf.live,
            orders: prev.orders + perf.orders,
            items: prev.items + perf.items,
            impressions: (prev.impressions ?? 0) + (perf.impressions ?? 0),
            clicks: prev.clicks + perf.clicks,
            atc: (prev.atc ?? 0) + (perf.atc ?? 0)
          }
        : perf;
      rows.set(key, row);
    }
  }
  const out: SkuHistoryRow[] = [];
  for (const row of rows.values()) {
    const periods = Object.values(row.perPeriod);
    row.totalSales = periods.reduce((a, p) => a + p.sales, 0);
    row.totalOrders = periods.reduce((a, p) => a + p.orders, 0);
    for (const { period } of [...sorted].reverse()) {
      const p = row.perPeriod[period.key];
      if (p && p.sales > 0 && p.items > 0) {
        row.avgPrice = Math.round(p.sales / p.items);
        break;
      }
    }
    out.push(row);
  }
  out.sort((a, b) => b.totalSales - a.totalSales);
  return { platform, periods: sorted.map((s) => s.period), rows: out };
}

/** Cộng hiệu suất của một SKU trong các kỳ đã chọn (cùng một sàn). */
export function perfIn(row: SkuHistoryRow | undefined, keys: string[]): SkuPeriodPerf & { present: boolean } {
  const out = { sales: 0, live: 0, orders: 0, items: 0, impressions: 0, clicks: 0, atc: 0, present: false };
  for (const k of keys) {
    const p = row?.perPeriod[k];
    if (!p) continue;
    out.present = true;
    out.sales += p.sales;
    out.live += p.live;
    out.orders += p.orders;
    out.items += p.items;
    out.impressions += p.impressions ?? 0;
    out.clicks += p.clicks;
    out.atc += p.atc ?? 0;
  }
  return out;
}

export type SoldState = "live" | "offlive" | "none";
/** live = có đơn từ live; offlive = chỉ bán ngoài live (thẻ SP/video/…); none = chưa có đơn nào. */
export const soldState = (p: { sales: number; live: number }): SoldState => (p.live > 0 ? "live" : p.sales > 0 ? "offlive" : "none");

/** Số SKU đầu bảng cộng lại đủ 80% doanh số của kỳ (độ tập trung); null nếu kỳ không có doanh số. */
export function skusFor80(rows: SkuHistoryRow[], periodKey: string): number | null {
  const sales = rows.map((r) => r.perPeriod[periodKey]?.sales ?? 0).filter((v) => v > 0).sort((a, b) => b - a);
  const total = sales.reduce((a, v) => a + v, 0);
  let acc = 0;
  for (let i = 0; i < sales.length && total > 0; i++) {
    acc += sales[i];
    if (acc / total >= 0.8) return i + 1;
  }
  return null;
}

/** Nhãn kỳ: file 1 tháng ⇒ "T10"; file phủ nhiều tháng/lệch tháng ⇒ "04/05–31/10". */
export function periodLabel(p: SkuPeriod): string {
  const m = p.start.slice(0, 7);
  const lastDay = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0).getDate();
  if (p.end.slice(0, 7) === m && p.start.slice(8) === "01" && Number(p.end.slice(8)) >= lastDay - 3) return `T${Number(m.slice(5, 7))}`;
  const dm = (d: string) => `${d.slice(8)}/${d.slice(5, 7)}`;
  return `${dm(p.start)}–${dm(p.end)}`;
}
