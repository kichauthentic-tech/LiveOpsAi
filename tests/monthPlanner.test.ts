// Điều Phối Lịch Live — xếp cả tháng theo mục tiêu (01/11). Pool = người đã đăng ký đúng ca; giờ tối đa là luật cứng; người dưới giờ tối
// thiểu được cân lại; ba mục tiêu cho kết quả khác nhau. Chạy: npx vitest run tests/monthPlanner.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const P = await import("../src/lib/roster/monthPlanner");
import type { LiveSession, ShiftSlot, Talent } from "../src/types";

const MONTH = "2026-11";
const tal = (id: string, role: Talent["role"], rate: number): Talent =>
  ({ id, name: id, nickname: id, role, ratePerHour: rate, assistantRatePerHour: role === "Assistant" ? rate : 0, ratePerSession: 0 }) as Talent;
const slot = (id: string, date: string, start = "19:00", end = "22:00"): ShiftSlot => ({
  id, date, startTime: start, endTime: end, brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioId: "r", studioName: "R", notes: "", status: "open"
});
const reg = (slotId: string, talentId: string) => ({ id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "" });
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;

type Over = Partial<Parameters<typeof P.planMonth>[0]> & { slots: ShiftSlot[]; regs: ReturnType<typeof reg>[]; talents: Talent[] };
function run(over: Over) {
  const { slots, regs, ...rest } = over;
  const shifts = R.buildRosterShifts([] as LiveSession[], slots, [], regs, "2026-10-25", "2026-12-07");
  return P.planMonth({
    shifts,
    month: MONTH,
    today: "2026-10-30",
    goal: "balance",
    bounds: { host: { min: 6, max: 12 }, co_host: { min: 6, max: 12 } },
    guaranteeMin: true,
    rules: R.DEFAULT_ROSTER_RULES,
    history: [],
    fam: new Map(),
    perf: new Map(),
    ...rest
  });
}

describe("planMonth", () => {
  test("chỉ chọn người đã đăng ký ca; ca không ai đăng ký để trống", () => {
    const talents = [tal("a", "Host", 200000), tal("b", "Host", 200000)];
    const slots = [slot("s1", day(2)), slot("s2", day(3))];
    const plan = run({ slots, talents, regs: [reg("s1", "a")] });
    expect(plan.assignments.filter((x) => x.role === "host").map((x) => [x.slotId, x.talentId])).toEqual([["s1", "a"]]);
    expect(plan.unfilled.find((u) => u.shiftKey === "o:s2" && u.role === "host")?.reason).toBe("no_registrant");
  });

  test("giờ tối đa tháng là luật cứng", () => {
    const talents = [tal("a", "Host", 200000), tal("b", "Host", 300000)];
    const slots = Array.from({ length: 6 }, (_, i) => slot(`s${i}`, day(2 + i)));
    const regs = slots.flatMap((s) => [reg(s.id, "a"), reg(s.id, "b")]);
    const plan = run({ slots, talents, regs, bounds: { host: { min: 3, max: 6 }, co_host: { min: 3, max: 6 } } });
    for (const l of plan.load) expect(l.hours).toBeLessThanOrEqual(6 + 1e-9);
    // Hai người, mỗi người ≤ 6h (cả hai vai) ⇒ chỉ lấp được 4 chỗ của 2 ca; 4 ca còn lại trống host.
    expect(plan.unfilled.filter((u) => u.role === "host").length).toBe(4);
  });

  test("chi phí: chọn người rẻ hơn; performance: chọn người chỉ số cao hơn", () => {
    const talents = [tal("rẻ", "Host", 150000), tal("đắt", "Host", 350000)];
    const slots = [slot("s1", day(2))];
    const regs = [reg("s1", "rẻ"), reg("s1", "đắt")];
    const perf = new Map([["rẻ", { index: 0.9, n: 40 }], ["đắt", { index: 1.2, n: 40 }]]);
    const cheap = run({ slots, talents, regs, perf, goal: "cost" });
    const best = run({ slots, talents, regs, perf, goal: "performance" });
    expect(cheap.assignments[0].talentId).toBe("rẻ");
    expect(best.assignments[0].talentId).toBe("đắt");
    const hostCost = (p: typeof cheap) => p.load.find((l) => l.talentId === p.assignments[0].talentId)!.cost;
    expect(hostCost(cheap)).toBeLessThan(hostCost(best));
    expect(best.totals.perfIndex!).toBeGreaterThan(cheap.totals.perfIndex!);
  });

  test("cân lại: người dưới giờ tối thiểu nhận ca từ người đang nhiều giờ", () => {
    const talents = [tal("nhiều", "Host", 150000), tal("ít", "Host", 350000)];
    const slots = Array.from({ length: 4 }, (_, i) => slot(`s${i}`, day(2 + i)));
    const regs = slots.flatMap((s) => [reg(s.id, "nhiều"), reg(s.id, "ít")]);
    const bounds = { host: { min: 6, max: 12 }, co_host: { min: 6, max: 12 } };
    const off = run({ slots, talents, regs, goal: "cost", bounds, guaranteeMin: false });
    const on = run({ slots, talents, regs, goal: "cost", bounds, guaranteeMin: true });
    const h = (p: typeof on, id: string) => p.load.find((l) => l.talentId === id)?.hours ?? 0;
    expect(h(on, "ít")).toBeGreaterThanOrEqual(6);
    expect(h(on, "ít")).toBeGreaterThanOrEqual(h(off, "ít"));
    expect(on.totals.below).toBeLessThanOrEqual(off.totals.below);
  });

  test("không xếp một người vào hai ca trùng giờ", () => {
    const talents = [tal("a", "Host", 200000)];
    const slots = [slot("s1", day(2)), slot("s2", day(2))];
    const plan = run({ slots, talents, regs: slots.map((s) => reg(s.id, "a")) });
    expect(plan.assignments.length).toBe(1);
  });
});

describe("buildHostPerformance", () => {
  test("co về 1,00 theo số ca và chuẩn hoá theo kênh × khung giờ", () => {
    const mk = (id: string, host: string, gmv: number): LiveSession =>
      ({ id, brandId: "crocs", platform: "TikTok", date: "2026-10-10", startTime: "19:00", endTime: "22:00", status: "Completed", hostId: host, actualGmv: gmv }) as LiveSession;
    const sessions = [...Array.from({ length: 10 }, (_, i) => mk(`x${i}`, "avg", 3_000_000)), ...Array.from({ length: 2 }, (_, i) => mk(`y${i}`, "star", 6_000_000))];
    const m = P.buildHostPerformance(sessions, "2026-11-01");
    expect(m.get("star")!.n).toBe(2);
    expect(m.get("star")!.index).toBeGreaterThan(m.get("avg")!.index);
    expect(m.get("star")!.index).toBeLessThan(1.4); // thô ≈ 1,5+, bị co mạnh vì chỉ 2 ca
  });
});

describe("tự fill nháp theo mốc (range + releaseAutoFilled)", () => {
  const talents = [tal("a", "Host", 200000), tal("b", "Host", 200000), tal("c", "Host", 200000)];
  const slots = [slot("s1", day(2)), slot("s2", day(10)), slot("s3", day(20))];
  const regs = slots.flatMap((s) => talents.map((t) => reg(s.id, t.id)));
  const build = (drafts: { slotId: string; hostId?: string; coHostId?: string }[]) => R.buildRosterShifts([] as LiveSession[], slots, drafts, regs, "2026-10-25", "2026-12-07");
  const base = { month: MONTH, today: "2026-10-30", goal: "balance" as const, bounds: { host: { min: 3, max: 12 }, co_host: { min: 3, max: 12 } }, guaranteeMin: true, rules: R.DEFAULT_ROSTER_RULES, history: [], fam: new Map(), perf: new Map(), talents };

  test("chỉ lấp ca trong phạm vi ngày 1–15, ca ngày 20 để nguyên", () => {
    const range = { from: "2026-11-01", to: "2026-11-15" };
    const plan = P.planMonth({ ...base, shifts: build([]), range, minScale: 0.5 });
    expect(plan.assignments.filter((a) => a.source === "plan").map((a) => a.slotId).sort()).toEqual(["s1", "s1", "s2", "s2"]);
    expect(plan.totals.openShifts).toBe(2);
  });

  test("bấm lại: ô còn nguyên giá trị tự fill bị xếp lại, ô Trainer đã đổi tay được giữ", () => {
    const range = { from: "2026-11-01", to: "2026-11-30" };
    const first = P.planMonth({ ...base, shifts: build([]), range });
    const r1 = P.applyPlanRows(first, build([]), {}, range);
    expect(r1.rows.length).toBe(3);
    // Trainer đổi tay host của s2 sang người khác với giá trị bộ xếp đã fill.
    const filled = r1.rows.map((r) => ({ ...r }));
    const s2 = filled.find((r) => r.slotId === "s2")!;
    const manual = ["a", "b", "c"].find((id) => id !== s2.hostId && id !== s2.coHostId)!;
    s2.hostId = manual;
    const freed = P.releaseAutoFilled(build(filled), r1.nextAuto, range);
    expect(freed.find((s) => s.slotId === "s2")!.hostId).toBe(manual); // giữ
    expect(freed.find((s) => s.slotId === "s1")!.hostId).toBeUndefined(); // gỡ để xếp lại
    const again = P.planMonth({ ...base, shifts: freed, range, goal: "cost" });
    const r2 = P.applyPlanRows(again, freed, r1.nextAuto, range);
    expect(r2.rows.find((r) => r.slotId === "s2")!.hostId).toBe(manual);
  });

  test("ô đã tự fill mà lần sau không ai đủ điều kiện thì thành dòng rỗng (xoá nháp)", () => {
    const range = { from: "2026-11-01", to: "2026-11-30" };
    const auto = { s1: { hostId: "a" } };
    const freed = P.releaseAutoFilled(build([{ slotId: "s1", hostId: "a" }]), auto, range);
    const empty = { assignments: [], unfilled: [], load: [], totals: {} } as never;
    const r = P.applyPlanRows(empty, freed, auto, range);
    expect(r.rows).toEqual([{ slotId: "s1", hostId: undefined, coHostId: undefined }]);
    expect(r.nextAuto).toEqual({});
  });
});

describe("luật trợ / host", () => {
  test("chưa có host thì không xếp trợ (nháp chỉ có trợ làm cả tuần không công bố được)", () => {
    const talents = [tal("tro", "Assistant", 60000)];
    const slots = [slot("s1", day(2))];
    const plan = run({ slots, talents, regs: [reg("s1", "tro")] });
    expect(plan.assignments).toEqual([]);
    expect(plan.unfilled.find((u) => u.role === "co_host")?.reason).toBe("no_host");
  });

  test("trợ: Assistant được ưu tiên hơn host đã đăng ký cùng ca", () => {
    const talents = [tal("h1", "Host", 200000), tal("h2", "Host", 150000), tal("tro", "Assistant", 60000)];
    const slots = [slot("s1", day(2))];
    const regs = [reg("s1", "h1"), reg("s1", "h2"), reg("s1", "tro")];
    const plan = run({ slots, talents, regs, goal: "performance", perf: new Map([["h1", { index: 1.2, n: 30 }]]) });
    expect(plan.assignments.find((a) => a.role === "co_host")?.talentId).toBe("tro");
  });
});
