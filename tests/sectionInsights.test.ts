// Khung Insight từng phần của Report Tháng — số mẫu lấy từ CROCS thật (T8/T9 2026), đo lúc build 2026-09-26.
import { expect, test } from "vitest";
import type { CampCompareRow, ChannelMix, LiveStats, SkuMoves } from "../src/lib/report/monthlyReportInsights";
import {
  contextInsight,
  hostVsPeer,
  insightToText,
  parseInsightText,
  peopleInsight,
  productsInsight,
  shopInsight,
  shortSku,
  whyInsight
} from "../src/lib/report/sectionInsights";

const stats = (gmv: number, hours: number, views: number, extra: Partial<LiveStats> = {}): LiveStats => ({
  sessions: 1, gmv, hours, views, orders: 1, skuOrders: 1, itemsSold: 1, productImpressions: 1, productClicks: 1,
  gmvPerHour: gmv / hours, viewsPerHour: views / hours, gmvPerView: gmv / views, ctr: null, ctor: null, aov: null,
  upt: null, pricePerItem: null, liveCtr: null, ...extra
});

test("văn bản Insight: dòng đầu kết luận, dòng '→' là việc cần làm — đi 2 chiều không mất gì", () => {
  const i = { headline: "Kết luận.", points: ["Số 1.", "Số 2."], action: "Làm X." };
  expect(parseInsightText(insightToText(i))).toEqual(i);
  expect(parseInsightText("- Kết luận\n• chứng minh\n→ việc")).toEqual({ headline: "Kết luận", points: ["chứng minh"], action: "việc" });
  expect(parseInsightText("  \n ")).toBeNull();
});

test("Vì sao — CROCS 1–22/09 vs 1–22/08: cả traffic lẫn chuyển đổi cùng giảm, nghẽn nặng nhất ở chốt đơn", () => {
  const t8 = stats(4_309_000_000, 153.6, 526_400, { liveCtr: 56.0, ctor: 1.6, upt: 1.2, aov: 1_084_000 });
  const t9 = stats(3_517_000_000, 177.8, 496_400, { liveCtr: 52.4, ctor: 1.25, upt: 1.06, aov: 1_146_000 });
  const w = whyInsight(t8, t9)!;
  expect(w.headline).toMatch(/^GMV mỗi giờ −29%: lượt xem mỗi giờ −19%, GMV mỗi lượt xem −13%/);
  expect(w.headline).toContain("cả traffic lẫn chuyển đổi cùng giảm");
  expect(w.points).toContain("Chốt đơn (CTOR): 1,60% → 1,25% (−22%).");
  expect(w.action).toMatch(/chốt đơn/);
});

test("Vì sao — CROCS T8 vs T7: chuyển đổi kéo lên, nghẽn ở giỏ hàng (UPT −17%)", () => {
  const t7 = stats(5_187_000_000, 213.6, 724_500, { liveCtr: 54.16, ctor: 1.73, upt: 1.43 });
  const t8 = stats(5_885_000_000, 228.6, 725_100, { liveCtr: 56.28, ctor: 1.54, upt: 1.18 });
  const w = whyInsight(t7, t8)!;
  expect(w.headline).toContain("chuyển đổi kéo lên, traffic bù một phần");
  expect(w.action).toMatch(/giỏ hàng/);
  // Thiếu lượt xem ⇒ không bịa.
  expect(whyInsight(t7, { ...t8, viewsPerHour: null, gmvPerView: null })).toBeNull();
});

test("Người — so mặt bằng cùng loại ngày: host bán ngày thường tốt hơn host chỉ live D-Day dù GMV/giờ thô thấp hơn", () => {
  const hosts = [
    { name: "Camp", gmv: 300, hours: 10, byBucket: { dday: { gmv: 300, hours: 10 } } },
    { name: "Thường", gmv: 200, hours: 10, byBucket: { daily: { gmv: 200, hours: 10 } } },
    { name: "Thường 2", gmv: 100, hours: 10, byBucket: { daily: { gmv: 100, hours: 10 } } }
  ];
  const p = Object.fromEntries(hostVsPeer(hosts).map((x) => [x.name, x]));
  expect(p["Camp"].gmvPerHour).toBeGreaterThan(p["Thường"].gmvPerHour!);
  expect(p["Camp"].vsPeer).toBeCloseTo(0); // D-Day chỉ có mình host này ⇒ bằng mặt bằng
  expect(p["Thường"].vsPeer).toBeCloseTo(33.33, 1); // ngày thường mặt bằng 15/giờ, bán 20/giờ
  expect(p["Thường 2"].gap).toBeCloseTo(-50);
});

test("Người — cùng −21% thì nêu tên host hụt nhiều tiền hơn (live 20h), không phải host live 7h (CROCS T8)", () => {
  const mk = (name: string, gmv: number, hours: number) => ({ name, gmv, hours, byBucket: { daily: { gmv, hours } } });
  const avg = 26_000_000;
  const hosts = [mk("Hùng", 72 * avg * 1.2, 72), mk("Nhật", 20 * avg * 0.79, 20), mk("Linh", 7.2 * avg * 0.79, 7.2), mk("An", 21 * avg, 21)];
  const i = peopleInsight(hosts)!;
  expect(i.headline).toMatch(/^Hùng dẫn đầu GMV/);
  const weak = i.points.find((l) => l.includes("hụt"))!;
  expect(weak).toMatch(/^Nhật:/);
  expect(i.action).toMatch(/Nhật/);
  expect(peopleInsight([mk("Một mình", 100, 5)])).toBeNull();
});

test("Hàng — SKU dẫn đầu giảm mạnh: nêu ở kết luận, không lặp ở 'Đi xuống', vẫn là việc cần làm; bắt SKU bấm nhiều chốt ít", () => {
  const row = (name: string, rank: number, prevRank: number | null, gmv: number, gmvChange: number | null, ctr: number, ctor: number) => ({
    name, rank, prevRank, gmv, prevGmv: null, gmvChange, gmvLive: gmv / 2, orders: 1, itemsSold: 1, ctr, ctor
  });
  const skus: SkuMoves = {
    rows: [
      row("Baya Platform - Winter White - 208186-11S", 1, 1, 490_900_000, -32.3, 3.0, 1.21),
      row("Classic - Bone - 10001-2Y2", 2, 2, 298_800_000, -12.4, 4.27, 1.0),
      row("Classic - Atmosphere - 10001-1FT", 3, 3, 247_400_000, 1.5, 4.3, 0.87),
      row("Baya - White - 10126-100", 4, 4, 225_300_000, 1.6, 4.1, 0.85),
      row("Bayaband - White - 205089-126", 5, 20, 170_200_000, 78.4, 3.36, 1.39),
      row("Baya Platform - Barely Pink - 208186-6PI", 6, 3, 151_300_000, -28.4, 2.85, 0.98),
      row("Classic - White - 10001-100", 7, 5, 219_300_000, 0.1, 3.99, 1.04),
      row("Bayaband - Winter White - 205089-1LI", 8, 13, 217_600_000, 71.9, 4.35, 1.29),
      row("Platform Classic - Bone - 206750-2Y2", 9, 9, 195_000_000, -3, 3.29, 1.05),
      row("Bella - Winter White - 210062-11S", 10, 6, 180_400_000, -15.2, 3.16, 1.23)
    ],
    perDay: true,
    curDays: 22,
    prevDays: 31,
    prevLimit: 30
  };
  const i = productsInsight(skus, { name: "[Double day 7-9.9] VC 10% bill 900K", gmv: 570_000_000, orders: 559 })!;
  expect(i.headline).toMatch(/^Baya Platform - Winter White giữ hạng 1 \(.*GMV mỗi ngày −32%\)/);
  const down = i.points.find((l) => l.startsWith("Đi xuống"))!;
  expect(down).not.toContain("Baya Platform - Winter White");
  expect(down).toContain("Baya Platform - Barely Pink (3 → 6");
  expect(i.points.find((l) => l.startsWith("Lên hạng"))).toContain("Bayaband - White (20 → 5");
  expect(i.points.some((l) => /^Baya - White được bấm nhiều/.test(l))).toBe(true);
  expect(i.action).toMatch(/^Rà Baya Platform - Winter White/);
  expect(productsInsight(null, null)).toBeNull();
  expect(shortSku("Classic - Bone - 10001-2Y2")).toBe("Classic - Bone");
  expect(shortSku("Túi vải")).toBe("Túi vải");
});

test("Toàn shop — CROCS T9: tỷ trọng LIVE affiliate 11,0% → 6,8% ⇒ việc cần làm về affiliate", () => {
  const mix = (month: string, shopGmv: number, liveLinked: number, affiliate: number, video: number, card: number, refundRate: number): ChannelMix => ({
    month, shopGmv, liveLinked, affiliate, video, card, coverage: null, refundRate
  });
  const shop = (gmv: number) => ({ gmv, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0, days: 22, through: null });
  const i = shopInsight({
    months: ["2026-08", "2026-09"],
    mixes: [mix("2026-08", 9_100_000_000, 5_898_000_000, 999_900_000, 534_500_000, 1_660_000_000, 16.51), mix("2026-09", 5_210_000_000, 3_626_000_000, 354_200_000, 289_100_000, 936_800_000, 15.62)],
    agencyGmv: [5_885_000_000, 3_517_000_000],
    shopCur: shop(5_210_000_000),
    shopPrev: shop(6_750_000_000),
    windowLabel: "1–22/09 so với 1–22/08"
  })!;
  expect(i.headline).toContain("agency live chiếm 67,5% (tháng 08: 64,7%)");
  expect(i.points).toContain("LIVE affiliate: 11,0% → 6,8% tổng shop (−4,2 điểm).");
  expect(i.action).toMatch(/LIVE affiliate/);
});

test("Bối cảnh — đếm khung camp tăng/giảm cùng khung tháng trước, bỏ khung chưa chạy; việc cần làm là khung tụt GMV/giờ mạnh nhất", () => {
  const camp = (key: CampCompareRow["key"], cur: [number, number], prev: [number, number]): CampCompareRow => ({
    key,
    cur: { ...stats(cur[0] || 1, cur[1] || 1, 1), gmv: cur[0], sessions: cur[0] ? 3 : 0, gmvPerHour: cur[1] ? cur[0] / cur[1] : null },
    prev: { ...stats(prev[0], prev[1], 1), sessions: 3 },
    target: null
  });
  const i = contextInsight(
    [camp("dday", [968_200_000, 36.5], [1_172_000_000, 37.5]), camp("midmonth", [790_900_000, 43], [863_000_000, 37]), camp("payday", [0, 0], [985_800_000, 42.9]), camp("daily", [1_760_000_000, 98.3], [2_270_000_000, 79.3])],
    [
      { label: "Sáng (trước 12h)", cur: { n: 18, gmvPerHour: 19_500_000 }, prev: { n: 14, gmvPerHour: 27_900_000 } },
      { label: "Tối (từ 17h)", cur: { n: 22, gmvPerHour: 20_500_000 }, prev: { n: 23, gmvPerHour: 28_100_000 } }
    ]
  )!;
  expect(i.headline).toBe("Ngày thường −22,5% GMV so với cùng kỳ tháng trước; 0/2 khung camp đã chạy tăng GMV so với cùng khung tháng trước.");
  expect(i.points.some((l) => l.startsWith("Pay-Day"))).toBe(false);
  expect(i.action).toMatch(/^Xem lại cách chạy ngày thường: GMV mỗi giờ −37%/);
});
