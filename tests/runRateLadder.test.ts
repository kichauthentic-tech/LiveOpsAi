// Run-rate bốn tầng của Dashboard (lib/performance/runRateLadder.ts): chỉ xếp lại số của MonthOutlook, và phải khớp planRunRate.
// Chạy: npx vitest run tests/runRateLadder.test.ts
import { describe, expect, test } from "vitest";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { runRateLadder, runRateTone, waveRows, dayRows } from "../src/lib/performance/runRateLadder";
import { BrandMonthPlanSlot, LiveSession } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `r${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 5_000, ctrAvg: 0, cvrAvg: 0, productImpressions: 100_000, productClicks: 3_000,
    liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const planSlot = (date: string, targetGmv: number): BrandMonthPlanSlot =>
  ({ id: `ps-${date}`, planId: "p1", date, startTime: "20:00", endTime: "23:00", targetGmv, expectedGmv: 0, note: "" }) as BrandMonthPlanSlot;

// 7–9/10 là D-Day (m−2..m ⇒ 8–10/10); dùng tháng 10/2026, hôm nay 9/10, số về tới 8/10.
const TODAY = "2026-10-09";
const days = ["2026-10-06", "2026-10-07", "2026-10-08"];
const gmvOf: Record<string, number> = { "2026-10-06": 40_000_000, "2026-10-07": 50_000_000, "2026-10-08": 20_000_000 };
const targets: Record<string, number> = { "2026-10-06": 40_000_000, "2026-10-07": 40_000_000, "2026-10-08": 40_000_000, "2026-10-09": 60_000_000, "2026-10-10": 60_000_000, "2026-10-13": 50_000_000 };

function build() {
  const sessions = days.map((d) => ca(d, { actualGmv: gmvOf[d] }));
  sessions.push(ca("2026-10-09", { status: "Upcoming", actualGmv: 0, totalViews: 0, totalOrders: 0 }));
  const slotTargets = Object.entries(targets).map(([date, target]) => ({ date, target }));
  const total = Object.values(targets).reduce((a, b) => a + b, 0);
  const target = monthTargetOf("2026-10", total, slotTargets);
  const o = monthOutlook("2026-10", TODAY, sessions, [], target, undefined);
  return { o, sessions, slotTargets };
}

describe("runRateTone", () => {
  test("ngưỡng 85% / 95%", () => {
    expect(runRateTone(null)).toBe("none");
    expect(runRateTone(0.84)).toBe("bad");
    expect(runRateTone(0.85)).toBe("warn");
    expect(runRateTone(0.949)).toBe("warn");
    expect(runRateTone(0.95)).toBe("good");
  });
});

describe("runRateLadder", () => {
  test("không target ⇒ thang rỗng", () => {
    const o = monthOutlook("2026-10", TODAY, [ca("2026-10-06")], [], null, undefined);
    expect(runRateLadder(o, TODAY)).toEqual([]);
  });

  test("hàng tháng = thực đạt ÷ target tới ngày có số, khớp planRunRate", () => {
    const { o, sessions, slotTargets } = build();
    const rows = runRateLadder(o, TODAY);
    const month = rows[0];
    expect(month.tier).toBe("month");
    expect(month.actual).toBe(110_000_000);
    expect(month.targetToDate).toBe(120_000_000); // 6,7,8/10 — ngày 9, 10, 13 chưa có số
    expect(month.runRate).toBeCloseTo(110 / 120, 6);
    const rr = planRunRate("2026-10", slotTargets.map((t) => planSlot(t.date, t.target)), [], sessions, TODAY);
    expect(rr.total.runRate).toBeCloseTo(month.runRate!, 9);
    expect(rr.total.targetToDate).toBe(month.targetToDate);
  });

  test("đợt: D-Day đang chạy với 1/3 ngày có số, Mid-Month sắp tới chỉ có target", () => {
    const { o } = build();
    const waves = waveRows(o);
    const dd = waves.find((w) => w.key === "dday")!;
    expect(dd.state).toBe("live");
    expect(dd.actual).toBe(20_000_000); // 8/10
    expect(dd.targetToDate).toBe(40_000_000);
    expect(dd.runRate).toBeCloseTo(0.5, 6);
    expect(dd.sub).toBe("1/3 ngày có số");
    const mid = waves.find((w) => w.key === "midmonth")!;
    expect(mid.state).toBe("next");
    expect(mid.target).toBe(50_000_000);
    // đợt ngày thường gom 6–7/10 (và các ngày daily còn lại)
    const daily = waves.find((w) => w.key === "daily")!;
    expect(daily.actual).toBe(90_000_000);
  });

  test("ngày: hôm qua có run-rate, hôm nay còn ca chưa có số và chưa ca nào về ⇒ chờ số, không in 0%", () => {
    const { o } = build();
    const [yesterday, today] = dayRows(o, TODAY);
    expect(yesterday.label).toBe("Hôm qua");
    expect(yesterday.runRate).toBeCloseTo(0.5, 6);
    expect(yesterday.state).toBe("done");
    expect(today.label).toBe("Hôm nay");
    expect(today.partial).toBe(true);
    expect(today.runRate).toBeNull();
  });
});
