// File Shopee xuất theo giao diện TIẾNG VIỆT (Franklin T10, 31/10): Product List, Overview, Live List, theo ngày — phải đọc ra cùng số với bản tiếng Anh.
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { describe, expect, test } from "vitest";
import { parseCsvRows, parseShopeeRows, readShopeeDays, readShopeeOverview, readShopeeProducts, readShopeeStreams, shopeeDurationSec } from "../src/lib/dataraw/shopeeFiles";

const dir = new URL("./fixtures/shopee-shop/", import.meta.url);
const xlsxRows = (f: string) => {
  const wb = XLSX.read(readFileSync(new URL(f, dir)), { type: "buffer" });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null });
};
const csvRows = (f: string) => parseCsvRows(readFileSync(new URL(f, dir), "utf-8"));

describe("thời lượng tiếng Việt", () => {
  test("68giờ13phút6giây, 31giây, 2giờ31phút35giây", () => {
    expect(shopeeDurationSec("68giờ13phút6giây")).toBe(68 * 3600 + 13 * 60 + 6);
    expect(shopeeDurationSec("31giây")).toBe(31);
    expect(shopeeDurationSec("2giờ31phút35giây")).toBe(2 * 3600 + 31 * 60 + 35);
    expect(shopeeDurationSec("175h16m7s")).toBe(175 * 3600 + 16 * 60 + 7);
  });
});

describe("file tiếng Việt của Franklin T10", () => {
  test("Product List: kỳ tháng 10, sản phẩm xếp hạng, doanh số đặt", () => {
    const p = parseShopeeRows(xlsxRows("franklin-t10-product-list-vi.xlsx"), "shopee_product_list");
    expect(p.periodStart).toBe("2026-10-01");
    const prods = readShopeeProducts(p.rows);
    expect(prods.length).toBeGreaterThan(30);
    expect(prods[0].rank).toBe(1);
    expect(prods[0].name).toMatch(/Áo Thể Thao Franklin/);
    expect(prods[0].salesPlaced).toBe(10576004);
  });
  test("Overview: cùng số với file Daily (64.544.176), 27 phiên, 68h13", () => {
    const p = parseShopeeRows(csvRows("franklin-t10-overview-vi.csv"), "shopee_overview");
    expect(p.periodStart).toBe("2026-10-01");
    expect(p.summary).toMatchObject({ shopId: "1697777871" });
    const o = readShopeeOverview(p.rows);
    expect(o.salesPlaced).toBe(64544176);
    expect(o.salesConfirmed).toBe(52712176);
    expect(o.ordersPlaced).toBe(32);
    expect(o.sessions).toBe(27);
    expect(o.durationSec).toBe(68 * 3600 + 13 * 60 + 6);
    expect(o.viewers).toBe(49785);
    expect(o.engaged).toBe(2571);
    expect(o.atc).toBe(414);
    expect(o.productImpressions).toBe(47130);
    expect(o.productClicks).toBe(340);
    expect(o.likes).toBe(73044);
    expect(o.newFollowers).toBe(407);
    expect(o.coinsClaimed).toBe(224000);
    expect(o.avgViewSec).toBe(31);
  });
  test("Overview: nguồn traffic giữ tên Seller Centre, 'Tất cả nguồn' không thành nguồn riêng", () => {
    const o = readShopeeOverview(parseShopeeRows(csvRows("franklin-t10-overview-vi.csv"), "shopee_overview").rows);
    const keys = o.sources.map((s) => s.key);
    expect(keys).toContain("Khác");
    expect(keys).toContain("Video");
    expect(keys.some((k) => /Tất cả/.test(k))).toBe(false);
    expect(o.sources.find((s) => s.key === "Khác")!.salesPlaced).toBe(44642174);
    expect(o.sources.reduce((a, s) => a + s.salesPlaced, 0)).toBeGreaterThan(0);
  });
  test("Live List và file theo ngày vẫn đọc được", () => {
    const streams = readShopeeStreams(parseShopeeRows(xlsxRows("franklin-t10-live-list.xlsx"), "shopee_live_list").rows);
    expect(streams.length).toBe(24);
    const days = readShopeeDays(parseShopeeRows(csvRows("franklin-t10-daily.csv"), "shopee_daily").rows);
    expect(days.reduce((a, d) => a + d.salesPlaced, 0)).toBe(64544176);
  });
});
