// Key Metrics (src/lib/report/keyMetrics.ts, user chốt 2026-09-29): mọi report có bộ chỉ số live phải hiện đủ 18
// chỉ số theo đúng thứ tự, cộng AOV làm dòng bổ sung, và cùng một công thức.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { LiveSession } from "../src/types";
import { METRIC } from "../src/lib/metricGlossary";
import { addKeyInput, emptyKeyCounts, fmtKeyMetric, KEY_METRICS, keyMetrics, keyMetricsOfSessions, keyMetricValue, type KeyInput } from "../src/lib/report/keyMetrics";

const input = (x: Partial<KeyInput>): KeyInput => ({
  gmv: 0, itemsSold: 0, orders: 0, views: 0, hours: 0, impressions: 0, productImpressions: 0, productClicks: 0, avgViewSec: 0, ...x
});

test("đủ 18 chỉ số đúng thứ tự user đưa, rồi AOV bổ sung", () => {
  expect(KEY_METRICS.filter((d) => !d.extra).map((d) => d.label)).toEqual([
    METRIC.gmv, METRIC.itemsSold, METRIC.orders, METRIC.upt, METRIC.err, METRIC.avgPrice, METRIC.productImpressions,
    METRIC.productClicks, METRIC.productCtr, METRIC.liveCtr, METRIC.ctor, METRIC.avgView, METRIC.views, METRIC.liveImpressions,
    METRIC.liveHours, METRIC.viewsPerHour, METRIC.impressionsPerHour, METRIC.gmvPerHour
  ]);
  expect(KEY_METRICS.filter((d) => d.extra).map((d) => d.label)).toEqual([METRIC.aov]);
});

test("công thức khớp số thật ca CROCS 01/08 (file Creator-Live-Performance)", () => {
  const m = keyMetrics(addKeyInput(emptyKeyCounts(), input({
    gmv: 120_000_000, itemsSold: 150, orders: 100, views: 7_396, hours: 4, impressions: 417_199,
    productImpressions: 128_556, productClicks: 3_561, avgViewSec: 40
  })));
  expect(m.err).toBeCloseTo(1.77, 2); // Tap-through rate của TikTok
  expect(m.liveCtr).toBeCloseTo(48.15, 2); // cột LIVE CTR của TikTok
  expect(m.ctr).toBeCloseTo(2.77, 2); // cột CTR của TikTok
  expect(m.ctor).toBeCloseTo((100 / 3_561) * 100, 6);
  expect(m.upt).toBe(1.5);
  expect(m.avgPrice).toBe(800_000);
  expect(m.aov).toBe(1_200_000);
  expect(m.viewsPerHour).toBe(1_849);
  expect(m.impressionsPerHour).toBeCloseTo(417_199 / 4, 6);
  expect(m.gmvPerHour).toBe(30_000_000);
  expect(m.avgViewSec).toBe(40);
});

test("ERR, LIVE impressions/giờ, Avg. view chỉ tính ca có số của trường đó (ca tự khai không kéo tụt)", () => {
  const c = emptyKeyCounts();
  addKeyInput(c, input({ views: 1_000, hours: 2, impressions: 50_000, avgViewSec: 30 }));
  addKeyInput(c, input({ views: 3_000, hours: 2 })); // ca giao ca: có Views, thiếu impressions + Avg. view
  const m = keyMetrics(c);
  expect(m.err).toBe(2); // 1.000 ÷ 50.000, không phải 4.000 ÷ 50.000
  expect(m.impressionsPerHour).toBe(25_000); // 50.000 ÷ 2h của ca có số
  expect(m.avgViewSec).toBe(30);
  expect(m.viewsPerHour).toBe(1_000); // Views/giờ vẫn cộng mọi ca
});

test("kỳ trống hiện — chứ không 0; định dạng từng loại", () => {
  const empty = keyMetrics(emptyKeyCounts());
  expect(KEY_METRICS.every((d) => keyMetricValue(empty, d.key) == null)).toBe(true);
  expect(fmtKeyMetric("pct2", 2.345)).toBe("2,35%");
  expect(fmtKeyMetric("sec", 39.6)).toBe("40s");
  expect(fmtKeyMetric("money", null)).toBe("—");
});

test("cộng từ LiveSession lấy đủ trường (impressions, Avg. view)", () => {
  const s = { actualGmv: 10, attributedItemsSold: 2, totalOrders: 1, totalViews: 100, impressions: 1_000, productImpressions: 50, productClicks: 5, avgWatchTimeSeconds: 20 } as LiveSession;
  const m = keyMetricsOfSessions([s], () => 1);
  expect(m.err).toBe(10);
  expect(m.avgViewSec).toBe(20);
  expect(m.itemsSold).toBe(2);
});

// Mọi màn có bộ chỉ số live phải lấy danh sách từ KEY_METRICS — không tự liệt kê lại (lệch là thiếu chỉ số).
test("các report dùng KEY_METRICS", () => {
  const files = [
    "components/brand-workspace/MonthlyReportTabs.tsx",
    "components/brand-workspace/BrandWeeklyReport.tsx",
    "components/brand-workspace/BrandDashboard.tsx",
    "components/SessionWindow.tsx",
    "components/HostPerformance.tsx",
    "components/CeoBrief.tsx"
  ];
  // Bước 2 đa sàn (07/10): màn hiện cả hai sàn đọc bộ chỉ số qua hồ sơ sàn (`profileOf(x).metrics.defs` = KEY_METRICS
  // của TikTok / SHOPEE_METRICS của Shopee) — vẫn là bộ chuẩn, không tự liệt kê.
  for (const f of files) expect(readFileSync(join(__dirname, "..", "src", f), "utf8"), f).toMatch(/(KEY_METRICS|metrics\.defs)\.(map|filter)/);
});
