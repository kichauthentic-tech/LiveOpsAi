import type { LiveSession } from "../../types";
import { fetchOverlappingBatchRows } from "../dataraw/monthlyProductSlice";
import { readShopeeDays, readShopeeOverview, readShopeeProducts, readShopeeStreams } from "../dataraw/shopeeFiles";
import { shopeeAdsStats } from "../dataraw/shopeeAds";
import { fetchDataRawImportStamps } from "../db/brandDataRaw";
import { fetchMonthlyReportSnapshot } from "../db/monthlyReportSnapshots";
import { buildShopeeSnapshot, shopeeStampsFor, type ShopeeHeadline, type ShopeeReportSnapshot } from "./shopeeSnapshot";

// Phần có I/O của bản chụp Report Shopee: đọc 4 loại file Shopee trong kho Dữ Liệu Gốc của tháng + bản chụp Shopee
// tháng trước (để so cùng kỳ), rồi giao cho hàm thuần buildShopeeSnapshot (lib/report/shopeeSnapshot.ts).

function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function buildShopeeReportSnapshot(input: { brandId: string; month: string; sessions: LiveSession[] }): Promise<ShopeeReportSnapshot> {
  const { brandId, month, sessions } = input;
  const start = `${month}-01`;
  const end = `${month}-31`;
  const [live, daily, products, overview, ads, imports, prevStored] = await Promise.all([
    fetchOverlappingBatchRows(brandId, "shopee_live_list", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_daily", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_product_list", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_overview", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_ads", start, end),
    fetchDataRawImportStamps(brandId),
    fetchMonthlyReportSnapshot(brandId, prevMonthOf(month), "Shopee").catch(() => null)
  ]);
  const prev: ShopeeHeadline | null = (prevStored?.snapshot as unknown as ShopeeReportSnapshot | undefined)?.headline ?? null;
  return buildShopeeSnapshot({
    brandId,
    month,
    sessions,
    streams: readShopeeStreams(live.rows).filter((s) => s.date.startsWith(month)),
    days: readShopeeDays(daily.rows).filter((d) => d.date.startsWith(month)),
    products: readShopeeProducts(products.rows),
    overview: overview.hasAnyBatch ? readShopeeOverview(overview.rows) : null,
    files: { live: live.hasAnyBatch, daily: daily.hasAnyBatch, products: products.hasAnyBatch, overview: overview.hasAnyBatch },
    prev,
    ads: ads.hasAnyBatch ? shopeeAdsStats(ads.rows) : null,
    stamps: shopeeStampsFor(imports, month)
  });
}
