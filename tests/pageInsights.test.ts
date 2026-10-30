// Insight tổng hợp cuối mỗi trang Report Tháng — câu mẫu có chỗ trống + quy tắc chọn (2026-10-28).
import { expect, test } from "vitest";
import { adsBlocks, affiliateBlocks, BLOCK_KEYS, decodeEdits, encodeEdits, keyMetricsBlocks, nextBlocks, nmvBlocks, peopleBlocks, productsBlocks, shopBlocks, shownBlocks, summaryBlocks, whyBlocks } from "../src/lib/report/pageInsights";

test("sửa tay: mã hoá/giải mã đi 2 chiều, bỏ khối rỗng, rác thì coi như chưa sửa", () => {
  expect(decodeEdits(encodeEdits({ observe: " Sửa ", cause: "  " }))).toEqual({ observe: "Sửa" });
  expect(encodeEdits({})).toBeNull();
  expect(decodeEdits("không phải JSON")).toEqual({});
  expect(decodeEdits(undefined)).toEqual({});
});

test("bản ops sửa ghi đè đúng khối đã sửa, khối còn lại theo bản tự sinh", () => {
  const auto = { observe: "a", cause: "b", impact: "c", advise: "d" };
  expect(shownBlocks(auto, { cause: "B2", own: "riêng" })).toEqual({ observe: "a", cause: "B2", impact: "c", advise: "d", own: "riêng" });
  expect(shownBlocks(auto, {}).own).toBe("");
});

test("Tổng quan: nêu loại ngày thấp nhất so với Target và yếu tố giảm; không vượt ngưỡng thì nói rõ", () => {
  const base = { liveActual: 4_430_000_000, liveTarget: 4_660_000_000, days: [{ label: "Daily", target: 1_800_000_000, actual: 1_890_000_000 }, { label: "Pay Day", target: 925_000_000, actual: 647_000_000 }], shopKpi: { target: 8_400_000_000, projected: 7_390_000_000 } };
  const a = summaryBlocks({ ...base, worstFactor: { dayLabel: "Pay Day", factorLabel: "LIVE CTR", change: -14 } });
  expect(a.observe).toContain("Pay Day chiếm");
  expect(a.cause).toContain("LIVE CTR −14%");
  expect(a.impact).toContain("KPI GMV");
  expect(summaryBlocks({ ...base, worstFactor: null }).cause).toContain("Không loại ngày nào");
  // Chưa có Target: không ghi việc nội bộ ("Lập Target…") vào Insight gửi brand (audit 30/10).
  expect(summaryBlocks({ ...base, liveTarget: null, worstFactor: null }).advise).toBe("");
});

test("Key Metrics: không chỉ số vượt ngưỡng thì câu nói rõ điều đó", () => {
  const quiet = keyMetricsBlocks({ rows: [{ label: "GMV", change: -3, tone: "noise" }], band: 8, prevLabel: "T9" });
  expect(quiet.observe).toContain("không chỉ số nào đổi vượt ngưỡng");
  const down = keyMetricsBlocks({ rows: [{ label: "LIVE impressions", change: 13, tone: "up" }, { label: "ERR", change: -15, tone: "down" }], band: 8, prevLabel: "T9" });
  expect(down.observe).toContain("ERR −15%");
  expect(down.cause).toContain("ERR là chỉ số phễu suy giảm");
});

test("Nguyên nhân: chọn yếu tố có đóng góp tuyệt đối lớn nhất cùng chiều; loại ngày chỉ nêu khi vượt ngưỡng", () => {
  const parts = [
    { label: "Giờ live", value: 125e6, change: 10 },
    { label: "Views/giờ", value: -295e6, change: -6 },
    { label: "AOV", value: -199e6, change: -4 }
  ];
  const r = whyBlocks({ gmvPerHourChange: -7, parts, significantDays: [{ label: "Pay Day", change: -29 }], band: 22, mix: { mix: 482e3, rate: -1.9e6 } });
  expect(r.cause).toContain("Views/giờ là yếu tố hiệu suất đóng góp tuyệt đối lớn nhất");
  expect(r.observe).toContain("Pay Day (−29%)");
  expect(r.impact).toContain("không ở lịch live");
  expect(whyBlocks({ gmvPerHourChange: -7, parts, significantDays: [], band: null, mix: null }).observe).toContain("Không loại ngày nào");
  expect(whyBlocks({ gmvPerHourChange: null, parts: [], significantDays: [], band: null, mix: null }).observe).toContain("Chưa đủ số liệu");
});

test("Host: chỉ nêu host có khoảng tin cậy không cắt trung bình và đủ 5 phiên", () => {
  const r = peopleBlocks({
    hosts: [
      { name: "Hùng", verdict: "above", ci: "+14% (+2% … +26%)", sessions: 73, borderline: false },
      { name: "Nhật", verdict: "above", ci: "+30% (+5% … +60%)", sessions: 3, borderline: false },
      { name: "Trang", verdict: "unclear", ci: "+1%", sessions: 20, borderline: false }
    ],
    months: 4,
    slots: [{ label: "sáng", gmvPerHour: 20e6, n: 10 }, { label: "chiều", gmvPerHour: 15.8e6, n: 12 }]
  });
  expect(r.observe).toContain("Hùng");
  expect(r.observe).not.toContain("Nhật +30%");
  expect(r.impact).toContain("dưới 5 phiên");
  expect(r.cause).toContain("chiều");
});

test("Sản phẩm: mã tăng/giảm hạng nhiều nhất và CTOR của hai nhóm", () => {
  const r = productsBlocks({ topN: 10, risers: [{ name: "Bayaband", from: 7, to: 3, ctor: 1.68 }], fallers: [{ name: "Classic White", from: 3, to: 9, ctor: 0.92, ctr: 3.5 }], lead: { name: "Classic", share: 22 }, promo: null });
  expect(r.observe).toContain("Bayaband (7 → 3)");
  expect(r.cause).toContain("Classic White");
  expect(r.advise).toContain("Kiểm tra tồn kho");
});

test("Shop / Ads / Affiliate / NMV / Kế hoạch: câu mẫu theo quy tắc, thiếu số thì nói thiếu", () => {
  const shop = shopBlocks({ totalChange: -2.1, windowLabel: "1–26/10", channels: [{ label: "Affiliate LIVE", delta: -320e6 }, { label: "Video", delta: 165e6 }], control: [{ label: "Daily", liveChg: -4, restChg: -18, verdict: "agency_better" }] });
  expect(shop.observe).toContain("Affiliate LIVE");
  expect(shop.cause).toContain("không giảm mạnh hơn");
  const ads = adsBlocks({ cost: 342e6, target: 360e6, liveRoas: 14.7, buckets: [{ label: "Pay Day", cost: 72.6e6, target: 68e6, roas: 8.9 }, { label: "Daily", cost: 100e6, target: 120e6, roas: 21.7 }], zeroOrderDays: 0 });
  expect(ads.cause).toContain("Pay Day chi");
  expect(ads.impact).toContain("Không ngày nào");
  expect(affiliateBlocks({ sessions: 0, creators: 0, gmv: 0, pctTarget: null, top: null, gmvPerHour: null, lowest: null }).observe).toContain("Chưa đủ");
  expect(nmvBlocks({ refundCur: 37.7, refundPrev: 36.9, prevLabel: "T9", nmvSource: null, usesCrmRate: false }).observe).toContain("37,7%");
  expect(nextBlocks({ nextLabel: "Tháng 11", hasLivePlan: false, hasCreatorPlan: true }).observe).toContain("chưa có Target Live");
});

test("mọi hàm sinh trả đủ 4 khối không rỗng, kể cả khi thiếu dữ liệu", () => {
  const empties = [
    keyMetricsBlocks({ rows: [], band: null, prevLabel: "T9" }),
    shopBlocks({ totalChange: null, windowLabel: "", channels: [], control: [] }),
    productsBlocks({ topN: 0, risers: [], fallers: [], lead: null, promo: null }),
    peopleBlocks({ hosts: [], months: 0, slots: [] }),
    adsBlocks({ cost: 0, target: null, liveRoas: null, buckets: [], zeroOrderDays: 0 }),
    nextBlocks({ nextLabel: "Tháng 11", hasLivePlan: true, hasCreatorPlan: true })
  ];
  for (const b of empties) for (const k of BLOCK_KEYS) expect(b[k].length).toBeGreaterThan(0);
  // Tổng quan chưa có Target: tiêu đề trang đã nói điều đó ⇒ Quan sát rỗng (khối bị ẩn), các khối khác vẫn có chữ.
  // Audit 30/10: mọi khối rỗng (khung Insight bị ẩn ở bản gửi brand) — việc lập Target là dòng "Chỉ ops thấy".
  const noTarget = summaryBlocks({ liveActual: 0, liveTarget: null, days: [], worstFactor: null, shopKpi: null });
  for (const k of BLOCK_KEYS) expect(noTarget[k]).toBe("");
});

test("audit trùng lặp 30/10: trang 1 nói thiếu do GMV/giờ hay Giờ live, không phân tích yếu tố phễu khi có kế hoạch", () => {
  const b = summaryBlocks({
    liveActual: 4.43e9,
    liveTarget: 4.66e9,
    days: [
      { label: "Daily", target: 1.83e9, actual: 1.89e9, gphPct: 107, hoursPct: 77 },
      { label: "Pay Day", target: 925e6, actual: 647e6, gphPct: 65, hoursPct: 108 }
    ],
    worstFactor: { dayLabel: "Pay Day", factorLabel: "LIVE CTR", change: -14 },
    shopKpi: null
  });
  expect(b.observe).toContain("Thiếu 230M");
  expect(b.cause).toContain("Pay Day 65% GMV/giờ kế hoạch");
  expect(b.cause).toContain("do GMV/giờ");
  expect(b.cause).not.toContain("LIVE CTR");
});

test("audit trùng lặp 30/10: Key Metrics đề xuất cùng chỉ số chính với trang Nguyên nhân", () => {
  const rows = [{ label: "Product impressions", change: -13, tone: "down" as const }];
  const b = keyMetricsBlocks({ rows, band: 12, prevLabel: "T8", mainMetric: "Views/giờ" });
  expect(b.advise).toContain("Chỉ số theo dõi chính của tháng sau: Views/giờ");
  expect(b.advise).toContain("Product impressions theo dõi kèm");
});

test("audit trùng lặp 30/10: whyMainMetric = yếu tố kéo giảm vượt ngưỡng, yếu thì null", async () => {
  const { whyMainMetric } = await import("../src/lib/report/pageInsights");
  const parts = [{ key: "hours", label: "Giờ live", value: 760e6, change: 15 }, { key: "viewsPerHour", label: "Views/giờ", value: -1.03e9, change: -17 }];
  expect(whyMainMetric({ gmvPerHourChange: -23, parts, significantDays: [], band: null, factorBand: 12, mix: null })).toBe("Views/giờ");
  expect(whyMainMetric({ gmvPerHourChange: -23, parts, significantDays: [], band: null, factorBand: 20, mix: null })).toBeNull();
});
