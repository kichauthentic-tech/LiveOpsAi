import { describe, expect, it } from "vitest";
import { nextBlocks, nmvBlocks, peopleBlocks, shopBlocks, summaryBlocks } from "../src/lib/report/pageInsights";
import { shopeeCancelBlocks } from "../src/lib/report/shopeePages";

// Audit trước khi xuất report T10 gửi brand (30/10): lỗi logic + câu dặn việc nội bộ trong Insight tự sinh.

const ops = /Hợp đồng & giá|Kế Hoạch Tháng|[Tt]ải lên|Tải lại|Nhập Ads|trước khi chốt report/;

describe("B1 · trang 1 nói đúng vế thiếu (GMV/giờ hay Giờ live)", () => {
  const base = { liveActual: 78.8e6, liveTarget: 91.4e6, worstFactor: null, shopKpi: null };
  it("JOCKEY T10 Daily 88% GMV/giờ, 64% Giờ live ⇒ cả hai, Giờ live là phần lớn hơn", () => {
    const b = summaryBlocks({ ...base, days: [{ label: "Daily", target: 32e6, actual: 21.2e6, gphPct: 88, hoursPct: 64 }] });
    expect(b.cause).toContain("thiếu do cả GMV/giờ và Giờ live, phần lớn hơn là Giờ live");
    expect(b.cause).not.toContain("không do Giờ live");
    expect(b.advise).toContain("Giữ đủ Giờ live kế hoạch của Daily (mới đạt 64%)");
  });
  it("chỉ GMV/giờ dưới kế hoạch ⇒ thiếu do GMV/giờ", () => {
    const b = summaryBlocks({ ...base, days: [{ label: "Pay Day", target: 86.7e6, actual: 40.8e6, gphPct: 47, hoursPct: 101 }] });
    expect(b.cause).toContain("thiếu do GMV/giờ, Giờ live đạt kế hoạch");
  });
});

describe("B2 · Đề xuất trang 1 theo phạm vi Ads", () => {
  const i = { liveActual: 300e6, liveTarget: 561e6, days: [{ label: "Daily", target: 241e6, actual: 120e6 }], worstFactor: null, shopKpi: null };
  it("YFB không chạy Ads ⇒ không khuyên chỉnh Ads", () => {
    expect(summaryBlocks({ ...i, withAds: false }).advise).not.toContain("Ads");
    expect(summaryBlocks(i).advise).toContain("và Ads");
  });
  it("không có KPI toàn shop ⇒ không ghi câu 'chưa có KPI' cho brand", () => {
    expect(summaryBlocks(i).impact).toBe("");
  });
});

describe("B3 · chọn loại ngày thiếu nhiều tiền nhất (VERA T10)", () => {
  it("Daily −122M được nêu, không phải Pay Day 47% Target", () => {
    const b = summaryBlocks({
      liveActual: 300.9e6,
      liveTarget: 561.2e6,
      days: [
        { label: "Daily", target: 241.4e6, actual: 119.8e6 },
        { label: "Pay Day", target: 86.7e6, actual: 40.8e6 }
      ],
      worstFactor: null,
      shopKpi: null
    });
    expect(b.observe).toContain("Daily chiếm");
  });
});

describe("B4 · Insight gửi brand không chứa việc nội bộ", () => {
  it("NMV dùng mặc định: nêu chênh với Refund rate thực, không dặn nhập CRM", () => {
    const b = nmvBlocks({ refundCur: 16.9, refundPrev: 15.5, prevLabel: "T9", nmvSource: "ước tính — % hoàn mặc định 40%", usesCrmRate: false });
    expect(b.impact).toContain("khác Refund rate thực 16,9%");
    expect(b.impact).not.toMatch(ops);
  });
  it("Tháng sau chưa có kế hoạch: nói YFB gửi kế hoạch, không 'Lập … trước khi chốt report'", () => {
    const b = nextBlocks({ nextLabel: "Tháng 11", hasLivePlan: false, hasCreatorPlan: false, withCreator: false });
    expect(Object.values(b).join(" ")).not.toMatch(ops);
    expect(b.advise).toContain("YFB gửi Target Live của tháng 11");
  });
  it("Shopee đơn huỷ: không dặn tải lại Live List", () => {
    const b = shopeeCancelBlocks([{ month: "2026-10", gmv: 789e6, confirmed: 744.6e6, cancelRate: 5.7, byBucket: {} } as never]);
    expect(b.advise).not.toMatch(ops);
  });
});

describe("B5 · Toàn shop: phần Seller LIVE ngoài YFB không bị coi là kênh của YFB", () => {
  it("kênh giảm lớn nhất là livestream YFB ⇒ không bảo brand lập kế hoạch cho kênh đó", () => {
    const b = shopBlocks({
      totalChange: -14.4,
      windowLabel: "1–25/10 so với 1–25/09",
      channels: [
        { label: "Livestream YFB", delta: -156e6, yfb: true },
        { label: "Seller LIVE khác", delta: 19e6 },
        { label: "Video", delta: 40e6 }
      ],
      control: []
    });
    expect(b.advise).not.toContain("Trao đổi với brand kế hoạch");
    expect(b.impact).toContain("Livestream YFB");
  });
});

describe("B6 · Host: khung đổi vượt ngưỡng phải được giải thích", () => {
  const hosts = [{ name: "A", verdict: "unclear" as const, ci: "", sessions: 10, borderline: false }];
  it("VERA T10 Tối −32% (±18%) nhưng 97% trung bình cùng loại ngày ⇒ giảm chung cả tháng", () => {
    const b = peopleBlocks({
      hosts,
      months: 4,
      slots: [
        { label: "sáng (trước 12h)", gmvPerHour: 1.6e6, n: 21, index: 0.97, change: -28, band: 25 },
        { label: "chiều (12h–17h)", gmvPerHour: 1.8e6, n: 8, index: 1.04, change: -17, band: 41 },
        { label: "tối (từ 17h)", gmvPerHour: 1.6e6, n: 35, index: 0.98, change: -32, band: 18 }
      ]
    });
    expect(b.cause).toContain("Khung tối (từ 17h) −32% so với tháng trước (vượt ngưỡng ±18%)");
    expect(b.cause).toContain("giảm chung cả tháng");
  });
  it("không khung nào vượt ngưỡng ⇒ không thêm câu", () => {
    const b = peopleBlocks({ hosts, months: 4, slots: [{ label: "sáng", gmvPerHour: 1e6, n: 5, index: 1, change: -5, band: 20 }, { label: "tối", gmvPerHour: 1e6, n: 5, index: 1, change: 3, band: 20 }] });
    expect(b.cause).not.toContain("vượt ngưỡng");
  });
});

describe("NMV: nguồn bắt đầu bằng 'theo' không bị lặp chữ", () => {
  it("không ra 'theo theo'", () => {
    const b = nmvBlocks({ refundCur: 17.2, refundPrev: 14.4, prevLabel: "T9", nmvSource: "ước tính — theo Refund rate tạm tính của tháng (đơn còn trong thời gian hoàn trả)", usesCrmRate: false });
    expect(b.impact).toContain("NMV là số ước tính theo Refund rate tạm tính");
    expect(b.impact).not.toContain("theo theo");
  });
});
