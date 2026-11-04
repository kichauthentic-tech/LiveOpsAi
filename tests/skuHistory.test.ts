import { describe, expect, it } from "vitest";
import { buildSkuHistory, periodKey, shopeePeriodInput, perfIn, skusFor80, skuKey, soldState, tiktokPeriodInput } from "../src/lib/sku/skuHistory";
import type { ProductListAgg } from "../src/lib/dataraw/productListAgg";

const agg = (skus: ProductListAgg["skus"]): ProductListAgg => ({ v: 2, skus, cardGmv: 0, hasSkuCols: true, hasCardCol: false, rowCount: skus.length });

describe("buildSkuHistory", () => {
  const sep = periodKey("2026-09-01", "2026-09-30");
  const oct = periodKey("2026-10-01", "2026-10-31");
  const h = buildSkuHistory("TikTok", [
    tiktokPeriodInput(oct, agg([["A", 300, 200, 3, 3, 3, 1000, 50], ["B", 0, 0, 0, 0, 0, 10, 0], ["C", 100, 0, 1, 1, 2, 100, 5]])),
    tiktokPeriodInput(sep, agg([["A", 100, 0, 1, 1, 1, 500, 20]]))
  ]);

  it("orders periods old → new and keeps SKUs that never sold at the bottom", () => {
    expect(h.periods.map((p) => p.key)).toEqual([sep.key, oct.key]);
    expect(h.rows.map((r) => r.name)).toEqual(["A", "C", "B"]);
    expect(soldState(perfIn(h.rows[0], [oct.key]))).toBe("live");
    expect(soldState(perfIn(h.rows[1], [oct.key]))).toBe("offlive");
    expect(soldState(perfIn(h.rows[2], [oct.key]))).toBe("none");
    expect(perfIn(h.rows[0], [sep.key, oct.key]).sales).toBe(400);
  });

  it("sums totals across periods and uses the latest selling period for average price", () => {
    const a = h.rows[0];
    expect(a.totalSales).toBe(400);
    expect(a.totalOrders).toBe(4);
    expect(a.avgPrice).toBe(100); // 300 / 3 món tháng 10
    expect(h.rows[1].avgPrice).toBe(50); // 100 / 2 món
  });

  it("finds how many top SKUs make 80% of a period", () => {
    expect(skusFor80(h.rows, oct.key)).toBe(2); // A = 300/400 = 75% < 80% nên cần thêm C
  });
});

describe("shopee input", () => {
  it("merges duplicate names and parses ₫ strings", () => {
    const p = periodKey("2026-10-01", "2026-10-31");
    const input = shopeePeriodInput(p, [
      { "Product(s)": "[HOT] X", "Sales(Placed Order)": "₫1.000.000", "Orders(Placed Order)": 2, "Items Sold(Placed Order)": 2, "Product Clicks": 10, ATC: 3 },
      { "Product(s)": "X", "Sales(Placed Order)": "₫500.000", "Orders(Placed Order)": 1, "Items Sold(Placed Order)": 1, "Product Clicks": 5, ATC: 1 }
    ]);
    expect(input.items).toHaveLength(1);
    expect(input.items[0].perf).toMatchObject({ sales: 1500000, orders: 3, items: 3, clicks: 15, atc: 4 });
    expect(skuKey("[HOT] X")).toBe("x");
  });
});
