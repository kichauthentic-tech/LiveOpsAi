// Dòng ảo theo host cho ca đổi host đã có số liệu (lib/hostSplit.ts). Chạy: npx vitest run tests/hostSplit.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { hostSplitRows } = await import("../src/lib/hostSplit");
import type { LiveSession, StaffSegment } from "../src/types";

const seg = (talentId: string, role: StaffSegment["role"], fromMin: number, toMin: number): StaffSegment => ({ talentId, talentName: talentId, role, fromMin, toMin });
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "s1", brandId: "crocs", brandName: "CROCS", platform: "TikTok", date: "2026-11-11", startTime: "18:00", endTime: "21:00",
    status: "Completed", hostId: "hung", hostName: "hung", coHostId: "bin", coHostName: "bin", targetGmv: 81_000_000,
    actualGmv: 100_000_000, totalOrders: 100, totalViews: 10_000, dataSource: "live_snapshot", liveDurationMinutes: 180,
    staffSegments: [seg("hung", "host", 0, 120), seg("toan", "host", 120, 180)],
    ...over
  }) as LiveSession;

describe("tách dòng ảo theo host", () => {
  test("A→B thành hai dòng: giờ, target và GMV theo phần của từng host", () => {
    const rows = hostSplitRows(ca());
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.hostId, r.startTime, r.endTime])).toEqual([["hung", "18:00", "20:00"], ["toan", "20:00", "21:00"]]);
    expect(rows[0].targetGmv + rows[1].targetGmv).toBe(81_000_000);
    expect(rows[0].targetGmv).toBe(54_000_000);
    expect(rows[0].actualGmv + rows[1].actualGmv).toBeCloseTo(100_000_000);
    expect(rows.every((r) => r.id === "s1")).toBe(true);
  });
  test("ca không đổi host giữ một dòng", () => {
    const s = ca({ staffSegments: undefined });
    expect(hostSplitRows(s)).toEqual([s]);
  });
  test("A→B→A giữ một dòng", () => {
    const s = ca({ staffSegments: [seg("hung", "host", 0, 60), seg("toan", "host", 60, 120), seg("hung", "host", 120, 180)] });
    expect(hostSplitRows(s)).toEqual([s]);
  });
});
