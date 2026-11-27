// Audit lại Report Tháng 27/11/2026 — 5 lỗi: quà/UPT khi hai file lệch ngày, Target tháng sau, Insight trang Tháng sau,
// ngưỡng dao động trên chỉ số quy mô. Chạy: npx vitest run tests/reportAudit27_11.test.ts
import { describe, expect, it } from "vitest";
import { giftCoverageGap, giftStats, type GiftSlice } from "../src/lib/report/deepAnalysis";
import { keyMetricsTable, type KeyMetricsMonth } from "../src/lib/report/brandReport";
import { addKeyInput, emptyKeyCounts, keyMetrics } from "../src/lib/report/keyMetrics";
import { dayAbsRows } from "../src/lib/report/reportVisuals";
import { planSlotTargetSum, type LiveStats } from "../src/lib/report/monthlyReportInsights";
import { planGaps, planSums, type PlanGapRow } from "../src/lib/report/nextMonthPlan";
import { nextBlocks, nmvBlocks, productsBlocks, shopBlocks, type ProductsInsightInput, type ShopInsightPageInput } from "../src/lib/report/pageInsights";
import { refundImmature, type RefundMonthStatus } from "../src/lib/refundStatus";
import { observeHeadline } from "../src/lib/report/pageHeadlines";

const gift: GiftSlice = { hasAnyBatch: true, periodStart: "2026-10-01", periodEnd: "2026-10-29", items: 4410, giftItems: 872, giftSkus: 3, top: [] };
const shopDays = (n: number) => ({
  hasAnyBatch: true,
  days: Array.from({ length: n }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, "0")}`, gmv: 0, refunds: 0, orders: 108, visitors: 0, liveLinked: 0, affiliate: 0, video: 0 }))
});

describe("quà tặng và UPT toàn shop", () => {
  it("file shop thiếu ngày so với file Sản Phẩm ⇒ không tính, báo hai ngày cuối", () => {
    expect(giftStats(gift, shopDays(25))).toBeNull();
    expect(giftCoverageGap(gift, shopDays(25))).toEqual({ shopThrough: "2026-10-25", productThrough: "2026-10-29", missingDays: 4 });
  });
  it("file shop phủ đủ kỳ (kể cả dài hơn) ⇒ tính như cũ", () => {
    expect(giftCoverageGap(gift, shopDays(31))).toBeNull();
    expect(giftStats(gift, shopDays(31))!.uptShop).toBeCloseTo(4410 / (29 * 108), 4);
  });
});

const month = (m: string, sessions: number, gmv: number): KeyMetricsMonth => {
  const c = emptyKeyCounts();
  for (let i = 0; i < sessions; i++) addKeyInput(c, { gmv, itemsSold: 10, orders: 8, views: 1000, hours: 3, impressions: 5000, productImpressions: 2000, productClicks: 100, avgViewSec: 40 });
  const stats = { ...keyMetrics(c), skuOrders: 0, gmvPerView: null } as LiveStats;
  return { month: m, stats: { all: stats, daily: stats, dday: stats, midmonth: stats, payday: stats }, targets: null, gmvForTarget: { all: 0, daily: 0, dday: 0, midmonth: 0, payday: 0 } };
};

describe("Key Metrics: chỉ số quy mô không xếp vượt ngưỡng", () => {
  const months = [month("2026-10", 60, 10_000_000), month("2026-11", 90, 12_000_000)];
  it("tổng GMV, Views… đứng trung tính; GMV/giờ vẫn được chấm", () => {
    const t = keyMetricsTable(months, "all");
    const tone = (k: string) => t.rows.find((r) => r.def.key === k)!.tones[1];
    for (const k of ["gmv", "itemsSold", "orders", "views", "impressions", "productImpressions", "productClicks"]) expect(tone(k)).toBe("noise");
    expect(tone("gmvPerHour")).toBe("up");
  });
  it("bảng số đo từng loại ngày không viền sáng chỉ số quy mô", () => {
    const rows = dayAbsRows(months, ["daily"]);
    const gmv = rows.find((r) => r.key === "gmv")!;
    expect(gmv.neutral).toBe(true);
    expect(gmv.cells.daily[1].significant).toBe(false);
    expect(rows.find((r) => r.key === "gmvPerHour")!.cells.daily[1].significant).toBe(true);
  });
});

const row = (name: string, achieved: number, hours: number, target: number): PlanGapRow => ({ name, achieved, sessionsCur: 30, plan: { hours, target, slots: 30 } });
const total: PlanGapRow = { name: "Cả tháng", achieved: 10, sessionsCur: 120 };
const next = (rows: PlanGapRow[]) => nextBlocks({ nextLabel: "Tháng 12", curLabel: "Tháng 11", hasLivePlan: true, hasCreatorPlan: false, withCreator: false, gaps: planGaps(rows, total) });

describe("trang Tháng sau", () => {
  it("Target tháng = tổng Target các phiên", () => {
    expect(planSlotTargetSum([{ targetGmv: 4 }, { targetGmv: 6 }, { targetGmv: 0 }])).toBe(10);
  });
  it("GMV/giờ yêu cầu vượt ngưỡng ⇒ nêu mức chênh ở tiêu đề, không nói kế hoạch đã đủ", () => {
    const b = next([row("Daily", 10, 100, 2000), row("Pay Day", 10, 20, 1160)]);
    expect(observeHeadline(b, "")).toContain("Pay Day +480%");
    expect(observeHeadline(b, "")).toContain("cả tháng +");
    expect(b.impact).toContain("giờ kế hoạch đạt khoảng");
    expect(b.advise).toContain("xem trước Pay Day");
    expect(JSON.stringify(b)).not.toContain("Kế hoạch đã đủ");
  });
  it("chỉ một loại ngày vượt, cả tháng trong ngưỡng ⇒ nói đúng loại ngày đó", () => {
    const g = planGaps([row("Daily", 10, 200, 2000), row("Pay Day", 10, 10, 180)], total);
    expect(g.total).toBeNull();
    expect(g.days.map((d) => d.name)).toEqual(["Pay Day"]);
  });
  it("yêu cầu trong ngưỡng ⇒ giữ câu cũ", () => {
    const b = next([row("Daily", 10, 100, 1050)]);
    expect(b.impact).toContain("Kế hoạch đã đủ");
  });
});

describe("Kế hoạch có lịch nhưng chưa đặt Target", () => {
  it("nói đúng là chưa đặt Target, kèm mốc theo GMV/giờ đang đạt", () => {
    const b = nextBlocks({ nextLabel: "Tháng 12", curLabel: "Tháng 11", hasLivePlan: false, hasCreatorPlan: false, withCreator: false, unpriced: { sessions: 90, hours: 270, achieved: 10_000_000 } });
    expect(b.observe).toContain("90 phiên");
    expect(b.observe).toContain("chưa đặt Target");
    expect(JSON.stringify(b)).not.toContain("chưa được chốt");
    expect(b.advise).toContain("270 giờ");
  });
  it("loại ngày không có phiên không chặn dòng cả tháng", () => {
    const rows = [row("Daily", 10, 100, 2000), row("Pay Day", 10, 0, 0)];
    expect(planSums(rows)).toEqual({ hours: 100, target: 2000, complete: true });
    expect(planGaps(rows, total).total).not.toBeNull();
    expect(planSums([row("Daily", 10, 100, 2000), row("Pay Day", 10, 20, 0)]).complete).toBe(false);
  });
});

describe("trang Toàn shop: tổng GMV ngang nhau nhưng hiệu suất mỗi giờ giảm", () => {
  const base: ShopInsightPageInput = { totalChange: 3, windowLabel: "1–25/11", channels: [{ label: "Video", delta: -1e8 }], control: [{ label: "Daily", liveChg: -1, restChg: 0, verdict: "market" }] };
  it("có loại ngày GMV/giờ giảm vượt ngưỡng ⇒ không khuyên giữ lịch", () => {
    const b = shopBlocks({ ...base, channels: [], weakDays: [{ label: "Daily", gphChange: -15, hoursChange: 16 }] });
    expect(b.cause).toContain("Daily (−15%");
    expect(b.advise).toContain("Rà soát GMV/giờ ở Daily");
    expect(b.advise).not.toContain("Duy trì");
  });
  it("không có ⇒ giữ câu cũ", () => {
    expect(shopBlocks({ ...base, channels: [] }).advise).toContain("Duy trì");
  });
});

describe("trang Sản phẩm", () => {
  const base: ProductsInsightInput = {
    topN: 10,
    risers: [{ name: "A", from: 5, to: 2, ctor: 1.5 }, { name: "B", from: 9, to: 6, ctor: 0.84 }],
    fallers: [{ name: "C", from: 2, to: 5, ctor: 0.93, ctr: 3 }],
    lead: null,
    promo: { name: "MD 3.11", rate: 43, discount: 50, totalDiscount: 100, otherRates: [12, 6] }
  };
  it("có mã phản ví dụ ⇒ nói tỷ lệ không tách được hai nhóm", () => {
    expect(productsBlocks(base).cause).toContain("không tách được hai nhóm: B tăng hạng");
  });
  it("chương trình GMV cao nhất, giảm sâu nhất và tốn nhiều tiền giảm ⇒ nêu bằng mức giảm, không bằng ROI", () => {
    const b = productsBlocks(base);
    // Mức giảm theo "Tỷ lệ giảm giá trung bình" của TikTok (MD price 3.11 CROCS T11: 43%); chương trình khác 6–12%.
    expect(b.impact).toContain("mức giảm 43%");
    expect(b.impact).toContain("mức giảm sâu nhất");
    expect(b.impact).not.toContain("ROI");
    expect(b.advise).toContain("Xem lại mức giảm của MD 3.11");
    expect(b.advise).not.toContain("ROI");
  });
});

describe("trang NMV: file tháng này xuất non hơn", () => {
  const status = (month: string, exportedAt: string) => ({ month, exportedAt, settleFrom: month === "2026-11" ? "2026-12-15" : "2026-11-15" }) as Pick<RefundMonthStatus, "month" | "exportedAt" | "settleFrom">;
  it("chỉ coi là non khi xuất trước hạn chốt và sớm hơn ≥ 3 ngày so với tuổi file tháng trước", () => {
    // CROCS T11 (xuất 26/11, 4 ngày trước cuối tháng) so với T10 (xuất 1/11, 1 ngày sau cuối tháng).
    expect(refundImmature(status("2026-11", "2026-11-26"), status("2026-10", "2026-11-01"))).not.toBeNull();
    expect(refundImmature(status("2026-11", "2026-11-26"), status("2026-10", "2026-11-20"))).not.toBeNull();
    expect(refundImmature(status("2026-11", "2026-11-26"), status("2026-10", "2026-10-27"))).toBeNull();
    expect(refundImmature(status("2026-11", "2026-12-20"), status("2026-10", "2026-11-20"))).toBeNull();
  });
  it("không in chênh điểm, báo NMV nếu áp tỷ lệ tháng trước", () => {
    const b = nmvBlocks({ refundCur: 33.8, refundPrev: 37.7, prevLabel: "T10", nmvSource: null, usesCrmRate: false, curImmature: { exportedAt: "2026-11-26", settleFrom: "2026-12-15", prevExportedAt: "2026-11-20" }, nmvBase: { liveGmv: 1e9, rate: 33.8 } });
    expect(b.observe).not.toContain("điểm");
    expect(b.impact).toContain("không so chênh trực tiếp");
    expect(b.impact).toContain("Nếu áp tỷ lệ 37,7% của T10");
  });
});
