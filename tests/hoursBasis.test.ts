// Audit 2026-09-28 mục 7: giờ trong GMV/giờ.
// Chạy: npx vitest run tests/hoursBasis.test.ts
import { describe, expect, test } from "vitest";
import { sessionToLivePerfRow } from "../src/lib/report/sessionsLivePerf";
import { LiveSession } from "../src/types";

const ca = (id: string, over: Partial<LiveSession>): LiveSession =>
  ({ id, brandId: "b", date: "2026-10-05", startTime: "19:00", endTime: "22:00", status: "Completed", actualGmv: 0, totalViews: 0, dataSource: "tiktok_reconciled", ...over }) as LiveSession;

describe("giờ ca", () => {
  test("giờ bắt đầu = giờ kết thúc ra 0 giờ ở Report như ở Finance (trước đây 24 giờ)", () => {
    expect(sessionToLivePerfRow(ca("a", { startTime: "20:00", endTime: "20:00" })).hours).toBe(0);
  });
});
