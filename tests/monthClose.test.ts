// Chốt tháng (audit Report Tháng 27/10, phương án B). Chạy: npx vitest run tests/monthClose.test.ts
import { expect, test, vi } from "vitest";
import type { BrandMonthPlan, BrandMonthlyReport, LiveSession } from "../src/types";
import type { DataRawImportStamp } from "../src/lib/db/brandDataRaw";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
const { closeDeadline, closeMonthFor, closeRow, daysDue, fileCoverage, openCount, publishBlocker } = await import("../src/lib/report/monthClose");

const stamp = (reportType: string, periodStart: string, periodEnd: string): DataRawImportStamp =>
  ({ id: `${reportType}-${periodStart}`, reportType, periodStart, periodEnd, importedAt: "2026-09-23T00:00:00Z" }) as DataRawImportStamp;
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({ id, brandId: "crocs", platform: "TikTok", date: "2026-09-10", startTime: "10:00", endTime: "13:00", status: "Completed", hostId: "hung", hostName: "Hùng", actualGmv: 50e6, totalOrders: 40, dataSource: "tiktok_reconciled", ...over }) as LiveSession;

// Dấu file thật của CROCS (đo 27/10): Shop Analytics / Sản phẩm 1–22/09, Khuyến mãi 1–22/09, Live Analysis 1–21/09, không file Ads.
const crocsStamps = [
  stamp("shop_analytics", "2026-09-01", "2026-09-22"),
  stamp("product_list", "2026-09-01", "2026-09-22"),
  stamp("shop_promotion", "2026-09-01", "2026-09-22"),
  stamp("affiliate_live_analysis", "2026-09-01", "2026-09-21"),
  stamp("shop_analytics", "2026-08-01", "2026-08-31")
];

test("độ phủ file: hợp các lần tải, cắt trong tháng; khuyến mãi vắt sang tháng sau vẫn tính đúng ngày", () => {
  expect(fileCoverage(crocsStamps, "shop_analytics", "2026-09")).toEqual({ days: 22, lastDay: "2026-09-22", any: true });
  expect(fileCoverage([stamp("shop_promotion", "2026-08-01", "2026-09-01")], "shop_promotion", "2026-09")).toEqual({ days: 1, lastDay: "2026-09-01", any: true });
  expect(fileCoverage([stamp("shop_analytics", "2026-09-01", "2026-09-10"), stamp("shop_analytics", "2026-09-11", "2026-09-30")], "shop_analytics", "2026-09").days).toBe(30);
  expect(fileCoverage(crocsStamps, "ads_campaign_overview", "2026-09")).toEqual({ days: 0, lastDay: null, any: false });
});

test("kỳ chốt: tháng đã hết là chính nó; tháng đang chạy tới ngày 10 vẫn chốt tháng trước; hạn ngày 3 tháng sau", () => {
  expect(closeMonthFor("2026-09", "2026-10-27")).toBe("2026-09");
  expect(closeMonthFor("2026-11", "2026-11-02")).toBe("2026-10");
  expect(closeMonthFor("2026-10", "2026-10-27")).toBe("2026-10");
  expect(closeDeadline("2026-10")).toBe("2026-11-03");
  expect(closeDeadline("2026-12")).toBe("2027-01-03");
  expect(daysDue("2026-09", "2026-10-27")).toBe(30);
  expect(daysDue("2026-10", "2026-10-27")).toBe(26);
});

test("CROCS T9 hôm 27/10: file toàn shop thiếu 8 ngày, Ads tuỳ chọn, affiliate thiếu file, report chưa phát hành", () => {
  const cells = closeRow({
    brandId: "crocs",
    platform: "TikTok",
    month: "2026-09",
    today: "2026-10-27",
    sessions: [ca("a", { date: "2026-09-01" }), ca("b", { dataSource: "live_snapshot" }), ca("c", { hostId: "", hostName: "" }), ca("x", { platform: "Shopee" }), ca("y", { brandId: "vera" })],
    stamps: crocsStamps,
    affiliate: [{ brandId: "crocs", periodMonth: "2026-09-01", status: "done", liveDateLabel: "3/9/2026" }],
    nextPlan: { status: "locked" } as BrandMonthPlan,
    report: { status: "draft" } as BrandMonthlyReport
  });
  const by = Object.fromEntries(cells.map((c) => [c.key, c]));
  expect(by.sessions).toEqual({ key: "sessions", state: "partial", text: "1 ca chưa gán host" });
  expect(by.reconcile).toEqual({ key: "reconcile", state: "partial", text: "2/3 ca" });
  expect(by.shop).toEqual({ key: "shop", state: "partial", text: "22/30 ngày · tới 22/09" });
  expect(by.ads.state).toBe("optional");
  expect(by.affiliate).toEqual({ key: "affiliate", state: "partial", text: "Live Analysis Affiliate 21/30 ngày" });
  expect(by.nextPlan.state).toBe("ok");
  expect(by.report).toEqual({ key: "report", state: "partial", text: "nháp" });
  expect(openCount(cells)).toBe(7); // sessions, reconcile, shop, products, promo, affiliate, report — Ads tuỳ chọn không tính
});

test("ca chưa có số, affiliate phiên kế hoạch đã qua ngày, brand không chạy affiliate, tháng chưa hết", () => {
  const base = { brandId: "crocs", platform: "TikTok" as const, stamps: [], nextPlan: null, report: null };
  const t10 = closeRow({
    ...base,
    month: "2026-10",
    today: "2026-10-27",
    sessions: [ca("a", { date: "2026-10-05", actualGmv: 0, totalOrders: 0, dataSource: "manual", liveDurationMinutes: 0 })],
    affiliate: [{ brandId: "crocs", periodMonth: "2026-10-01", status: "planned", liveDateLabel: "9/10/2026" }]
  });
  const by = Object.fromEntries(t10.map((c) => [c.key, c]));
  expect(by.sessions.text).toBe("1 ca chưa có số liệu");
  expect(by.affiliate).toEqual({ key: "affiliate", state: "partial", text: "1 phiên chưa có số liệu" });
  expect(by.shop).toEqual({ key: "shop", state: "optional", text: "tải sau 31/10" }); // tháng chưa hết: không tô đỏ
  expect(by.nextPlan.state).toBe("missing");
  expect(by.report.state).toBe("na");
  const noAff = closeRow({ ...base, month: "2026-09", today: "2026-10-27", sessions: [ca("a")], affiliate: [] });
  expect(noAff.find((c) => c.key === "affiliate")).toEqual({ key: "affiliate", state: "na", text: "không chạy" });
  expect(noAff.find((c) => c.key === "shop")).toEqual({ key: "shop", state: "missing", text: "chưa có" }); // tháng đã hết
});

test("Shopee: cột file Shopee, không có cột affiliate", () => {
  const cells = closeRow({
    brandId: "vera",
    platform: "Shopee",
    month: "2026-09",
    today: "2026-10-27",
    sessions: [ca("a", { brandId: "vera", platform: "Shopee" })],
    stamps: [stamp("shopee_live_list", "2026-09-01", "2026-09-30"), stamp("shopee_daily", "2026-09-01", "2026-09-30"), stamp("shopee_ads", "2026-09-01", "2026-09-30")],
    affiliate: null,
    nextPlan: null,
    report: { status: "published" } as BrandMonthlyReport
  });
  expect(cells.map((c) => c.key)).toEqual(["sessions", "reconcile", "shopeeLive", "shopeeDaily", "shopeeOverview", "shopeeProducts", "ads", "nextPlan", "report"]);
  const by = Object.fromEntries(cells.map((c) => [c.key, c]));
  expect([by.shopeeLive.state, by.shopeeDaily.state, by.shopeeOverview.state, by.ads.state, by.report.state]).toEqual(["ok", "ok", "missing", "ok", "ok"]);
});

test("chặn phát hành: file toàn shop thiếu ngày thì chặn; đủ tháng hoặc chưa tải gì thì cho (bản chỉ livestream)", () => {
  expect(publishBlocker("TikTok", "2026-09", crocsStamps, "2026-10-27")).toMatch(/^File Shop Analytics của tháng 9\/2026 mới phủ 22\/30 ngày \(tới 22\/09\)/);
  expect(publishBlocker("TikTok", "2026-09", [...crocsStamps, stamp("shop_analytics", "2026-09-23", "2026-09-30")], "2026-10-27")).toBeNull();
  expect(publishBlocker("TikTok", "2026-09", [], "2026-10-27")).toBeNull();
  expect(publishBlocker("Shopee", "2026-09", [stamp("shopee_daily", "2026-09-01", "2026-09-15")], "2026-10-27")).toMatch(/Shopee theo ngày/);
  expect(publishBlocker("Shopee", "2026-09", crocsStamps, "2026-10-27")).toBeNull(); // file TikTok không chặn report Shopee
});

test("kênh mở giữa tháng (Franklin Shopee từ 08/10): ngày trước ca đầu tiên không tính là thiếu", () => {
  const sessions = [ca("f1", { brandId: "franklin", platform: "Shopee", date: "2026-10-08" }), ca("f2", { brandId: "franklin", platform: "Shopee", date: "2026-10-25" })];
  const cells = closeRow({
    brandId: "franklin",
    platform: "Shopee",
    month: "2026-10",
    today: "2026-10-27",
    sessions,
    stamps: [stamp("shopee_live_list", "2026-10-08", "2026-10-25")],
    affiliate: null,
    nextPlan: null,
    report: null
  });
  expect(cells.find((c) => c.key === "shopeeLive")).toEqual({ key: "shopeeLive", state: "partial", text: "18/19 ngày · tới 25/10" });
  expect(publishBlocker("Shopee", "2026-09", [stamp("shopee_daily", "2026-09-10", "2026-09-30")], "2026-10-27", ["2026-09-10"])).toBeNull();
  expect(publishBlocker("Shopee", "2026-09", [stamp("shopee_daily", "2026-09-10", "2026-09-30")], "2026-10-27", ["2026-09-05"])).toMatch(/21\/26 ngày/);
});
