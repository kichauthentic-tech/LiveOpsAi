// Report Tháng chuyên sâu (2026-09-26) — quà tặng, tách loại ngày / cơ cấu lịch, nhóm đối chứng, độ tin cậy host.
// Số mẫu lấy từ CROCS thật T6–T9/2026 (đo 2026-09-26 trên live_sessions + Shop Analytics + file Sản Phẩm).
// Chạy: npx vitest run tests/deepAnalysis.test.ts
import { expect, test } from "vitest";
import type { CampDayBucket } from "../src/lib/campaignDays";
import type { CreatorLivePerfRow } from "../src/lib/dataraw/creatorLivePerfSlice";
import type { ShopDayLite } from "../src/lib/dataraw/monthlyProductSlice";
import type { ProductAggSku } from "../src/lib/dataraw/productListAgg";
import {
  controlGroup,
  controlLine,
  controlVerdict,
  dailyGapLine,
  dayGroupStats,
  giftLine,
  giftSliceFromAgg,
  giftStats,
  hostReliability,
  mixRateSplit,
  reliabilityText,
  t95
} from "../src/lib/report/deepAnalysis";
import { compareWindow } from "../src/lib/report/monthlyReportInsights";
import type { LiveSession } from "../src/types";

// [tên, GMV, GMV live, orders, skuOrders, items, impressions, clicks]
const sku = (name: string, gmv: number, items: number): ProductAggSku => [name, gmv, 0, items, items, items, 1000, 100];

test("quà tặng: SKU dưới 20k/món là quà; UPT tính trên hàng bán thật; câu quà tặng chỉ khi quà/đơn đổi ≥ 0,1", () => {
  // CROCS T6: 4.125 món quà (Jibbitz 0–3k) trên 10.898 món, 6.235 đơn cả shop.
  const t6 = giftSliceFromAgg({
    agg: { v: 2, skus: [sku("Classic Clog", 6_000_000_000, 6773), sku("Jibbitz Pink Heart", 300_000, 937), sku("Jibbitz Bulbasaur", 1_300_000, 3188)], cardGmv: 0, hasSkuCols: true, hasCardCol: true, rowCount: 3 },
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30"
  });
  expect(t6).toMatchObject({ items: 10_898, giftItems: 4125, giftSkus: 2 });
  expect(t6.top[0][0]).toBe("Jibbitz Bulbasaur");
  // Jibbitz bán giá thật (T9: 150–209k) không phải quà.
  const t9 = giftSliceFromAgg({
    agg: { v: 2, skus: [sku("Classic Clog", 4_900_000_000, 4966), sku("Jibbitz Letter N", 3_100_000, 20)], cardGmv: 0, hasSkuCols: true, hasCardCol: true, rowCount: 2 },
    periodStart: "2026-09-01",
    periodEnd: "2026-09-22"
  });
  expect(t9.giftItems).toBe(0);

  const days = (month: string, n: number, orders: number) => ({
    hasAnyBatch: true,
    days: Array.from({ length: n }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, gmv: 0, refunds: 0, orders: orders / n, visitors: 0, liveLinked: 0, affiliate: 0, video: 0 }))
  });
  const g6 = giftStats(t6, days("2026-06", 30, 6235))!;
  expect(g6.uptShop).toBeCloseTo(1.75, 2);
  expect(g6.uptExGift).toBeCloseTo(1.09, 2);
  expect(g6.giftPerOrder).toBeCloseTo(0.66, 2);
  // Kỳ file Sản Phẩm T9 là 1–22 ⇒ chỉ lấy đơn 1–22 của Shop Analytics.
  const g9 = giftStats(t9, days("2026-09", 30, 6306))!;
  expect(g9.shopOrders).toBeCloseTo(4624.4, 0);
  expect(g9.uptExGift).toBeCloseTo(1.08, 2);

  expect(giftLine(g6, g9, "T6")).toBe(
    "Quà tặng (hàng dưới 20K/món) giảm từ 0,66 xuống 0,00 món mỗi đơn cả shop (T6 → nay) — UPT giảm chủ yếu vì vậy; tính trên hàng bán thật, UPT cả shop 1,09 → 1,08."
  );
  expect(giftLine(g9, { ...g9, giftPerOrder: 0.05 }, "T8")).toBeNull();
  expect(giftStats(null, days("2026-09", 30, 1))).toBeNull();
});

// Ca dạng dòng Creator-Live-Performance: 1 ca = 1 dòng, giờ bắt đầu 10h sáng VN.
const row = (date: string, gmv: number, hours: number): CreatorLivePerfRow =>
  ({ startTime: `${date}T03:00:00.000Z`, hours, gmv, itemsSold: 0, orders: 1, skuOrders: 1, views: 100, productClicks: 10, productImpressions: 50 }) as CreatorLivePerfRow;
const bucket = (camp: number[]) => (d: string): CampDayBucket => (camp.includes(Number(d.slice(8, 10))) ? "dday" : "daily");
const win = compareWindow("2026-09", "2026-09-22");

test("cơ cấu lịch vs hiệu suất: mix + rate = ΔGMV/giờ; giữ nguyên tỷ trọng giờ camp thì toàn bộ là hiệu suất", () => {
  // T8: ngày thường 80h × 28,8tr, camp 40h × 31,2tr. T9: cùng tỷ trọng giờ, cả hai loại ngày bán kém đi.
  const prev = [row("2026-08-03", 80 * 28.8e6, 80), row("2026-08-08", 40 * 31.2e6, 40)];
  const cur = [row("2026-09-03", 100 * 17.9e6, 100), row("2026-09-09", 50 * 26.5e6, 50)];
  const m = mixRateSplit(prev, cur, win, bucket([8]), bucket([9]))!;
  expect(m.mix + m.rate).toBeCloseTo(m.delta, 3);
  expect(Math.abs(m.mix)).toBeLessThan(1);
  expect(m.rate).toBeLessThan(-7e6);
  // Dồn giờ sang ngày thường (bán kém hơn) ⇒ có phần cơ cấu âm.
  const shifted = mixRateSplit(prev, [row("2026-09-03", 140 * 28.8e6, 140), row("2026-09-09", 10 * 31.2e6, 10)], win, bucket([8]), bucket([9]))!;
  expect(shifted.rate).toBeCloseTo(0, 3);
  expect(shifted.mix).toBeLessThan(0);
  expect(mixRateSplit([], cur, win, bucket([8]), bucket([9]))).toBeNull();

  const groups = dayGroupStats(prev, cur, win, bucket([8]), bucket([9]));
  expect(groups.map((g) => [g.key, Math.round(g.prev.gmvPerHour! / 1e5) / 10, Math.round(g.cur.gmvPerHour! / 1e5) / 10])).toEqual([
    ["daily", 28.8, 17.9],
    ["camp", 31.2, 26.5]
  ]);
  expect(dailyGapLine(groups[0])).toBe(
    "Nếu ngày thường giữ GMV/giờ kỳ trước (28,8M/giờ, nay 17,9M/giờ) với 100 giờ live đã chạy, LIVE GMV có thêm ~1,09B."
  );
});

test("nhóm đối chứng CROCS 1–22/09: ngày thường hụt do vận hành, ngày camp agency giữ tốt hơn thị trường", () => {
  // Shop Analytics thật (triệu đ): ngày thường T8 live 2.285 / còn lại 1.165, T9 1.855 / 1.177; camp T8 1.987 / 1.311, T9 1.770 / 405.
  const day = (date: string, live: number, rest: number, visitors: number, orders: number): ShopDayLite => ({
    date, gmv: (live + rest) * 1e6, liveLinked: live * 1e6, refunds: 0, orders, visitors, affiliate: 0, video: 0
  });
  const prev = [day("2026-08-03", 2285, 1165, 145_469, 3209), day("2026-08-08", 1987, 1311, 94_697, 3004)];
  const cur = [day("2026-09-03", 1855, 1177, 139_716, 2614), day("2026-09-09", 1770, 405, 72_824, 2010)];
  const rows = controlGroup(prev, cur, win, bucket([8]), bucket([9]));
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(Math.round(by.daily.liveChg!)).toBe(-19);
  expect(Math.round(by.daily.restChg!)).toBe(1);
  expect(Math.round(by.daily.visitorsChg!)).toBe(-4);
  expect(controlVerdict(by.daily)).toBe("ops");
  expect(controlVerdict(by.camp)).toBe("agency_better");
  expect(controlVerdict(by.all)).toBe("agency_better");
  expect(controlLine(rows)).toBe(
    "So với phần còn lại của shop (ngày thường): live agency −19%, phần còn lại +1%, lượt vào shop −4% ⇒ khoảng hụt nằm ở vận hành live."
  );
  // Cùng chiều, lệch < 10 điểm ⇒ đi cùng thị trường; không có ngày nào ⇒ không có dòng.
  expect(controlVerdict({ ...by.all, liveChg: -12, restChg: -8 })).toBe("market");
  expect(controlGroup(null, cur, win, bucket([8]), bucket([9]))).toEqual([]);

  // Cột live lấy từ ca (2026-09-29): Linked account đếm cả live ngoài ca agency. Phần còn lại KHÔNG đổi
  // (vẫn Total − Linked account); chỉ cộng ca ở ngày Shop Analytics có số.
  const agency = {
    prev: new Map([["2026-08-03", 2274.5e6], ["2026-08-08", 2035e6], ["2026-08-31", 999e6]]),
    cur: new Map([["2026-09-03", 1757.6e6], ["2026-09-09", 1759.1e6]])
  };
  const fromCa = Object.fromEntries(controlGroup(prev, cur, win, bucket([8]), bucket([9]), agency).map((r) => [r.key, r]));
  expect(Math.round(fromCa.daily.liveChg! * 10) / 10).toBe(-22.7);
  expect(Math.round(fromCa.daily.restChg!)).toBe(1);
  expect(fromCa.daily.shopLiveCur).toBe(1855e6);
  expect(Math.round(fromCa.all.liveChg! * 10) / 10).toBe(-18.4);
  expect(controlVerdict(fromCa.daily)).toBe("ops");
  expect(controlVerdict(fromCa.camp)).toBe("agency_better");
});

test("độ tin cậy host: chỉ kết luận khi khoảng tin cậy nằm hẳn một phía; mặt bằng theo tháng × loại ngày × buổi; tất định", () => {
  let n = 0;
  const ca = (hostName: string, date: string, gmv: number, startTime = "10:00"): LiveSession =>
    ({ id: `s${n++}`, hostId: hostName, hostName, date, startTime, endTime: "13:00", liveDurationMinutes: 180, actualGmv: gmv, status: "Completed" }) as LiveSession;
  const sessions: LiveSession[] = [];
  // "Đều" luôn hơn mặt bằng ~20%; "Nhiễu" lúc gấp đôi lúc một nửa; "Hai ca" chỉ 2 ca.
  for (let d = 1; d <= 8; d++) {
    const date = `2026-08-${String(d + 10).padStart(2, "0")}`;
    sessions.push(ca("Đều", date, 120), ca("Nhiễu", date, d % 2 ? 180 : 40), ca("Nền", date, 80));
  }
  sessions.push(ca("Hai ca", "2026-08-20", 60), ca("Hai ca", "2026-08-21", 60));
  // Ca chưa gán host góp vào mặt bằng nhưng không có dòng.
  sessions.push({ ...ca("", "2026-08-22", 100), hostId: "", hostName: "" } as LiveSession);
  const rel = hostReliability(sessions, () => "daily");
  const by = Object.fromEntries(rel.map((r) => [r.name, r]));
  expect(Object.keys(by).sort()).toEqual(["Hai ca", "Nhiễu", "Nền", "Đều"]);
  expect(by["Đều"].verdict).toBe("above");
  expect(by["Nền"].verdict).toBe("below");
  expect(by["Nhiễu"].verdict).toBe("unclear");
  expect(by["Hai ca"]).toMatchObject({ lo: null, hi: null, verdict: "unclear" });
  expect(hostReliability(sessions, () => "daily")).toEqual(rel);
  // Ca tối so với mặt bằng ca tối: một host chỉ live tối, bán bằng mặt bằng tối ⇒ tỷ số 1.
  const eve = hostReliability([ca("Tối", "2026-08-11", 200, "20:00"), ca("Tối 2", "2026-08-12", 200, "20:00"), ca("Sáng", "2026-08-11", 100)], () => "daily");
  expect(eve.find((r) => r.name === "Tối")!.ratio).toBeCloseTo(1, 6);
  expect(reliabilityText({ ratio: 1.11, lo: 1.02, hi: 1.23 })).toBe("+11% (+2% … +23%)");
  expect(reliabilityText({ ratio: 0.83, lo: null, hi: null })).toBe("−17%");
  expect(reliabilityText({ ratio: 1.12, lo: 1.0003, hi: 1.23 })).toBe("+12% (+0,0% … +23%)");
  // Mẫu nhỏ dùng phân phối t: 3 ca hệ số 4,30 (không phải 1,96), > 120 bậc tự do mới về 1,96.
  expect(t95(2)).toBe(4.3);
  expect(t95(58)).toBe(2.04);
  expect(t95(200)).toBe(1.96);
});
