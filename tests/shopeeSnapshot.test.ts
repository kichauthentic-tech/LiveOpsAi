// Bản chụp Report Tháng SHOPEE (migration 0139). Chạy: npx vitest run tests/shopeeSnapshot.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { buildShopeeSnapshot, shopeeHeadline, shopeeSessionsSig, shopeeSnapshotFreshness, shopeeStampsFor, monthDays } = await import("../src/lib/report/shopeeSnapshot");
import type { LiveSession } from "../src/types";
import type { ShopeeDay, ShopeeOverview, ShopeeProduct, ShopeeStream } from "../src/lib/dataraw/shopeeFiles";

const stream = (date: string, time: string, hours: number, gmv: number, over: Partial<ShopeeStream> = {}): ShopeeStream => ({
  no: 1, name: "live", date, time, startAt: "", endAt: "", durationSec: hours * 3600, viewers: 1000, engaged: 100, comments: 10, atc: 50,
  avgViewSec: 40, ordersPlaced: 10, ordersConfirmed: 9, itemsPlaced: 12, itemsConfirmed: 11, salesPlaced: gmv, salesConfirmed: Math.round(gmv * 0.95), ...over
});
const day = (date: string, gmv: number): ShopeeDay => ({
  date, salesPlaced: gmv, salesConfirmed: Math.round(gmv * 0.95), ordersPlaced: 10, ordersConfirmed: 9, itemsPlaced: 12, itemsConfirmed: 11,
  viewers: 1000, engaged: 100, avgViewSec: 40, buyersPlaced: 9, atc: 50, ctrPct: 10, views: 2000, pcu: 20, likes: 0, shares: 0, comments: 0, newFollowers: 0
});
const prod = (name: string, sales: number): ShopeeProduct => ({ rank: 1, name, clicks: 10, atc: 5, ordersPlaced: 3, ordersConfirmed: 3, itemsPlaced: 3, itemsConfirmed: 3, salesPlaced: sales, salesConfirmed: sales });
const overview = (over: Partial<ShopeeOverview> = {}): ShopeeOverview => ({
  salesPlaced: 100_000_000, salesConfirmed: 95_000_000, salesNewPlaced: 0, salesOldPlaced: 0, ordersPlaced: 300, ordersConfirmed: 280, itemsPlaced: 350, itemsConfirmed: 330, absPlaced: 333_333,
  sessions: 4, durationSec: 12 * 3600, viewers: 5000, engaged: 500, views: 8000, pcu: 30, avgViewSec: 40, atc: 400, productImpressions: 20000, productClicks: 2000, ctrPct: 10,
  orderRatePlacedPct: 15, orderRateConfirmedPct: 14, buyersPlaced: 250, buyersConfirmed: 240, gpmPlaced: 0, likes: 0, shares: 0, comments: 0, newFollowers: 0, voucherClaimed: 0,
  specialVoucherClaimed: 0, coinsClaimed: 0,
  sources: [{ key: "Others", salesRatioPct: 65, salesPlaced: 65_000_000, salesConfirmed: 60_000_000, views: 5000, viewers: 3000, engaged: 300 }, { key: "Shop", salesRatioPct: 35, salesPlaced: 35_000_000, salesConfirmed: 35_000_000, views: 3000, viewers: 2000, engaged: 200 }], ...over
});
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({ id, brandId: "vera", brandName: "VERA", platform: "Shopee", date: "2026-09-09", startTime: "10:00", endTime: "13:00", status: "Completed", hostId: "mia", hostName: "Mia", actualGmv: 20_000_000, totalOrders: 50, totalViews: 1000, dataSource: "manual", ...over }) as LiveSession;

// 4 phiên: 09/09 (D-Day: ngày 7–9/9) 10:00 và 20:00, 13/09 (Mid-Month) 11:00, 26/09 (ngày thường) 22:00
const streams = [stream("2026-09-09", "10:00", 3, 60_000_000), stream("2026-09-09", "20:00", 3, 20_000_000), stream("2026-09-13", "11:00", 3, 10_000_000), stream("2026-09-26", "22:00", 3, 10_000_000)];
const days = [day("2026-09-09", 80_000_000), day("2026-09-13", 10_000_000), day("2026-09-26", 10_000_000)];
const sessions = [ca("a"), ca("b", { date: "2026-09-13", hostId: "su", hostName: "Su", actualGmv: 8_000_000, dataSource: "tiktok_reconciled" }), ca("c", { platform: "TikTok", actualGmv: 999 }), ca("d", { brandId: "other" })];

const build = (over: Record<string, unknown> = {}) =>
  buildShopeeSnapshot({
    brandId: "vera", month: "2026-09", sessions, streams, days, products: [prod("A", 50_000_000), prod("B", 30_000_000), prod("C", 10_000_000), prod("D", 10_000_000)], overview: overview(),
    files: { live: true, daily: true, products: true, overview: true }, prev: null, stamps: ["x@1"], computedAt: "2026-10-06T00:00:00Z", ...over
  } as Parameters<typeof buildShopeeSnapshot>[0]);

describe("headline", () => {
  test("ưu tiên overview; giờ live từ Live List; GMV/giờ và AOV", () => {
    const h = shopeeHeadline(streams, days, overview());
    expect(h.gmv).toBe(100_000_000);
    expect(h.confirmed).toBe(95_000_000);
    expect(h.liveHours).toBe(12);
    expect(h.liveSessions).toBe(4);
    expect(h.gmvPerHour).toBeCloseTo(100_000_000 / 12, 3);
    expect(h.aov).toBeCloseTo(100_000_000 / 300, 3);
    expect(h.days).toBe(3);
    expect(h.lastDay).toBe("2026-09-26");
  });
  test("số của overview thắng số cộng từ file theo ngày khi hai bên khác nhau", () => {
    expect(shopeeHeadline(streams, days, overview({ salesPlaced: 123_000_000 })).gmv).toBe(123_000_000);
    expect(shopeeHeadline(streams, [day("2026-09-09", 7)], null).gmv).toBe(7);
  });
  test("thiếu overview thì cộng file theo ngày; thiếu cả hai thì cộng phiên", () => {
    expect(shopeeHeadline(streams, days, null).gmv).toBe(100_000_000);
    expect(shopeeHeadline(streams, [], null).gmv).toBe(100_000_000);
    expect(shopeeHeadline([], [], null).gmvPerHour).toBeNull();
  });
});

describe("buildShopeeSnapshot", () => {
  const s = build();
  test("khung giờ theo giờ bắt đầu phiên", () => {
    const by = Object.fromEntries(s.slots.map((x) => [x.key, x]));
    expect(by.morning).toMatchObject({ sessions: 2, hours: 6, gmv: 70_000_000 });
    expect(by.evening).toMatchObject({ sessions: 2, hours: 6, gmv: 30_000_000 });
    expect(by.early).toBeUndefined();
    expect(by.morning.avgViewers).toBe(1000);
  });
  test("ranh giới khung giờ: 15:59 vào Sáng/Trưa, 16:00 vào Tối, 09:59 vào Khuya", () => {
    const b = build({ streams: [stream("2026-09-20", "15:59", 1, 1), stream("2026-09-20", "16:00", 1, 1), stream("2026-09-21", "09:59", 1, 1)] });
    const by = Object.fromEntries(b.slots.map((x) => [x.key, x.sessions]));
    expect(by).toEqual({ morning: 1, evening: 1, early: 1 });
  });
  test("loại ngày camp theo lịch cố định", () => {
    const by = Object.fromEntries(s.camps.map((x) => [x.key, x]));
    expect(by.dday).toMatchObject({ sessions: 2, gmv: 80_000_000, days: 1 });
    expect(by.midmonth).toMatchObject({ sessions: 1, gmv: 10_000_000 });
    expect(by.daily).toMatchObject({ sessions: 1, gmv: 10_000_000 });
    expect(s.camps.reduce((a, x) => a + (x.share ?? 0), 0)).toBeCloseTo(1, 6);
  });
  test("ngày không live: các ngày tới ngày cuối có số mà không có phiên", () => {
    expect(s.noLiveDays).toContain("2026-09-01");
    expect(s.noLiveDays).not.toContain("2026-09-09");
    expect(s.noLiveDays).not.toContain("2026-09-27");
  });
  test("host chỉ từ ca Shopee của đúng brand và tháng; ca TikTok bị loại", () => {
    expect(s.hosts.map((h) => h.name).sort()).toEqual(["Mia", "Su"]);
    expect(s.appGmv).toBe(28_000_000);
    expect(s.plan).toMatchObject({ sessions: 2, completed: 2 });
    expect(s.quality).toMatchObject({ total: 2, reconciled: 1, manual: 1 });
  });
  test("sản phẩm: top 3 chiếm 90%", () => {
    expect(s.products.top3Share).toBeCloseTo(0.9, 6);
    expect(s.products.top[0].name).toBe("A");
  });
  test("so tháng trước và nhận xét", () => {
    const withPrev = build({ prev: { ...s.headline, gmv: 50_000_000, gmvPerHour: 2_000_000 } });
    expect(withPrev.insights.summary?.headline).toMatch(/tăng 100% so với tháng trước/);
    expect(s.insights.summary?.headline).toMatch(/GMV Shopee 100M/);
    expect(s.insights.funnel?.points.join(" ")).toMatch(/Others/);
    // Mỗi khung chỉ có 2 phiên (< 3) ⇒ không nêu "khung hiệu quả nhất" — tránh gán nhãn theo một vài phiên.
    expect(s.insights.schedule?.headline).toMatch(/dưới 3 phiên/);
    const many = build({ streams: [...streams, stream("2026-09-20", "10:00", 3, 30_000_000), stream("2026-09-21", "11:00", 3, 30_000_000)] });
    expect(many.insights.schedule?.headline).toMatch(/Sáng\/Trưa/);
    // Host: mỗi người 1 ca ⇒ chưa xếp hạng.
    expect(s.insights.people?.headline).toMatch(/Chưa đủ ca/);
  });
  test("ghi chú: nêu GMV = doanh số đặt, nêu phần Shopee không có, nêu lệch số ca với file", () => {
    const text = s.notes.join("\n");
    expect(text).toMatch(/doanh số ĐẶT/);
    expect(text).toMatch(/Ads, khuyến mãi/);
    expect(text).toMatch(/28M so với 100M/);
  });
  test("thiếu file thì báo thiếu file nào", () => {
    const t = build({ files: { live: true, daily: false, products: false, overview: true } }).notes.join("\n");
    expect(t).toMatch(/Chưa có file: theo ngày, Product List/);
  });
});

describe("độ mới của bản chụp", () => {
  const s = build();
  test("không đổi gì thì còn mới", () => {
    expect(shopeeSnapshotFreshness(s, { sessions, stamps: ["x@1"] }).upToDate).toBe(true);
  });
  test("ca đổi số hoặc đổi người thì cũ; file mới up thì cũ", () => {
    const changed = sessions.map((x) => (x.id === "a" ? { ...x, actualGmv: 1 } : x));
    expect(shopeeSnapshotFreshness(s, { sessions: changed, stamps: ["x@1"] })).toMatchObject({ upToDate: false, sessionsChanged: true });
    const rehost = sessions.map((x) => (x.id === "a" ? { ...x, hostId: "linh" } : x));
    expect(shopeeSnapshotFreshness(s, { sessions: rehost, stamps: ["x@1"] }).sessionsChanged).toBe(true);
    expect(shopeeSnapshotFreshness(s, { sessions, stamps: ["x@1", "y@2"] })).toMatchObject({ upToDate: false, filesChanged: true });
  });
  test("ca TikTok hoặc brand khác không làm cũ bản chụp Shopee", () => {
    const more = [...sessions, ca("z", { platform: "TikTok", actualGmv: 5 }), ca("y", { brandId: "other2" })];
    expect(shopeeSessionsSig(more, "vera", "2026-09")).toBe(shopeeSessionsSig(sessions, "vera", "2026-09"));
  });
  test("dấu file: chỉ 4 loại Shopee phủ tháng", () => {
    const imps = [
      { id: "1", reportType: "shopee_live_list", periodStart: "2026-09-01", periodEnd: "2026-09-30", importedAt: "t1" },
      { id: "2", reportType: "shopee_live_list", periodStart: "2026-08-01", periodEnd: "2026-08-31", importedAt: "t2" },
      { id: "3", reportType: "product_list", periodStart: "2026-09-01", periodEnd: "2026-09-30", importedAt: "t3" }
    ] as Parameters<typeof shopeeStampsFor>[0];
    expect(shopeeStampsFor(imps, "2026-09")).toEqual(["1@t1"]);
  });
  test("số ngày của tháng", () => {
    expect(monthDays("2026-09")).toHaveLength(30);
    expect(monthDays("2026-02")).toHaveLength(28);
  });
});
