// Bản chụp số liệu Report Tháng (2026-09-25, migration 0119) + tổng hợp sẵn product_list.
// Chạy: npm test    (chỉ file này: npx vitest run tests/monthlySnapshot.test.ts)
import { beforeEach, expect, test, vi } from "vitest";
import { LiveSession } from "../src/types";
import type { DataRawImportStamp } from "../src/lib/db/brandDataRaw";

// Không có Supabase trong test — thay các lời gọi DB/Dữ Liệu Gốc bằng bản giả đếm số lần gọi, để
// kiểm đúng điều quan trọng: bấm cập nhật khi không có gì đổi thì KHÔNG tải lại gì.
const calls: string[] = [];
let imports: DataRawImportStamp[] = [];
let prevMonthPieces: Record<string, { stamp: string; data: unknown }> | null = null;

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
vi.mock("../src/lib/db/brandDataRaw", () => ({ fetchDataRawImportStamps: async () => imports }));
vi.mock("../src/lib/db/monthlyReportSnapshots", () => ({ fetchSnapshotPieces: async () => prevMonthPieces }));
vi.mock("../src/lib/dataraw/creatorLivePerfSlice", () => ({
  fetchCreatorLivePerfMonthSlice: async (_b: string, s: string) => (calls.push(`creatorLive ${s}`), { rows: [], missingDays: [], hasAnyBatch: false })
}));
vi.mock("../src/lib/dataraw/monthlyDailySlice", () => ({
  fetchLivePerformanceCoreMonthSlice: async (_b: string, s: string) => (calls.push(`dailyPerf ${s}`), { daily: [], missingDays: [], hasAnyBatch: true })
}));
vi.mock("../src/lib/dataraw/monthlyProductSlice", () => ({
  fetchProductListAggWithPeriod: async (_b: string, s: string, e: string) => (
    calls.push(`productAgg ${s}`), { agg: { v: 2, skus: [["Clog", 100, 60, 2, 2, 3, 1000, 50]], cardGmv: 40, hasSkuCols: true, hasCardCol: true, rowCount: 1 }, periodStart: s, periodEnd: e }
  ),
  fetchShopDaysMonthSlice: async (_b: string, s: string) => (calls.push(`shopDays ${s}`), { days: [{ date: s, gmv: 300, refunds: 30, orders: 3, visitors: 10, liveLinked: 150, affiliate: 50, video: 7 }], hasAnyBatch: true }),
  fetchCardGmvMonthSlice: async (_b: string, s: string) => (calls.push(`card ${s}`), { cardGmv: 40, hasAnyBatch: true }),
  fetchTopPromotionsMonthSlice: async (_b: string, s: string) => (calls.push(`promo ${s}`), { items: [], hasAnyBatch: true, excludedMultiMonth: 0 }),
  topSkuFromAgg: (agg: { skus: [string, number, number, number][] }) => ({ items: agg.skus.map(([name, gmv, gmvLive, orders]) => ({ name, gmv, gmvLive, orders })), hasAnyBatch: true }),
  skuRankFromAgg: (src: { agg: { skus: [string, number][] } } | null) => ({ items: (src?.agg.skus ?? []).map(([name, gmv], i) => ({ name, gmv, rank: i + 1 })), sellingSkus: 1, limit: 30, hasAnyBatch: !!src })
}));

const { buildMonthlyReportSnapshot, hydrateSnapshotSessions, snapshotFreshness, snapshotHeadline } = await import("../src/lib/report/monthlySnapshot");
const { buildProductListAgg, isCurrentProductAgg } = await import("../src/lib/dataraw/productListAgg");

const B = "brand-crocs";
const M = "2026-09";

function ca(id: string, date: string, extra: Partial<LiveSession> = {}): LiveSession {
  return {
    id, title: id, brandId: B, brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: "09:00", endTime: "12:00", status: "Completed",
    targetGmv: 0, actualGmv: 0, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 0, ctrAvg: 0, cvrAvg: 0, skus: [], checklist: [], minuteMetrics: [],
    dataSource: "tiktok_reconciled", ...extra
  } as LiveSession;
}
const imp = (id: string, reportType: DataRawImportStamp["reportType"], periodStart: string, periodEnd: string, importedAt = "2026-09-22T08:00:00Z"): DataRawImportStamp => ({
  id, reportType, periodStart, periodEnd, importedAt
});

// 4 tháng cửa sổ đều có ca có số ⇒ không cần file Creator-Live-Performance dự phòng.
const sessions = [
  ca("jun", "2026-06-10", { actualGmv: 10 }),
  ca("jul", "2026-07-10", { actualGmv: 20 }),
  ca("aug", "2026-08-10", { actualGmv: 30 }),
  ca("sep1", "2026-09-05", { actualGmv: 40, liveDurationMinutes: 120, aiAnalysis: { overallRating: "x" } as LiveSession["aiAnalysis"] }),
  ca("sep2", "2026-09-20", { actualGmv: 50, liveDurationMinutes: 60 }),
  ca("sepX", "2026-09-21", { status: "Cancelled" }),
  ca("other", "2026-09-06", { brandId: "brand-vera", actualGmv: 999 })
];
const baseImports = [
  imp("pl-aug", "product_list", "2026-08-01", "2026-08-31"),
  imp("pl-sep", "product_list", "2026-09-01", "2026-09-22"),
  imp("sa-aug", "shop_analytics", "2026-08-01", "2026-08-31"),
  imp("sa-sep", "shop_analytics", "2026-09-01", "2026-09-22"),
  imp("pr-sep", "shop_promotion", "2026-09-01", "2026-09-22"),
  imp("lp-sep", "live_performance_core_stats", "2026-09-01", "2026-09-21")
];
const live = (over: Partial<Parameters<typeof snapshotFreshness>[1]> = {}) => ({ sessions, brandPlatformRates: [], imports, ...over });

beforeEach(() => {
  calls.length = 0;
  imports = baseImports;
  prevMonthPieces = null;
});

test("dựng lần đầu: bản tổng hợp SKU chỉ đọc 1 lần mỗi tháng (Top SKU + xếp hạng dùng chung), shop + thẻ SP cho đủ 4 tháng, không tải file dự phòng khi đã có ca", async () => {
  const { snapshot, fetched, reused } = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  expect(calls.filter((c) => c === "productAgg 2026-09-01")).toHaveLength(1);
  expect(calls.filter((c) => c === "productAgg 2026-08-01")).toHaveLength(1);
  expect(calls.some((c) => c.startsWith("creatorLive"))).toBe(false);
  expect(reused).toEqual([]);
  expect(fetched.sort()).toEqual(
    ["cardGmv|2026-06", "cardGmv|2026-07", "cardGmv|2026-08", "cardGmv|2026-09", "dailyPerf|2026-09", "shopDays|2026-06", "shopDays|2026-07", "shopDays|2026-08", "shopDays|2026-09", "skuRank|2026-08", "skuRank|2026-09", "topPromo|2026-09", "topSku|2026-09"]
  );
  // Chỉ ca của brand, trong cửa sổ 4 tháng, trừ ca huỷ; không mang theo aiAnalysis.
  expect(snapshot.sessions.map((s) => s.id).sort()).toEqual(["aug", "jul", "jun", "sep1", "sep2"]);
  expect(JSON.stringify(snapshot.sessions)).not.toContain("overallRating");
  expect(snapshot.coverage).toEqual({
    sessionsThrough: "2026-09-20",
    datarawThrough: { product_list: "2026-09-22", shop_analytics: "2026-09-22", shop_promotion: "2026-09-22", live_performance_core_stats: "2026-09-21" }
  });
});

test("bấm cập nhật khi không có gì đổi: tái dùng mọi phần, 0 lần đọc file", async () => {
  const first = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  calls.length = 0;
  const again = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [], previous: first.snapshot });
  expect(calls).toEqual([]);
  expect(again.fetched).toEqual([]);
  expect(snapshotFreshness(first.snapshot, live()).upToDate).toBe(true);
});

test("up đè file Sản Phẩm T9: chỉ tải lại phần dính product_list của T9, báo đúng loại file", async () => {
  const first = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  imports = baseImports.map((i) => (i.id === "pl-sep" ? { ...i, importedAt: "2026-09-25T02:00:00Z" } : i));
  const f = snapshotFreshness(first.snapshot, live());
  expect(f.upToDate).toBe(false);
  expect(f.changedFiles).toEqual(["Sản Phẩm"]);
  expect(f.changedSessions).toBe(0);
  calls.length = 0;
  const again = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [], previous: first.snapshot });
  expect(again.fetched.sort()).toEqual(["cardGmv|2026-09", "skuRank|2026-09", "topSku|2026-09"]);
  expect(calls).toEqual(expect.arrayContaining(["productAgg 2026-09-01"]));
  expect(calls).not.toContain("promo 2026-09-01");
});

test("tháng trước lấy từ bản chụp tháng trước (cùng stamp) thay vì đọc lại file", async () => {
  const aug = await buildMonthlyReportSnapshot({ brandId: B, month: "2026-08", sessions, brandPlatformRates: [] });
  prevMonthPieces = aug.snapshot.pieces;
  calls.length = 0;
  const sep = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  // Cửa sổ T9 = T6..T9; bản chụp T8 (T5..T8) đã có shop + thẻ SP của T6, T7, T8.
  // skuRank|2026-08 = piece tháng report của bản chụp T8 ⇒ hạng tháng trước không phải đọc lại file T8.
  expect(sep.reused.sort()).toEqual(["cardGmv|2026-06", "cardGmv|2026-07", "cardGmv|2026-08", "shopDays|2026-06", "shopDays|2026-07", "shopDays|2026-08", "skuRank|2026-08"]);
  expect(calls).not.toContain("productAgg 2026-08-01");
  expect(calls).not.toContain("shopDays 2026-08-01");
  expect(calls).toContain("shopDays 2026-09-01");
});

test("độ mới: ca đối soát lại / ca mới / ca bị loại đều được đếm, tách riêng số trong tháng report", async () => {
  const { snapshot } = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  const changed = sessions
    .filter((s) => s.id !== "jul") // ca T7 bị loại khỏi báo cáo
    .map((s) => (s.id === "sep2" ? { ...s, actualGmv: 55 } : s))
    .concat([ca("sep3", "2026-09-23", { actualGmv: 5 })]);
  const f = snapshotFreshness(snapshot, live({ sessions: changed }));
  expect(f.changedSessions).toBe(3);
  expect(f.changedSessionsThisMonth).toBe(2);
  // Đổi trường report không đọc (ghi chú phòng) thì không tính là thay đổi.
  const cosmetic = sessions.map((s) => (s.id === "sep1" ? { ...s, studioName: "Room 203" } : s));
  expect(snapshotFreshness(snapshot, live({ sessions: cosmetic })).upToDate).toBe(true);
  // Target kế hoạch đổi ⇒ configChanged.
  expect(snapshotFreshness(snapshot, live({ planMonthTotals: new Map([[`${B}|${M}`, 1]]) })).configChanged).toBe(true);
});

test("hydrate trả lại LiveSession đủ trường mặc định, số khớp với ca gốc", async () => {
  const { snapshot } = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions, brandPlatformRates: [] });
  const round = JSON.parse(JSON.stringify(snapshot));
  const h = hydrateSnapshotSessions(round).find((s) => s.id === "sep1")!;
  expect(h.brandId).toBe(B);
  expect(h.actualGmv).toBe(40);
  expect(h.skus).toEqual([]);
  expect(snapshotHeadline(round)).toMatchObject({ totalGmv: 90, shopGmv: 300, sessionsWithNumbers: 2, liveHours: 3, videoGmv: 7, cardGmv: 40, topSku: "Clog" });
});

test("tổng hợp product_list: gộp dòng trùng tên sau khi làm sạch, cộng GMV thẻ SP, song ngữ", () => {
  const cols = [
    { key: "Tên", label: "Tên" },
    { key: "GMV", label: "GMV" },
    { key: "GMV LIVE của người bán", label: "GMV LIVE của người bán" },
    { key: "Đơn hàng", label: "Đơn hàng" },
    { key: "GMV thẻ sản phẩm của người bán", label: "GMV thẻ sản phẩm của người bán" }
  ];
  const agg = buildProductListAgg(cols, [
    { "Tên": "Giày Clog Nữ Crocs Baya", GMV: "1.000₫", "GMV LIVE của người bán": "600₫", "Đơn hàng": 2, "GMV thẻ sản phẩm của người bán": "300₫" },
    { "Tên": "[SẢN PHẨM ĐỘC QUYỀN ONLINE] Baya", GMV: "500₫", "GMV LIVE của người bán": "0", "Đơn hàng": 1, "GMV thẻ sản phẩm của người bán": "100₫" },
    { "Tên": "Ế", GMV: "0", "GMV LIVE của người bán": "0", "Đơn hàng": 0, "GMV thẻ sản phẩm của người bán": "0" }
  ]);
  expect(agg.skus).toEqual([["Baya", 1500, 600, 3, 0, 0, 0, 0], ["Ế", 0, 0, 0, 0, 0, 0, 0]]);
  expect(agg.cardGmv).toBe(400);
  expect(isCurrentProductAgg(JSON.parse(JSON.stringify(agg)))).toBe(true);
  expect(isCurrentProductAgg({ ...agg, v: 0 })).toBe(false);

  const en = buildProductListAgg([{ key: "Product Name", label: "Product Name" }, { key: "GMV", label: "GMV" }, { key: "Seller product card GMV", label: "Seller product card GMV" }], [
    { "Product Name": "Echo", GMV: 10, "Seller product card GMV": 4 }
  ]);
  expect(en.skus).toEqual([["Echo", 10, 0, 0, 0, 0, 0, 0]]);
  expect(en.cardGmv).toBe(4);
  // Sai loại file: không có cột tên/GMV — phân biệt với "0 SKU".
  expect(buildProductListAgg([{ key: "X", label: "X" }], [{ X: 1 }]).hasSkuCols).toBe(false);
});

test("tổng hợp v2: phễu SKU lấy khối cột TỔNG (cột đầu tiên), không lấy khối LIVE/video lặp tên", () => {
  // Nhãn trùng ở các khối sau được parser đặt key khác (vd "Product impressions__2") — khớp số deck Crocs.
  const cols = [
    { key: "Product Name", label: "Product Name" },
    { key: "GMV", label: "GMV" },
    { key: "SKU orders", label: "SKU orders" },
    { key: "Items sold", label: "Items sold" },
    { key: "Product impressions", label: "Product impressions" },
    { key: "Product clicks", label: "Product clicks" },
    { key: "Product impressions__2", label: "Product impressions" },
    { key: "Product clicks__2", label: "Product clicks" }
  ];
  const agg = buildProductListAgg(cols, [
    { "Product Name": "Baya Platform - Winter White", GMV: "486.186.999₫", "SKU orders": 417, "Items sold": 421, "Product impressions": 1181278, "Product clicks": 32503, "Product impressions__2": 5, "Product clicks__2": 1 }
  ]);
  const [, , , , skuOrders, items, imp, clk] = agg.skus[0];
  expect([skuOrders, items, imp, clk]).toEqual([417, 421, 1181278, 32503]);
  expect(((clk / imp) * 100).toFixed(2)).toBe("2.75");
  expect(((skuOrders / clk) * 100).toFixed(2)).toBe("1.28");
});

test("v3: bản chụp giữ trợ live của ca (bảng Host Theo Loại Ngày ghi giờ trợ); bản chụp v2 bị báo cần cập nhật", async () => {
  const withCo = sessions.map((s) => (s.id === "sep1" ? { ...s, coHostId: "t-toan", coHostName: "Toàn" } : s));
  const { snapshot } = await buildMonthlyReportSnapshot({ brandId: B, month: M, sessions: withCo, brandPlatformRates: [] });
  const round = JSON.parse(JSON.stringify(snapshot));
  const h = hydrateSnapshotSessions(round).find((s) => s.id === "sep1")!;
  expect(h.coHostId).toBe("t-toan");
  expect(h.coHostName).toBe("Toàn");
  expect(hydrateSnapshotSessions(round).find((s) => s.id === "sep2")!.coHostName).toBe("");
  expect(snapshotFreshness(round, live({ sessions: withCo })).upToDate).toBe(true);
  // Bản chụp dựng trước v3: không có trợ live ⇒ phải hiện "cần cập nhật".
  const v2 = { ...round, version: 2, sessions: round.sessions.map(({ coHostId: _i, coHostName: _n, ...s }: Record<string, unknown>) => s) };
  const f = snapshotFreshness(v2, live({ sessions: withCo }));
  expect(f.configChanged).toBe(true);
  expect(f.changedSessions).toBe(1);
});
