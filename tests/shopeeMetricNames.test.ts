// Tên chỉ số SHOPEE phải là tên cột của file Shopee (user chốt 07/10): không dùng tên TikTok (AOV, LIVE CTR, CTOR, CVR, UPT, ERR…),
// không tự đặt tên Việt hoá cho cột có sẵn tên (Người xem, Thêm vào giỏ, Hiển thị sản phẩm…), không có chỉ số mà file Shopee không có
// (CO, Xu đã tung theo ca, GPM theo ca). Test quét chữ hiển thị của các file thuần Shopee + bộ chỉ số theo ca.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { METRIC } from "../src/lib/metricGlossary";
import { PLATFORM_PROFILES } from "../src/lib/platforms/profiles";

const SHOPEE_ONLY_FILES = [
  "src/components/brand-workspace/ShopeeMonthlyReportTabs.tsx",
  "src/components/brand-workspace/ShopeeAdsPanel.tsx",
  "src/lib/report/shopeeSnapshot.ts",
  "src/lib/report/shopeeKeyMetrics.ts"
];

// [regex, tên Shopee đúng]
const BANNED: [RegExp, string][] = [
  [/Người xem\b/, "Viewers"],
  [/Lượt xem\b/, "Views / Live Views"],
  [/Thêm vào giỏ|Thêm giỏ/, "ATC"],
  [/Hiển thị sản phẩm/, "Product Impressions"],
  [/Click sản phẩm/, "Product Clicks"],
  [/Món bán ra/, "Items Sold"],
  [/Thực nhận \(/, "Sales (Confirmed Order)"],
  [/\bAOV\b/, "ABS"],
  [/Chi phí Ads|Chi phí \/ đơn/, "Expense / Expense/Orders"],
  [/Xu khách nhận|Xu đã tung/, "Coins Claimed"]
];

test("file thuần Shopee không dùng tên TikTok hay tên Việt hoá của cột Shopee", () => {
  const hits: string[] = [];
  for (const f of SHOPEE_ONLY_FILES) {
    readFileSync(join(__dirname, "..", f), "utf8").split("\n").forEach((line, i) => {
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) return;
      const code = line.replace(/\/\/.*$/, "");
      for (const [re, fix] of BANNED) if (re.test(code)) hits.push(`${f}:${i + 1} → dùng "${fix}": ${t.slice(0, 110)}`);
    });
  }
  expect(hits).toEqual([]);
});

test("bộ chỉ số theo ca của Shopee chỉ gồm tên Shopee hoặc số chia theo giờ/tự tính", () => {
  const labels = PLATFORM_PROFILES.Shopee.metrics.defs.map((d) => d.label);
  const allowed = [METRIC.gmv, METRIC.gmvPerHour, METRIC.liveHours, METRIC.orders, METRIC.abs, METRIC.itemsSoldShopee, METRIC.viewers, METRIC.viewersPerHour, METRIC.atc];
  expect(labels).toEqual(allowed);
  expect(PLATFORM_PROFILES.Shopee.basketLabel).toBe("ABS");
  expect(PLATFORM_PROFILES.Shopee.briefKpis.map((k) => k.label)).toEqual(["Viewers", "ATC"]);
});
