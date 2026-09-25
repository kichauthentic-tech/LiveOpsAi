// Report Tháng 8 phần (2026-09-25) — so cùng số ngày, tách nguyên nhân, tổng shop theo kênh, dấu hiệu
// xu hướng, bản nháp tóm tắt. Số mẫu lấy từ CROCS thật (T8 1–22 vs T9 1–22, đo 2026-09-25).
// Chạy: npm test    (chỉ file này: npx vitest run tests/monthlyReportInsights.test.ts)
import { expect, test } from "vitest";
import {
  autoNextSteps,
  autoSummary,
  channelMix,
  compareWindow,
  driverBreakdown,
  liveStatsFromRows,
  LiveStats,
  shopTotals,
  trendSignal
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
  sessions: 1, gmv, hours, views, orders: 1, skuOrders: 1, productImpressions: 1, productClicks: 1,
  gmvPerHour: gmv / hours, viewsPerHour: views / hours, gmvPerView: gmv / views, ctr: null, ctor: null, aov: null, ...extra
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
  expect(summary).toMatch(/Phần lớn mức giảm đến từ lượt xem mỗi giờ/);
  expect(summary).toContain("CTOR giảm 4 tháng liên tiếp");
  expect(summary).toContain("D-Day");
  const next = autoNextSteps(input).join("\n");
  expect(next).toContain("CTOR");
  expect(next).toContain("5,5 tỷ");
  expect(next).toContain("75 ca");
});
