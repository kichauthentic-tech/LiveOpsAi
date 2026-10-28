import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NmvDemoPage, type NmvMonth } from "../src/components/brand-workspace/report/DemoSummaryPages";
import { SECTIONS } from "../src/components/brand-workspace/report/theme";
import { scoreRows } from "../src/lib/report/brandReport";
import { controlGap, controlVerdict, type ControlRow } from "../src/lib/report/deepAnalysis";
import { whyBlocks } from "../src/lib/report/pageInsights";

// Audit Report Tháng 29/10 — 5 lỗi nặng A1–A5.

describe("A1/A2 · trang NMV không nhắc 'hủy' khi chưa có số hủy, nói rõ nguồn tỷ lệ", () => {
  const mo = (month: string, short: string, rate: number): NmvMonth => ({
    month, short, win: `1–26/${month.slice(5)}`, liveGmv: 5e9, nmvGmv: 5e9, windowRate: rate, fileRate: rate, template: "new",
    exportedAt: "2026-10-27", status: "provisional", shopGmv: 9e9, affiliate: 1e9, video: 1e9, card: 1e9
  });
  const html = renderToStaticMarkup(
    React.createElement(NmvDemoPage, {
      no: "3", title: "t", headline: "h", months: [mo("2026-08", "T8", 20), mo("2026-09", "T9", 22), mo("2026-10", "T10", 25)],
      nmvRate: 18, nmvSource: "đã chốt gần nhất (tháng 2026-08)", curEndDay: 22, nmvEndDay: 26, track: [], finalDates: {}, canManage: false,
      onSaveFinal: async () => {}, onSaveDate: async () => {}, insight: null
    })
  );
  it("nhãn thanh và chú giải dùng 'hoàn', không 'hoàn hủy'", () => {
    expect(html).not.toContain("hoàn hủy");
    expect(html).toContain("Hoàn ước tính");
    expect(html).toContain("chưa gồm đơn hủy");
  });
  it("tháng report ghi nguồn tỷ lệ đang trừ, tháng trước dùng tỷ lệ tại ngày xuất file", () => {
    expect(html).toContain("tỷ lệ đã chốt gần nhất (tháng 2026-08)");
    expect(html).toContain("tỷ lệ tại ngày xuất file");
  });
  it("tiêu đề trang không hứa số hủy", () => {
    expect(SECTIONS.find((s) => s.id === "nmv")!.title).not.toMatch(/hủy/i);
  });
});

describe("A3 · bảng điểm: KPI toàn shop cũng theo target tới nay", () => {
  it("tháng dở: dòng shop chia cho target tới nay, không phải target cả tháng", () => {
    const rows = scoreRows(5.15e9, 4.43e9, [], { target: 8.4e9, actual: 3.4e9 }, { all: 4.66e9, shop: 3.6e9 });
    const shop = rows.find((r) => r.key === "shop")!;
    expect(shop.target).toBe(8.4e9);
    expect(shop.targetToDate).toBe(3.6e9);
    expect(Math.round(shop.pct!)).toBe(94);
  });
  it("tháng đủ (không có toDate): vẫn theo target tháng", () => {
    const shop = scoreRows(null, 0, [], { target: 8e9, actual: 7e9 }).find((r) => r.key === "shop")!;
    expect(shop.targetToDate).toBeNull();
    expect(Math.round(shop.pct!)).toBe(88);
  });
});

describe("A4 · Giờ live không phải nguyên nhân của GMV/giờ", () => {
  const parts = [
    { key: "hours", label: "Giờ live", value: -400e6, change: -12 },
    { key: "viewsPerHour", label: "Views/giờ", value: -150e6, change: -5 },
    { key: "aov", label: "AOV", value: 30e6, change: 2 }
  ];
  const r = whyBlocks({ gmvPerHourChange: -8, parts, significantDays: [], band: null, mix: null });
  it("yếu tố dẫn đầu chọn trong nhóm hiệu suất, giờ live chỉ được nêu là do lịch", () => {
    expect(r.cause).toContain("Views/giờ là yếu tố hiệu suất");
    expect(r.cause).not.toContain("Giờ live là");
    expect(r.advise).toContain("Views/giờ");
    expect(r.observe).toContain("do lịch quyết định, không tính vào nguyên nhân của GMV/giờ");
    expect(r.observe).not.toContain("Đóng góp tiêu cực: Giờ live");
  });
});

describe("A5 · nhóm đối chứng: ngưỡng tăng khi ít ngày", () => {
  const row = (days: number, liveChg: number, restChg: number) => ({ key: "camp", days, liveChg, restChg }) as ControlRow;
  it("ngưỡng 10/15/20 điểm theo số ngày", () => {
    expect([controlGap(9), controlGap(5), controlGap(3)]).toEqual([10, 15, 20]);
  });
  it("chênh 12 điểm: đủ để kết luận ở nhóm 9 ngày, không đủ ở nhóm 3 ngày", () => {
    expect(controlVerdict(row(9, -20, -8))).toBe("ops");
    expect(controlVerdict(row(5, -20, -8))).toBe("market");
    expect(controlVerdict(row(3, -20, -8))).toBe("market");
    expect(controlVerdict(row(3, -30, -8))).toBe("ops");
  });
});

// ---------------- Nhóm B (B6–B11) ----------------
import { SummaryDemoPage, type SummaryDemoProps } from "../src/components/brand-workspace/report/DemoSummaryPages";
import { keyMetricsHeadline, summaryHeadline } from "../src/lib/report/pageHeadlines";
import { keyMetricsBlocks, nmvBlocks, summaryBlocks } from "../src/lib/report/pageInsights";

const summaryProps = (over: Partial<SummaryDemoProps> = {}): SummaryDemoProps => ({
  no: "1", title: "t", headline: "h", month: "2026-10", partial: true, curEndDay: 26, prevMonthShort: "T9", prevEndDay: 26,
  liveActual: 4e9, liveTargetMonth: 5e9, liveTargetToDate: 4e9, liveProjected: null, shop: null, gmvPerHour: null, gmvPerHourChange: null,
  hoursChange: null, bridge: null, score: [], spans: {}, insight: null,
  planHours: [
    { key: "daily", planGmvPerHour: 1e6, actualGmvPerHour: 0.97e6, planHours: 100, planTarget: 100e6, share: 0.9 },
    { key: "dday", planGmvPerHour: 2e6, actualGmvPerHour: 1.5e6, planHours: 10, planTarget: 20e6, share: 0.1 }
  ],
  actualHours: { daily: 200, dday: 10 },
  ...over
});

describe("B6/B7 · bảng GMV/giờ kế hoạch trang 1", () => {
  const html = renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps()));
  it("GMV/giờ thực tế cả tháng trọng số theo giờ THỰC (995K), không theo giờ kế hoạch", () => {
    expect(html).toContain("995K");
  });
  it("câu phụ đề cùng ngưỡng 95% với thanh đỏ: 97% không tính là thấp, 75% có", () => {
    expect(html).toContain("1/2 loại ngày dưới 95%");
    const allOk = renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ planHours: [{ key: "daily", planGmvPerHour: 1e6, actualGmvPerHour: 0.97e6, planHours: 100, planTarget: 100e6, share: 1 }] })));
    expect(allOk).toContain("đạt từ 95%");
    expect(allOk).not.toContain("dưới 95%");
  });
});

describe("B8 · tiêu đề và Insight trang 1 chọn cùng loại ngày yếu nhất", () => {
  const days = [
    { label: "Daily", target: 3e9, actual: 2.4e9 }, // −600M, 80%
    { label: "D-Day", target: 0.5e9, actual: 0.3e9 } // −200M, 60%
  ];
  it("cùng chọn D-Day (60%) dù Daily chênh tuyệt đối lớn hơn", () => {
    expect(summaryHeadline({ liveActual: 2.7e9, liveTarget: 3.5e9, days })).toContain("D-Day thấp nhất ở 60%");
    const b = summaryBlocks({ liveActual: 2.7e9, liveTarget: 3.5e9, days, worstFactor: null, shopKpi: null });
    expect(b.observe).toContain("D-Day đạt % Target thấp nhất");
    expect(b.advise).toContain("D-Day");
  });
});

describe("B9 · Key Metrics: tiêu đề và Insight cùng chỉ số 'đầu tiên'", () => {
  const rows = [
    { label: "GMV", change: -10, tone: "down" as const, result: true },
    { label: "ERR", change: -15, tone: "down" as const }
  ];
  it("bỏ chỉ số kết quả ở cả hai", () => {
    expect(keyMetricsHeadline({ rows, prevLabel: "T9" })).toContain("đầu tiên trong phễu: ERR");
    expect(keyMetricsBlocks({ rows, band: 8, prevLabel: "T9" }).cause).toContain("ERR là chỉ số phễu");
  });
});

describe("B10 · NMV cùng cửa sổ với Refund rate", () => {
  it("KPI NMV ghi cùng khoảng ngày với Refund rate", () => {
    const mo = (month: string, short: string): NmvMonth => ({ month, short, win: "1–22/10", liveGmv: 5e9, nmvGmv: 5e9, windowRate: 20, fileRate: 20, template: "new", exportedAt: null, status: "provisional", shopGmv: 9e9, affiliate: 1e9, video: 1e9, card: 1e9 });
    const html = renderToStaticMarkup(React.createElement(NmvDemoPage, { no: "3", title: "t", headline: "h", months: [mo("2026-10", "T10")], nmvRate: 20, curEndDay: 22, track: [], finalDates: {}, canManage: false, onSaveFinal: async () => {}, onSaveDate: async () => {}, insight: null }));
    expect(html).toContain("NMV ước tính tạm · 1–22/10");
    expect(html).toContain("Refund rate tạm tính · 1–22/10");
    expect(html).not.toContain("1–26/10");
  });
  it("trang 1 báo khi LIVE và KPI toàn shop khác ngày cuối", () => {
    const html = renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ shop: { actual: 1e9, throughDay: 22, target: 8e9, projected: null, projectedPct: null } })));
    expect(html).toContain("tính tới 26/10");
    expect(html).toContain("tính tới 22/10");
  });
});

describe("B11 · Insight NMV không tự mâu thuẫn", () => {
  const base = { refundCur: 37.7, refundPrev: 30, prevLabel: "T9", nmvSource: null, usesCrmRate: false };
  it("tháng này chưa chốt, tháng trước đã chốt ⇒ không in chênh điểm", () => {
    const b = nmvBlocks({ ...base, curProvisional: true, prevProvisional: false });
    expect(b.observe).toContain("chưa so sánh được");
    expect(b.observe).not.toContain("điểm");
    expect(b.impact).toContain("không so chênh trực tiếp");
  });
  it("cùng mức chín ⇒ vẫn in chênh, Tác động không nói 'không so sánh'", () => {
    const b = nmvBlocks({ ...base, curProvisional: false, prevProvisional: false });
    expect(b.observe).toContain("điểm");
    expect(b.impact).not.toContain("không so chênh");
  });
});

// ---------------- N1–N5 (kiểm trên CROCS T10) ----------------
import { cancelledPlanTarget } from "../src/lib/report/reportVisuals";

describe("N1 · 'vượt ngưỡng' chỉ gắn cho GMV/giờ của loại ngày, không gắn cho yếu tố chưa vượt", () => {
  const base = { liveActual: 4.43e9, liveTarget: 4.66e9, days: [{ label: "Pay Day", target: 925e6, actual: 647e6 }], shopKpi: null };
  it("LIVE CTR −14% với ngưỡng ±19% ⇒ không nói yếu tố vượt ngưỡng", () => {
    const c = summaryBlocks({ ...base, worstFactor: { dayLabel: "Pay Day", factorLabel: "LIVE CTR", change: -14, dayChange: -29, band: 19 } }).cause;
    expect(c).toContain("GMV/giờ −29% vượt ngưỡng dao động ±19%");
    expect(c).toContain("chưa vượt ngưỡng riêng");
    expect(c).not.toContain("LIVE CTR −14%, cũng vượt");
  });
  it("yếu tố −25% vượt ngưỡng ±19% ⇒ nói 'cũng vượt ngưỡng'", () => {
    expect(summaryBlocks({ ...base, worstFactor: { dayLabel: "Pay Day", factorLabel: "LIVE CTR", change: -25, dayChange: -29, band: 19 } }).cause).toContain("cũng vượt ngưỡng");
  });
});

describe("N2 · tile GMV/giờ trang 1 chỉ đỏ khi vượt ngưỡng dao động", () => {
  const render = (band: number | null) => renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ gmvPerHour: 18.9e6, gmvPerHourChange: -7.2, hoursChange: 2.8, gmvPerHourBand: band })));
  it("−7,2% trong ngưỡng ±8% ⇒ không đỏ, có ghi 'trong ngưỡng'", () => {
    const h = render(8);
    expect(h).not.toContain("var(--red)");
    expect(h).toContain("trong ngưỡng ±8%");
  });
  it("−7,2% với ngưỡng ±5% ⇒ đỏ", () => {
    expect(render(5)).toContain("var(--red)");
  });
});

describe("N3 · Insight NMV không viết 'ước tính theo ước tính'", () => {
  const b = nmvBlocks({ refundCur: 37.7, refundPrev: 36.9, prevLabel: "T9", nmvSource: "ước tính — % hoàn mặc định 40% (CRM chưa nhập % hoàn dự kiến)", usesCrmRate: false });
  it("câu Tác động gọn và chỉ cách sửa khi dùng mặc định", () => {
    expect(b.impact).not.toContain("ước tính theo ước tính");
    expect(b.impact).toContain("NMV là số ước tính theo % hoàn mặc định 40%");
    expect(b.impact).toContain("khác Refund rate thực 37,7%");
    expect(b.impact).toContain("Hợp đồng & giá");
  });
  it("nguồn là số đã chốt ⇒ không nhắc mặc định", () => {
    const c = nmvBlocks({ ...base0(), nmvSource: "Refund rate đã chốt của tháng 2026-09" });
    expect(c.impact).not.toContain("khác Refund rate thực");
  });
  function base0() {
    return { refundCur: 37.7, refundPrev: 36.9, prevLabel: "T9", usesCrmRate: false };
  }
});

describe("N4 · Target tháng gồm ca huỷ", () => {
  const slot = (state: string, target: number) => ({ state, target }) as never;
  it("cộng đúng target của ca huỷ", () => {
    expect(cancelledPlanTarget([slot("cancelled", 25e6), slot("done", 1e9), slot("cancelled", 15e6)])).toBe(40e6);
  });
  it("bảng kế hoạch ghi chú phần chênh với Target tháng", () => {
    const h = renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ liveTargetMonth: 5.15e9, cancelledTarget: 40e6 })));
    expect(h).toContain("gồm 40M của ca kế hoạch đã huỷ");
    expect(renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ cancelledTarget: 0 })))).not.toContain("ca kế hoạch đã huỷ");
  });
});

describe("N5 · Nguyên nhân chỉ chắc chắn khi yếu tố vượt ngưỡng dao động", () => {
  const parts = [
    { key: "hours", label: "Giờ live", value: 125e6, change: 3 },
    { key: "viewsPerHour", label: "Views/giờ", value: -295e6, change: -6 },
    { key: "aov", label: "AOV", value: -199e6, change: -9 }
  ];
  it("AOV −9% vượt ±8% được chọn dù Views/giờ có đóng góp tiền lớn hơn", () => {
    const r = whyBlocks({ gmvPerHourChange: -7, parts, significantDays: [], band: null, factorBand: 8, mix: null });
    expect(r.cause).toContain("AOV là yếu tố hiệu suất");
    expect(r.advise).toContain("Đặt AOV làm chỉ số theo dõi chính");
  });
  it("không yếu tố nào vượt ngưỡng ⇒ nói chưa kết luận, đề xuất chỉ theo dõi", () => {
    const r = whyBlocks({ gmvPerHourChange: -7, parts: parts.map((p) => (p.key === "aov" ? { ...p, change: -4 } : p)), significantDays: [{ label: "Pay Day", change: -29 }], band: 19, factorBand: 8, mix: null });
    expect(r.cause).toContain("Views/giờ đóng góp tuyệt đối lớn nhất");
    expect(r.cause).toContain("chưa kết luận được nguyên nhân");
    expect(r.advise).toContain("chưa coi là nguyên nhân");
    expect(r.advise).not.toContain("làm chỉ số theo dõi chính");
  });
});
