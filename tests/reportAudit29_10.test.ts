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

describe("B8 (sửa 30/10) · tiêu đề và Insight trang 1 chọn cùng loại ngày thiếu nhiều tiền nhất", () => {
  const days = [
    { label: "Daily", target: 3e9, actual: 2.4e9 }, // −600M, 80%
    { label: "D-Day", target: 0.5e9, actual: 0.3e9 } // −200M, 60%
  ];
  it("cùng chọn Daily (−600M) dù D-Day có % Target thấp hơn", () => {
    expect(summaryHeadline({ liveActual: 2.7e9, liveTarget: 3.5e9, days })).toContain("Daily thiếu nhiều nhất (−600M, đạt 80% Target)");
    const b = summaryBlocks({ liveActual: 2.7e9, liveTarget: 3.5e9, days, worstFactor: null, shopKpi: null });
    expect(b.observe).toContain("Daily chiếm 75%");
    expect(b.advise).toContain("Daily");
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

describe("N2 · trang 1 có 4 chip cam kết/tiến độ, không còn chip GMV/giờ", () => {
  const h = renderToStaticMarkup(React.createElement(SummaryDemoPage, summaryProps({ liveTargetMonth: 5.15e9 })));
  it("không còn chip GMV/giờ", () => {
    expect(h).not.toContain("so với 1–");
  });
  it("có chip Giờ live và chip đích cuối tháng", () => {
    expect(h).toContain("Cần mỗi ngày còn lại");
    expect(h).toContain("kế hoạch tháng");
  });
  it("tối đa 4 chip", () => {
    expect((h.match(/class="kpi"/g) ?? []).length).toBeLessThanOrEqual(4);
  });
});

describe("N3 · Insight NMV không viết 'ước tính theo ước tính'", () => {
  const b = nmvBlocks({ refundCur: 37.7, refundPrev: 36.9, prevLabel: "T9", nmvSource: "ước tính — % hoàn mặc định 40% (CRM chưa nhập % hoàn dự kiến)", usesCrmRate: false });
  it("câu Tác động gọn, không dặn việc nội bộ (gửi brand)", () => {
    expect(b.impact).not.toContain("ước tính theo ước tính");
    expect(b.impact).toContain("NMV là số ước tính theo % hoàn mặc định 40%");
    expect(b.impact).toContain("khác Refund rate thực 37,7%");
    expect(b.impact).not.toContain("Hợp đồng & giá");
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

// ---------------- N6, C12–C14 ----------------
import { KeyMetricsDemoPage } from "../src/components/brand-workspace/report/DemoSummaryPages";
import { estimateSessionCv, keyMetricsTable, noiseBand, SESSION_CV, type KeyMetricsMonth } from "../src/lib/report/brandReport";
import { affiliateBlocks, peopleBlocks, shopBlocks } from "../src/lib/report/pageInsights";

describe("N6 · Đề xuất trang Toàn shop không bỏ sót kênh giảm lớn nhất", () => {
  const ch = [{ label: "Affiliate LIVE", delta: -320e6 }, { label: "Video", delta: 165e6 }];
  it("livestream cần rà soát và Affiliate giảm nhiều nhất ⇒ có cả hai việc", () => {
    const b = shopBlocks({ totalChange: -2, windowLabel: "1–25/10", channels: ch, control: [{ label: "Campaign", liveChg: -2, restChg: 12, verdict: "ops" }] });
    expect(b.advise).toContain("Rà soát khung giờ, host và kịch bản livestream ở Campaign");
    expect(b.advise).toContain("Trao đổi với brand kế hoạch Affiliate LIVE");
  });
  it("không có kênh giảm ⇒ chỉ việc livestream", () => {
    const b = shopBlocks({ totalChange: 1, windowLabel: "x", channels: [{ label: "Video", delta: 5e6 }], control: [{ label: "Daily", liveChg: -20, restChg: 0, verdict: "ops" }] });
    expect(b.advise).not.toContain("Trao đổi với brand");
  });
});

describe("C12 · ngưỡng dao động đo theo brand", () => {
  const mk = (day: string, hour: number, gph: number) => ({ startTime: `${day}T${String(hour - 7).padStart(2, "0")}:00:00.000Z`, gmv: gph * 2, hours: 2 });
  // 40 ca cùng tháng, cùng loại ngày, cùng buổi sáng, GMV/giờ dao động ±20% quanh 10M
  const rows = Array.from({ length: 40 }, (_, i) => mk(`2026-10-${String(1 + (i % 20)).padStart(2, "0")}`, 9, i % 2 ? 12e6 : 8e6));
  it("đo được CV ≈ 20% khi dao động ±20%", () => {
    const cv = estimateSessionCv(rows, () => "daily")!;
    expect(cv).toBeGreaterThan(0.19);
    expect(cv).toBeLessThan(0.23);
  });
  it("dưới 30 ca ⇒ null (dùng mặc định); CV bị kẹp 0,15–0,45", () => {
    expect(estimateSessionCv(rows.slice(0, 12), () => "daily")).toBeNull();
    const flat = Array.from({ length: 40 }, (_, i) => mk(`2026-10-${String(1 + (i % 20)).padStart(2, "0")}`, 9, 10e6));
    expect(estimateSessionCv(flat, () => "daily")).toBe(0.15);
  });
  it("noiseBand/keyMetricsTable nhận CV; không truyền thì giữ mặc định", () => {
    expect(noiseBand(10, 10)).toBeCloseTo(noiseBand(10, 10, SESSION_CV)!);
    expect(noiseBand(10, 10, 0.13)!).toBeCloseTo(noiseBand(10, 10)! / 2);
    const st = (sessions: number) => ({ sessions } as never);
    const months = [{ month: "2026-09", stats: { all: st(20), daily: st(10), dday: st(4), midmonth: st(3), payday: st(3) }, targets: null, gmvForTarget: {} as never }, { month: "2026-10", stats: { all: st(20), daily: st(10), dday: st(4), midmonth: st(3), payday: st(3) }, targets: null, gmvForTarget: {} as never }] as KeyMetricsMonth[];
    expect(keyMetricsTable(months, "all", 0.13).bands[1]!).toBeCloseTo(keyMetricsTable(months, "all").bands[1]! / 2);
  });
  it("trang Key Metrics ghi nguồn CV", () => {
    const base = { no: "2", title: "t", headline: "h", months: [] as KeyMetricsMonth[], monthLabel: (m: string) => m, insight: null };
    // 2 tháng rỗng: chỉ cần phần phụ đề
    const mo = (month: string) => ({ month, stats: { all: { sessions: 0 }, daily: { sessions: 0 }, dday: { sessions: 0 }, midmonth: { sessions: 0 }, payday: { sessions: 0 } }, targets: null, gmvForTarget: {} }) as never;
    const h = (cvMeasured: boolean) => renderToStaticMarkup(React.createElement(KeyMetricsDemoPage, { ...base, months: [mo("2026-09"), mo("2026-10")], cv: 0.22, cvMeasured }));
    expect(h(true)).toContain("±22%, đo trên phiên của brand");
    expect(h(false)).toContain("mức mặc định");
  });
});

describe("C13 · khung giờ: chỉ số khử loại ngày", () => {
  const base = { hosts: [{ name: "A", verdict: "unclear" as const, ci: "", sessions: 8, borderline: false }], months: 3 };
  it("xếp theo chỉ số so với trung bình cùng loại ngày, không theo GMV/giờ thô", () => {
    // Tối có GMV/giờ thô cao nhất (nhiều ngày camp) nhưng chỉ số thấp nhất
    const r = peopleBlocks({ ...base, slots: [{ label: "tối", gmvPerHour: 24e6, n: 20, index: 0.7 }, { label: "sáng", gmvPerHour: 15e6, n: 20, index: 1.1 }] });
    expect(r.cause).toContain("đã so với trung bình cùng loại ngày");
    expect(r.cause).toContain("sáng 15M/giờ (110% mức trung bình cùng loại ngày)");
    expect(r.advise).toContain("dời bớt phiên tối sang sáng");
  });
  it("không có chỉ số ⇒ giữ cách cũ nhưng ghi chưa khử loại ngày", () => {
    const r = peopleBlocks({ ...base, slots: [{ label: "tối", gmvPerHour: 10e6, n: 20 }, { label: "sáng", gmvPerHour: 20e6, n: 20 }] });
    expect(r.advise).toContain("chưa khử hiệu ứng loại ngày");
  });
});

describe("C14 · không dùng 'Direct GMV' cho GMV phiên creator", () => {
  it("Insight Affiliate gọi là GMV phiên", () => {
    const b = affiliateBlocks({ sessions: 6, creators: 3, gmv: 600e6, pctTarget: 75, top: { creator: "Khói", share: 64.7 }, gmvPerHour: 20e6, lowest: null });
    expect(b.observe).toContain("GMV phiên");
    expect(b.observe).not.toContain("Direct GMV");
  });
  it("Key Metrics ghi dòng Direct lấy từ mọi phiên tài khoản shop", () => {
    const mo = (month: string) => ({ month, stats: { all: { sessions: 0 }, daily: { sessions: 0 }, dday: { sessions: 0 }, midmonth: { sessions: 0 }, payday: { sessions: 0 } }, targets: null, gmvForTarget: {} }) as never;
    const share = { all: [70, 72], daily: [null, null], dday: [null, null], midmonth: [null, null], payday: [null, null] } as never;
    const h = renderToStaticMarkup(React.createElement(KeyMetricsDemoPage, { no: "2", title: "t", headline: "h", months: [mo("2026-09"), mo("2026-10")], directShare: share, monthLabel: (m: string) => m, insight: null }));
    expect(h).toContain("mọi phiên của tài khoản shop");
  });
});
