// Giao ca (0144 → bằng file ở 0145/0154): ai giao, đếm số, các bước còn thiếu của ca.
// Chạy: npx vitest run tests/handover.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { fmtCount, handoverOwnerLabel, hasHandover, isHandoverPerson, parseCount } = await import("../src/lib/handover");
const { missingSteps } = await import("../src/lib/sessionLedger");
import type { LiveSession } from "../src/types";

describe("số đếm", () => {
  test("parseCount nhận mọi kiểu viết nghìn", () => {
    expect(parseCount("11.513.359")).toBe(11513359);
    expect(parseCount("11,513,359")).toBe(11513359);
    expect(parseCount(" 5883 ")).toBe(5883);
    expect(parseCount("")).toBeNull();
    expect(fmtCount(11513359)).toBe("11.513.359");
  });
});

const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({ id: "s", brandId: "vera", brandName: "VERA", platform: "Shopee", date: "2026-10-05", startTime: "18:00", endTime: "20:00", status: "Completed", dataSource: "manual", isBackfill: false, hostId: "my", coHostId: "giang", coHostName: "Trà Giang", ...over }) as LiveSession;

describe("ai giao ca", () => {
  test("trợ live của ca giao; host thì không; ca không trợ ⇒ OPS", () => {
    expect(isHandoverPerson(ca(), "giang")).toBe(true);
    expect(isHandoverPerson(ca(), "my")).toBe(false);
    expect(isHandoverPerson(ca({ coHostId: undefined, staffSegments: [{ talentId: "thao", talentName: "Thảo", role: "co_host", fromMin: 60, toMin: 120 }] }), "thao")).toBe(true);
    expect(handoverOwnerLabel(ca())).toBe("Trợ live Trà Giang giao ca");
    expect(handoverOwnerLabel(ca({ coHostId: undefined, coHostName: undefined }))).toBe("Ca không có trợ — OPS giao ca");
  });
  test("bước còn thiếu, CẢ HAI SÀN: up file → giao ca → đối soát (Shopee chuyển sang file ở 0154, 08/10)", () => {
    for (const platform of ["TikTok", "Shopee"] as const) {
      expect(missingSteps(ca({ platform }), "2026-10-06")).toEqual(["snapshot", "report", "reconcile"]);
      expect(missingSteps(ca({ platform, dataSource: "live_snapshot" }), "2026-10-06")).toEqual(["report", "reconcile"]);
    }
    const done = ca({ dataSource: "live_snapshot", report: { handoverAt: "2026-10-05T13:20:00Z", submittedAt: "2026-10-05T13:20:00Z" } as LiveSession["report"] });
    expect(hasHandover(done)).toBe(true);
    expect(missingSteps(done, "2026-10-06")).toEqual(["reconcile"]);
  });
});
