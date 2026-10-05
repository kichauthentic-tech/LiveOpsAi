// Report Shopee dựng từ 4 file thật rồi vẽ ra HTML (SSR) — bắt vỡ giao diện / NaN / undefined mà tsc không thấy.
// Phần file thật chỉ chạy khi 4 file có trong ~/Downloads. Chạy: npx vitest run tests/shopeeReportRender.test.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { buildShopeeSnapshot } = await import("../src/lib/report/shopeeSnapshot");
const { parseDataRawExcel } = await import("../src/lib/dataraw/parseDataRawExcel");
const { readShopeeDays, readShopeeOverview, readShopeeProducts, readShopeeStreams } = await import("../src/lib/dataraw/shopeeFiles");
const { ShopeeMonthlyReportTabs } = await import("../src/components/brand-workspace/ShopeeMonthlyReportTabs");
import type { LiveSession } from "../src/types";

const render = (snapshot: ReturnType<typeof buildShopeeSnapshot>, canManage = true) =>
  renderToStaticMarkup(
    React.createElement(ShopeeMonthlyReportTabs, { brandId: "vera", brandName: "VERA", month: snapshot.month, snapshot, report: null, canManage, onReportChange: () => {} })
  );

const noBadText = (html: string) => {
  expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
};

describe("Report Shopee — trạng thái rỗng", () => {
  test("chưa có file nào, chưa có ca: vẽ được, nói rõ thiếu gì", () => {
    const s = buildShopeeSnapshot({
      brandId: "vera", month: "2026-09", sessions: [], streams: [], days: [], products: [], overview: null,
      files: { live: false, daily: false, products: false, overview: false }, prev: null, stamps: []
    });
    const html = render(s);
    noBadText(html);
    expect(html).toContain("Chưa có file theo ngày");
    expect(html).toContain("Chưa có file overview");
    expect(html).toContain("Chưa có file Live List");
    expect(html).toContain("Chưa có file Product List");
    expect(html).toContain("Cách tính và điểm cần xác nhận");
  });
});

const DL = join(homedir(), "Downloads");
const pick = (prefix: string, ext: string) => (existsSync(DL) ? readdirSync(DL).find((f) => f.startsWith(prefix) && f.endsWith(ext)) : undefined);
const F = {
  live: pick("supply-sellercenter-export-sc_live_stream_list_export_vn_13347498", ".xlsx"),
  product: pick("supply-sellercenter-export-sc_live_product_list_export_vn_13347498", ".xlsx"),
  daily: pick("export-sc__1m_2026-09-30", ".csv"),
  overview: pick("overview-v2_1m_2026-09-30", ".csv")
};
const haveReal = Object.values(F).every(Boolean);
const open = (n: string) => new File([readFileSync(join(DL, n))], n);

describe.skipIf(!haveReal)("Report Shopee — 4 file thật VERA T9", () => {
  test("dựng bản chụp và vẽ đủ 6 phần với số đúng", async () => {
    const [live, daily, prod, ov] = await Promise.all([
      parseDataRawExcel(open(F.live!), "shopee_live_list"), parseDataRawExcel(open(F.daily!), "shopee_daily"),
      parseDataRawExcel(open(F.product!), "shopee_product_list"), parseDataRawExcel(open(F.overview!), "shopee_overview")
    ]);
    const sessions = [
      { id: "1", brandId: "vera", platform: "Shopee", date: "2026-09-09", startTime: "10:00", endTime: "13:00", status: "Completed", hostId: "mia", hostName: "Mia", actualGmv: 20_000_000, dataSource: "tiktok_reconciled", totalViews: 1000 },
      { id: "2", brandId: "vera", platform: "Shopee", date: "2026-09-10", startTime: "20:00", endTime: "23:00", status: "Completed", hostId: "su", hostName: "Su", actualGmv: 9_000_000, dataSource: "manual", totalViews: 800 }
    ] as unknown as LiveSession[];
    const s = buildShopeeSnapshot({
      brandId: "vera", month: "2026-09", sessions,
      streams: readShopeeStreams(live.rows), days: readShopeeDays(daily.rows), products: readShopeeProducts(prod.rows), overview: readShopeeOverview(ov.rows),
      files: { live: true, daily: true, products: true, overview: true }, prev: null, stamps: ["a@1"]
    });
    expect(s.headline).toMatchObject({ orders: 2232, liveSessions: 50 });
    expect(s.headline.gmv).toBeCloseTo(668841273.7, 1);
    expect(s.headline.confirmed).toBeCloseTo(633141514.7, 1);
    expect(s.headline.liveHours).toBeCloseTo(175.3, 1);
    expect(s.noLiveDays).toEqual(["2026-09-02"]);
    expect(s.overview?.sources).toHaveLength(10);
    expect(s.slots.length).toBeGreaterThan(0);
    expect(s.camps.map((c) => c.key)).toEqual(["daily", "dday", "midmonth", "payday"]);
    console.log(s.notes.join("\n"));
    expect(s.notes.join(" ")).toMatch(/29M so với/);
    const html = render(s);
    noBadText(html);
    for (const t of ["1", "2", "3", "4", "5", "6"]) expect(html).toContain(`>${t}</span>`);
    expect(html).toContain("Nguồn traffic của live");
    expect(html).toContain("Others");
    expect(html).toContain("Theo khung giờ");
    expect(html).toContain("Theo loại ngày");
    expect(html).toContain("COMBO ƯU ĐÃI");
    expect(html).toContain("Mia");
    expect(html).toContain("02/09");
    expect(html).toContain("2.232");
    // brand (canManage=false) không thấy nút Sửa Insight
    expect(render(s, false)).not.toContain("Sửa Insight");
    expect(html).toContain("Sửa Insight");
  });
});
