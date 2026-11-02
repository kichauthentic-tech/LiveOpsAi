// Thuật ngữ theo sàn: TikTok = "GMV", Shopee = "Sales" (tên trong báo cáo của sàn). Màn gộp nhiều sàn ghi cả hai.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { metricFor, platformText, salesTerm } from "../src/lib/metricGlossary";

test("platformText đổi tên theo sàn, 'all' ghi cả hai", () => {
  expect(platformText("GMV/giờ", "TikTok")).toBe("GMV/giờ");
  expect(platformText("GMV/giờ", "Shopee")).toBe("Sales/giờ");
  expect(platformText("Total GMV", "Shopee")).toBe("Tổng doanh số");
  expect(platformText("GMV", "all")).toBe("GMV · Sales");
  expect(platformText("GMV", null)).toBe("GMV");
  expect(salesTerm("Shopee")).toBe("Sales");
  expect(salesTerm("TikTok")).toBe("GMV");
  expect(metricFor("Shopee").gmv).toBe("Sales");
  expect(metricFor("TikTok").gmv).toBe("GMV");
});

test("file thuần Shopee không in chữ GMV ra màn hình (trừ chú thích)", () => {
  const files = [
    "src/lib/report/shopeeSnapshot.ts",
    "src/lib/report/shopeeKeyMetrics.ts",
    "src/lib/report/shopeeAdsInsight.ts",
    "src/components/brand-workspace/ShopeeMonthlyReportTabs.tsx",
    "src/components/brand-workspace/ShopeeAdsPanel.tsx"
  ];
  const hits: string[] = [];
  for (const f of files) {
    readFileSync(join(__dirname, "..", f), "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
      if (/\bGMV\b/.test(line.replace(/\/\/.*$/, ""))) hits.push(`${f}:${i + 1}: ${t.slice(0, 100)}`);
    });
  }
  expect(hits).toEqual([]);
});
