// 3 file Ads Shopee (31/10, Franklin whole shop, T10): Livestream Ads (cột tiếng Việt), Shop+ Ads, Product Ads. Mẫu = file thật.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseCsvRows } from "../src/lib/dataraw/shopeeFiles";
import {
  detectShopeeAdsKind, hasShopeeAds, parseShopeeAdsRows, parseShopeeProductAdsRows, parseShopeeShopAdsRows,
  shopeeAdsStats, shopeeAdsTotals, shopeeProductAdsGroup, shopeeSearchAdsGroup, type ShopeeAdsSuite
} from "../src/lib/dataraw/shopeeAds";
import { analyzeShopeeAds, shopeeAdsHeadline, shopeeAdsSuiteBlocks, shortAdName } from "../src/lib/report/shopeeAdsInsight";

const read = (f: string) => parseCsvRows(readFileSync(new URL(`./fixtures/shopee-ads/${f}`, import.meta.url), "utf-8"));
const LIVE = read("franklin-t10-live.csv");
const SHOP = read("franklin-t10-shop.csv");
const PROD = read("franklin-t10-product.csv");

function suite(): ShopeeAdsSuite {
  const live = parseShopeeAdsRows(LIVE);
  return {
    live: shopeeAdsStats(live.rows, live.summary),
    shop: shopeeSearchAdsGroup(parseShopeeShopAdsRows(SHOP).rows),
    product: shopeeProductAdsGroup(parseShopeeProductAdsRows(PROD).rows)
  };
}

describe("nhận loại file Ads Shopee", () => {
  test("3 file Franklin nhận đúng loại, file tiếng Anh cũ vẫn là Livestream Ads", () => {
    expect(detectShopeeAdsKind(LIVE)).toBe("shopee_ads");
    expect(detectShopeeAdsKind(SHOP)).toBe("shopee_shop_ads");
    expect(detectShopeeAdsKind(PROD)).toBe("shopee_product_ads");
    expect(detectShopeeAdsKind(parseCsvRows("Shopee Live Ads Report - Shopee Vietnam\nSequence,Campaign Name,Expense\n1,A,1"))).toBe("shopee_ads");
    expect(detectShopeeAdsKind(parseCsvRows("a,b\n1,2"))).toBeNull();
  });
  test("kỳ T10 và tên shop", () => {
    for (const rows of [parseShopeeAdsRows(LIVE), parseShopeeShopAdsRows(SHOP), parseShopeeProductAdsRows(PROD)]) {
      expect(rows.periodStart).toBe("2026-10-01");
      expect(rows.periodEnd).toBe("2026-10-31");
      expect(rows.periodLabel).toContain("Franklin Pickleball Vietnam");
    }
  });
  test("file Shop+ đưa vào parser Livestream bị từ chối rõ ràng", () => {
    expect(() => parseShopeeAdsRows(SHOP)).toThrow(/thiếu cột/);
  });
});

describe("số khớp file", () => {
  const s = suite();
  test("Livestream Ads: ROAS nhỏ (0,05) không bị coi là lệch, chi 6,36M", () => {
    expect(s.live!.campaigns).toHaveLength(3);
    expect(s.live!.expense).toBe(6_364_686);
    expect(s.live!.gmv).toBe(1_579_000);
    expect(s.live!.campaigns[0]).toMatchObject({ name: "Views", status: "Tạm dừng", views: 52066 });
  });
  test("Shop+ và Product Ads", () => {
    expect(s.shop!.expense).toBe(5_479_100);
    expect(s.shop!.gmvDirect).toBe(86_092_275);
    expect(s.product!.rows).toHaveLength(23);
    expect(s.product!.expense).toBe(19_729_415);
    expect(s.product!.gmv).toBe(242_330_370);
    expect(s.product!.conversions).toBe(178);
  });
  test("tổng: ROAS 10,6x, trực tiếp 6,7x, 250 lượt chuyển đổi", () => {
    const t = shopeeAdsTotals(s);
    expect(t.expense).toBe(31_573_201);
    expect(t.gmv).toBe(334_530_896);
    expect(t.roas).toBeCloseTo(10.6, 1);
    expect(t.roasDirect).toBeCloseTo(6.7, 1);
    expect(t.conversions).toBe(250);
    expect(t.acos).toBeCloseTo(9.4, 1);
    expect(hasShopeeAds(s)).toBe(true);
    expect(hasShopeeAds({ live: null, shop: null, product: null })).toBe(false);
  });
});

describe("phân tích", () => {
  const z = analyzeShopeeAds(suite());
  test("Livestream Ads chi nhiều, doanh số ít; chiến dịch Views kéo xuống", () => {
    const live = z.types.find((t) => t.kind === "shopee_ads")!;
    expect(live.expenseShare).toBeCloseTo(20.2, 0);
    expect(live.gmvShare).toBeLessThan(1);
    expect(z.liveDrag).toMatchObject({ name: "Views" });
    expect(z.liveDrag!.shareOfLive).toBeGreaterThan(90);
    expect(z.liveLoss).toBe(6_364_686 - 1_579_000);
  });
  test("Shop+ thủ công gấp đôi tự động", () => {
    expect(z.searchManual!.roas!).toBeGreaterThan(z.searchAuto!.roas! * 1.9);
  });
  test("Product Ads: đang chạy 4 sản phẩm ROAS cao hơn tạm dừng; 11 sản phẩm không ra doanh số", () => {
    expect(z.productRunning!.count).toBe(4);
    expect(z.productRunning!.roas!).toBeGreaterThan(18);
    expect(z.productPaused!.count).toBe(19);
    expect(z.noSales).toMatchObject({ count: 11 });
    expect(z.noSales.expense).toBe(1_552_752);
    expect(z.strong.every((p) => p.running && p.roas! >= 10)).toBe(true);
    expect(z.weak.every((p) => p.roas! < 7 && p.expense >= 400_000)).toBe(true);
  });
  test("tiêu đề + 4 khối Insight nêu đúng ý", () => {
    expect(shopeeAdsHeadline(suite())).toMatch(/Livestream Ads chiếm 20% chi phí/);
    const b = shopeeAdsSuiteBlocks(suite());
    expect(b.observe).toMatch(/3 loại Ads/);
    expect(b.cause).toMatch(/"Views"/);
    expect(b.impact).toMatch(/11 sản phẩm/);
    expect(b.advise).toMatch(/Dừng hoặc đổi mục tiêu/);
    expect(b.advise).toMatch(/trực tiếp/);
  });
  test("chỉ có 1 loại thì vẫn ra Insight, không văng lỗi", () => {
    const only = { live: null, shop: suite().shop, product: null };
    expect(shopeeAdsSuiteBlocks(only).observe).toMatch(/1 loại Ads/);
  });
  test("tên sản phẩm dài rút gọn ở ranh giới", () => {
    expect(shortAdName("Vợt Pickleball Franklin C45 Tết Con Ngựa 16mm Chính Hãng – Carbon Fiber")).toBe("Vợt Pickleball Franklin C45 Tết Con Ngựa…");
    expect(shortAdName("Áo Thể Thao Franklin Chính Hãng Nam Nữ | Athletic Fit | Đen/Xám")).toBe("Áo Thể Thao Franklin · Đen/Xám");
  });
});
