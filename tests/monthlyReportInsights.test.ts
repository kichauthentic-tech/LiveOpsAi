// Report Tháng 8 phần (2026-09-25) — so cùng số ngày, tách nguyên nhân, tổng shop theo kênh, dấu hiệu
// xu hướng, bản nháp tóm tắt. Số mẫu lấy từ CROCS thật (T8 1–22 vs T9 1–22, đo 2026-09-25).
// Chạy: npm test    (chỉ file này: npx vitest run tests/monthlyReportInsights.test.ts)
import { expect, test } from "vitest";
import {
  autoNextSteps,
  autoSummary,
  basketBreakdown,
  campCompare,
  channelMix,
  compareWindow,
  driverBreakdown,
  liveStatsFromRows,
  LiveStats,
  planCampAllocation,
  shopKpiProgress,
  shopTotals,
  skuMoves,
  trendSignal,
  UPT_LABEL
} from "../src/lib/report/monthlyReportInsights";
import type { CreatorLivePerfRow } from "../src/lib/dataraw/creatorLivePerfSlice";

test("cửa sổ so sánh: tháng chưa hết so cùng số ngày, tháng đủ so trọn tháng, tháng trước ngắn hơn thì cắt ở ngày cuối", () => {
  expect(compareWindow("2026-09", "2026-09-22")).toMatchObject({ curEnd: "2026-09-22", prevEnd: "2026-08-22", partial: true, label: "1–22/09 so với 1–22/08" });
  // Tháng 9 có 30 ngày: có số tới 30/09 là ĐỦ tháng ⇒ so trọn tháng 8 (31 ngày), không cắt ở 30/08.
  expect(compareWindow("2026-09", "2026-09-30")).toMatchObject({ curEnd: "2026-09-30", prevEnd: "2026-08-31", partial: false });
  // 1–30/03 so với tháng 2 (28 ngày) ⇒ cắt ở 28/02, không ra ngày 30/02.
  expect(compareWindow("2026-03", "2026-03-30")).toMatchObject({ prevEnd: "2026-02-28", partial: true });
  // Chưa có ca nào có số ⇒ coi như trọn tháng.
  expect(compareWindow("2026-09", null)).toMatchObject({ curEnd: "2026-09-30", partial: false });
});

function row(startTimeIso: string, gmv: number, extra: Partial<CreatorLivePerfRow> = {}): CreatorLivePerfRow {
  return {
    startTime: startTimeIso, hours: 2, gmv, itemsSold: 0, orders: 2, skuOrders: 2, customers: 0, aov: 0, views: 100, impressions: 0,
    gmvPerHour: 0, avgViewDurationSec: 0, liveCtr: 0, productImpressions: 50, productClicks: 10, ctr: 0, ctor: 0,
    newFollowers: 0, comments: 0, shares: 0, likes: 0, ...extra
  } as CreatorLivePerfRow;
}

test("chỉ số theo cửa sổ lọc theo NGÀY GIỜ VN của giờ bắt đầu ca", () => {
  // 23/09 00:30 giờ VN = 22/09 17:30Z — thuộc ngày 23 (VN), không lọt vào cửa sổ 1–22.
  const rows = [row("2026-09-22T10:00:00.000Z", 100), row("2026-09-22T17:30:00.000Z", 999)];
  const s = liveStatsFromRows(rows, "2026-09-01", "2026-09-22");
  expect(s.sessions).toBe(1);
  expect(s.gmv).toBe(100);
  expect(s.ctor).toBe(20);
  expect(s.gmvPerView).toBe(1);
});

const stats = (gmv: number, hours: number, views: number, extra: Partial<LiveStats> = {}): LiveStats => ({
  sessions: 1, gmv, hours, views, orders: 1, skuOrders: 1, itemsSold: 1, productImpressions: 1, productClicks: 1,
  gmvPerHour: gmv / hours, viewsPerHour: views / hours, gmvPerView: gmv / views, ctr: null, ctor: null, aov: null,
  upt: null, pricePerItem: null, liveCtr: null, ...extra
});
// CROCS thật: 1–22/08 vs 1–22/09.
const t8 = stats(4_309_000_000, 153.6, 526_400);
const t9 = stats(3_517_000_000, 177.8, 496_400);

test("tách nguyên nhân: 3 phần cộng đúng ΔGMV, chiều đúng như số thật CROCS", () => {
  const d = driverBreakdown(t8, t9)!;
  const sum = d.parts.reduce((a, p) => a + p.value, 0);
  expect(Math.abs(sum - d.delta)).toBeLessThan(1);
  const by = Object.fromEntries(d.parts.map((p) => [p.key, p.value]));
  expect(by.hours).toBeGreaterThan(0); // giờ live tăng
  expect(by.viewsPerHour).toBeLessThan(0); // lượt xem mỗi giờ giảm
  expect(by.gmvPerView).toBeLessThan(0); // mỗi lượt xem ra ít tiền hơn
  // Thiếu lượt xem ở một bên ⇒ không bịa phần tách.
  expect(driverBreakdown(t8, { ...t9, views: 0, viewsPerHour: null, gmvPerView: null })).toBeNull();
  // GMV không đổi ⇒ không chia cho 0.
  const flat = driverBreakdown(t8, stats(4_309_000_000, 170, 526_400))!;
  expect(flat.parts.every((p) => Number.isFinite(p.value))).toBe(true);
});

test("dấu hiệu xu hướng: CTOR CROCS giảm 4 tháng liên tiếp; dao động nhỏ hoặc đổi chiều thì không báo", () => {
  const ctor = trendSignal("CTOR", [1.99, 1.73, 1.54, 1.25])!;
  expect(ctor).toMatchObject({ direction: "down", streak: 4 });
  expect(Math.round(ctor.totalChange)).toBe(-37);
  expect(trendSignal("CTR", [2.99, 3.1, 3.12, 3.17])).toBeNull(); // tăng liền nhưng tổng < 10%
  expect(trendSignal("X", [10, 12, 9, 8])).toMatchObject({ direction: "down", streak: 3 });
  expect(trendSignal("X", [10, 8, 12, 9])).toBeNull(); // chỉ 1 bước
  expect(trendSignal("X", [10, null, 8, 6])).toBeNull(); // thiếu tháng ⇒ không kết luận
});

test("toàn shop: cộng theo ngày trong cửa sổ; 4 kênh ÷ tổng để kiểm chéo", () => {
  const slice = {
    hasAnyBatch: true,
    days: [
      { date: "2026-09-01", gmv: 1000, refunds: 150, orders: 1, visitors: 5, liveLinked: 600, affiliate: 100, video: 50 },
      { date: "2026-09-23", gmv: 9999, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0 }
    ]
  };
  const t = shopTotals(slice, "2026-09-01", "2026-09-22")!;
  expect(t).toMatchObject({ gmv: 1000, days: 1, through: "2026-09-01" });
  const mix = channelMix("2026-09", t, 250)!;
  expect(mix.coverage).toBe(100);
  expect(mix.refundRate).toBe(15);
  expect(shopTotals({ hasAnyBatch: false, days: [] }, "2026-09-01", "2026-09-30")).toBeNull();
  expect(channelMix("2026-09", t, null)!.coverage).toBeNull();
});

test("bản nháp tóm tắt + việc tháng sau nêu đúng số và đúng nguyên nhân chính", () => {
  const window = compareWindow("2026-09", "2026-09-22");
  const input = {
    month: "2026-09",
    window,
    shopCur: { gmv: 5_207_000_000, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0, days: 22, through: "2026-09-22" },
    shopPrev: null,
    liveCur: { ...t9, ctr: 3.17 },
    livePrev: t8,
    drivers: driverBreakdown(t8, t9),
    basket: null,
    signals: [trendSignal("CTOR", [1.99, 1.73, 1.54, 1.25])!],
    targetGmv: null,
    campBest: { label: "D-Day (double-day)", gmvPerHour: 26_500_000 },
    dailyGmvPerHour: 17_900_000,
    nextMonth: "2026-10",
    nextPlan: { targetGmv: 5_500_000_000, status: "draft" as const, slotCount: 75 }
  };
  const summary = autoSummary(input).join("\n");
  expect(summary).toContain("5,21 tỷ");
  expect(summary).toContain("67,5% tổng shop");
  expect(summary).toContain("1–22/09 so với 1–22/08");
  expect(summary).toContain("−18,4%");
  expect(summary).toMatch(/Phần lớn mức giảm đến từ Views\/giờ/);
  expect(summary).toContain("CTOR giảm 4 tháng liên tiếp");
  expect(summary).toContain("D-Day");
  const next = autoNextSteps(input).join("\n");
  expect(next).toContain("CTOR");
  expect(next).toContain("5,5 tỷ");
  expect(next).toContain("75 ca");
});

// CROCS thật, trọn tháng 7 vs 8 (đo 2026-09-26 từ live_sessions; khớp deck report tháng 8 của Crocs:
// đơn 5.291 / SP 6.270 / UPT 1,19 / giá/SP 930.641).
const basketStats = (gmv: number, orders: number, itemsSold: number): LiveStats =>
  stats(gmv, 200, 700_000, { orders, itemsSold, aov: gmv / orders, upt: itemsSold / orders, pricePerItem: gmv / itemsSold });
const b7 = basketStats(5_187_000_000, 4838, 6902);
const b8 = basketStats(5_885_000_000, 5333, 6319);

test("tách phía giỏ hàng: 3 phần cộng đúng ΔGMV; CROCS T8 tăng chủ yếu nhờ số đơn, không phải giá", () => {
  const b = basketBreakdown(b7, b8)!;
  expect(Math.abs(b.parts.reduce((a, p) => a + p.value, 0) - b.delta)).toBeLessThan(1);
  const by = Object.fromEntries(b.parts.map((p) => [p.key, p]));
  expect(by.upt.value).toBeLessThan(0); // mỗi đơn ít SP hơn
  expect(by.pricePerItem.value).toBeGreaterThan(0); // GMV/SP tăng — hệ quả của UPT giảm
  expect(by.orders.change).toBeCloseTo(10.2, 1);
  // Thiếu số SP ở một bên ⇒ không bịa.
  expect(basketBreakdown(b7, { ...b8, itemsSold: 0, upt: null, pricePerItem: null })).toBeNull();

  const summary = autoSummary({
    month: "2026-08",
    window: compareWindow("2026-08", "2026-08-31"),
    shopCur: null,
    shopPrev: null,
    liveCur: b8,
    livePrev: b7,
    drivers: null,
    basket: b,
    signals: [],
    targetGmv: null,
    campBest: null,
    dailyGmvPerHour: null,
    nextMonth: "2026-09",
    nextPlan: null
  }).join("\n");
  expect(summary).toContain("Orders +10%");
  expect(summary).toContain("AOV +3%");
  expect(summary).toContain("UPT 1,43 → 1,18 (−17%)");
  expect(summary).toContain("gần như bù nhau");
  // Không được kết luận "GMV tăng nhờ Avg. price" dù đó là phần lớn nhất trong 3 phần.
  expect(summary).not.toMatch(/Avg\. price là phần/);
});

test("UPT CROCS giảm 4 tháng liền ⇒ báo xu hướng + gợi ý việc tháng sau", () => {
  const upt = trendSignal(UPT_LABEL, [1.76, 1.43, 1.18, 1.06])!;
  expect(upt).toMatchObject({ direction: "down", streak: 4 });
  const input = {
    month: "2026-09", window: compareWindow("2026-09", "2026-09-22"), shopCur: null, shopPrev: null, liveCur: t9, livePrev: t8,
    drivers: null, basket: null, signals: [upt], targetGmv: null, campBest: null, dailyGmvPerHour: null, nextMonth: "2026-10", nextPlan: null
  };
  expect(autoSummary(input).join("\n")).toContain("UPT giảm 4 tháng liên tiếp: 1,76 → 1,43 → 1,18 → 1,06");
  expect(autoNextSteps(input).join("\n")).toContain("combo 2 sản phẩm");
});

test("so camp với camp tháng trước: mỗi tháng dùng khoảng camp của chính nó", () => {
  // Tháng 9 dời D-Day sang 20–22/09; tháng 8 không dời ⇒ 08/08 vẫn phải là D-Day của tháng 8.
  const cur = [row("2026-09-09T03:00:00.000Z", 100), row("2026-09-21T03:00:00.000Z", 300)];
  const prev = [row("2026-08-08T03:00:00.000Z", 500), row("2026-08-10T03:00:00.000Z", 50)];
  const rows = campCompare(
    cur, { start: "2026-09-01", end: "2026-09-30", overrides: { dday: { start: "2026-09-20", end: "2026-09-22" } } },
    prev, { start: "2026-08-01", end: "2026-08-31" },
    { dday: 400 }
  );
  const dday = rows.find((r) => r.key === "dday")!;
  expect(dday.cur.gmv).toBe(300);
  expect(dday.prev.gmv).toBe(500);
  expect(dday.target).toBe(400);
  // 09/09 là D-Day cố định nhưng tháng 9 đã dời D-Day ⇒ thành ngày thường.
  expect(rows.find((r) => r.key === "daily")!.cur.gmv).toBe(100);
  expect(rows.find((r) => r.key === "daily")!.prev.gmv).toBe(50);
});

test("phân bổ Kế Hoạch Tháng theo camp: target, giờ (ca qua đêm), % và GMV/giờ cần", () => {
  const a = planCampAllocation([
    { date: "2026-10-10", startTime: "19:00", endTime: "00:00", targetGmv: 200 }, // D-Day, 5h qua nửa đêm
    { date: "2026-10-05", startTime: "10:00", endTime: "14:00", targetGmv: 600 } // ngày thường, 4h
  ]);
  const by = Object.fromEntries(a.map((x) => [x.key, x]));
  expect(by.dday).toMatchObject({ target: 200, hours: 5, slots: 1, share: 25, requiredGmvPerHour: 40 });
  expect(by.daily).toMatchObject({ target: 600, hours: 4, share: 75, requiredGmvPerHour: 150 });
  expect(by.payday).toMatchObject({ target: 0, share: 0, requiredGmvPerHour: null });
});

test("hạng SKU: so hạng thẳng, % GMV tính MỖI NGÀY khi 2 file phủ số ngày khác nhau; SKU ngoài top tháng trước không bịa %", () => {
  const sku = (name: string, rank: number, gmv: number, extra = {}) => ({ name, rank, gmv, gmvLive: 0, orders: 10, ...extra });
  const prev = { items: [sku("Baya Platform", 1, 3_100), sku("Classic Bone", 2, 2_000), sku("Baya White", 8, 500)], sellingSkus: 40, limit: 30, hasAnyBatch: true, periodStart: "2026-08-01", periodEnd: "2026-08-31" };
  const cur = {
    items: [sku("Baya Platform", 1, 2_200, { skuOrders: 417, clicks: 32_503, impressions: 1_181_278 }), sku("Baya White", 2, 1_100), sku("Mới", 3, 900)],
    sellingSkus: 35, limit: 30, hasAnyBatch: true, periodStart: "2026-09-01", periodEnd: "2026-09-22"
  };
  const m = skuMoves(cur, prev)!;
  expect(m).toMatchObject({ perDay: true, curDays: 22, prevDays: 31, prevLimit: 30 });
  // 2.200/22 = 100/ngày vs 3.100/31 = 100/ngày ⇒ 0%, KHÔNG phải −29%.
  expect(m.rows[0].gmvChange).toBeCloseTo(0, 5);
  expect(m.rows[0].ctr).toBeCloseTo(2.75, 2);
  expect(m.rows[0].ctor).toBeCloseTo(1.28, 2);
  expect(m.rows[1]).toMatchObject({ rank: 2, prevRank: 8 });
  expect(m.rows[2]).toMatchObject({ prevRank: null, gmvChange: null });
  // Cùng số ngày ⇒ so GMV thẳng.
  expect(skuMoves({ ...cur, periodEnd: "2026-09-30" }, { ...prev, periodEnd: "2026-08-30" })!.perDay).toBe(false);

  const text = autoSummary({
    month: "2026-09", window: compareWindow("2026-09", "2026-09-22"), shopCur: null, shopPrev: null, liveCur: t9, livePrev: t8,
    drivers: null, basket: null, signals: [], targetGmv: null, campBest: null, dailyGmvPerHour: null, nextMonth: "2026-10", nextPlan: null, skus: m
  }).join("\n");
  expect(text).toContain("SKU dẫn đầu: Baya Platform (giữ hạng 1, GMV mỗi ngày +0%)");
  expect(text).toContain("Lên hạng mạnh nhất: Baya White (8 → 2");
});

test("KPI cả shop: tháng đủ so thẳng (deck Crocs T8 9,1 tỷ vs KPI 8,4 tỷ); tháng dở dự kiến theo nhịp cùng kỳ tháng trước", () => {
  const shop = (gmv: number, through: string) => ({ gmv, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0, days: 1, through });
  const full = shopKpiProgress(8_400_000_000, shop(9_100_000_000, "2026-08-31"), 31, null)!;
  expect(full.partial).toBe(false);
  expect(full.pct).toBeCloseTo(108.33, 1);
  expect(full.projected).toBe(9_100_000_000);
  // T9 tới 22/09 = 5,21 tỷ; T8 1–22 = 6,75 tỷ trên cả tháng 9,1 tỷ ⇒ còn ~26% GMV nằm ở 9 ngày cuối (có Pay Day).
  const sep = shopKpiProgress(8_000_000_000, shop(5_210_000_000, "2026-09-22"), 30, { toDay: 6_750_000_000, total: 9_100_000_000 })!;
  expect(sep.partial).toBe(true);
  expect(sep.method).toBe("prev");
  expect(sep.projected).toBeCloseTo(7_023_852_000, -6);
  // Không có tháng trước ⇒ chia đều theo ngày.
  const lin = shopKpiProgress(8_000_000_000, shop(5_210_000_000, "2026-09-22"), 30, null)!;
  expect(lin.method).toBe("linear");
  expect(lin.projected).toBeCloseTo((5_210_000_000 / 22) * 30, -3);
  expect(shopKpiProgress(0, shop(1, "2026-09-22"), 30, null)).toBeNull();
  expect(shopKpiProgress(8_000_000_000, null, 30, null)).toBeNull();

  const base = {
    month: "2026-08", window: compareWindow("2026-08", "2026-08-31"), shopCur: shop(9_100_000_000, "2026-08-31"), shopPrev: null,
    liveCur: t9, livePrev: t8, drivers: null, basket: null, signals: [], targetGmv: null, campBest: null, dailyGmvPerHour: null,
    nextMonth: "2026-09", nextPlan: null
  };
  expect(autoSummary({ ...base, shopKpi: full })[0]).toContain("Cả shop đạt 108% KPI 8,4 tỷ đ (vượt 700 triệu đ).");
  expect(autoSummary({ ...base, shopKpi: sep })[0]).toMatch(/Cả shop đạt 65% KPI 8 tỷ đ; theo nhịp cùng kỳ tháng trước, dự kiến cuối tháng ~7,02 tỷ đ \(88% KPI\)\./);
});
