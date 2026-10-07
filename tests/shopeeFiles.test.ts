// 4 file Shopee Seller Centre (migration 0139). Chạy: npx vitest run tests/shopeeFiles.test.ts
// Phần "file thật" chỉ chạy khi 4 file VERA Shopee T9 có trong ~/Downloads (máy của user); CI chạy phần tổng hợp.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const {
  parseCsvRows, parseShopeeDaily, parseShopeeLiveList, parseShopeeOverview, parseShopeeProductList, readShopeeDays, readShopeeOverview,
  readShopeeProducts, readShopeeStreams, shopeeDate, shopeeDurationSec, shopeeNum, shopeeStreamsToSnapshotRows, vnIso, flattenShopeeOverview
} = await import("../src/lib/dataraw/shopeeFiles");
const { parseDataRawExcel } = await import("../src/lib/dataraw/parseDataRawExcel");

describe("số / giờ / ngày kiểu Shopee Việt Nam", () => {
  test("tiền, phần trăm, số có dấu chấm nghìn", () => {
    expect(shopeeNum("6.478.400₫")).toBe(6478400);
    expect(shopeeNum("668.841.273,70₫")).toBeCloseTo(668841273.7, 5);
    expect(shopeeNum("299.660,07₫")).toBeCloseTo(299660.07, 5);
    expect(shopeeNum("₫110.259.733")).toBe(110259733);
    expect(shopeeNum("16,41%")).toBeCloseTo(16.41, 5);
    expect(shopeeNum("4.510")).toBe(4510);
    expect(shopeeNum("353.360₫")).toBe(353360);
    expect(shopeeNum(31)).toBe(31);
    expect(shopeeNum("-")).toBe(0);
    expect(shopeeNum(null)).toBe(0);
  });
  test("thời lượng và ngày", () => {
    expect(shopeeDurationSec("00:00:31")).toBe(31);
    expect(shopeeDurationSec("04:00:04")).toBe(14404);
    expect(shopeeDurationSec("175h16m7s")).toBe(175 * 3600 + 16 * 60 + 7);
    expect(shopeeDurationSec("48s")).toBe(48);
    expect(shopeeDate("01-09-2026")).toBe("2026-09-01");
    expect(shopeeDate("rác")).toBeNull();
  });
  test("ISO giờ Việt Nam, kể cả ca qua nửa đêm", () => {
    expect(vnIso("2026-09-30", "20:01")).toBe("2026-09-30T20:01:00+07:00");
    expect(vnIso("2026-09-30", "22:00", 3 * 3600)).toBe("2026-10-01T01:00:00+07:00");
  });
  test("CSV: ngoặc kép, dấu phẩy trong ô, BOM, CRLF", () => {
    const rows = parseCsvRows('\uFEFFa,b\r\n03-09-2026,"8.213.860₫"\r\n05-09-2026,"1,5"\r\n');
    expect(rows).toEqual([["a", "b"], ["03-09-2026", "8.213.860₫"], ["05-09-2026", "1,5"]]);
  });
});

const LIVE_HEAD = ["Data Period", "User Id", "No.", "Livestream Name", "Start Time", "Duration:", "Engaged Viewers", "Comments", "ATC", "Avg. Viewing Duration", "Viewers", "Orders(Placed Order)", "Orders(Confirmed Order)", "Items Sold(Placed Order)", "Items Sold(Confirmed Order)", "Sales(Placed Order)", "Sales(Confirmed Order)"];
const live = (rows: unknown[][]) => [LIVE_HEAD, ...rows];
const PERIOD = "01-09-2026 - 30-09-2026";
const s1 = [PERIOD, 13347498, 1, "SALE XỊN", "30-09-2026 22:00", "03:00:00", 126, 50, 117, "00:00:36", 1778, 22, 21, 28, 27, "₫6.317.440", "₫5.900.000"];
const s2 = [PERIOD, 13347498, 2, "SALE XỊN", "29-09-2026 11:02", "02:15:40", 79, 44, 84, "00:01:00", 1019, 14, 13, 23, 21, "₫4.430.000", "₫4.046.000"];

describe("Live List → phiên", () => {
  test("đọc phiên: giờ kết thúc theo thời lượng, doanh số đặt/xác nhận", () => {
    const p = parseShopeeLiveList(live([s1, s2]));
    expect(p.periodStart).toBe("2026-09-29");
    expect(p.periodEnd).toBe("2026-09-30");
    expect(p.summary).toMatchObject({ shopId: "13347498", source: "shopee" });
    const st = readShopeeStreams(p.rows);
    expect(st).toHaveLength(2);
    expect(st[0].endAt).toBe("2026-10-01T01:00:00+07:00");
    expect(st[0].salesPlaced).toBe(6317440);
    expect(st[0].salesConfirmed).toBe(5900000);
    expect(st[1].durationSec).toBe(2 * 3600 + 15 * 60 + 40);
    expect(st[1].avgViewSec).toBe(60);
  });
  test("từ chối: không phải file Live List, thiếu cột, trải 2 tháng, giờ hỏng, rỗng", () => {
    expect(() => parseShopeeLiveList([["a", "b"], [1, 2]])).toThrow(/Live List/);
    expect(() => parseShopeeLiveList([LIVE_HEAD.filter((h) => h !== "Viewers"), [PERIOD, 1, 1, "x", "30-09-2026 22:00", "01:00:00"]])).toThrow(/Thiếu cột/);
    expect(() => parseShopeeLiveList(live([s1, [...s2.slice(0, 4), "29-08-2026 11:02", ...s2.slice(5)]]))).toThrow(/2 tháng/);
    expect(() => parseShopeeLiveList(live([[...s1.slice(0, 4), "hôm qua", ...s1.slice(5)]]))).toThrow(/giờ bắt đầu/);
    expect(() => parseShopeeLiveList(live([]))).toThrow(/không có phiên/);
  });
  test("dòng snapshot/đối soát: GMV = doanh số ĐẶT, doanh số xác nhận giữ trong raw, mã phòng tổng hợp", () => {
    const rows = shopeeStreamsToSnapshotRows(readShopeeStreams(parseShopeeLiveList(live([s2])).rows));
    expect(rows[0]).toMatchObject({ roomId: "SHP-2026-09-29-1102", gmv: 4430000, orders: 14, views: 1019, startedAt: "2026-09-29T11:02:00+07:00", endedAt: "2026-09-29T13:17:40+07:00" });
    expect((rows[0].raw as Record<string, unknown>).salesConfirmed).toBe(4046000);
    // ATC không có cột riêng ở bảng snapshot ⇒ nằm trong raw để DB trừ giữa hai lần up (0154)
    expect((rows[0].raw as Record<string, unknown>).atc).toBe(readShopeeStreams(parseShopeeLiveList(live([s2])).rows)[0].atc);
  });
});

describe("file Live List làm file giao ca / đổi host (0154) — cùng đường snapshot với TikTok", () => {
  test("snapshotRowsFromParsed(Shopee): một phiên = một dòng room, cột chỉ TikTok = 0, ATC nằm trong raw", async () => {
    const { snapshotRowsFromParsed, SNAPSHOT_FILE_TYPE } = await import("../src/lib/liveSnapshot/extractRooms");
    const out = snapshotRowsFromParsed(parseShopeeLiveList(live([s1, s2])), "Shopee");
    expect(out.rows.map((r) => r.roomId)).toEqual(["SHP-2026-09-30-2200", "SHP-2026-09-29-1102"]);
    const r = out.rows[1];
    expect(r).toMatchObject({ gmv: 4430000, orders: 14, views: 1019, comments: 44, impressions: 0, productClicks: 0, newFollowers: 0, shares: 0, likes: 0, watchSeconds: 60 * 1019 });
    expect((r.raw as Record<string, unknown>).atc).toBe(84);
    expect(SNAPSHOT_FILE_TYPE.Shopee).toBe("shopee_live_list");
    expect(SNAPSHOT_FILE_TYPE.TikTok).toBe("creator_live_performance");
  });
  test("picker: ca 11:00–13:00 ngày 29/09 chọn sẵn phiên 11:02, không chọn phiên 30/09", async () => {
    const { snapshotRowsFromParsed } = await import("../src/lib/liveSnapshot/extractRooms");
    const { classifyRooms, sessionWindow } = await import("../src/lib/liveSnapshot/roomSelection");
    const rows = snapshotRowsFromParsed(parseShopeeLiveList(live([s1, s2])), "Shopee").rows;
    const picks = classifyRooms(rows, sessionWindow({ date: "2026-09-29", startTime: "11:00", endTime: "13:00" }));
    expect(picks.filter((c) => c.suggested).map((c) => c.row.roomId)).toEqual(["SHP-2026-09-29-1102"]);
    expect(picks.find((c) => c.row.roomId === "SHP-2026-09-30-2200")?.inWindow).toBe(false);
  });
  test("migration 0154 đọc ATC từ raw của dòng snapshot (client không gửi cột riêng)", () => {
    const sql = readFileSync(join(__dirname, "..", "supabase", "migrations", "0154_shopee_snapshot_from_live_list.sql"), "utf8");
    expect(sql).toContain("c.raw ? 'atc'");
    expect(sql).toContain("atc_count");
  });
});

describe("theo ngày, sản phẩm, overview (tổng hợp)", () => {
  const DAY_GROUP = ["Data Period", "", "Key Metrics"];
  const DAY_HEAD = ["Data Period", "User Id", "Sales(Placed Order)", "Sales(Confirmed Order)", "Orders(Placed Order)", "Orders(Confirmed Order)", "Total Items Sold(Placed Order)", "Total Items Sold(Confirmed Order)", "Total Viewers", "Engaged Viewers", "Avg. Viewing Duration", "Buyers(Placed Order)", "Total ATC", "CTR", "Total Views", "PCU"];
  const day = (d: string, placed: string, conf: string) => [d, 13347498, placed, conf, "19", "19", "28", "28", "3.158", "231", "00:00:31", "17", "138", "16,41%", "4.510", "47"];
  test("file theo ngày: 2 dòng tiêu đề, ngày dd-mm-yyyy, số kiểu Việt", () => {
    const p = parseShopeeDaily([DAY_GROUP, DAY_HEAD, day("01-09-2026", "6.478.400₫", "6.478.400₫"), day("03-09-2026", "8.213.860₫", "7.984.860₫")]);
    expect(p.periodStart).toBe("2026-09-01");
    const d = readShopeeDays(p.rows);
    expect(d.map((x) => x.salesPlaced)).toEqual([6478400, 8213860]);
    expect(d[1].salesConfirmed).toBe(7984860);
    expect(d[0].ctrPct).toBeCloseTo(16.41, 5);
    expect(d[0].avgViewSec).toBe(31);
  });
  test("file theo ngày: từ chối file không phải theo ngày / ngày lặp / 2 tháng", () => {
    expect(() => parseShopeeDaily([DAY_GROUP, DAY_HEAD, ["01-09-2026 - 30-09-2026", 1, "1"]])).toThrow(/THEO NGÀY/);
    expect(() => parseShopeeDaily([DAY_GROUP, DAY_HEAD, day("01-09-2026", "1", "1"), day("01-09-2026", "1", "1")])).toThrow(/lặp/);
    expect(() => parseShopeeDaily([DAY_GROUP, DAY_HEAD, day("30-08-2026", "1", "1"), day("01-09-2026", "1", "1")])).toThrow(/2 tháng/);
  });
  test("sản phẩm", () => {
    const head = ["Data Period", "User Id", "Ranking", "Product(s)", "Product Clicks", "ATC", "Orders(Placed Order)", "Orders(Confirmed Order)", "Items Sold(Placed Order)", "Items Sold(Confirmed Order)", "Sales(Placed Order)", "Sales(Confirmed Order)"];
    const p = parseShopeeProductList([head, [PERIOD, 13347498, 1, "Combo 10 quần lót", 4286, 1315, 328, 308, 336, 316, "₫110.259.733", "₫103.744.733"]]);
    expect(p.periodEnd).toBe("2026-09-30");
    const pr = readShopeeProducts(p.rows);
    expect(pr[0]).toMatchObject({ rank: 1, clicks: 4286, salesPlaced: 110259733, salesConfirmed: 103744733 });
  });
  test("overview: gom khối theo nhóm, đọc nguồn traffic", () => {
    const rows: unknown[][] = [
      ["", "", "Transaction – Overview", "", "", "Traffic - Performance", "", "Conversion - Conversion Funnel", ""],
      ["Data Period", "User Id", "Sales(Placed Order)", "Orders(Placed Order)", "", "Total Livestream Sessions", "Total Livestream Duration", "Product Impressions", "CTR"],
      [PERIOD, 13347498, "668.841.273,70₫", "2.232", "", "50", "175h16m7s", "94.500", "9,35%"],
      [],
      ["", "", "Transaction – My Shop", "", "", "Traffic - Traffic Source - Shop"],
      ["", "", "Sales(Placed Order)", "Orders(Placed Order)", "", "Sales Ratio(Placed Order)", "Sales(Placed Order)", "Live Views"],
      ["", "", "668.841.273,70₫", "2.232", "", "23%", "151.732.563₫", "7.589"]
    ];
    const p = parseShopeeOverview(rows);
    expect(p.periodStart).toBe("2026-09-01");
    expect(p.summary).toMatchObject({ shopId: "13347498" });
    const o = readShopeeOverview(p.rows);
    expect(o.salesPlaced).toBeCloseTo(668841273.7, 5);
    expect(o.ordersPlaced).toBe(2232);
    expect(o.sessions).toBe(50);
    expect(o.durationSec).toBe(630967);
    expect(o.productImpressions).toBe(94500);
    expect(o.ctrPct).toBeCloseTo(9.35, 5);
    expect(o.sources).toEqual([{ key: "Shop", salesRatioPct: 23, salesPlaced: 151732563, salesConfirmed: 0, views: 7589, viewers: 0, engaged: 0 }]);
    expect(flattenShopeeOverview(rows).filter((r) => r["Nhóm"] === "Transaction – My Shop")).toHaveLength(2);
  });
  test("overview: từ chối file lạ", () => {
    expect(() => parseShopeeOverview([["a"], ["b"]])).toThrow(/overview/);
  });
});

// ---------- file thật ----------
const DL = join(homedir(), "Downloads");
const pick = (prefix: string, ext: string) => (existsSync(DL) ? readdirSync(DL).find((f) => f.startsWith(prefix) && f.endsWith(ext)) : undefined);
const FILES = {
  live: pick("supply-sellercenter-export-sc_live_stream_list_export_vn_13347498", ".xlsx"),
  product: pick("supply-sellercenter-export-sc_live_product_list_export_vn_13347498", ".xlsx"),
  daily: pick("export-sc__1m_2026-09-30", ".csv"),
  overview: pick("overview-v2_1m_2026-09-30", ".csv")
};
const haveReal = Object.values(FILES).every(Boolean);
const open = (name: string) => new File([readFileSync(join(DL, name))], name);

describe.skipIf(!haveReal)("4 file thật VERA Shopee T9 — số khớp nhau và khớp Shopee", () => {
  test("Live List: 50 phiên, 668.841.274 đặt / 633.141.515 xác nhận, 175,3 giờ", async () => {
    const p = await parseDataRawExcel(open(FILES.live!), "shopee_live_list");
    const st = readShopeeStreams(p.rows);
    expect(st).toHaveLength(50);
    expect(st.reduce((s, x) => s + x.salesPlaced, 0)).toBeCloseTo(668841273.7, 1);
    expect(st.reduce((s, x) => s + x.salesConfirmed, 0)).toBeCloseTo(633141514.7, 1);
    expect(st.reduce((s, x) => s + x.ordersPlaced, 0)).toBe(2232);
    expect(st.reduce((s, x) => s + x.durationSec, 0) / 3600).toBeCloseTo(175.3, 1);
    expect(p.periodStart).toBe("2026-09-01");
    expect(p.periodEnd).toBe("2026-09-30");
  });
  test("theo ngày: 29 ngày, cộng ra đúng số của Live List", async () => {
    const days = readShopeeDays((await parseDataRawExcel(open(FILES.daily!), "shopee_daily")).rows);
    expect(days).toHaveLength(29);
    expect(days.reduce((s, d) => s + d.salesPlaced, 0)).toBeCloseTo(668841273.7, 1);
    expect(days.reduce((s, d) => s + d.salesConfirmed, 0)).toBeCloseTo(633141514.7, 1);
    expect(days.find((d) => d.date === "2026-09-09")?.salesPlaced).toBe(206064317);
  });
  test("overview: cùng tổng, 50 phiên, funnel và 10 nguồn traffic", async () => {
    const o = readShopeeOverview((await parseDataRawExcel(open(FILES.overview!), "shopee_overview")).rows);
    expect(o.salesPlaced).toBeCloseTo(668841273.7, 1);
    expect(o.salesConfirmed).toBeCloseTo(633141514.7, 1);
    expect(o.ordersPlaced).toBe(2232);
    expect(o.sessions).toBe(50);
    expect(o.durationSec).toBe(630967);
    expect(o.views).toBe(149115);
    expect(o.viewers).toBe(100040);
    expect(o.productImpressions).toBe(94500);
    expect(o.productClicks).toBe(8840);
    expect(o.ctrPct).toBeCloseTo(9.35, 2);
    expect(o.sources).toHaveLength(10);
    expect(o.sources.reduce((s, x) => s + x.salesPlaced, 0)).toBeCloseTo(668841273.7, 0);
    expect(o.sources.find((x) => x.key === "Shop")?.salesPlaced).toBe(151732563);
  });
  test("sản phẩm: 140 dòng, hạng 1 là combo 10 quần lót", async () => {
    const pr = readShopeeProducts((await parseDataRawExcel(open(FILES.product!), "shopee_product_list")).rows);
    expect(pr).toHaveLength(140);
    expect(pr[0]).toMatchObject({ rank: 1, salesPlaced: 110259733, clicks: 4286 });
    expect(pr.reduce((s, x) => s + x.salesPlaced, 0)).toBeCloseTo(662932773.7, 1);
  });
});
