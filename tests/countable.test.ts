// Audit 2026-09-28 mục 6: một định nghĩa "ca có số" (isCountable; hasLiveNumbers là bí danh).
// Chạy: npx vitest run tests/countable.test.ts
import { describe, expect, test } from "vitest";
import { isCountable } from "../src/lib/performance/hostPerformance";
import { hasLiveNumbers } from "../src/lib/report/sessionsLivePerf";
import { computeTalentRealTotals } from "../src/lib/metrics/avgGmv";
import { LiveSession } from "../src/types";

const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({ id, brandId: "b", hostId: "h1", date: "2026-10-05", startTime: "19:00", endTime: "22:00", status: "Completed", actualGmv: 0, totalViews: 0, dataSource: "manual", ...over }) as LiveSession;

const cases: [string, LiveSession, boolean][] = [
  ["đã đối soát, có GMV", ca("a", { dataSource: "tiktok_reconciled", actualGmv: 50e6, totalViews: 9000 }), true],
  ["đã up file mà bán 0 — kết quả thật", ca("b", { dataSource: "live_snapshot" }), true],
  ["tự khai có GMV", ca("c", { actualGmv: 10e6 }), true],
  ["tự khai chỉ có view", ca("d", { totalViews: 300 }), true],
  ["đã qua giờ, chưa có gì", ca("e", {}), false],
  ["đang live, có số tạm", ca("f", { status: "Live Now", actualGmv: 5e6, totalViews: 800 }), false],
  ["huỷ", ca("g", { status: "Cancelled", actualGmv: 1 }), false],
  ["sắp tới", ca("h", { status: "Upcoming" }), false]
];

describe("isCountable — một luật cho Report, Hiệu Suất Host, Sổ Ca, Bản Tin CEO, Talent Pool", () => {
  test.each(cases)("%s", (_, s, want) => {
    expect(isCountable(s)).toBe(want);
    expect(hasLiveNumbers(s)).toBe(want);
  });

  test("Talent Pool: ca đã xong mà chưa có số không kéo GMV/ca xuống", () => {
    const t = computeTalentRealTotals(cases.map(([, s]) => s), "h1");
    expect(t.sessionCount).toBe(4);
    expect(t.avgGmvPerSession).toBe(15e6);
  });
});
