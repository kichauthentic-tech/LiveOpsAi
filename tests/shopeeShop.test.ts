// 5 file cả shop Shopee (31/10, Franklin whole shop, T10): Shop Stats, Voucher, Discount, Sales Composition, Sản phẩm cả shop. Mẫu = file thật.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { parseCsvRows, parseShopeeRows, readShopeeDays } from "../src/lib/dataraw/shopeeFiles";
import {
  detectShopeeShopKind, parseShopeeShopSheets, reconcileShopLive, shopeePeriod, shopeeShopData, type ShopeeShopKind, type ShopeeSheets
} from "../src/lib/dataraw/shopeeShop";

const dir = new URL("./fixtures/shopee-shop/", import.meta.url);
function sheetsOf(file: string): ShopeeSheets {
  const wb = XLSX.read(readFileSync(new URL(file, dir)), { type: "buffer" });
  return Object.fromEntries(wb.SheetNames.map((n) => [n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: null })]));
}
const FILES: Record<ShopeeShopKind, string> = {
  shopee_shop_stats: "franklin-t10-shop-stats.xlsx",
  shopee_voucher: "franklin-t10-voucher.xlsx",
  shopee_discount: "franklin-t10-discount.xlsx",
  shopee_composition: "franklin-t10-composition.xlsx",
  shopee_shop_products: "producttraffic_Product_Card.20261001_20261030.xlsx"
};
const sheets = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, sheetsOf(f)])) as Record<ShopeeShopKind, ShopeeSheets>;
const parse = (k: ShopeeShopKind) => parseShopeeShopSheets(sheets[k], k, FILES[k]);

describe("nhận loại file cả shop", () => {
  test("5 file Franklin nhận đúng loại", () => {
    for (const k of Object.keys(FILES) as ShopeeShopKind[]) expect(detectShopeeShopKind(sheets[k])).toBe(k);
  });
  test("file không liên quan không bị nhận nhầm", () => {
    expect(detectShopeeShopKind({ Sheet1: [["a", "b"]] })).toBeNull();
  });
});

describe("kỳ của file", () => {
  test("đọc khoảng ngày từ nội dung và từ tên file", () => {
    expect(shopeePeriod("01-10-2026-30-10-2026")).toEqual({ start: "2026-10-01", end: "2026-10-30" });
    expect(shopeePeriod("01-10-2026 - 30-10-2026")).toEqual({ start: "2026-10-01", end: "2026-10-30" });
    expect(shopeePeriod("producttraffic_Product_Card.20261001_20261030.xlsx")).toEqual({ start: "2026-10-01", end: "2026-10-30" });
  });
  test("file vắt qua 2 tháng bị chặn", () => {
    const bad = JSON.parse(JSON.stringify(sheets.shopee_voucher)) as ShopeeSheets;
    bad["Tổng quan"][1][0] = "20-10-2026 - 10-11-2026";
    expect(() => parseShopeeShopSheets(bad, "shopee_voucher")).toThrow(/nhiều tháng/);
  });
});

describe("Shop Stats", () => {
  const p = parse("shopee_shop_stats");
  const data = shopeeShopData(p.rows)!;
  test("30 ngày, tổng đặt / xác nhận khớp file", () => {
    expect(p.periodStart).toBe("2026-10-01");
    expect(p.periodEnd).toBe("2026-10-30");
    expect(data.days).toHaveLength(30);
    expect(data.placed).toBe(1193913200);
    expect(data.confirmed).toBe(1127503700);
    expect(data.orders).toBe(252);
  });
  test("bốn kênh chính cộng đúng Total, Ads là lát cắt chồng", () => {
    const c = data.channels!;
    expect(c.total).toBe(1193913200);
    expect(c.card + c.live + c.video + c.affiliate).toBe(c.total);
    expect(c.live).toBe(64544176);
    expect(c.affiliate).toBe(63392644);
    expect(c.ads).toBe(334530896);
    expect((p.summary as { warnings: string[] }).warnings).toEqual([]);
  });
  test("nguồn con và người mua mới", () => {
    expect(data.sources.find((s) => s.block === "card" && s.source === "Tìm kiếm")?.sales).toBe(211626871);
    expect(data.sources.find((s) => s.block === "affiliate" && s.source === "Affiliate Video")?.sales).toBe(57860644);
    expect(data.sources.find((s) => s.block === "ads" && s.source === "Quảng cáo cửa hàng")).toMatchObject({ sales: 90621526, cost: 5428317 });
    expect(data.days.reduce((s, d) => s + d.newBuyers, 0)).toBeGreaterThan(100);
    expect(data.days.reduce((s, d) => s + d.cancelOrders, 0)).toBe(64);
  });
  test("theo ngày × nguồn có dòng cho mỗi ngày", () => {
    const live = p.rows.filter((r) => r.t === "channelDay" && r.block === "live" && r.source === "Live");
    expect(live.reduce((s, r) => s + (r.sales as number), 0)).toBe(64544176);
  });
  test("Seller LIVE khớp tổng ngày của file Daily", () => {
    const daily = parseShopeeRows(parseCsvRows(readFileSync(new URL("franklin-t10-daily.csv", dir), "utf-8")), "shopee_daily");
    const live = readShopeeDays(daily.rows).reduce((s, d) => s + d.salesPlaced, 0);
    expect(live).toBe(64544176);
    expect(reconcileShopLive(data.channels!.live, live)).toBeNull();
    expect(reconcileShopLive(64544176, 60000000)).toMatch(/lệch/);
  });
  test("thiếu sheet ⇒ báo lỗi rõ", () => {
    expect(() => parseShopeeShopSheets({ "Đơn hàng đã đặt": [] }, "shopee_shop_stats")).toThrow(/thiếu sheet/);
  });
});

describe("Voucher và Discount", () => {
  test("Voucher: tổng, theo ngày, từng mã", () => {
    const p = parse("shopee_voucher");
    const total = p.rows.find((r) => r.t === "total")!;
    expect(total).toMatchObject({ sales: 626245100, confirmedSales: 574079100, claims: 1266, orders: 88, cost: 12081228 });
    expect(p.rows.filter((r) => r.t === "day")).toHaveLength(30);
    expect(p.rows.filter((r) => r.t === "voucher").length).toBeGreaterThanOrEqual(4);
    expect(p.rows.find((r) => r.code === "STVN100K")).toMatchObject({ sales: 306850600, cost: 6200000 });
  });
  test("Discount: theo loại, ngày, chương trình", () => {
    const p = parse("shopee_discount");
    expect(p.rows.find((r) => r.t === "type" && r.type === "Tất cả")).toMatchObject({ sales: 923645964, orders: 175 });
    expect(p.rows.find((r) => r.t === "type" && r.type === "Mua Kèm Deal Sốc")).toMatchObject({ sales: 215827748 });
    expect(p.rows.filter((r) => r.t === "day").length).toBe(120);
    expect(p.rows.find((r) => r.t === "program" && r.name === "Discount 7%")).toMatchObject({ sales: 559301592, status: "Đang diễn ra" });
  });
});

describe("Sales Composition và sản phẩm cả shop", () => {
  test("Composition: người mua mới 49% doanh số, ngành hàng và khung giá", () => {
    const p = parse("shopee_composition");
    expect(p.rows.find((r) => r.t === "buyerGroup" && r.basis === "placed" && r.name === "new")).toMatchObject({ buyers: 171, sales: 586201650 });
    expect(p.rows.find((r) => r.t === "buyerGroup" && r.basis === "placed" && r.name === "existing")).toMatchObject({ buyers: 18, sales: 607711550 });
    expect(p.rows.filter((r) => r.t === "price" && r.basis === "placed")).toHaveLength(4);
    expect(p.rows.filter((r) => r.t === "subcategory" && r.basis === "placed")).toHaveLength(3);
    expect(p.rows.find((r) => r.t === "category" && r.basis === "confirmed")).toMatchObject({ sales: 1127503700 });
  });
  test("Sản phẩm: kỳ lấy từ tên file, hàng quà tặng đứng đầu", () => {
    const p = parse("shopee_shop_products");
    expect(p.periodStart).toBe("2026-10-01");
    const placed = p.rows.filter((r) => r.basis === "placed");
    expect(placed.length).toBeGreaterThan(30);
    expect(placed[0]).toMatchObject({ id: "46163360709", sales: 657400000 });
    expect(String(placed[0].name)).toMatch(/Quà tặng/);
  });
  test("file sản phẩm thiếu kỳ trong tên ⇒ báo lỗi", () => {
    expect(() => parseShopeeShopSheets(sheets.shopee_shop_products, "shopee_shop_products", "x.xlsx")).toThrow(/kỳ/);
  });
});
