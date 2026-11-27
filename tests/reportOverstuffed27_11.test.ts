// Audit "report nhồi nhét" 27/11/2026 (CROCS TikTok T10 + Insight tự sinh T11) — 3 đợt: chỗ tự nói sai, phân tích vô nghĩa,
// số trùng nhiều chỗ. Chạy: npx vitest run tests/reportOverstuffed27_11.test.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isInsightStale, keyMetricsBlocks, nmvBlocks, peopleBlocks, shopBlocks, type ShopInsightPageInput } from "../src/lib/report/pageInsights";
import { observeHeadline } from "../src/lib/report/pageHeadlines";
import { staleInsightBlocker } from "../src/components/brand-workspace/report/staleInsights";
import { promoTableHtml } from "../src/components/brand-workspace/report/ProductsPage";
import { DemoShopPage, type ShopMonthMix } from "../src/components/brand-workspace/report/DemoShopWhy";
import { KeyMetricsDemoPage } from "../src/components/brand-workspace/report/DemoSummaryPages";
import { bucketStats } from "../src/lib/report/brandReport";

describe("A1 · Insight sửa tay cũ hơn bản chụp", () => {
  const edited = JSON.stringify({ observe: "ERR −15%" });
  it("sửa tay trước lần Cập nhật số liệu ⇒ cũ; sửa sau ⇒ không", () => {
    expect(isInsightStale({ text: edited, savedAt: "2026-10-30T08:00:00.000Z" }, "2026-11-27T08:42:00.000Z")).toBe(true);
    expect(isInsightStale({ text: edited, savedAt: "2026-11-27T09:00:00.000Z" }, "2026-11-27T08:42:00.000Z")).toBe(false);
  });
  it("ghi chú rỗng (đã khôi phục bản gốc) hoặc chưa có bản chụp ⇒ không chặn", () => {
    expect(isInsightStale({ text: "{}", savedAt: "2026-10-30T08:00:00.000Z" }, "2026-11-27T08:42:00.000Z")).toBe(false);
    expect(isInsightStale(undefined, "2026-11-27T08:42:00.000Z")).toBe(false);
    expect(isInsightStale({ text: edited, savedAt: "2026-10-30T08:00:00.000Z" }, null)).toBe(false);
  });
  it("câu chặn nêu đúng trang, bỏ trùng; không trang nào thì không chặn", () => {
    const m = staleInsightBlocker(["Key Metrics", "Host", "Key Metrics"])!;
    expect(m).toContain("Key Metrics, Host");
    expect(m).toContain("Đã đọc lại, giữ bản sửa");
    expect(staleInsightBlocker([])).toBeNull();
  });
});

describe("A2 · trang Toàn shop không còn biểu đồ thác kênh / lượt truy cập", () => {
  // CROCS T10: 4 kênh trong file chỉ cộng 98% Total GMV; card trang 1 giảm ≈ 110M.
  const a: ShopMonthMix = { liveLinked: 5230e6, affiliate: 629e6, video: 436e6, card: 1231e6, shopGmv: 7550e6 };
  const b: ShopMonthMix = { liveLinked: 5020e6, affiliate: 312e6, video: 628e6, card: 1120e6, shopGmv: 7220e6 };
  const base = {
    no: "4", title: "Toàn shop", control: [], mixLabels: ["T7", "T8", "T9", "T10"], attribution: [null, null, null, null],
    yfbGmv: [0, 0, 3500e6, 3400e6], shopCur: { gmv: 7220e6 }, shopPrev: { gmv: 7550e6 },
    window: { prevStart: "2026-09-01", prevEnd: "2026-09-30", curStart: "2026-10-01", curEnd: "2026-10-31" }, fallbackHeadline: "x", insight: null
  };
  it("không còn 2 biểu đồ thác (đóng góp kênh, lượt truy cập × CVR × AOV)", () => {
    const html = renderToStaticMarkup(React.createElement(DemoShopPage, { ...base, mixes: [null, null, a, b] }));
    expect(html).not.toContain("Đóng góp của từng kênh vào thay đổi Total GMV");
    expect(html).not.toContain("Phân rã Total GMV");
    expect(html).not.toContain("phân kênh");
  });
  it("C2 · bỏ biểu đồ tăng trưởng và 2 ô lặp số (lượt truy cập, Affiliate LIVE)", () => {
    const html = renderToStaticMarkup(React.createElement(DemoShopPage, { ...base, mixes: [null, null, a, b] }));
    expect(html).not.toContain("Tăng trưởng GMV");
    expect(html).not.toContain("Lượt truy cập shop ·");
    expect(html).not.toContain(">Affiliate LIVE</div>");
    // giải thích nhóm đối chứng chuyển sang bảng so sánh
    expect(html).toContain("nhóm đối chứng gần đúng");
  });
});

describe("B1 · khuyến mãi: mức giảm thay cho ROI", () => {
  it("dùng Tỷ lệ giảm giá trung bình của TikTok; thiếu cột thì tính tiền giảm ÷ giá trước giảm; không còn cột ROI", () => {
    const html = promoTableHtml([
      { name: "VC 5% bill 1M", status: "", period: "", gmv: 484.8e6, orders: 422, aov: 1.15e6, itemsSold: 430, discount: 32.5e6, roi: 14.9, discountRate: 6 },
      { name: "MD 1.10", status: "", period: "", gmv: 434.6e6, orders: 450, aov: 966e3, itemsSold: 460, discount: 253.6e6, roi: 1.71 }
    ]);
    expect(html).toContain("Mức giảm");
    expect(html).not.toContain(">ROI<");
    expect(html).toContain("6,0%");
    expect(html).toContain("37%"); // 253,6 ÷ (434,6 + 253,6)
  });
});

describe("B2 · UPT gồm quà tặng không tô tốt/xấu ở Key Metrics", () => {
  it("chỉ số không có chiều tốt (UPT, Avg. price, Giờ live) luôn trung tính", () => {
    const stats = bucketStats([], "2026-09-01", "2026-09-30", undefined as never);
    const month = (m: string) => ({ month: m, stats, targets: null, gmvForTarget: { all: 0, daily: 0, dday: 0, midmonth: 0, payday: 0 } });
    const html = renderToStaticMarkup(React.createElement(KeyMetricsDemoPage, { no: "2", title: "Key Metrics", headline: "h", months: [month("2026-08"), month("2026-09"), month("2026-10")], monthLabel: (m: string) => m, insight: null }));
    expect(html).toContain("(gồm quà tặng)");
    // C1 · chỉ còn "Cả tháng": không còn hàng tab loại ngày
    expect(html).not.toContain('role="tablist"');
  });
});

describe("B5 · ô Insight không có phát hiện thì '—' (giao diện ẩn)", () => {
  it("Key Metrics không chỉ số nào đổi từ 10% ⇒ 4 ô ẩn; tiêu đề trang vẫn nói rõ", () => {
    const b = keyMetricsBlocks({ rows: [{ label: "GMV", change: 3, tone: "noise" }], prevLabel: "T10" });
    expect(Object.values(b).every((v) => v === "—")).toBe(true);
    expect(observeHeadline(b, "dự phòng")).toBe("dự phòng");
  });
  it("Toàn shop không kênh nào giảm ⇒ ô Tác động ẩn", () => {
    const i: ShopInsightPageInput = { totalChange: 13.8, windowLabel: "1–25/11", channels: [{ label: "Livestream YFB", delta: 671e6, yfb: true }, { label: "Video", delta: 20e6 }], control: [] };
    expect(shopBlocks(i).impact).toBe("—");
  });
  it("NMV: câu cách tính không chiếm ô Nguyên nhân; Đề xuất không còn việc nội bộ của ops", () => {
    const b = nmvBlocks({ refundCur: 37.7, refundPrev: 37.3, prevLabel: "T9" } as Parameters<typeof nmvBlocks>[0]);
    expect(b.cause).toBe("—");
    expect(b.advise).not.toContain("Ghi ngày xuất file");
    expect(b.advise).toContain("file Order");
  });
  it("Host không có gì để nói ở Tác động ⇒ ẩn, không in câu cách so sánh", () => {
    const b = peopleBlocks({ hosts: [{ name: "Hùng", verdict: "above", ci: "+5% … +28%", sessions: 74, borderline: false }], months: 4, slots: [] });
    expect(b.impact).toBe("—");
  });
});
