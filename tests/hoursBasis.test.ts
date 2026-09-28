// Audit 2026-09-28 mục 7: giờ trong GMV/giờ.
// Chạy: npx vitest run tests/hoursBasis.test.ts
import { describe, expect, test } from "vitest";
import { sessionToLivePerfRow } from "../src/lib/report/sessionsLivePerf";
import { planCheck } from "../src/lib/performance/slotInsights";
import { LiveSession } from "../src/types";

const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({ id, brandId: "b", date: "2026-10-05", startTime: "19:00", endTime: "22:00", status: "Completed", actualGmv: 0, totalViews: 0, dataSource: "tiktok_reconciled", ...over }) as LiveSession;

describe("giờ ca", () => {
  test("giờ bắt đầu = giờ kết thúc ra 0 giờ ở Report như ở Finance (trước đây 24 giờ)", () => {
    expect(sessionToLivePerfRow(ca("a", { startTime: "20:00", endTime: "20:00" })).hours).toBe(0);
  });
});

describe("planCheck — GMV/giờ nhân với giờ KẾ HOẠCH thì phải tính trên giờ kế hoạch", () => {
  test("ca 3 giờ lịch chỉ live 45 phút: 30M ÷ 3h = 10M/giờ, không phải 40M/giờ", () => {
    const sessions = [ca("a", { actualGmv: 30e6, totalViews: 5000, liveDurationMinutes: 45 })];
    const c = planCheck([{ date: "2026-11-02", startTime: "19:00", endTime: "22:00", targetGmv: 40e6 }], sessions, "2026-10-05", () => "daily", null);
    expect(c?.recentPerHour).toBe(10e6);
  });
});
