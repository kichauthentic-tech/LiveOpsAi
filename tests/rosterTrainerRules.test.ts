// Điều Phối Lịch Live — luật tự fill theo brief chị Trainer (17/11): trần giờ theo đợt, hạng ca (Campaign/cao điểm vs Daily/thấp điểm),
// trần cast, trợ nam, người đăng ký ít, PFM tháng trước. Chạy: npx vitest run tests/rosterTrainerRules.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const P = await import("../src/lib/roster/monthPlanner");
const { DEFAULT_ENGINE_PARAMS } = await import("../src/lib/scheduling/engineParams");
import type { LiveSession, ShiftSlot, Talent } from "../src/types";

const MONTH = "2026-11";
const day = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const tal = (id: string, role: Talent["role"], rate: number, gender = "Nữ"): Talent =>
  ({ id, name: id, nickname: id, role, gender, ratePerHour: rate, assistantRatePerHour: role === "Assistant" ? rate : 0, ratePerSession: 0 }) as Talent;
const slot = (id: string, date: string, o: Partial<ShiftSlot> = {}): ShiftSlot => ({
  id, date, startTime: "19:00", endTime: "22:00", brandId: "b1", brandName: "NIKE", platform: "TikTok", studioId: "r", studioName: "R", notes: "", status: "open", ...o
});
const reg = (slotId: string, talentId: string) => ({ id: `${slotId}-${talentId}`, slotId, talentId, registeredAt: "" });

type Over = Partial<Parameters<typeof P.planMonth>[0]> & { slots: ShiftSlot[]; regs: ReturnType<typeof reg>[]; talents: Talent[] };
function run(over: Over) {
  const { slots, regs, ...rest } = over;
  const shifts = R.buildRosterShifts([] as LiveSession[], slots, [], regs, "2026-10-25", "2026-12-07");
  return P.planMonth({
    shifts,
    month: MONTH,
    today: "2026-10-30",
    goal: "balance",
    bounds: { host: { min: 0, max: 100 }, co_host: { min: 0, max: 100 } },
    guaranteeMin: false,
    rules: R.DEFAULT_ROSTER_RULES,
    history: [],
    fam: new Map(),
    perf: new Map(),
    ...rest
  });
}
const tuning = (over: Partial<typeof DEFAULT_ENGINE_PARAMS> = {}, personCaps?: Record<string, import("../src/lib/roster/monthPlanner").PersonCap>) => ({
  params: { ...DEFAULT_ENGINE_PARAMS, ...over },
  personCaps
});
const hostOf = (plan: ReturnType<typeof run>, slotId: string) => plan.assignments.find((a) => a.slotId === slotId && a.role === "host")?.talentId;
const coOf = (plan: ReturnType<typeof run>, slotId: string) => plan.assignments.find((a) => a.slotId === slotId && a.role === "co_host")?.talentId;
const hours = (plan: ReturnType<typeof run>, id: string) => plan.load.filter((l) => l.talentId === id).reduce((n, l) => n + l.hours, 0);

describe("trần giờ riêng theo đợt", () => {
  // 10 ca × 3h ở nửa đầu (ngày 2–11), 10 ca × 3h ở nửa sau (ngày 17–26) ⇒ nửa đầu = 50% giờ tháng.
  const slots = [...Array.from({ length: 10 }, (_, i) => slot(`a${i}`, day(2 + i))), ...Array.from({ length: 10 }, (_, i) => slot(`b${i}`, day(17 + i)))];
  const talents = [tal("x", "Host", 200000)];
  const regs = slots.map((s) => reg(s.id, "x"));
  const range = { from: day(1), to: day(15) };

  test("trần 20h/tháng, xếp ngày 1–15: nhận ≈ nửa trần (+10%), phần còn lại chừa cho nửa sau", () => {
    const plan = run({ slots, talents, regs, range, minScale: 0.5, tuning: tuning({}, { x: { monthMax: 20 } }) });
    expect(hours(plan, "x")).toBeLessThanOrEqual(11 + 1e-9); // 20 × 0,5 × 1,1 = 11 ⇒ 3 ca × 3h
    expect(hours(plan, "x")).toBeGreaterThanOrEqual(9);
    expect(plan.unfilled.some((u) => u.detail.includes("đủ trần giờ nửa đầu"))).toBe(true);
  });

  test("không đặt trần thì người duy nhất đăng ký nhận hết nửa đầu (đúng lỗi chị Trainer lo)", () => {
    const plan = run({ slots, talents, regs, range, minScale: 0.5, tuning: tuning() });
    expect(hours(plan, "x")).toBe(30);
  });

  test("ô 'nửa đầu' ghi đè số tự tính", () => {
    const plan = run({ slots, talents, regs, range, minScale: 0.5, tuning: tuning({}, { x: { monthMax: 40, firstHalfMax: 6 } }) });
    expect(hours(plan, "x")).toBe(6);
  });

  test("xếp cả tháng: trần tháng vẫn chặn (không có dung sai)", () => {
    const plan = run({ slots, talents, regs, tuning: tuning({}, { x: { monthMax: 20 } }) });
    expect(hours(plan, "x")).toBeLessThanOrEqual(20);
  });
});

describe("hạng ca và trần cast", () => {
  const talents = [tal("rẻ", "Host", 120000), tal("đắt", "Host", 250000)];
  const perf = new Map([
    ["rẻ", { index: 0.9, n: 40 }],
    ["đắt", { index: 1.2, n: 40 }]
  ]);
  const both = (s: ShiftSlot) => [reg(s.id, "rẻ"), reg(s.id, "đắt")];

  test("ca Daily (3/11): nghiêng về người cast thấp; không có luật thì Performance thắng", () => {
    const s = slot("s", day(3));
    expect(hostOf(run({ slots: [s], talents, regs: both(s), perf }), "s")).toBe("đắt");
    expect(hostOf(run({ slots: [s], talents, regs: both(s), perf, tuning: tuning() }), "s")).toBe("rẻ");
  });

  test("ca Campaign (D-Day 10/11): Performance được ưu tiên, không phạt cast TikTok", () => {
    const s = slot("s", day(10));
    expect(R.shiftHours).toBeTypeOf("function");
    expect(P.shiftTier(R.buildRosterShifts([] as LiveSession[], [s], [], [], day(1), day(20))[0], tuning())).toBe("peak");
    expect(hostOf(run({ slots: [s], talents, regs: both(s), perf, tuning: tuning() }), "s")).toBe("đắt");
  });

  test("khung giờ cao điểm theo lịch sử cũng là ca peak", () => {
    const shift = R.buildRosterShifts([] as LiveSession[], [slot("s", day(3))], [], [], day(1), day(20))[0];
    const strong = new Map([[`${shift.channelKey}|eve`, 1.3]]);
    const weak = new Map([[`${shift.channelKey}|eve`, 0.8]]);
    expect(P.shiftTier(shift, { ...tuning(), bandStrength: strong })).toBe("peak");
    expect(P.shiftTier(shift, { ...tuning(), bandStrength: weak })).toBe("regular");
  });

  test("Shopee: chỉ riêng trần 200k cũng đủ đẩy host 260k sang host 190k khi chênh Performance nhỏ", () => {
    const hosts = [tal("a190", "Host", 190000), tal("b260", "Host", 260000)];
    const pf = new Map([
      ["a190", { index: 0.9, n: 40 }],
      ["b260", { index: 1.0, n: 40 }]
    ]);
    const s = slot("s", day(3), { platform: "Shopee" });
    const regs = [reg("s", "a190"), reg("s", "b260")];
    const off = { rosterRegularCostAdd: 0, rosterPeakPerfAdd: 0 };
    expect(hostOf(run({ slots: [s], talents: hosts, regs, perf: pf, goal: "performance", tuning: tuning({ ...off, rosterShopeeCastCap: 0 }) }), "s")).toBe("b260");
    expect(hostOf(run({ slots: [s], talents: hosts, regs, perf: pf, goal: "performance", tuning: tuning(off) }), "s")).toBe("a190");
  });
});

describe("trợ nam", () => {
  const talents = [tal("h", "Host", 200000), tal("nữ", "Assistant", 50000, "Nữ"), tal("nam", "Assistant", 50000, "Nam")];
  const pick = (s: ShiftSlot, t = tuning()) => coOf(run({ slots: [s], talents, regs: [reg(s.id, "h"), reg(s.id, "nữ"), reg(s.id, "nam")], tuning: t }), s.id);

  test("brand thể thao (CROCS / Franklin): trợ nam hơn nhẹ khi mọi thứ khác bằng nhau", () => {
    expect(pick(slot("s", day(3), { brandName: "NIKE" }))).toBe("nữ");
    expect(pick(slot("s", day(3), { brandName: "CROCS" }))).toBe("nam");
    expect(pick(slot("s", day(3), { brandName: "Franklin Sports" }))).toBe("nam");
  });

  test("ca đêm (kết thúc 23:30): trợ nam hơn; ca tối kết thúc 22:00 thì không", () => {
    expect(pick(slot("s", day(3), { startTime: "20:00", endTime: "23:30" }))).toBe("nam");
    expect(pick(slot("s", day(3), { startTime: "19:00", endTime: "22:00" }))).toBe("nữ");
  });

  test("là luật mềm: chỉ có trợ nữ đăng ký thì vẫn xếp trợ nữ", () => {
    const s = slot("s", day(3), { brandName: "CROCS", startTime: "20:00", endTime: "23:30" });
    const plan = run({ slots: [s], talents, regs: [reg("s", "h"), reg("s", "nữ")], tuning: tuning() });
    expect(coOf(plan, "s")).toBe("nữ");
  });
});

describe("người đăng ký ít", () => {
  test("ca hai người cùng đăng ký: người đăng ký ít ca hơn mức trung bình được xếp", () => {
    const talents = [tal("nhiều", "Host", 200000), tal("ít", "Host", 200000), tal("c", "Host", 200000), tal("d", "Host", 200000)];
    const s1 = slot("s1", day(3));
    const others = ["s2", "s3", "s4", "s5"].map((id, i) => slot(id, day(4 + i)));
    const regs = [reg("s1", "nhiều"), reg("s1", "ít"), ...others.flatMap((s) => [reg(s.id, "nhiều"), reg(s.id, "c"), reg(s.id, "d")])];
    expect(hostOf(run({ slots: [s1, ...others], talents, regs }), "s1")).toBe("nhiều");
    expect(hostOf(run({ slots: [s1, ...others], talents, regs, tuning: tuning() }), "s1")).toBe("ít");
  });
});

describe("PFM tháng trước", () => {
  const mk = (id: string, host: string, date: string, gmv: number): LiveSession =>
    ({ id, brandId: "b1", platform: "TikTok", date, startTime: "19:00", endTime: "22:00", status: "Completed", hostId: host, actualGmv: gmv }) as LiveSession;
  const sessions = [
    ...Array.from({ length: 10 }, (_, i) => mk(`o${i}`, "avg", "2026-10-10", 3_000_000)),
    ...Array.from({ length: 10 }, (_, i) => mk(`p${i}`, "star", "2026-10-12", 6_000_000)),
    ...Array.from({ length: 10 }, (_, i) => mk(`q${i}`, "sept", "2026-09-10", 9_000_000))
  ];

  test("xếp T11: chỉ tính ca của tháng 10 (tháng 9 không vào)", () => {
    const m = P.buildHostPerformancePrevMonth(sessions, "2026-11", "2026-11-17");
    expect(m.has("sept")).toBe(false);
    expect(m.get("star")!.index).toBeGreaterThan(m.get("avg")!.index);
  });

  test("xếp T12 ngày 17/11: tháng trước = 1–16/11, tới hôm nay", () => {
    const nov = [...sessions, mk("n1", "nov", "2026-11-05", 3_000_000), mk("n2", "late", "2026-11-20", 3_000_000)];
    const m = P.buildHostPerformancePrevMonth(nov, "2026-12", "2026-11-17");
    expect(m.has("nov")).toBe(true);
    expect(m.has("late")).toBe(false);
    expect(m.has("star")).toBe(false);
  });
});
