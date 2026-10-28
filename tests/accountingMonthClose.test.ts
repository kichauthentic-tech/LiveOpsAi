// Kế Toán K1 (23/10): doanh thu tách theo hợp đồng, hợp đồng % NMV ước tính → chính thức, công theo người.
// Chạy: npx vitest run tests/accountingMonthClose.test.ts
import { describe, expect, test } from "vitest";
import { buildMonthClose, monthEndOf, nmvSettledFrom, settledReturnRate, type MonthCloseInput } from "../src/lib/accounting/monthClose";
import type { Brand, BrandContract, BrandPlatformRate, LiveSession, Talent } from "../src/types";

const brand = (id: string, billingModel: Brand["billingModel"]) => ({ id, name: id.toUpperCase(), billingModel }) as Brand;
const talent = (id: string, ratePerHour: number) =>
  ({ id, name: `T-${id}`, ratePerHour, ratePerSession: 0, commissionRate: 0, assistantRatePerHour: 0 }) as unknown as Talent;
const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({
    id, brandId: "hr", brandName: "HR", platform: "TikTok", date: "2026-09-05", startTime: "19:00", endTime: "22:00",
    status: "Completed", dataSource: "live_snapshot", actualGmv: 0, totalViews: 0, isBackfill: false, hostId: "h1", ...over
  }) as LiveSession;
const contract = (id: string, brandId: string, platform: "TikTok" | "Shopee" = "TikTok"): BrandContract => ({
  id, brandId, platform, startMonth: "2026-01-01", monthlyHours: 100, status: "active", contractCode: id
});
const rate = (brandId: string, over: Partial<BrandPlatformRate>): BrandPlatformRate => ({ id: brandId, brandId, platform: "TikTok", ratePerHour: 0, returnRate: 0, ...over });

const base = (over: Partial<MonthCloseInput>): MonthCloseInput => ({
  month: "2026-09",
  today: "2026-10-23",
  sessions: [],
  talents: [talent("h1", 100_000)],
  brands: [brand("hr", "hourly"), brand("nm", "gmv_commission")],
  financeRecords: [],
  brandPlatformRates: [rate("hr", { ratePerHour: 500_000 }), rate("nm", { commissionRate: 10, returnRate: 5 })],
  talentRateHistory: [],
  brandPlatformRateHistory: [],
  contracts: [contract("C-HR", "hr"), contract("C-NM", "nm")],
  commitments: [],
  shopRefunds: {},
  ...over
});

describe("ngày chốt hoàn/huỷ", () => {
  test("ngày cuối tháng và +15 ngày", () => {
    expect(monthEndOf("2026-09")).toBe("2026-09-30");
    expect(monthEndOf("2026-02")).toBe("2026-02-28");
    expect(nmvSettledFrom("2026-09")).toBe("2026-10-15");
  });

  test("% hoàn thật chỉ dùng được khi đủ ngày chờ, file phủ hết tháng và GMV > 0", () => {
    const shop = { gmv: 1_000, refunds: 80, lastDate: "2026-09-30", template: "new" as const, definitionVerified: true };
    expect(settledReturnRate("2026-09", "2026-10-15", shop)).toBeCloseTo(8);
    expect(settledReturnRate("2026-09", "2026-10-14", shop)).toBeUndefined();
    expect(settledReturnRate("2026-09", "2026-10-20", { ...shop, lastDate: "2026-09-27" })).toBeUndefined();
    expect(settledReturnRate("2026-09", "2026-10-20", { ...shop, gmv: 0 })).toBeUndefined();
    expect(settledReturnRate("2026-09", "2026-10-20", undefined)).toBeUndefined();
  });
});

describe("buildMonthClose", () => {
  test("hợp đồng thu theo giờ: giờ × đơn giá − công host − chi phí ca", () => {
    const m = buildMonthClose(base({ sessions: [ca("s1", {}), ca("s2", { date: "2026-09-06" })] }));
    expect(m.contracts).toHaveLength(1);
    const c = m.contracts[0];
    expect(c.contract?.id).toBe("C-HR");
    expect(c.basis).toEqual({ kind: "hourly", ratePerHour: 500_000 });
    expect(c.hours).toBe(6);
    expect(c.revenue).toBe(3_000_000);
    expect(c.hostPay).toBe(600_000);
    expect(c.grossProfit).toBe(2_400_000);
    expect(m.summary).toMatchObject({ revenue: 3_000_000, talentPay: 600_000, grossProfit: 2_400_000, counted: 2, total: 2 });
  });

  test("hợp đồng % NMV trước ngày chốt: ước tính theo % hoàn dự kiến của CRM", () => {
    const m = buildMonthClose(
      base({ today: "2026-10-05", sessions: [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })] })
    );
    const c = m.contracts[0];
    expect(c.basis.kind).toBe("nmv_estimate");
    expect(c.revenue).toBeCloseTo(100_000_000 * 0.95 * 0.1);
    expect(m.estimateNotes[0]).toContain("2026-10-15");
  });

  test("hợp đồng % NMV sau ngày chốt có file Shop Analytics: doanh thu chính thức theo % hoàn thật của cả shop", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })],
        shopRefunds: { nm: { gmv: 1_000, refunds: 200, lastDate: "2026-09-30", template: "new", definitionVerified: true } }
      })
    );
    const c = m.contracts[0];
    expect(c.basis).toMatchObject({ kind: "nmv_final", returnRate: 20 });
    expect(c.revenue).toBeCloseTo(100_000_000 * 0.8 * 0.1);
    expect(c.revenueEstimate).toBeCloseTo(100_000_000 * 0.95 * 0.1);
    expect(m.estimateNotes).toHaveLength(0);
    // Mẫu mới chưa được user xác nhận định nghĩa cột Hoàn tiền ⇒ cảnh báo.
    expect(m.definitionWarnings).toHaveLength(0);
  });

  test("chưa xác nhận định nghĩa mẫu mới: chỉ ước tính, CRM chưa nhập thì mặc định 40%", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })],
        brandPlatformRates: [rate("hr", { ratePerHour: 500_000 }), rate("nm", { commissionRate: 10, returnRate: 0 })],
        shopRefunds: { nm: { gmv: 1_000, refunds: 373, lastDate: "2026-09-30", template: "new" } }
      })
    );
    const c = m.contracts[0];
    expect(c.basis).toMatchObject({ kind: "nmv_estimate", returnRate: 40 });
    expect(c.revenue).toBeCloseTo(100_000_000 * 0.6 * 0.1);
    expect(m.estimateNotes.join(" ")).toContain("mặc định 40%");
  });

  test("file mẫu cũ: không chốt dù đã qua ngày chờ và phủ hết tháng", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })],
        shopRefunds: { nm: { gmv: 1_000, refunds: 150, lastDate: "2026-09-30", template: "old" } }
      })
    );
    expect(m.contracts[0].basis.kind).toBe("nmv_estimate");
    expect(m.estimateNotes[0]).toContain("mẫu cũ");
  });

  test("file Shop Analytics chưa phủ hết tháng: giữ ước tính và nói lý do", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", { brandId: "nm", brandName: "NM", actualGmv: 100_000_000 })],
        shopRefunds: { nm: { gmv: 1_000, refunds: 200, lastDate: "2026-09-20", template: "new" } }
      })
    );
    expect(m.contracts[0].basis.kind).toBe("nmv_estimate");
    expect(m.estimateNotes[0]).toContain("chưa phủ hết tháng");
  });

  test("Shopee không có nguồn hoàn thật: luôn ước tính", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", { brandId: "nm", brandName: "NM", platform: "Shopee", actualGmv: 10_000_000 })],
        contracts: [contract("C-NM-S", "nm", "Shopee")],
        brandPlatformRates: [rate("nm", { platform: "Shopee", commissionRate: 10, returnRate: 5 })],
        shopRefunds: { nm: { gmv: 1_000, refunds: 200, lastDate: "2026-09-30", template: "new" } }
      })
    );
    expect(m.contracts[0].platform).toBe("Shopee");
    expect(m.contracts[0].basis.kind).toBe("nmv_estimate");
  });

  test("ca không có hợp đồng hiệu lực nằm dòng riêng, không lẫn vào hợp đồng khác", () => {
    const m = buildMonthClose(base({ contracts: [], sessions: [ca("s1", {})] }));
    expect(m.contracts).toHaveLength(1);
    expect(m.contracts[0].contract).toBeUndefined();
  });

  test("ca thiếu rate bị loại khỏi tổng tiền nhưng được đếm; công người thiếu rate được cờ", () => {
    const m = buildMonthClose(base({ talents: [talent("h1", 0)], sessions: [ca("s1", {})] }));
    expect(m.summary.counted).toBe(0);
    expect(m.summary.total).toBe(1);
    expect(m.summary.revenue).toBe(0);
    expect(m.missing.sessions).toBe(1);
    expect(m.hosts[0].missingRate).toBe(true);
  });

  test("ca nạp bù không vào tiền nhưng được đếm; ca ngoài tháng bị bỏ", () => {
    const m = buildMonthClose(
      base({ sessions: [ca("s1", { isBackfill: true, actualGmv: 5 }), ca("s2", { date: "2026-08-30" })] })
    );
    expect(m.summary.total).toBe(0);
    expect(m.backfillCount).toBe(1);
  });

  test("công theo người cộng giờ và tiền theo vai", () => {
    const m = buildMonthClose(
      base({
        talents: [talent("h1", 100_000), talent("c1", 40_000)],
        sessions: [ca("s1", { coHostId: "c1" })]
      })
    );
    const byId = Object.fromEntries([...m.hosts, ...m.assistants].map((t) => [t.talentId, t]));
    expect(byId.h1).toMatchObject({ hostHours: 3, hostPay: 300_000, total: 300_000 });
    expect(byId.c1).toMatchObject({ coHostHours: 3, coHostPay: 120_000, total: 120_000 });
    expect(m.summary.talentPay).toBe(420_000);
  });

  test("ai có làm host thì vai chính là host (kể cả khi cũng làm trợ), người chỉ làm trợ nằm bảng trợ", () => {
    const m = buildMonthClose(
      base({
        talents: [talent("h1", 100_000), talent("c1", 40_000), talent("x", 100_000)],
        sessions: [
          ca("s1", { hostId: "h1", coHostId: "c1" }),
          // h1 làm trợ cho ca khác: vẫn là host, giờ trợ ở cột riêng
          ca("s2", { date: "2026-09-06", hostId: "x", coHostId: "h1" })
        ]
      })
    );
    expect(m.hosts.map((t) => t.talentId).sort()).toEqual(["h1", "x"]);
    expect(m.assistants.map((t) => t.talentId)).toEqual(["c1"]);
    const h1 = m.hosts.find((t) => t.talentId === "h1")!;
    expect(h1.primaryRole).toBe("host");
    expect(h1.hostHours).toBe(3);
    expect(h1.coHostHours).toBe(3);
  });

  test("giờ của một người tách theo brand × sàn", () => {
    const m = buildMonthClose(
      base({
        sessions: [ca("s1", {}), ca("s2", { date: "2026-09-06", brandId: "nm", brandName: "NM" }), ca("s3", { date: "2026-09-07", brandId: "nm", brandName: "NM", endTime: "20:00" })]
      })
    );
    const h1 = m.hosts[0];
    expect(h1.byBrand.map((b) => [b.brandName, b.hostHours, b.sessions])).toEqual([
      ["HR", 3, 1],
      ["NM", 4, 2]
    ]);
    expect(h1.hostHours).toBe(7);
  });

  test("đối chiếu giờ: giờ host cộng lại khớp giờ live của brand; ca thiếu host/trợ được đếm", () => {
    const m = buildMonthClose(
      base({
        talents: [talent("h1", 100_000), talent("c1", 40_000)],
        sessions: [ca("s1", { coHostId: "c1" }), ca("s2", { date: "2026-09-06" }), ca("s3", { date: "2026-09-07", hostId: "" })]
      })
    );
    const c = m.hourCheck[0];
    expect(c).toMatchObject({ brandName: "HR", sessions: 3, brandHours: 9, hostHours: 6, coHostHours: 3, sessionsNoHost: 1, sessionsNoAssistant: 2 });
    expect(c.hostGap).toBe(3);
    expect(c.coHostGap).toBe(6);
  });

  test("đối chiếu giờ: đủ host mọi ca thì lệch host = 0", () => {
    const m = buildMonthClose(base({ sessions: [ca("s1", {}), ca("s2", { date: "2026-09-06" })] }));
    expect(m.hourCheck[0].hostGap).toBe(0);
  });
});
