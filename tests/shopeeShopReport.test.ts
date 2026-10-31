// Report Shopee whole shop (bản 7): phần cả shop của bản chụp + 3 trang mới + các khối gắn vào trang cũ. Mẫu = 5 file Franklin T10.
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as XLSX from "xlsx";
import { describe, expect, test, vi } from "vitest";

import type { ShopeeShopKind, ShopeeSheets } from "../src/lib/dataraw/shopeeShop";
import type { ShopeeShopSnapshot } from "../src/lib/report/shopeeShopReport";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { buildShopeeSnapshot } = await import("../src/lib/report/shopeeSnapshot");
const S = await import("../src/lib/dataraw/shopeeShop");
const R = await import("../src/lib/report/shopeeShopReport");
const { ShopeeMonthlyReportTabs } = await import("../src/components/brand-workspace/ShopeeMonthlyReportTabs");
const { ToastProvider } = await import("../src/hooks/useToast");

const dir = new URL("./fixtures/shopee-shop/", import.meta.url);
const FILES: Record<ShopeeShopKind, string> = {
  shopee_shop_stats: "franklin-t10-shop-stats.xlsx",
  shopee_voucher: "franklin-t10-voucher.xlsx",
  shopee_discount: "franklin-t10-discount.xlsx",
  shopee_composition: "franklin-t10-composition.xlsx",
  shopee_shop_products: "producttraffic_Product_Card.20261001_20261030.xlsx"
};
const sheetsOf = (f: string): ShopeeSheets => {
  const wb = XLSX.read(readFileSync(new URL(f, dir)), { type: "buffer" });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
};
const rowsOf = (partial?: ShopeeShopKind[]) =>
  Object.fromEntries((Object.keys(FILES) as ShopeeShopKind[]).filter((k) => !partial || partial.includes(k)).map((k) => [k, S.parseShopeeShopSheets(sheetsOf(FILES[k]), k, FILES[k]).rows]));
const PERIOD = { start: "2026-10-01", end: "2026-10-30" };
const full = R.buildShopeeShopSnapshot(rowsOf(), PERIOD)!;

const snap = (shop: ShopeeShopSnapshot | null, shopPrev: ShopeeShopSnapshot | null = null) =>
  buildShopeeSnapshot({
    brandId: "franklin", month: "2026-10", sessions: [], streams: [], days: [], products: [], overview: null,
    files: { live: false, daily: false, products: false, overview: false }, prev: null, stamps: [], shop, shopPrev
  });
const render = (s: ReturnType<typeof snap>, canManage = true) =>
  renderToStaticMarkup(
    React.createElement(ToastProvider, null, React.createElement(ShopeeMonthlyReportTabs, { brandId: "franklin", brandName: "Franklin", month: "2026-10", snapshot: s, report: null, canManage, onReportChange: () => {}, liveSessions: [], scope: { ads: true, affiliate: false, inhouseLive: false }, showAll: true } as never))
  );

describe("phần cả shop của bản chụp", () => {
  test("số khớp file: Total, kênh, ngày, khuyến mãi, người mua, sản phẩm", () => {
    expect(full.placed).toBe(1193913200);
    expect(full.throughDay).toBe(30);
    expect(full.days).toHaveLength(30);
    expect(full.channels).toMatchObject({ live: 64544176, affiliate: 63392644 });
    expect(full.discount!.types.find((t) => t.type === "Tất cả")!.sales).toBe(923645964);
    expect(full.voucher).toMatchObject({ sales: 626245100, cost: 12081228 });
    expect(full.buyerMix!.groups.find((g) => g.name === "new")!.buyers).toBe(171);
    expect(full.products![0]).toMatchObject({ sales: 657400000, gift: true });
    expect(full).toMatchObject({ buyers: 189, newBuyers: 171, oldBuyers: 18, visits: 42616, cancelOrders: 64 });
    expect(full.files.shopee_voucher).toBe(true);
  });
  test("tách kênh tới hết ngày: 4 kênh cộng đúng Total, LIVE theo ngày khớp tổng", () => {
    const c = R.shopeeShopSplitThrough(full, 30);
    expect(c.shopGmv).toBe(1193913200);
    expect(c.liveLinked).toBe(64544176);
    expect(c.liveLinked + c.affiliate + c.video + c.card).toBeLessThanOrEqual(c.shopGmv + 1);
    expect(R.shopeeShopSplitThrough(full, 9).shopGmv).toBeLessThan(c.shopGmv);
  });
  test("ngày doanh số nhảy: 6 ngày trên 100M chiếm khoảng 63%", () => {
    const sp = R.shopeeShopSpikeDays(full);
    expect(sp.days.length).toBeGreaterThanOrEqual(6);
    expect(sp.share).toBeGreaterThan(0.5);
  });
  test("không có Shop Stats ⇒ không có phần cả shop", () => {
    expect(R.buildShopeeShopSnapshot(rowsOf(["shopee_voucher"]), PERIOD)).toBeNull();
  });
  test("thiếu vài file vẫn dựng, file thiếu là null", () => {
    const part = R.buildShopeeShopSnapshot(rowsOf(["shopee_shop_stats"]), PERIOD)!;
    expect(part.voucher).toBeNull();
    expect(part.buyerMix).toBeNull();
    expect(part.products).toBeNull();
  });
});

describe("so sánh 3 tháng gần nhất", () => {
  const m9 = R.shopeeShopMonthOf(full, "2026-09");
  const m8 = { ...m9, month: "2026-08" };
  test("chuỗi 3 tháng cũ → mới, tháng này ở cuối; < 2 tháng thì rỗng", () => {
    const t = R.shopeeShopTrend(full, "2026-10", [m9, m8]);
    expect(t.map((x) => x.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(R.shopeeShopTrend(full, "2026-10", [])).toEqual([]);
    expect(R.shopeeShopTrend(null, "2026-10", [m9])).toEqual([]);
  });
  test("chỉ giữ tối đa 2 tháng trước, bỏ tháng không trước tháng này", () => {
    const t = R.shopeeShopTrend(full, "2026-10", [{ ...m9, month: "2026-07" }, m8, m9, { ...m9, month: "2026-11" }]);
    expect(t.map((x) => x.month)).toEqual(["2026-08", "2026-09", "2026-10"]);
  });
  test("cùng kỳ: tổng tới ngày d khớp tổng ngày", () => {
    expect(R.shopeeShopMonthThrough(m9, 30).placed).toBe(full.placed);
    expect(R.shopeeShopMonthThrough(m9, 10).placed).toBeLessThan(full.placed);
    expect(m9.voucherSales).toBe(626245100);
  });
  test("report có 5 khối so sánh 3 tháng khi có lịch sử", () => {
    const html = render(snap(full));
    expect(html).not.toContain("Tăng trưởng 3 tháng gần nhất");
    const withHist = buildShopeeSnapshot({ brandId: "franklin", month: "2026-10", sessions: [], streams: [], days: [], products: [], overview: null, files: { live: false, daily: false, products: false, overview: false }, prev: null, stamps: [], shop: full, shopPrev: null, shopHistory: [m8, m9] });
    const h2 = renderToStaticMarkup(React.createElement(ToastProvider, null, React.createElement(ShopeeMonthlyReportTabs, { brandId: "franklin", brandName: "Franklin", month: "2026-10", snapshot: withHist, report: null, canManage: true, onReportChange: () => {}, liveSessions: [], scope: { ads: true, affiliate: false, inhouseLive: false }, showAll: true } as never)));
    for (const t of ["Tăng trưởng 3 tháng gần nhất", "Khách hàng 3 tháng", "Cơ cấu nguồn doanh số 3 tháng", "Khuyến mãi và Voucher 3 tháng"]) expect(h2).toContain(t);
    expect(h2).not.toMatch(/NaN|undefined|Infinity|\[object/);
  });
});

describe("report Shopee có phần cả shop", () => {
  test("đủ 5 file: 3 trang mới có số, hàng quà tặng được tách riêng", () => {
    const html = render(snap(full));
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(html).toContain("Tăng trưởng &amp; khách hàng");
    expect(html).toContain("Kênh bán");
    expect(html).toContain("Khuyến mãi &amp; voucher");
    expect(html).toContain("1,19B");
    expect(html).toContain("Bối cảnh cả shop");
    expect(html).toContain("Đã loại khỏi xếp hạng");
    expect(html).toContain("Nguồn lưu lượng của từng nguồn doanh số");
    expect(html).toContain("Livestream của người bán");
    expect(html).toContain("Tổng doanh số");
    expect(html).not.toMatch(/Total GMV|Seller LIVE|Product card|1~2\.997e/);
  });
  test("thứ tự trang: Tổng quan, Tăng trưởng, Kênh bán trước Key Metrics", () => {
    const html = render(snap(full));
    const at = (id: string) => html.indexOf(`id="mr-${id}"`);
    expect(at("summary")).toBeLessThan(at("growth"));
    expect(at("growth")).toBeLessThan(at("channels"));
    expect(at("channels")).toBeLessThan(at("keymetrics"));
    expect(at("promo")).toBeLessThan(at("products"));
    expect(at("products")).toBeLessThan(at("ads"));
  });
  test("chưa có file cả shop: vẫn đủ trang, ops thấy cần tải file nào, brand không thấy lời nhắc", () => {
    const ops = render(snap(null));
    expect(ops).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(ops).toContain("File cả shop");
    expect(render(snap(null), false)).not.toContain("File cả shop");
  });
  test("so với tháng trước cùng ngày khi có bản chụp tháng trước", () => {
    const html = render(snap(full, full));
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect(html).not.toContain("chưa có file cả shop nên chưa so");
  });
});
