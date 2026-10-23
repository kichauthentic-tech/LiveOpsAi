import { useEffect, useState } from "react";
import { fetchAdsMonthSlice, fetchOverlappingBatchRows, fetchProductListAggWithPeriod, fetchShopDaysMonthSlice, fetchTopPromotionsMonthSlice, skuRankFromAgg, type AdsMonthSlice, type PromotionMonthSlice, type ShopDayLite, type SkuRankSlice } from "../../../lib/dataraw/monthlyProductSlice";
import { readShopeeDays, type ShopeeDay } from "../../../lib/dataraw/shopeeFiles";
import { fetchAffiliateActuals } from "../../../lib/db/affiliateActuals";
import type { AffiliateActualEntry } from "../../../types";
import { monthEndOf, prevMonthOf } from "../../../lib/performance/ceoBrief";
import { errorMessage } from "../../../lib/errorMessage";
import type { ReportPlatform } from "../../../lib/reportPlatform";
import { profileOf } from "../../../lib/platforms/profiles";

// File brand tải lên ở Dữ Liệu Gốc / Nhập Ads mà tab Brand của Dashboard đọc (22/10/2026): mọi file chỉ có số theo THÁNG (hoặc theo
// kỳ file), nên chỉ đi theo kỳ ở mức tháng — không cắt được theo đợt/ngày/ca. Đọc qua đúng các hàm Report Tháng dùng (cùng con số).

export interface ShopMonth {
  month: string;
  days: ShopDayLite[];
}

export interface BrandFiles {
  loading: boolean;
  error: string | null;
  /** TikTok: Shop Analytics từng tháng (cũ → mới), tháng không có file bị bỏ. */
  shop: ShopMonth[];
  /** TikTok: SKU tháng đang xem + tháng trước (file Sản Phẩm). */
  sku: SkuRankSlice | null;
  skuPrev: SkuRankSlice | null;
  /** TikTok: file Ads Campaign overview tháng đang xem. */
  ads: AdsMonthSlice | null;
  promo: PromotionMonthSlice | null;
  /** Affiliate (tab Affiliate: kế hoạch + số) của tháng đang xem — creator ngoài, không phải ca agency. */
  affiliate: AffiliateActualEntry[];
  /** Shopee: file theo ngày (Placed / Confirmed Order) tháng đang xem + tháng trước. */
  shopee: ShopeeDay[];
  shopeePrev: ShopeeDay[];
}

const EMPTY: BrandFiles = { loading: false, error: null, shop: [], sku: null, skuPrev: null, ads: null, promo: null, affiliate: [], shopee: [], shopeePrev: [] };
const SHOP_MONTHS = 5;

async function shopeeDaysOf(brandId: string, month: string): Promise<ShopeeDay[]> {
  const a = `${month}-01`, b = monthEndOf(a);
  const { rows, hasAnyBatch } = await fetchOverlappingBatchRows(brandId, "shopee_daily", a, b);
  return hasAnyBatch ? readShopeeDays(rows).filter((d) => d.date >= a && d.date <= b) : [];
}

export function useBrandFiles(brandId: string, platform: ReportPlatform, month: string): BrandFiles {
  // Kết quả gắn với khoá (brand × sàn × tháng): đổi khoá thì tự là "đang đọc", không setState đồng bộ trong effect.
  const key = `${brandId}|${platform}|${month}`;
  const [state, setState] = useState<{ key: string; files: BrandFiles } | null>(null);
  useEffect(() => {
    let alive = true;
    const pm = prevMonthOf(month);
    const range = (m: string): [string, string] => [`${m}-01`, monthEndOf(`${m}-01`)];
    const run = async (): Promise<BrandFiles> => {
      // Sàn không có Shop Analytics (Shopee) đọc file theo ngày của sàn đó.
      if (!profileOf(platform).hasShopAnalytics) {
        const [cur, prev, prev2] = await Promise.all([shopeeDaysOf(brandId, month), shopeeDaysOf(brandId, pm), shopeeDaysOf(brandId, prevMonthOf(pm))]);
        // Tháng đang xem chưa có file theo ngày ⇒ dùng tháng gần nhất có file (tiêu đề in đúng khoảng ngày của file).
        const [shopee, shopeePrev] = cur.length ? [cur, prev] : [prev, prev2];
        return { ...EMPTY, shopee, shopeePrev };
      }
      const months: string[] = [month];
      while (months.length < SHOP_MONTHS) months.unshift(prevMonthOf(months[0]));
      const ppm = prevMonthOf(pm);
      const [shopList, aggCur0, aggPrev0, aggPrev2, ads, promo, affiliate] = await Promise.all([
        Promise.all(months.map(async (m) => ({ month: m, s: await fetchShopDaysMonthSlice(brandId, ...range(m)) }))),
        fetchProductListAggWithPeriod(brandId, ...range(month)),
        fetchProductListAggWithPeriod(brandId, ...range(pm)),
        fetchProductListAggWithPeriod(brandId, ...range(ppm)),
        fetchAdsMonthSlice(brandId, ...range(month)),
        fetchTopPromotionsMonthSlice(brandId, ...range(month)),
        fetchAffiliateActuals(brandId, `${month}-01`).catch(() => [])
      ]);
      // Tháng đang xem chưa có file Sản Phẩm ⇒ dùng file gần nhất trước đó (ghi rõ kỳ file ở tiêu đề bảng), so với file trước nó.
      const [aggCur, aggPrev] = aggCur0 ? [aggCur0, aggPrev0] : [aggPrev0, aggPrev2];
      return {
        ...EMPTY,
        shop: shopList.filter((x) => x.s.hasAnyBatch && x.s.days.length > 0).map((x) => ({ month: x.month, days: x.s.days })),
        sku: aggCur ? skuRankFromAgg(aggCur, 15) : null,
        skuPrev: aggPrev ? skuRankFromAgg(aggPrev, 200) : null,
        ads: ads.hasAnyBatch ? ads : null,
        promo: promo.hasAnyBatch ? promo : null,
        affiliate: affiliate.filter((e) => e.status !== "cancelled")
      };
    };
    run()
      .then((x) => alive && setState({ key, files: x }))
      .catch((e) => alive && setState({ key, files: { ...EMPTY, error: errorMessage(e) } }));
    return () => { alive = false; };
  }, [key, brandId, platform, month]);
  return state?.key === key ? state.files : { ...EMPTY, loading: true };
}
