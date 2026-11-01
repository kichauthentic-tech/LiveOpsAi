// P&L tháng (01/11): trình bày lại MonthClose + % hoàn ước tính theo brand.
// Chạy: npx vitest run tests/pnlStatement.test.ts
import { describe, expect, test } from "vitest";
import { buildMonthClose, expectedReturnRate, latestSettledReturnRates, type MonthCloseInput, type ShopRefundMonth } from "../src/lib/accounting/monthClose";
import { buildDailyTrend, buildPnlStatement, buildPnlTrend, changePct, coverageOf } from "../src/lib/accounting/pnlStatement";
import type { Brand, BrandContract, BrandPlatformRate, LiveSession, Talent } from "../src/types";

const brand = (id: string, billingModel: Brand["billingModel"]) => ({ id, name: id.toUpperCase(), billingModel }) as Brand;
const talent = (id: string, ratePerHour: number) =>
  ({ id, name: `T-${id}`, ratePerHour, ratePerSession: 0, commissionRate: 0, assistantRatePerHour: 0 }) as unknown as Talent;
const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({
    id, brandId: "hr", brandName: "HR", platform: "TikTok", date: "2026-09-05", startTime: "19:00", endTime: "22:00",
    status: "Completed", dataSource: "live_snapshot", actualGmv: 0, totalViews: 0, isBackfill: false, hostId: "h1", ...over
  }) as LiveSession;
const contract = (id: string, brandId: string): BrandContract => ({ id, brandId, platform: "TikTok", startMonth: "2026-01-01", monthlyHours: 100, status: "active", contractCode: id });
const rate = (brandId: string, over: Partial<BrandPlatformRate>): BrandPlatformRate => ({ id: brandId, brandId, platform: "TikTok", ratePerHour: 0, returnRate: 0, ...over });

const base = (over: Partial<MonthCloseInput>): MonthCloseInput => ({
  month: "2026-09",
  today: "2026-10-05",
  sessions: [],
  talents: [talent("h1", 100_000), talent("h2", 0)],
  brands: [brand("hr", "hourly"), brand("nm", "gmv_commission")],
  financeRecords: [],
  brandPlatformRates: [rate("hr", { ratePerHour: 500_000 }), rate("nm", { commissionRate: 10, returnRate: 0 })],
  talentRateHistory: [],
  brandPlatformRateHistory: [],
  contracts: [contract("C-HR", "hr"), contract("C-NM", "nm")],
  commitments: [],
  shopRefunds: {},
  ...over
});

describe("% hoàn ước tính theo brand", () => {
  test("CRM nhập tay thắng, rồi tới % hoàn thật tháng gần nhất, cuối cùng mặc định", () => {
    expect(expectedReturnRate(12, 30)).toEqual({ rate: 12, source: "crm" });
    expect(expectedReturnRate(0, 30)).toEqual({ rate: 30, source: "prior" });
    expect(expectedReturnRate(undefined, 0)).toEqual({ rate: 0, source: "prior" });
    expect(expectedReturnRate(0, undefined)).toEqual({ rate: 40, source: "default" });
  });

  test("lấy tháng đã chốt gần nhất của từng brand, bỏ tháng chưa chốt", () => {
    const shop = (gmv: number, refunds: number, lastDate: string): ShopRefundMonth => ({ gmv, refunds, lastDate, template: "new", definitionVerified: true });
    const byMonth = {
      "2026-07": { a: shop(1000, 100, "2026-07-31") },
      "2026-08": { a: shop(1000, 200, "2026-08-31"), b: shop(1000, 50, "2026-08-31") },
      "2026-09": { a: shop(1000, 999, "2026-09-30") } // chưa tới ngày chốt (today 10-05)
    };
    const r = latestSettledReturnRates(["2026-07", "2026-08", "2026-09"], "2026-10-05", byMonth);
    expect(r.a).toBeCloseTo(20);
    expect(r.b).toBeCloseTo(5);
  });

  test("brand % NMV, CRM chưa nhập: NMV ước tính theo % hoàn thật tháng trước thay vì 40%", () => {
    const sessions = [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })];
    const prior = buildMonthClose(base({ sessions, priorReturnRates: { nm: 20 } }));
    const def = buildMonthClose(base({ sessions }));
    // 100tr × (1 − 20%) × 10% = 8tr ; mặc định 40% → 6tr
    expect(prior.contracts[0].revenue).toBe(8_000_000);
    expect(def.contracts[0].revenue).toBe(6_000_000);
    expect(prior.estimateNotes.join(" ")).toContain("tháng gần nhất đã chốt");
  });
});

describe("buildPnlStatement", () => {
  const sessions = [ca("s1", {}), ca("s2", { date: "2026-09-06" }), ca("s3", { date: "2026-09-07", hostId: "h2" })];
  const close = buildMonthClose(base({ sessions }));

  test("tổng khớp summary của MonthClose, kèm độ phủ", () => {
    const p = buildPnlStatement(close);
    expect(p.total).toMatchObject({ revenue: close.summary.revenue, talentPay: close.summary.talentPay, grossProfit: close.summary.grossProfit });
    expect(p.total.counted).toBe(2);
    expect(p.total.total).toBe(3);
    expect(p.total.coverage).toBe("partial");
    expect(p.uncountedSessions).toBe(1);
    expect(p.total.margin).toBeCloseTo((p.total.grossProfit / p.total.revenue) * 100);
  });

  test("thác nước: chi phí là số âm, lãi gộp = doanh thu − công − chi phí", () => {
    const w = buildPnlStatement(close).waterfall;
    expect(w.map((x) => x.key)).toEqual(["revenue", "talentPay", "sessionCosts", "grossProfit"]);
    expect(w[0].value + w[1].value + w[2].value).toBeCloseTo(w[3].value);
    expect(w[1].value).toBeLessThanOrEqual(0);
  });

  test("so với tháng trước theo brand × sàn; tháng trước không có dòng thì prev trống", () => {
    const prev = buildMonthClose(base({ month: "2026-08", sessions: [ca("p1", { date: "2026-08-05" })] }));
    const p = buildPnlStatement(close, prev);
    const hr = p.rows.find((r) => r.brandId === "hr")!;
    expect(hr.prev?.revenue).toBe(1_500_000);
    expect(p.prevTotal?.revenue).toBe(1_500_000);
    expect(changePct(hr.revenue, hr.prev?.revenue)).toBeCloseTo(100, 5); // 2 ca (3tr) so với 1 ca (1,5tr)
    const none = buildPnlStatement(close, buildMonthClose(base({ month: "2026-08" })));
    expect(none.prevTotal).toBeUndefined();
    expect(none.rows[0].prev).toBeUndefined();
  });

  test("dòng chưa tính được (0 ca đủ dữ liệu) đứng cuối và có coverage none", () => {
    const c = buildMonthClose(base({ sessions: [ca("s1", {}), ca("s9", { brandId: "nm", brandName: "NM", hostId: "h2" })] }));
    const p = buildPnlStatement(c);
    expect(p.rows[p.rows.length - 1].coverage).toBe("none");
  });

  test("changePct và coverageOf", () => {
    expect(changePct(120, 100)).toBe(20);
    expect(changePct(50, 0)).toBeUndefined();
    expect(changePct(50, undefined)).toBeUndefined();
    expect(coverageOf(0, 0)).toBe("none");
    expect(coverageOf(3, 3)).toBe("full");
  });

  test("lãi theo ngày: cộng dồn cuối kỳ = tổng từng ngày, chỉ tính ca đã đủ dữ liệu", () => {
    const d = buildDailyTrend(close);
    expect(d.days.at(-1)).toBe(Math.max(...close.daily.map((x) => Number(x.date.slice(8, 10)))));
    expect(d.series.length).toBeGreaterThan(0);
    for (const s of d.series) {
      expect(s.cumulative.at(-1)).toBeCloseTo(s.perDay.reduce((a, b) => a + b, 0));
      expect(s.perDay.length).toBe(d.days.length);
    }
    // ca s3 thiếu rate (hostId h2) không nằm trong daily: 2 ca đủ dữ liệu
    expect(close.daily.length).toBe(2);
  });

  test("xu hướng nhiều tháng bỏ tháng chưa tính được ca nào", () => {
    const empty = buildMonthClose(base({ month: "2026-08" }));
    expect(buildPnlTrend([empty, close]).map((t) => t.month)).toEqual(["2026-09"]);
  });
});
