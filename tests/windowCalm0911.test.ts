// Cửa sổ gọn 09/11 (demo user duyệt): công tắc, ô chạm, chấm nguồn số, và các màn đã bỏ chữ lặp.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "../src/components/ui/Switch";
import { ChipChoice } from "../src/components/ui/ChipChoice";
import { DataSourceBadge, DataSourceLegend } from "../src/components/common/DataSourceBadge";

const src = (f: string) => readFileSync(new URL(`../src/components/${f}`, import.meta.url), "utf8");

describe("cửa sổ gọn 09/11", () => {
  it("Switch là role=switch, aria-checked theo giá trị", () => {
    const on = renderToStaticMarkup(createElement(Switch, { checked: true, onChange: () => undefined, label: "SKU A" }));
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(renderToStaticMarkup(createElement(Switch, { checked: false, onChange: () => undefined, label: "SKU A" }))).toContain('aria-checked="false"');
  });

  it("ChipChoice đánh dấu đúng một ô đang chọn", () => {
    const html = renderToStaticMarkup(createElement(ChipChoice, { options: ["D-Day", "Mid-Month", "Pay Day", "Daily"] as const, value: "Pay Day", onChange: () => undefined, label: "Camp" }));
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Pay Day");
    expect(html).not.toContain("<select");
  });

  it("chấm nguồn số không in chữ, chú giải in một lần", () => {
    const dot = renderToStaticMarkup(createElement(DataSourceBadge, { dataSource: "live_snapshot", variant: "dot" }));
    expect(dot).toContain('aria-label="Số lúc giao ca"');
    expect(dot).not.toContain(">Số Lúc Giao Ca<");
    const legend = renderToStaticMarkup(createElement(DataSourceLegend));
    for (const t of ["Đã đối soát", "Số lúc giao ca", "Tạm tính"]) expect(legend).toContain(t);
  });

  it("các màn không còn ô chọn thả xuống / chữ lặp đã bỏ", () => {
    expect(src("brand-workspace/BrandSkuShowcase.tsx")).not.toMatch(/<select value=\{s\.status\}/);
    expect(src("brand-workspace/BrandAffiliateTable.tsx")).not.toContain("<select");
    expect(src("brand-workspace/AffiliatePlanTable.tsx")).not.toContain("<select");
    expect(src("scheduling/OpenSlotModal.tsx")).not.toContain("Ca đều đặn hằng tháng nên lập ở Kế Hoạch Tháng");
    expect(src("scheduling/OpenSlotModal.tsx")).toContain("Ca ngoài kế hoạch, không có target.");
    expect(src("SessionLedger.tsx")).toContain("{isBrandView && <th className=\"py-2.5 px-2\">Trạng thái</th>}");
    expect(src("Leaderboard.tsx")).toContain("ca sắp live</b> · chưa có số");
    expect(src("brand-workspace/BrandCalendar.tsx")).toContain("tuần chưa ghi khuyến mãi");
    expect(src("CrmProjects.tsx")).not.toContain("(nhập ở Kế Hoạch Tháng, chưa có hợp đồng)");
    expect(src("CrmProjects.tsx")).not.toContain('"theo %"');
    expect(src("roster/ShiftPanel.tsx")).toContain('{ key: "gmv", label: "Tối ưu GMV"');
  });
});
