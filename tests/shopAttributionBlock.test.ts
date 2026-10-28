import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoShopPage } from "../src/components/brand-workspace/report/DemoShopWhy";
import type { AttributionByType, AttributionMonth } from "../src/lib/report/liveAttribution";

const m = (direct: number, indirect: number, days = 30): AttributionMonth => ({ direct, indirect, attributed: direct + indirect, indirectPct: (indirect / (direct + indirect)) * 100, days });
const base = {
  no: "4", title: "Toàn shop", control: [], mixes: [null, null, null, null], mixLabels: ["T7", "T8", "T9", "T10"], yfbGmv: [0, 0, 0, 0],
  shopCur: null, shopPrev: null, window: { prevStart: "2026-09-01", prevEnd: "2026-09-30", curStart: "2026-10-01", curEnd: "2026-10-28" },
  traffic: null, fallbackHeadline: "x", insight: null
};
const noTypes: AttributionByType = { all: null, daily: null, dday: null, midmonth: null, payday: null };
const render = (attribution: (AttributionMonth | null)[], attributionTypes: AttributionByType[] = attribution.map(() => noTypes)) =>
  renderToStaticMarkup(React.createElement(DemoShopPage, { ...base, attribution, attributionTypes }));

describe("khối Direct vs Indirect ở trang Toàn shop", () => {
  it("liệt kê từng tháng: Direct, Indirect, Attributed, Indirect %, chênh so tháng trước", () => {
    const html = render([m(3413, 1194), m(3786, 1384), m(4170, 1729), null]);
    expect(html).toContain("Direct GMV và Indirect GMV qua các tháng");
    expect(html).toContain("So tháng trước");
    expect(html).not.toContain("Affiliate LIVE)");
    expect(html).not.toContain("<svg viewBox=\"0 0 640 240\"");
  });
  it("chênh từ 5 điểm trở lên tô màu, dưới 5 điểm trung tính", () => {
    const html = render([m(80, 20), m(73.6, 26.4), m(76, 24), null]);
    expect(html).toMatch(/class="dn[^"]*"[^>]*>\+6,4 điểm/);
    expect(html).toMatch(/class="nt[^"]*"[^>]*>−2,4 điểm/);
  });
  it("chi tiết theo loại ngày của tháng gần nhất, chỉ loại ngày có số", () => {
    const cur: AttributionByType = { ...noTypes, daily: m(700, 300, 16), payday: m(100, 50, 3) };
    const prev: AttributionByType = { ...noTypes, daily: m(800, 200, 16) };
    const html = render([null, null, m(1, 1), m(1, 1)], [noTypes, noTypes, prev, cur]);
    expect(html).toContain("Chi tiết theo loại ngày · T10");
    expect(html).toContain("Daily");
    expect(html).toContain("Pay Day");
    expect(html).not.toContain("<td>D-Day</td>");
    expect(html).toMatch(/class="dn[^"]*"[^>]*>\+10,0 điểm/);
  });
  it("chưa có số ⇒ nhắc bấm Cập nhật, không vẽ 0%", () => {
    const html = render([null, null, null, null]);
    expect(html).toContain("Bấm Cập nhật số liệu");
    expect(html).not.toContain("0,0%");
  });
});
