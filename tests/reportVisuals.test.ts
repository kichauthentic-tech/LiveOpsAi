import { expect, test } from "vitest";
import { bridgePoints, rankBadge, skuImageKey, targetBridge } from "../src/lib/report/reportVisuals";
import type { ScoreRow } from "../src/lib/report/brandReport";

test("cầu Target → thực tế: đầu + các bước = cuối, phần ngoài lịch thành bước riêng", () => {
  const rows: ScoreRow[] = [
    { key: "all", target: 5e9, actual: 4.43e9, targetToDate: 4.66e9, pct: 95 },
    { key: "daily", target: 1.8e9, actual: 1.89e9, targetToDate: 1.8e9, pct: 105 },
    { key: "payday", target: 1e9, actual: 0.65e9, targetToDate: 0.93e9, pct: 70 }
  ];
  const b = targetBridge(rows, (k) => k)!;
  const pts = bridgePoints("a", b.start, b.steps, "b", b.end);
  expect(b.start + b.steps.reduce((a, s) => a + s.delta, 0)).toBeCloseTo(b.end, 0);
  expect(pts[0].value).toBe(4.66e9);
  expect(b.steps.some((s) => s.label === "Ngoài lịch")).toBe(true);
});

test("huy hiệu hạng và khoá ảnh SKU", () => {
  expect(rankBadge(7, 3)).toEqual({ text: "▲ 4", tone: "up" });
  expect(rankBadge(3, 5).tone).toBe("down");
  expect(rankBadge(null, 2).tone).toBe("new");
  expect(skuImageKey("Đôi dép Baya Platform – Winter White")).toBe("skuimg_doi-dep-baya-platform-winter-white");
});
