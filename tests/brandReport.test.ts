// Report Tháng gửi brand — 10 trang (demo CROCS T9 user duyệt 24/10/2026). Số mẫu lấy từ bảng Host theo loại ngày của Report
// Tháng CROCS (T8 bản chụp 26/09, T9 bản chụp 23/10) và sheet kế hoạch Affiliate T10 của ops.
// Chạy: npx vitest run tests/brandReport.test.ts
import { expect, test } from "vitest";
import type { CreatorLivePerfRow } from "../src/lib/dataraw/creatorLivePerfSlice";
import type { AffiliateActualEntry } from "../src/types";
import { campCompare } from "../src/lib/report/monthlyReportInsights";
import {
  bucketStats,
  campSpanLabels,
  changeTone,
  creatorPlanRows,
  creatorRates,
  creatorSessionRows,
  creatorTotals,
  dayTypeFactorRows,
  keyMetricsTable,
  noiseBand,
  scoreRows,
  type KeyMetricsMonth
} from "../src/lib/report/brandReport";

// Một ca = một dòng; giờ VN 10:00 = 03:00Z.
function ca(date: string, gmv: number, hours: number, views: number, clicks: number, orders: number): CreatorLivePerfRow {
  return {
    startTime: `${date}T03:00:00.000Z`, hours, gmv, itemsSold: orders, orders, skuOrders: orders, customers: 0, aov: 0, views, impressions: 0,
    gmvPerHour: 0, avgViewDurationSec: 0, liveCtr: 0, productImpressions: clicks * 30, productClicks: clicks, ctr: 0, ctor: 0,
    newFollowers: 0, comments: 0, shares: 0, likes: 0, sourceRow: {}
  };
}
// Chia một tổng (GMV, giờ, views, clicks, orders) thành n ca bằng nhau trên các ngày cho trước.
function many(days: string[], n: number, gmv: number, hours: number, views: number, clicks: number, orders: number): CreatorLivePerfRow[] {
  return Array.from({ length: n }, (_, i) => ca(days[i % days.length], gmv / n, hours / n, views / n, clicks / n, orders / n));
}

test("ngưỡng dao động: 4 ca mỗi bên ±36%, 55 ca ±10%; một bên không có ca ⇒ null", () => {
  expect(Math.round(noiseBand(4, 4)!)).toBe(36);
  expect(Math.round(noiseBand(55, 55)!)).toBe(10);
  expect(Math.round(noiseBand(36, 55)!)).toBe(11);
  expect(noiseBand(0, 14)).toBeNull();
  expect(changeTone(-30, 11, true)).toBe("down");
  expect(changeTone(-15, 27, true)).toBe("noise");
  expect(changeTone(+20, 11, true)).toBe("up");
  expect(changeTone(-29, 27, null)).toBe("shift"); // UPT D-Day: đổi thật nhưng không đánh giá tốt/xấu
  expect(changeTone(null, 10, true)).toBe("noise");
});

test("bảng nhiệt CROCS T8 → T9: chỉ Daily giảm GMV/giờ vượt ngưỡng, 3 đợt camp nằm trong ngưỡng; Daily đứng đầu", () => {
  const aug = [
    ...many(["2026-08-04", "2026-08-05"], 36, 2.81e9, 107.9, 356_606, 207_018, 2579),
    ...many(["2026-08-07"], 5, 1.17e9, 37.5, 141_593, 75_889, 1066),
    ...many(["2026-08-14"], 6, 863e6, 37, 100_926, 54_272, 772),
    ...many(["2026-08-24"], 10, 943e6, 41.1, 112_746, 64_993, 830)
  ];
  const sep = [
    ...many(["2026-09-04", "2026-09-05"], 55, 2.61e9, 142.6, 368_209, 180_411, 2213),
    ...many(["2026-09-08"], 14, 971.9e6, 36.5, 111_999, 66_429, 864),
    ...many(["2026-09-14"], 12, 796.9e6, 43.1, 107_588, 56_326, 724),
    ...many(["2026-09-24"], 14, 829.6e6, 39.1, 98_888, 54_025, 762)
  ];
  const augCamp = { dday: { start: "2026-08-06", end: "2026-08-08" } };
  const sepCamp = { dday: { start: "2026-09-07", end: "2026-09-09" } };
  const rows = dayTypeFactorRows(
    campCompare(sep, { start: "2026-09-01", end: "2026-09-30", overrides: sepCamp }, aug, { start: "2026-08-01", end: "2026-08-31", overrides: augCamp }, {})
  );
  expect(rows.map((r) => r.key)).toEqual(["daily", "dday", "midmonth", "payday"]);
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(Math.round(by.daily.change.gmvPerHour!)).toBe(-30);
  expect(Math.round(by.daily.change.viewsPerHour!)).toBe(-22);
  expect(Math.round(by.daily.change.liveCtr!)).toBe(-16);
  expect(Math.round(by.daily.band!)).toBe(11);
  expect(by.daily.significant).toBe(true);
  expect([by.dday.significant, by.midmonth.significant, by.payday.significant]).toEqual([false, false, false]);
  expect(Math.round(by.dday.band!)).toBe(27);
});

test("Key Metrics 3 tháng: bảng theo loại ngày, % so tháng trước tô theo ngưỡng; giờ live không đánh giá; đếm chỉ số suy giảm", () => {
  const month = (m: string, n: number, gmv: number, hours: number, views: number): KeyMetricsMonth => {
    const rows = many([`${m}-04`], n, gmv, hours, views, views / 2, gmv / 1e6);
    const stats = bucketStats(rows, `${m}-01`, `${m}-28`);
    return { month: m, stats, targets: null, gmvForTarget: { all: gmv, daily: gmv, dday: 0, midmonth: 0, payday: 0 } };
  };
  const t = keyMetricsTable([month("2026-07", 38, 2.44e9, 106.9, 357_592), month("2026-08", 36, 2.81e9, 107.9, 356_606), month("2026-09", 55, 2.61e9, 142.6, 368_209)], "daily");
  const gph = t.rows.find((r) => r.def.key === "gmvPerHour")!;
  expect(gph.changes.map((c) => (c == null ? null : Math.round(c)))).toEqual([null, 14, -30]);
  expect(gph.tones).toEqual(["noise", "up", "down"]);
  expect(t.rows.find((r) => r.def.key === "hours")!.tones[2]).toBe("noise"); // +32% giờ live nhưng không tô
  expect(t.bands.map((b) => (b == null ? null : Math.round(b)))).toEqual([null, 12, 11]);
  expect(t.downCount).toBeGreaterThan(0);
  // Bảng đợt camp trống (không có ca) ⇒ mọi giá trị null, không có tông màu.
  const empty = keyMetricsTable([month("2026-08", 36, 2.81e9, 107.9, 356_606), month("2026-09", 55, 2.61e9, 142.6, 368_209)], "dday");
  expect(empty.rows.every((r) => r.values.every((v) => v == null) && r.tones.every((x) => x === "noise"))).toBe(true);
});

test("khoảng ngày đợt camp theo khung hiệu lực của tháng", () => {
  expect(campSpanLabels("2026-09")).toEqual({ dday: "7–9/9", midmonth: "13–15/9", payday: "23–25/9" });
  expect(campSpanLabels("2026-08", { dday: { start: "2026-08-06", end: "2026-08-08" } }).dday).toBe("6–8/8");
});

test("bảng điểm: % Target từng loại ngày + KPI cả shop; thiếu target ⇒ null, không chia 0", () => {
  const rows = scoreRows(5_220_288_000, 5.22e9, [
    { key: "dday", target: 1_025_590_000, actual: 971.9e6 },
    { key: "daily", target: 2_606_389_000, actual: 2.62e9 },
    { key: "payday", target: null, actual: 829.6e6 }
  ], { target: 8_576_224_000, actual: 7_556_536_315 });
  expect(rows.map((r) => r.key)).toEqual(["all", "daily", "dday", "payday", "shop"]);
  expect(Math.round(rows[2].pct! * 10) / 10).toBe(94.8);
  expect(Math.round(rows[4].pct! * 10) / 10).toBe(88.1);
  expect(rows[3].pct).toBeNull();
});

test("bảng điểm tháng còn dở: % theo target tới nay (khớp Dashboard T10 CROCS: Daily 103%, cả tháng 95%); khung chưa tới ⇒ null", () => {
  const rows = scoreRows(5.15e9, 4.43e9, [
    { key: "daily", target: 2.33e9, actual: 1.89e9 },
    { key: "dday", target: 1.08e9, actual: 1.16e9 },
    { key: "payday", target: 925.4e6, actual: 0 }
  ], null, { all: 4.66e9, daily: 1.83e9, dday: 1.08e9, payday: 0 });
  const by = (k: string) => rows.find((r) => r.key === k)!;
  expect(Math.round(by("all").pct!)).toBe(95);
  expect(Math.round(by("daily").pct!)).toBe(103);
  expect(Math.round(by("dday").pct!)).toBe(107);
  expect(by("payday").pct).toBeNull();
  expect(by("all").target).toBe(5.15e9); // cột "cả tháng" vẫn giữ
});

const entry = (e: Partial<AffiliateActualEntry>): AffiliateActualEntry => ({ brandId: "b", periodMonth: "2026-09-01", creatorName: "?", ...e });

test("affiliate CROCS T9: 6 phiên creator, Khói 64,7% GMV; lịch T10 so GMV/giờ mục tiêu với phiên tốt nhất của creator", () => {
  const done = creatorSessionRows([
    entry({ creatorName: "Khói", liveDateLabel: "3/9/2026", targetGmv: 300e6, directGmv: 204.1e6, durationHours: 7.8, adsCost: 9.93e6 }),
    entry({ creatorName: "Khói", liveDateLabel: "11/9/2026", targetGmv: 300e6, directGmv: 16.6e6, durationHours: 0.8, adsCost: 1.08e6 }),
    entry({ creatorName: "Khói", liveDateLabel: "25/9/2026", targetGmv: 350e6, directGmv: 152.2e6, durationHours: 7.8, adsCost: 12e6 }),
    entry({ creatorName: "Mạnh Ka", liveDateLabel: "9/9/2026", targetGmv: 200e6, directGmv: 45.6e6, durationHours: 4.4, adsCost: 5e6 }),
    entry({ creatorName: "Mạnh Ka", liveDateLabel: "24/9/2026", targetGmv: 150e6, directGmv: 104.5e6, durationHours: 4.9, adsCost: 6.6e6 }),
    entry({ creatorName: "Linh Ân", liveDateLabel: "20/9/2026", targetGmv: 300e6, directGmv: 53.6e6, durationHours: 4.6, adsCost: 5.5e6 }),
    entry({ creatorName: "Long Pham", liveDateLabel: "28/9/2026", targetGmv: 80e6, status: "planned" }) // chưa live ⇒ không tính
  ]);
  expect(done.map((r) => r.date)).toEqual(["2026-09-03", "2026-09-09", "2026-09-11", "2026-09-20", "2026-09-24", "2026-09-25"]);
  const t = creatorTotals(done);
  expect([t.sessions, t.creators, Math.round(t.gmv / 1e5) / 10, Math.round(t.target / 1e6)]).toEqual([6, 3, 576.6, 1600]);
  expect(t.top!.creator).toBe("Khói");

  // Audit 27/10: % target và ROAS chỉ trên phiên có target / có Ads — trước đây GMV cả 4 phiên ÷ target 1 phiên = 117,7%.
  const crocsT9 = creatorTotals(creatorSessionRows([
    entry({ creatorName: "Khói", liveDateLabel: "3/9/2026", targetGmv: 300e6, directGmv: 225_248_394, durationHours: 7.8, adsCost: 9_930_000, status: "done" }),
    entry({ creatorName: "Mạnh Ka", liveDateLabel: "9/9/2026", directGmv: 49_273_277, durationHours: 4.4, status: "done" }),
    entry({ creatorName: "Khói", liveDateLabel: "11/9/2026", directGmv: 17_665_514, durationHours: 0.8, status: "done" }),
    entry({ creatorName: "Linh Ân", liveDateLabel: "20/9/2026", directGmv: 60_937_008, status: "done" })
  ]));
  const rate = creatorRates(crocsT9);
  expect(Math.round(rate.pctTarget!)).toBe(75);
  expect(Math.round(rate.roas! * 10) / 10).toBe(22.7);
  expect([crocsT9.targetSessions, crocsT9.adsSessions]).toEqual([1, 1]);
  expect(Math.round(rate.gmvPerHour! / 1e5) / 10).toBe(22.5); // Linh Ân không có giờ ⇒ không vào GMV/giờ
  expect(creatorRates(creatorTotals([]))).toEqual({ pctTarget: null, gmvPerHour: null, roas: null });
  expect(Math.round(t.top!.share * 10) / 10).toBe(64.7);

  const plan = creatorPlanRows([
    entry({ creatorName: "Mạnh Ka", liveDateLabel: "15/10/2026", campName: "Mid-Month", planTimelineLabel: "19h - 24h", targetGmv: 150e6 }),
    entry({ creatorName: "Khói", liveDateLabel: "9/10/2026", campName: "D-Day", planTimelineLabel: "10h - 18h", targetGmv: 700e6 }),
    entry({ creatorName: "Long Pham", liveDateLabel: "24/10/2026", campName: "Pay Day", planTimelineLabel: "09h - 13h", targetGmv: 80e6, planBudgetAds: 2e6 }),
    entry({ creatorName: "Linh Ân", liveDateLabel: "24/10/2026", targetGmv: 150e6, status: "cancelled" })
  ], done);
  expect(plan.map((r) => r.creator)).toEqual(["Khói", "Mạnh Ka", "Long Pham"]);
  expect(plan[0].requiredGmvPerHour).toBe(87.5e6);
  expect(plan[0].budgetAds).toBe(24.5e6); // D-Day 3,5% mặc định
  expect(Math.round(plan[0].ratio! * 10) / 10).toBe(3.3); // 87,5M ÷ 26,2M (phiên 03/09)
  expect(Math.round(plan[1].ratio! * 10) / 10).toBe(1.4); // 30M ÷ 21,3M (phiên 24/09)
  expect([plan[2].bestGmvPerHour, plan[2].ratio, plan[2].budgetAds]).toEqual([null, null, 2e6]);
});
