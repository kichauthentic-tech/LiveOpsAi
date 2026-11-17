// "Theo người" (17/11): ca mở một talent đã đăng ký → xếp nháp host/trợ, dùng luật whatIf sẵn có.
// Chạy: npx vitest run tests/byPerson.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const C = await import("../src/lib/roster/candidates");
const P = await import("../src/lib/roster/byPerson");
import type { LiveSession, ShiftSlot, Talent } from "../src/types";
import type { RankContext } from "../src/lib/roster/candidates";

const slot = (id: string, over: Partial<ShiftSlot> = {}): ShiftSlot => ({ id, date: "2026-11-20", startTime: "19:00", endTime: "22:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioId: "r1", studioName: "CROCS", notes: "", status: "open", ...over });
const tal = (id: string, role: "Host" | "Assistant" = "Host"): Talent => ({ id, name: id, nickname: id, role, ratePerHour: 0, assistantRatePerHour: 0, ratePerSession: 0 }) as Talent;
const reg = (slotId: string, talentId: string) => ({ id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "" });
const busy = { id: "b1", brandId: "x", brandName: "X", platform: "TikTok", studioId: "r2", studioName: "X", date: "2026-11-20", startTime: "18:00", endTime: "21:00", status: "Upcoming", hostId: "henry", coHostId: undefined, actualGmv: 0, totalViews: 0, dataSource: "manual" } as unknown as LiveSession;

const talents = [tal("henry"), tal("phu"), tal("linh", "Assistant")];
const ctxOf = (shifts: ReturnType<typeof R.buildRosterShifts>): RankContext => ({ shifts, rules: R.DEFAULT_ROSTER_RULES, weekStart: "2026-11-16", fam: new Map(), talents, history: [], mode: "balance", nameOf: (id) => id });
const build = (sessions: LiveSession[], slots: ShiftSlot[], drafts: { slotId: string; hostId?: string; coHostId?: string }[], regs: ReturnType<typeof reg>[]) => R.buildRosterShifts(sessions, slots, drafts, regs, "2026-11-01", "2026-12-01");

describe("Theo người", () => {
  test("chỉ ca mở người đó đăng ký; đếm đăng ký / đã xếp", () => {
    const shifts = build([], [slot("o1"), slot("o2", { date: "2026-11-21" })], [{ slotId: "o1", hostId: "henry" }], [reg("o1", "henry"), reg("o2", "henry"), reg("o2", "phu")]);
    const c = P.registrationCounts(shifts, "2026-11").get("henry")!;
    expect(c).toEqual({ registered: 2, placed: 1 });
    expect(P.registeredShifts(shifts, "phu", "2026-11")).toHaveLength(1);
  });

  test("vai mặc định: Assistant ⇒ trợ; host ⇒ host, chỗ host có người thì sang trợ", () => {
    const shifts = build([], [slot("o1")], [{ slotId: "o1", hostId: "phu" }], [reg("o1", "henry"), reg("o1", "linh")]);
    const s = shifts[0];
    expect(P.defaultRole(talents[2], s)).toBe("co_host");
    expect(P.defaultRole(talents[0], s)).toBe("co_host");
  });

  test("trùng ca bị chặn, ô trống không cảnh báo, ca người khác giữ ⇒ takenBy", () => {
    const shifts = build([busy], [slot("o1"), slot("o2", { date: "2026-11-23" }), slot("o3", { date: "2026-11-24" })], [{ slotId: "o3", hostId: "phu" }], [reg("o1", "henry"), reg("o2", "henry"), reg("o3", "henry")]);
    const rows = P.buildPersonRows(shifts, talents[0], "2026-11", ctxOf(shifts), "host" as const);
    const by = (k: string) => rows.find((r) => r.shift.key === k)!;
    expect(by("o:o1").blocked).toMatch(/Đang ở ca/);
    expect(by("o:o2").blocked).toBeUndefined();
    expect(by("o:o2").issues).toEqual([]);
    expect(by("o:o3").takenBy).toBe("phu");
  });

  test("Xếp tất cả: bỏ ca trùng và ca có người, tính ca vừa xếp vào trùng giờ của ca sau", () => {
    const shifts = build(
      [busy],
      [slot("o1"), slot("o2", { date: "2026-11-23" }), slot("o3", { date: "2026-11-23", startTime: "21:00", endTime: "23:00" }), slot("o4", { date: "2026-11-24" })],
      [{ slotId: "o4", hostId: "phu" }],
      ["o1", "o2", "o3", "o4"].map((s) => reg(s, "henry"))
    );
    const plan = P.planPersonBulk(shifts, talents[0], "2026-11", ctxOf(shifts), "host" as const);
    // o1 trùng ca busy; o2 xếp được; o3 chồng giờ với o2 (19–22 vs 21–23) ⇒ bỏ; o4 host đã có người ⇒ bỏ
    expect(plan.placed.map((p) => p.shiftKey)).toEqual(["o:o2"]);
    expect(plan.skipped).toBe(3);
    expect(plan.shifts.find((s) => s.key === "o:o2")!.hostId).toBe("henry");
    expect(shifts.find((s) => s.key === "o:o2")!.hostId).toBeUndefined(); // không đụng dữ liệu gốc
  });

  test("giờ tháng theo vai và theo tuần", () => {
    const shifts = build([], [slot("o1"), slot("o2", { date: "2026-11-24" })], [{ slotId: "o1", hostId: "henry" }, { slotId: "o2", coHostId: "henry" }], []);
    const l = P.personLoad(shifts, "henry", "2026-11");
    expect(l.host).toBe(3);
    expect(l.co).toBe(3);
    expect([...l.byWeek.values()]).toEqual([3, 3]);
  });
});
void C;
