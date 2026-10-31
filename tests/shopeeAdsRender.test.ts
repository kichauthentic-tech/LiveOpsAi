// Trang Quảng cáo Report Shopee với 3 file Franklin T10 (SSR): không NaN/undefined, có số và tiêu đề đúng.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { buildShopeeSnapshot } = await import("../src/lib/report/shopeeSnapshot");
const { parseCsvRows } = await import("../src/lib/dataraw/shopeeFiles");
const A = await import("../src/lib/dataraw/shopeeAds");
const { ShopeeMonthlyReportTabs } = await import("../src/components/brand-workspace/ShopeeMonthlyReportTabs");
const { ToastProvider } = await import("../src/hooks/useToast");

const read = (f: string) => parseCsvRows(readFileSync(new URL(`./fixtures/shopee-ads/${f}`, import.meta.url), "utf-8"));
const live = A.parseShopeeAdsRows(read("franklin-t10-live.csv"));
const full: import("../src/lib/dataraw/shopeeAds").ShopeeAdsSuite = {
  live: A.shopeeAdsStats(live.rows, live.summary),
  shop: A.shopeeSearchAdsGroup(A.parseShopeeShopAdsRows(read("franklin-t10-shop.csv")).rows),
  product: A.shopeeProductAdsGroup(A.parseShopeeProductAdsRows(read("franklin-t10-product.csv")).rows)
};

const snap = (adsSuite: typeof full | null, ads = adsSuite?.live ?? null) =>
  buildShopeeSnapshot({
    brandId: "franklin", month: "2026-10", sessions: [], streams: [], days: [], products: [], overview: null,
    files: { live: false, daily: false, products: false, overview: false }, prev: null, stamps: [], ads, adsSuite
  });
const render = (s: ReturnType<typeof snap>, canManage = true) =>
  renderToStaticMarkup(
    React.createElement(ToastProvider, null, React.createElement(ShopeeMonthlyReportTabs, { brandId: "franklin", brandName: "Franklin", month: "2026-10", snapshot: s, report: null, canManage, onReportChange: () => {}, liveSessions: [], scope: { ads: true, affiliate: false, inhouseLive: false } }))
  );

describe("trang Quảng cáo Shopee — 3 loại Ads", () => {
  test("đủ 3 file: số, tiêu đề, tab, bảng sản phẩm", () => {
    const html = render(snap(full));
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(html).toContain("Livestream Ads chiếm 20% chi phí");
    expect(html).toContain("31,6M");
    expect(html).toContain("Shop+ Ads");
    expect(html).toContain("Product Ads");
    expect(html).toContain("Chi phí và doanh số theo loại Ads");
  });
  test("bản chụp chỉ có Livestream Ads: vẫn vẽ trang cũ + nhắc ops tải 2 file còn lại", () => {
    const only = { live: full.live, shop: null, product: null };
    const html = render(snap(only));
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(html).toContain("Shop+ Ads, Product Ads");
  });
  test("brand không thấy lời nhắc thiếu file", () => {
    const html = render(snap({ live: full.live, shop: null, product: null }), false);
    expect(html).not.toContain("Shop+ Ads, Product Ads");
  });
});
