// Key Metrics SHOPEE (src/lib/report/shopeeKeyMetrics.ts, user chốt 07/10): bộ chỉ số riêng, tên đúng cột của file Shopee.
import { expect, test } from "vitest";
import { addShopeeInput, emptyShopeeCounts, shopeeDriverBreakdown, shopeeKeyMetrics, shopeeMetricValue, SHOPEE_METRICS, type ShopeeKeyCounts, type ShopeeKeyInput } from "../src/lib/report/shopeeKeyMetrics";
import { KEY_METRICS } from "../src/lib/report/keyMetrics";

const x = (p: Partial<ShopeeKeyInput>): ShopeeKeyInput => ({ gmv: 0, hours: 0, viewers: 0, atc: null, orders: null, items: null, ...p });
const sum = (...xs: ShopeeKeyInput[]) => shopeeKeyMetrics(xs.reduce<ShopeeKeyCounts>((c, i) => addShopeeInput(c, i), emptyShopeeCounts()));

test("không mượn chỉ số nào của TikTok, không có chỉ số Shopee không có trong file", () => {
  // Tên chỉ số riêng của TikTok (không có cột tương ứng trong file Shopee) + tên tự đặt đã bỏ khỏi Shopee (CO, Xu theo ca, GPM theo ca).
  const notInShopeeData = ["LIVE impressions", "Product impressions", "Product clicks", "ERR", "LIVE CTR", "Product CTR", "CTOR", "CVR", "UPT", "AOV", "Avg. price", "CO", "CO/ATC", "Orders/ATC", "Xu đã tung", "GPM", "ATC/giờ"];
  const labels = SHOPEE_METRICS.map((d) => d.label);
  for (const t of notInShopeeData) expect(labels).not.toContain(t);
  // Tên Shopee: AOV của TikTok là ABS ở Shopee.
  expect(labels).toContain("ABS");
  expect(labels).toContain("Items Sold");
  expect(KEY_METRICS.length).toBeGreaterThan(0);
});

test("công thức: GMV/giờ, Viewers/giờ, ATC/Viewer, GMV/ATC, ABS", () => {
  const m = sum(x({ gmv: 30_000_000, hours: 3, viewers: 6_000, atc: 300, orders: 30, items: 45 }));
  expect(m.gmvPerHour).toBe(10_000_000);
  expect(m.viewersPerHour).toBe(2_000);
  expect(m.atcRate).toBeCloseTo(5, 6);
  expect(m.abs).toBe(1_000_000);
  expect(m.gmvPerAtc).toBe(100_000);
  expect(shopeeMetricValue(m, "items")).toBe(45);
});

test("ca thiếu ATC/Orders không kéo tụt tỷ lệ của ca có đủ", () => {
  const full = x({ gmv: 10_000_000, hours: 2, viewers: 1_000, atc: 100, orders: 10, items: 12 });
  const bare = x({ gmv: 90_000_000, hours: 6, viewers: 9_000 }); // ca gõ tay chỉ có GMV + viewers
  const m = sum(full, bare);
  expect(m.gmvPerHour).toBe(12_500_000); // GMV/giờ dùng mọi ca
  expect(m.atcRate).toBeCloseTo(10, 6); // 100 ÷ 1.000, KHÔNG ÷ 10.000
  expect(m.abs).toBe(1_000_000); // GMV của ca có đơn ÷ đơn
  expect(m.gmvPerAtc).toBe(100_000);
});

test("chưa ca nào có số thì ô hiện trống chứ không phải 0", () => {
  const m = sum(x({ gmv: 5_000_000, hours: 1, viewers: 800 }));
  for (const k of ["atc", "orders", "abs", "items"] as const) expect(shopeeMetricValue(m, k)).toBeNull();
  expect(shopeeMetricValue(sum(), "gmv")).toBeNull();
  expect(shopeeMetricValue(m, "gmv")).toBe(5_000_000);
});

test("tách nguyên nhân: các phần cộng đúng bằng ΔGMV", () => {
  const a = sum(x({ gmv: 20_000_000, hours: 4, viewers: 4_000, atc: 200 }));
  const b = sum(x({ gmv: 36_000_000, hours: 6, viewers: 7_200, atc: 432 }));
  const d = shopeeDriverBreakdown(a, b)!;
  expect(d.delta).toBe(16_000_000);
  expect(d.parts.reduce((s, p) => s + p.value, 0)).toBeCloseTo(16_000_000, 0);
  expect(d.parts.map((p) => p.key)).toEqual(["hours", "viewersPerHour", "atcRate", "gmvPerAtc"]);
});

test("tách nguyên nhân: thiếu ATC một bên thì không bịa", () => {
  const a = sum(x({ gmv: 20_000_000, hours: 4, viewers: 4_000 }));
  const b = sum(x({ gmv: 36_000_000, hours: 6, viewers: 7_200, atc: 432 }));
  expect(shopeeDriverBreakdown(a, b)).toBeNull();
});
