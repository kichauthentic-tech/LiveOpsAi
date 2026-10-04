// Ba khối chuyển từ Phân tích sâu vào Report Tháng (2026-09-27) + độ tập trung SKU trong piece skuRank.
import { expect, test, vi } from "vitest";
// CI không có .env — supabaseClient ném lỗi ngay lúc import (chuỗi: module dataraw → supabaseClient). Test này chỉ
// gọi hàm thuần, không chạm DB. Cùng khuôn với monthlySnapshot.test.ts.
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import type { CreatorLivePerfRow } from "../src/lib/dataraw/creatorLivePerfSlice";
import { skuRankFromAgg, type ShopDayLite } from "../src/lib/dataraw/monthlyProductSlice";
import type { ProductAggSku, ProductListAgg } from "../src/lib/dataraw/productListAgg";
import { compareWindow } from "../src/lib/report/monthlyReportInsights";
import { dailyRhythm, liveFunnel, sessionSpread } from "../src/lib/report/rhythm";

const day = (date: string, gmv: number): ShopDayLite => ({ date, gmv, refunds: 0, orders: 0, visitors: 0, liveLinked: 0, affiliate: 0, video: 0 });
const row = (startTime: string, gmv: number, hours: number, extra: Partial<CreatorLivePerfRow> = {}): CreatorLivePerfRow =>
  ({ startTime, hours, gmv, itemsSold: 0, orders: 0, skuOrders: 0, views: 0, impressions: 0, productClicks: 0, productImpressions: 0, ...extra }) as CreatorLivePerfRow;

test("nhịp bán: trung bình 7 ngày, 5 ngày đỉnh, số ngày tạo 80%, LIVE theo ngày VN, chỉ trong kỳ", () => {
  // 10 ngày: 9 ngày 10tr, ngày 09 (D-Day) 110tr ⇒ tổng 200tr.
  const days = Array.from({ length: 10 }, (_, i) => day(`2026-09-${String(i + 1).padStart(2, "0")}`, i === 8 ? 110e6 : 10e6));
  days.push(day("2026-09-25", 999e6)); // ngoài kỳ so (tới 22/09) ⇒ bỏ
  // Ca 23:30 giờ VN ngày 08 = 16:30Z ngày 08 ⇒ tính vào ngày 08.
  const r = dailyRhythm(days, [row("2026-09-08T16:30:00.000Z", 5e6, 1)], "2026-09-01", "2026-09-22")!;
  expect(r.points).toHaveLength(10);
  expect(r.points[5].ma7).toBeNull();
  expect(r.points[6].ma7).toBe(10e6);
  expect(r.points[8].ma7).toBeCloseTo((6 * 10e6 + 110e6) / 7, 0);
  expect(r.points[7].live).toBe(5e6);
  expect(r.best?.label).toBe("09/09");
  expect(r.top5Pct).toBeCloseTo(75, 5); // (110 + 4×10) / 200
  expect(r.daysFor80).toBe(6); // 110 + 5×10 = 160 = 80%
  expect(r.weekday.map((w) => w.label)).toEqual(["T2", "T3", "T4", "T5", "T6", "T7", "CN"]);
});

test("phễu LIVE: cùng kỳ, ERR / Product CTR / CTOR theo Orders ÷ Product clicks", () => {
  const cmp = compareWindow("2026-09", "2026-09-22");
  const base = { impressions: 100_000, views: 2_000, productImpressions: 8_000, productClicks: 1_000, orders: 20 };
  const prev = [row("2026-08-10T03:00:00.000Z", 20e6, 1, base), row("2026-08-28T03:00:00.000Z", 99e6, 1, base)]; // 28/08 ngoài 1–22/08
  const cur = [row("2026-09-10T03:00:00.000Z", 15e6, 1, { ...base, orders: 15, skuOrders: 40 })];
  const f = liveFunnel(prev, cur, cmp)!;
  const by = Object.fromEntries(f.map((s) => [s.label, s]));
  expect(by["LIVE impressions"].prev).toBe(100_000);
  expect(by.Views.rateLabel).toBe("ERR");
  expect(by.Views.rateCur).toBeCloseTo(2, 5);
  expect(by["Product impressions"].rateLabel).toBeNull();
  expect(by["Product clicks"].rateCur).toBeCloseTo(12.5, 5);
  expect(by.Orders.rateLabel).toBe("CTOR");
  expect(by.Orders.ratePrev).toBeCloseTo(2, 5);
  expect(by.Orders.rateCur).toBeCloseTo(1.5, 5); // Orders, không phải SKU orders (4%)
  expect(liveFunnel([], [], cmp)).toBeNull();
});

test("phân bố GMV/giờ: tứ phân vị, bỏ phiên dưới 6 phút, nhãn giờ VN", () => {
  const rows = [10, 20, 30, 40, 50].map((m, i) => row(`2026-09-0${i + 1}T12:00:00.000Z`, m * 1e6 * 2, 2));
  rows.push(row("2026-09-06T12:00:00.000Z", 50e6, 0.05));
  const s = sessionSpread(rows, "2026-09-01", "2026-09-30")!;
  expect(s.count).toBe(5);
  expect([s.worst, s.p25, s.median, s.p75, s.best]).toEqual([10e6, 20e6, 30e6, 40e6, 50e6]);
  expect(s.points[0].label).toBe("01/09 19:00");
});

test("độ tập trung SKU: số SKU đầu bảng đủ 80% GMV, bỏ SKU 0đ", () => {
  const sku = (name: string, gmv: number): ProductAggSku => [name, gmv, 0, 1, 1, 1, 0, 0];
  const agg: ProductListAgg = { v: 2, skus: [sku("A", 50), sku("B", 30), sku("C", 10), sku("D", 10), sku("E", 0)], cardGmv: 0, hasSkuCols: true, hasCardCol: true, rowCount: 5 };
  const r = skuRankFromAgg({ agg, periodStart: "2026-09-01", periodEnd: "2026-09-22" });
  expect(r.sellingSkus).toBe(4);
  expect(r.skusFor80Pct).toBe(2);
});
