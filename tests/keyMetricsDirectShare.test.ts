import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyMetricsDemoPage } from "../src/components/brand-workspace/report/DemoSummaryPages";
import { bucketStats } from "../src/lib/report/brandReport";

const stats = bucketStats([], "2026-09-01", "2026-09-30", undefined as never);
const month = (m: string) => ({ month: m, stats, targets: null, gmvForTarget: { all: 0, daily: 0, dday: 0, midmonth: 0, payday: 0 } });
const share = (all: (number | null)[]) => ({ all, daily: all, dday: all, midmonth: all, payday: all });
const render = (directShare?: ReturnType<typeof share>) =>
  renderToStaticMarkup(React.createElement(KeyMetricsDemoPage, { no: "2", title: "Key Metrics", headline: "h", months: [month("2026-07"), month("2026-08"), month("2026-09")], directShare, monthLabel: (m: string) => m, insight: null }));

describe("ô Direct % ở Key Metrics", () => {
  it("hiện hàng Direct % cho từng tháng, chênh bằng điểm và không tô màu", () => {
    const html = render(share([73.2, 70.7, 69]));
    expect(html).toContain("Direct vs Indirect");
    expect(html).toContain("73,2%");
    expect(html).toContain("−2,5 điểm");
    expect(html).not.toMatch(/class="dn"[^>]*>−2,5/);
  });
  it("thiếu số một tháng ⇒ gạch ngang, không hiện 0%", () => {
    const html = render(share([null, 70.7, 69]));
    expect(html).not.toContain("0,0%");
    expect(html).toContain("—");
  });
  it("không truyền directShare ⇒ không có hàng", () => {
    expect(render()).not.toContain("Direct vs Indirect");
  });
});
