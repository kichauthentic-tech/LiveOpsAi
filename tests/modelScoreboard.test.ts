// Bảng chấm mô hình dự báo (07/11): sổ thắng backtest, luật đổi chỉ xét tháng có sổ của cả hai. Chạy: npx vitest run tests/modelScoreboard.test.ts
import { describe, expect, test } from "vitest";
import { modelScoreboard, switchAdvice, type ModelScoreRow } from "../src/lib/performance/modelScoreboard";
import { DEFAULT_ENGINE_PARAMS } from "../src/lib/scheduling/engineParams";
import type { LiveSession } from "../src/types";

const row = (month: string, v3: number, sched: number, src: "ledger" | "backtest" = "ledger"): ModelScoreRow => ({ month, actual: 100, v3: { error: v3, source: src }, sched: { error: sched, source: src }, v3Kb: null });

describe("switchAdvice", () => {
  test("bộ xếp ca đúng hơn ≥ 2 điểm ở 2 tháng sổ gần nhất ⇒ đủ điều kiện đổi", () => {
    expect(switchAdvice([row("2026-11", 0.2, 0.1), row("2026-12", -0.15, 0.12)]).switchToSched).toBe(true);
  });
  test("một tháng không đủ chênh ⇒ chưa đổi; backtest không tính", () => {
    expect(switchAdvice([row("2026-11", 0.2, 0.1), row("2026-12", 0.1, 0.09)]).switchToSched).toBe(false);
    const a = switchAdvice([row("2026-09", 0.3, 0.1, "backtest"), row("2026-10", 0.3, 0.1, "backtest")]);
    expect(a.ledgerMonths).toBe(0);
    expect(a.switchToSched).toBe(false);
  });
});

describe("modelScoreboard", () => {
  let seq = 0;
  const ca = (date: string, gmv: number): LiveSession => ({ id: `s${++seq}`, brandId: "b", brandName: "B", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", actualGmv: gmv, totalViews: 1000, dataSource: "live_snapshot", targetGmv: 0 }) as LiveSession;
  const days = (m: string) => Array.from({ length: 28 }, (_, i) => `${m}-${String(i + 1).padStart(2, "0")}`);
  const channel = ["2026-07", "2026-08", "2026-09", "2026-10"].flatMap((m) => days(m).map((d) => ca(d, 30e6)));
  test("tháng có sổ dùng con số sổ (nguồn ledger), tháng khác backtest", () => {
    const rows = modelScoreboard(channel, DEFAULT_ENGINE_PARAMS, "2026-11-07", [
      { month: "2026-10", kind: "plan", model: "v3", p50: 28 * 30e6 * 1.1, asOf: "2026-09-30" },
      { month: "2026-10", kind: "plan", model: "sched", p50: 28 * 30e6 * 0.95, asOf: "2026-09-30" }
    ]);
    const oct = rows.find((r) => r.month === "2026-10")!;
    expect(oct.v3).toEqual({ error: expect.closeTo(0.1, 5), source: "ledger" });
    expect(oct.sched!.source).toBe("ledger");
    expect(oct.sched!.error).toBeCloseTo(-0.05, 5);
    const sep = rows.find((r) => r.month === "2026-09");
    expect(sep?.v3?.source).toBe("backtest");
  });
});
