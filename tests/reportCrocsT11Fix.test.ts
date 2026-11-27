import { describe, expect, it } from "vitest";
import { planCampAllocation, skuRankMoves, type SkuMove } from "../src/lib/report/monthlyReportInsights";
import { cancelledPlan } from "../src/lib/performance/planRunRate";
import { peopleBlocks, productsBlocks, whyBlocks, whyHeadline } from "../src/lib/report/pageInsights";
import { byHostDayType, dayTypeTeamTotals } from "../src/lib/performance/hostPerformance";
import { promoCountNote } from "../src/components/brand-workspace/report/ProductsPage";
import type { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

// Đối chiếu report CROCS T11 (27/11): các số/câu sai đã thấy trên report thật.

describe("Tháng sau: ca đã huỷ không tính vào Giờ live", () => {
  const slot = (id: string, date: string): BrandMonthPlanSlot => ({ id, planId: "p", date, startTime: "09:00", endTime: "12:00", targetGmv: 10e6, expectedGmv: 0, slotId: `s-${id}`, note: "" });
  const plan = [slot("a", "2026-12-02"), slot("b", "2026-12-03")];
  const shifts = [{ id: "s-a", status: "open" }, { id: "s-b", status: "cancelled" }] as unknown as ShiftSlot[];
  it("giờ và số ca bỏ ca huỷ, target giữ nguyên", () => {
    const off = cancelledPlan("2026-12", plan, shifts, [], "2026-11-27");
    expect(off).toMatchObject({ count: 1, target: 10e6 });
    const daily = planCampAllocation(plan, undefined, off.ids).find((x) => x.key === "daily")!;
    expect(daily).toMatchObject({ hours: 3, slots: 1, target: 20e6 });
  });
});

describe("Sản phẩm: câu đếm khớp mũi tên trong bảng", () => {
  const row = (name: string, rank: number, prevRank: number | null) => ({ name, rank, prevRank, ctor: 1, ctr: 2 }) as unknown as SkuMove;
  const rows = [row("A", 1, 2), row("B", 2, 1), row("C", 3, 5), row("D", 4, 7), row("E", 5, 9), row("F", 6, 6), row("G", 10, 4)];
  const { risers, fallers } = skuRankMoves(rows, true);
  const toInput = (x: SkuMove) => ({ name: x.name, from: x.prevRank, to: x.rank, ctor: x.ctor, ctr: x.ctr });
  const b = productsBlocks({ topN: 7, risers: risers.map(toInput), fallers: fallers.map(toInput), lead: { name: "A", share: 30 }, promo: { name: "BF", rate: null } });
  it("đếm mọi mã đổi hạng, chỉ liệt kê 3", () => {
    expect(b.observe).toContain("4 mã tăng hạng, 2 mã giảm hạng");
    expect(b.observe).toContain("và 1 mã khác");
  });
  it("đề xuất kiểm tra chỉ cho mã giảm từ 2 hạng", () => {
    expect(b.advise).toContain("kịch bản chuyển đổi của G.");
  });
  it("không gọi Total GMV của chương trình là LIVE GMV", () => {
    expect(b.impact).toContain("Total GMV cao nhất");
    expect(b.impact).not.toContain("LIVE GMV");
  });
  it("tháng trước không có bảng ⇒ không đếm", () => {
    expect(skuRankMoves([row("A", 1, null)], false).risers).toHaveLength(0);
  });
});

describe("Khuyến mãi: số chương trình không lấy từ danh sách top 10", () => {
  const items = Array.from({ length: 10 }, () => ({ name: "x", status: "", period: "", gmv: 1, orders: 1, aov: 1, itemsSold: 1 }));
  it("có insideCount thì nêu đúng số", () => {
    expect(promoCountNote({ items, hasAnyBatch: true, excludedMultiMonth: 0, insideCount: 41, openCount: 3 })).toBe("41 chương trình có kỳ chạy trong tháng, 3 còn đang chạy");
  });
  it("bản chụp cũ đủ 10 dòng thì không nêu số", () => {
    expect(promoCountNote({ items, hasAnyBatch: true, excludedMultiMonth: 0 })).not.toMatch(/\d/);
  });
});

describe("Nguyên nhân: nêu từng loại ngày, loại ngày giảm đứng trước", () => {
  const parts = [
    { key: "hours", label: "Giờ live", value: 325e6, change: 7 },
    { key: "viewsPerHour", label: "Views/giờ", value: 215e6, change: 5 },
    { key: "ctor", label: "CTOR", value: -101e6, change: -2 }
  ];
  const days = [{ label: "Daily", change: -15 }, { label: "D-Day", change: 28 }, { label: "Pay Day", change: 68 }];
  const r = whyBlocks({ gmvPerHourChange: 7, parts, significantDays: days, mix: { mix: 1e5, rate: 1.4e6 } });
  it("liệt kê loại ngày đổi từ 10%", () => {
    expect(r.observe).toContain("Daily (−15%)");
    expect(r.observe).toContain("Pay Day (+68%)");
  });
  it("không khẳng định nguyên nhân ở khối Tác động, đề xuất rà soát loại ngày giảm", () => {
    expect(r.impact).not.toContain("Nguyên nhân");
    expect(r.advise).toContain("Rà soát Daily (GMV/giờ −15%)");
    expect(r.advise).not.toContain("Giữ kịch bản");
  });
  it("tiêu đề nêu Daily, không nêu CTOR đổi dưới 10%", () => {
    const h = whyHeadline({ metric: "GMV/giờ", gmvPerHourChange: 7, parts, days })!;
    expect(h).toContain("Daily (−15%)");
    expect(h).not.toContain("CTOR");
  });
  it("cả tháng tăng, không loại ngày giảm, yếu tố âm dưới 10% ⇒ không gọi là kéo giảm", () => {
    expect(whyHeadline({ metric: "GMV/giờ", gmvPerHourChange: 7, parts, days: [] })).not.toContain("kéo giảm");
  });
});

describe("Khung giờ: chỉ nói 'chung cả tháng' khi cả tháng đổi tương đương", () => {
  const base = { hosts: [{ name: "A", verdict: "unclear" as const, ci: "", sessions: 8, borderline: false }], months: 4 };
  const slots = [{ label: "chiều", gmvPerHour: 22e6, n: 16, index: 0.93, change: 37 }, { label: "tối", gmvPerHour: 21e6, n: 43, index: 1.07, change: 0 }];
  it("chiều +37% trong khi cả tháng +7% ⇒ không quy cho xu hướng chung", () => {
    const b = peopleBlocks({ ...base, monthChange: 7, slots });
    expect(b.cause).not.toContain("chung cả tháng");
    expect(b.cause).toContain("(cả tháng +7%)");
    expect(b.cause).toContain("cao nhất là tối");
    expect(b.cause).toContain("43 phiên; thấp nhất là chiều");
  });
});

describe("Host: số phiên của team đếm theo phiên", () => {
  const s = { id: "1", date: "2026-11-02", startTime: "09:00", endTime: "12:00", status: "Completed", hostId: "h1", hostName: "A", coHostName: "", actualGmv: 30e6, liveDurationMinutes: 180,
    staffSegments: [{ role: "host", talentId: "h1", name: "A", startTime: "09:00", endTime: "10:00" }, { role: "host", talentId: "h2", name: "B", startTime: "10:00", endTime: "12:00" }] } as unknown as LiveSession;
  it("phiên đổi host vẫn là 1 phiên của team, mỗi host vẫn được ghi 1", () => {
    const bucketOf = () => "daily" as const;
    const rows = byHostDayType([s], bucketOf);
    expect(rows.map((r) => r.byBucket.daily.sessions)).toEqual([1, 1]);
    expect(dayTypeTeamTotals(rows, { sessions: [s], bucketOf }).daily.sessions).toBe(1);
  });
});
