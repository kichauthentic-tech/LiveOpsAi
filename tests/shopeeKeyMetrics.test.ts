// Key Metrics SHOPEE (src/lib/report/shopeeKeyMetrics.ts, user chốt 07/10): bộ chỉ số riêng, không dùng chỉ số TikTok.
import { expect, test } from "vitest";
import { addShopeeInput, emptyShopeeCounts, shopeeDriverBreakdown, shopeeKeyMetrics, shopeeMetricValue, SHOPEE_METRICS, type ShopeeKeyCounts, type ShopeeKeyInput } from "../src/lib/report/shopeeKeyMetrics";
import { KEY_METRICS } from "../src/lib/report/keyMetrics";

const x = (p: Partial<ShopeeKeyInput>): ShopeeKeyInput => ({ gmv: 0, hours: 0, viewers: 0, atc: null, checkout: null, orders: null, items: null, coins: null, ...p });
const sum = (...xs: ShopeeKeyInput[]) => shopeeKeyMetrics(xs.reduce<ShopeeKeyCounts>((c, i) => addShopeeInput(c, i), emptyShopeeCounts()));

test("không mượn chỉ số nào của TikTok", () => {
  const tiktokOnly = ["LIVE impressions", "Product impressions", "Product clicks", "ERR", "LIVE CTR", "Product CTR", "CTOR"];
  const labels = SHOPEE_METRICS.map((d) => d.label);
  for (const t of tiktokOnly) expect(labels).not.toContain(t);
  expect(KEY_METRICS.length).toBeGreaterThan(0);
});

test("công thức: GMV/giờ, Viewers/giờ, GPM, ATC/Viewer, CO/ATC, AOV", () => {
  const m = sum(x({ gmv: 30_000_000, hours: 3, viewers: 6_000, atc: 300, checkout: 60, orders: 30, coins: 150_000 }));
  expect(m.gmvPerHour).toBe(10_000_000);
  expect(m.viewersPerHour).toBe(2_000);
  expect(m.gpm).toBe(5_000_000);
  expect(m.atcRate).toBeCloseTo(5, 6);
  expect(m.coRate).toBeCloseTo(20, 6);
  expect(m.orderPerAtc).toBeCloseTo(10, 6);
  expect(m.aov).toBe(1_000_000);
  expect(m.gmvPerAtc).toBe(100_000);
  expect(m.coinsPctGmv).toBeCloseTo(0.5, 6);
});

test("ca thiếu ATC/Orders/Xu không kéo tụt tỷ lệ của ca có đủ", () => {
  const full = x({ gmv: 10_000_000, hours: 2, viewers: 1_000, atc: 100, checkout: 20, orders: 10, coins: 100_000 });
  const bare = x({ gmv: 90_000_000, hours: 6, viewers: 9_000 }); // ca gõ tay chỉ có GMV + viewers
  const m = sum(full, bare);
  expect(m.gmvPerHour).toBe(12_500_000); // GMV/giờ dùng mọi ca
  expect(m.atcRate).toBeCloseTo(10, 6); // 100 ÷ 1.000, KHÔNG ÷ 10.000
  expect(m.aov).toBe(1_000_000); // GMV của ca có đơn ÷ đơn
  expect(m.coinsPctGmv).toBeCloseTo(1, 6);
  expect(m.gmvPerAtc).toBe(100_000);
});

test("chưa ca nào khai số thì ô hiện trống chứ không phải 0", () => {
  const m = sum(x({ gmv: 5_000_000, hours: 1, viewers: 800 }));
  for (const k of ["atc", "checkout", "orders", "coins", "atcRate", "coRate", "aov", "coinsPctGmv"] as const) expect(shopeeMetricValue(m, k)).toBeNull();
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
