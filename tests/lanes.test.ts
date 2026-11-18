// Cơ cấu giờ & làn host (18/11): đo cơ cấu, gợi ý làn, lớp làn trong bộ xếp (mặc định tắt), thử xếp lại tháng đã qua. Chạy: npx vitest run tests/lanes.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const P = await import("../src/lib/roster/monthPlanner");
const L = await import("../src/lib/roster/lanes");
const { DEFAULT_ENGINE_PARAMS } = await import("../src/lib/scheduling/engineParams");
import type { LiveSession, ShiftSlot, Talent } from "../src/types";

const tal = (id: string, rate: number): Talent => ({ id, name: id, nickname: id, role: "Host", gender: "Nữ", ratePerHour: rate, assistantRatePerHour: 0, ratePerSession: 0 }) as Talent;
const slot = (id: string, date: string): ShiftSlot => ({ id, date, startTime: "19:00", endTime: "22:00", brandId: "b1", brandName: "NIKE", platform: "TikTok", studioId: "r", studioName: "R", notes: "", status: "open" });
const reg = (slotId: string, talentId: string) => ({ id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "" });

describe("lớp làn trong bộ xếp", () => {
  // 10/11 = D-Day (camp ⇒ peak), 3/11 = Daily. Hai host cùng điều kiện, khác làn.
  const slots = [slot("camp", "2026-11-10"), slot("daily", "2026-11-03")];
  const talents = [tal("a", 150000), tal("b", 150000)];
  const regs = slots.flatMap((s) => talents.map((t) => reg(s.id, t.id)));
  const run = (weight: number, lanes: Record<string, import("../src/lib/roster/monthPlanner").HostLane>) => {
    const shifts = R.buildRosterShifts([] as LiveSession[], slots, [], regs, "2026-10-25", "2026-12-07");
    return P.planMonth({
      shifts, month: "2026-11", today: "2026-10-30", goal: "balance", bounds: { host: { min: 0, max: 100 }, co_host: { min: 0, max: 100 } },
      guaranteeMin: false, rules: R.DEFAULT_ROSTER_RULES, talents, history: [], fam: new Map(), perf: new Map(),
      tuning: { params: { ...DEFAULT_ENGINE_PARAMS, rosterLaneWeight: weight }, lanes }
    });
  };
  const hostOf = (plan: ReturnType<typeof run>, id: string) => plan.assignments.find((a) => a.slotId === id && a.role === "host")?.talentId;

  test("làn cao điểm nhận ca camp, làn thường nhận ca Daily", () => {
    const plan = run(0.5, { a: "peak", b: "regular" });
    expect(hostOf(plan, "camp")).toBe("a");
    expect(hostOf(plan, "daily")).toBe("b");
  });
  test("đổi làn thì đổi người", () => {
    const plan = run(0.5, { a: "regular", b: "peak" });
    expect(hostOf(plan, "camp")).toBe("b");
    expect(hostOf(plan, "daily")).toBe("a");
  });
  test("trọng số 0 = tắt: kết quả giống không có làn", () => {
    const a = run(0, { a: "regular", b: "peak" }).assignments.map((x) => `${x.slotId}|${x.talentId}`);
    const b = run(0, { a: "peak", b: "regular" }).assignments.map((x) => `${x.slotId}|${x.talentId}`);
    expect(a).toEqual(b);
  });
});

describe("gợi ý làn", () => {
  const talents = [tal("dat", 300000), tal("re", 100000), tal("gioi", 100000), tal("moi", 0), tal("datyeu", 300000)];
  const perf = new Map([["gioi", { index: 1.2, n: 20 }], ["re", { index: 0.9, n: 20 }], ["dat", { index: 1.3, n: 20 }], ["datyeu", { index: 0.9, n: 20 }]]);
  test("rate > trần + PFM cao ⇒ cao điểm; rate > trần + PFM thấp ⇒ cân bằng; rẻ + PFM cao ⇒ cân bằng; rẻ ⇒ thường; chưa rate ⇒ cân bằng", () => {
    const m = new Map(L.suggestLanes(["dat", "datyeu", "re", "gioi", "moi"], talents, [], perf, "2026-10-01", DEFAULT_ENGINE_PARAMS).map((x) => [x.talentId, x.lane]));
    expect(m.get("dat")).toBe("peak");
    expect(m.get("datyeu")).toBe("balanced");
    expect(m.get("re")).toBe("regular");
    expect(m.get("gioi")).toBe("balanced");
    expect(m.get("moi")).toBe("balanced");
  });
});

describe("đo cơ cấu giờ + thử xếp lại", () => {
  const mk = (id: string, host: string, date: string): LiveSession =>
    ({ id, brandId: "b1", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: host, actualGmv: 3_000_000 }) as LiveSession;
  const sessions = [mk("1", "a", "2026-10-10"), mk("2", "a", "2026-10-11"), mk("3", "b", "2026-10-12"), mk("4", "b", "2026-10-13")];
  test("measureMonth cộng giờ theo host", () => {
    const m = L.measureMonth(sessions, "2026-10", DEFAULT_ENGINE_PARAMS);
    expect(L.mixTotal(m.total)).toBe(12);
    expect(L.mixTotal(m.byHost.get("a")!)).toBe(6);
  });
  test("backtestMonth chạy được, đủ ca, không ghi gì; tháng trống ⇒ null", () => {
    const r = L.backtestMonth({ sessions, talents: [tal("a", 100000), tal("b", 100000)], history: [], brandNames: new Map([["b1", "NIKE"]]), month: "2026-10", params: DEFAULT_ENGINE_PARAMS })!;
    expect(r.shifts).toBe(4);
    expect(r.actual.fillPct).toBe(100);
    expect(r.baseline.fillPct).toBeGreaterThan(0);
    expect(L.backtestMonth({ sessions, talents: [], history: [], brandNames: new Map(), month: "2026-09", params: DEFAULT_ENGINE_PARAMS })).toBeNull();
  });
});
