import type { LiveSession } from "../../types";
import { fetchOverlappingBatchRows } from "../dataraw/monthlyProductSlice";
import { readShopeeDays, readShopeeOverview, readShopeeProducts, readShopeeStreams } from "../dataraw/shopeeFiles";
import { shopeeAdsStats, shopeeProductAdsGroup, shopeeSearchAdsGroup } from "../dataraw/shopeeAds";
import { SHOPEE_SHOP_KINDS, reconcileShopLive, type ShopeeShopKind } from "../dataraw/shopeeShop";
import { buildShopeeShopSnapshot, shopeeShopMonthOf } from "./shopeeShopReport";
import { fetchDataRawImportStamps } from "../db/brandDataRaw";
import { fetchMonthlyReportSnapshot } from "../db/monthlyReportSnapshots";
import { buildShopeeSnapshot, shopeeStampsFor, type ShopeeHeadline, type ShopeeReportSnapshot } from "./shopeeSnapshot";
import { fetchMonthPlan } from "../db/monthPlans";
import { effectiveCamp } from "../campaignDays";

// Phần có I/O của bản chụp Report Shopee: đọc 4 loại file Shopee trong kho Dữ Liệu Gốc của tháng + bản chụp Shopee
// tháng trước (để so cùng kỳ), rồi giao cho hàm thuần buildShopeeSnapshot (lib/report/shopeeSnapshot.ts).
// Bản 5: thêm Live List + khung camp của 3 tháng trước (trang Key Metrics / Nguyên nhân) và ca Kế Hoạch Tháng có target.

function prevMonthOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const HISTORY_MONTHS = 3;

async function historyMonth(brandId: string, month: string) {
  const [live, plan] = await Promise.all([
    fetchOverlappingBatchRows(brandId, "shopee_live_list", `${month}-01`, `${month}-31`).catch(() => null),
    fetchMonthPlan(brandId, month, "Shopee").catch(() => null)
  ]);
  const streams = live ? readShopeeStreams(live.rows).filter((s) => s.date.startsWith(month)) : [];
  return streams.length > 0 ? { month, streams, campOverrides: effectiveCamp(plan?.plan.campRanges) } : null;
}

export async function buildShopeeReportSnapshot(input: { brandId: string; month: string; sessions: LiveSession[] }): Promise<ShopeeReportSnapshot> {
  const { brandId, month, sessions } = input;
  const start = `${month}-01`;
  const end = `${month}-31`;
  const [live, daily, products, overview, ads, shopAds, productAds, imports, prevStored, plan, shopFiles] = await Promise.all([
    fetchOverlappingBatchRows(brandId, "shopee_live_list", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_daily", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_product_list", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_overview", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_ads", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_shop_ads", start, end),
    fetchOverlappingBatchRows(brandId, "shopee_product_ads", start, end),
    fetchDataRawImportStamps(brandId),
    fetchMonthlyReportSnapshot(brandId, prevMonthOf(month), "Shopee").catch(() => null),
    // Khung camp của Kế Hoạch Tháng Shopee — cùng nguồn với report TikTok (effectiveCamp), không đọc lịch cố định khi đã có kế hoạch.
    fetchMonthPlan(brandId, month, "Shopee").catch(() => null),
    // 5 file cả shop (0193). DB chưa chạy 0193 / brand không tải ⇒ không có batch ⇒ không có phần cả shop.
    Promise.all(SHOPEE_SHOP_KINDS.map((k) => fetchOverlappingBatchRows(brandId, k, start, end).catch(() => null)))
  ]);
  const histMonths: string[] = [];
  for (let m = month, i = 0; i < HISTORY_MONTHS; i++) histMonths.unshift((m = prevMonthOf(m)));
  const prevMonth = prevMonthOf(month);
  const [history, prevProductRows] = await Promise.all([
    Promise.all(histMonths.map((m) => historyMonth(brandId, m))).then((xs) => xs.filter((x): x is NonNullable<typeof x> => x != null)),
    fetchOverlappingBatchRows(brandId, "shopee_product_list", `${prevMonth}-01`, `${prevMonth}-31`).catch(() => null)
  ]);
  const prev: ShopeeHeadline | null = (prevStored?.snapshot as unknown as ShopeeReportSnapshot | undefined)?.headline ?? null;
  const shopRows: Partial<Record<ShopeeShopKind, Record<string, unknown>[]>> = {};
  SHOPEE_SHOP_KINDS.forEach((k, i) => {
    if (shopFiles[i]?.hasAnyBatch) shopRows[k] = shopFiles[i]!.rows;
  });
  const statsImport = imports.find((i) => i.reportType === "shopee_shop_stats" && !!i.periodStart && !!i.periodEnd && i.periodStart <= end && i.periodEnd >= start);
  const dailyDays = readShopeeDays(daily.rows).filter((d) => d.date.startsWith(month));
  const shop = buildShopeeShopSnapshot(shopRows, statsImport ? { start: statsImport.periodStart!, end: statsImport.periodEnd! } : null, []);
  if (shop?.channels && dailyDays.length > 0) {
    const w = reconcileShopLive(shop.channels.live, dailyDays.reduce((a, d) => a + d.salesPlaced, 0));
    if (w) shop.warnings.push(w);
  }
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
    adsSuite: {
      live: ads.hasAnyBatch ? shopeeAdsStats(ads.rows) : null,
      shop: shopAds.hasAnyBatch ? shopeeSearchAdsGroup(shopAds.rows) : null,
      product: productAds.hasAnyBatch ? shopeeProductAdsGroup(productAds.rows) : null
    },
    shop,
    shopPrev: (prevStored?.snapshot as unknown as ShopeeReportSnapshot | undefined)?.shop ?? null,
    // Chuỗi 3 tháng: bản chụp tháng trước giữ phần cả shop của nó + 1 tháng trước nữa ⇒ tháng này giữ tối đa 2 tháng trước.
    shopHistory: (() => {
      const ps = prevStored?.snapshot as unknown as ShopeeReportSnapshot | undefined;
      return [...(ps?.shopHistory ?? []), ...(ps?.shop ? [shopeeShopMonthOf(ps.shop, prevMonth)] : [])].slice(-2);
    })(),
    campOverrides: effectiveCamp(plan?.plan.campRanges),
    history,
    prevProducts: prevProductRows?.hasAnyBatch ? readShopeeProducts(prevProductRows.rows) : null,
    plan: plan ? { targetGmv: plan.plan.targetGmv, locked: plan.plan.status === "locked", slots: plan.slots } : null,
    stamps: shopeeStampsFor(imports, month)
  });
}
