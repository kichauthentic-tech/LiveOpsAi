// Bảng kế hoạch Affiliate (0155) vẽ ra HTML (SSR): ops có ô nhập, brand chỉ đọc; không NaN/undefined; tổng đúng sheet T10.
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { AffiliatePlanTable } from "../src/components/brand-workspace/AffiliatePlanTable";
import { AffiliateRow } from "../src/lib/affiliate/plan";

const row = (o: Partial<AffiliateRow> & { _key: string }): AffiliateRow => ({ brandId: "crocs", periodMonth: "2026-10-01", creatorName: "", ...o });
const ROWS: AffiliateRow[] = [
  row({ _key: "a", creatorName: "Khói", liveDateLabel: "9/10/2026", campName: "D-Day", planTimelineLabel: "10h - 18h", targetGmv: 700_000_000, status: "planned" }),
  row({ _key: "b", creatorName: "Long Pham", liveDateLabel: "14/10/2026", campName: "Mid-Month", planTimelineLabel: "20h - 00h", targetGmv: 100_000_000, status: "planned" }),
  row({ _key: "c", creatorName: "Mạnh Ka", liveDateLabel: "15/10/2026", campName: "Mid-Month", planTimelineLabel: "19h - 24h", targetGmv: 150_000_000, status: "cancelled" })
];
const render = (readOnly: boolean, rows = ROWS, shopTarget?: number) =>
  renderToStaticMarkup(
    React.createElement(AffiliatePlanTable, { rows, month: "2026-10", fxRate: 26300, readOnly, shopTarget, onChange: () => {}, onRemove: () => {} })
  );

describe("AffiliatePlanTable", () => {
  test("không in NaN / undefined / [object", () => {
    for (const html of [render(false), render(true), render(false, []), render(true, [row({ _key: "z" })])]) expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
  });
  test("ops có ô nhập + nút xoá; brand chỉ đọc không có", () => {
    const ops = render(false);
    expect(ops).toContain("<input");
    expect(ops).toContain("<select");
    expect(ops).toContain("Xoá phiên");
    const brand = render(true);
    expect(brand).not.toContain("<input");
    expect(brand).not.toContain("<select");
    expect(brand).not.toContain("Xoá phiên");
  });
  test("phiên huỷ không vào tổng: 700tr + 100tr, 12 giờ (8 + 4)", () => {
    const html = render(true);
    expect(html).toContain("800.000.000");
    expect(html).not.toContain("950.000.000");
    expect(html).toContain("12,0");
  });
  test("cột tự tính: GMV/hour 87.500.000 và $26.616 theo tỷ giá 26.300", () => {
    const html = render(true);
    expect(html).toContain("87.500.000");
    expect(html).toContain("$26.616");
  });
  test("% KPI cả shop chỉ hiện khi có KPI", () => {
    expect(render(true, ROWS, 5_000_000_000)).toContain("16,0%");
    expect(render(true)).toContain("Chưa nhập KPI cả shop");
  });
  test("hai cột thực tế chỉ hiện khi có phiên đã live", () => {
    expect(render(true)).not.toContain("Direct GMV");
    const done = [...ROWS, row({ _key: "d", creatorName: "Khói", liveDateLabel: "9/10/2026", status: "done", targetGmv: 300_000_000, directGmv: 225_248_394 })];
    const html = render(true, done);
    expect(html).toContain("Direct GMV");
    expect(html).toContain("225.248.394");
    expect(html).toContain("75,1%");
  });
});
