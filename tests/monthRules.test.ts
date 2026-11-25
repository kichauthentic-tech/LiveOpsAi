// Luật đặt giờ THEO THÁNG × người × vai (0229): khoá tháng, trần cứng (brand/làn/vai), luật mềm, kiểm tra luật. Chạy: npx vitest run tests/monthRules.test.ts
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
const hours = (plan: ReturnType<typeof run>, id: string) => plan.load.filter((l) => l.talentId === id).reduce((n, l) => n + l.hours, 0);

const M = await import("../src/lib/roster/monthRules");
const rule = (over: Partial<import("../src/lib/roster/monthRules").MonthRule> = {}, id = "w", role: "host" | "assistant" = "host") => ({ ...M.emptyMonthRule(MONTH, id, role), ...over });
const withRule = (r: ReturnType<typeof rule>, role: "host" | "co_host" = "host") => ({ ...tuning(), monthRules: { [r.talentId]: { [role]: r } } });

describe("khoá tháng đã qua", () => {
  test("tháng khoá khi ngày cuối tháng đã qua", () => {
    expect(M.isMonthLocked("2026-10", "2026-11-20")).toBe(true);
    expect(M.isMonthLocked("2026-11", "2026-11-20")).toBe(false);
    expect(M.isMonthLocked("2026-11", "2026-11-30")).toBe(false);
    expect(M.isMonthLocked("2026-11", "2026-12-01")).toBe(true);
    expect(M.isMonthLocked("2026-12", "2026-11-20")).toBe(false);
  });
  test("ngày cuối tháng đúng (kể cả tháng 2 và năm nhuận)", () => {
    expect(M.monthLastDay("2026-02")).toBe("2026-02-28");
    expect(M.monthLastDay("2028-02")).toBe("2028-02-29");
    expect(M.monthLastDay("2026-12")).toBe("2026-12-31");
  });
});

describe("đọc luật cho một ca", () => {
  const shift = { date: day(3), brandId: "b1", platform: "TikTok", night: false };
  test("brand / làn 'x' là loại cứng", () => {
    expect(M.hardBlock(rule({ brands: { b1: { hours: "x", days: null, night: null } } }), shift)).toMatch(/brand/);
    expect(M.hardBlock(rule({ lanes: { "b1|TikTok": "x" } }), shift)).toMatch(/sàn/);
    expect(M.hardBlock(rule({ lanes: { "b1|Shopee": "x" } }), shift)).toBeNull();
    expect(M.hardBlock(undefined, shift)).toBeNull();
  });
  test("luật mềm: brand ghi đè luật chung", () => {
    const r = rule({ dayKinds: ["weekend"], brands: { b1: { hours: null, days: ["regular"], night: null } } });
    expect(M.softFit(r, shift).ok).toBe(true); // ngày thường, brand b1 cho phép
    expect(M.softFit(rule({ dayKinds: ["weekend"] }), shift).ok).toBe(false);
    expect(M.softFit(rule({ night: "only" }), shift).ok).toBe(false);
    expect(M.softFit(rule({ night: "no" }), { ...shift, night: true }).ok).toBe(false);
    expect(M.softFit(rule({ night: "no", brands: { b1: { hours: null, days: null, night: "any" } } }), { ...shift, night: true }).ok).toBe(true);
  });
});

describe("kiểm tra luật", () => {
  const name = (id: string) => id.toUpperCase();
  test("nửa đầu lớn hơn trần tháng, làn lớn hơn brand; 2 vai không bắt chia giờ, chỉ báo khi vượt trần tháng", () => {
    expect(M.checkRule(rule({ maxHours: 40, firstHalfMax: 50 }), [], ["b1"], name, 30).level).toBe("bad");
    expect(M.checkRule(rule({ maxHours: 40, brands: { b1: { hours: 20, days: null, night: null } }, lanes: { "b1|TikTok": 30 } }), [], ["b1"], name, 30).level).toBe("bad");
    const host = rule({ maxHours: 50, roleHours: 35 });
    const asst = rule({ maxHours: 50, roleHours: null }, "w", "assistant");
    expect(M.checkRule(host, [host, asst], ["b1"], name, 30).level).toBe("ok");
    const asst2 = { ...asst, roleHours: 20 };
    expect(M.checkRule(host, [host, asst2], ["b1"], name, 30).level).toBe("bad"); // 35 + 20 > 50
    expect(M.checkRule({ ...host, roleHours: 30 }, [{ ...host, roleHours: 30 }, asst2], ["b1"], name, 30).level).toBe("ok");
  });
  test("2 vai: làn/brand lớn hơn trần vai = lỗi; Host + Trợ cùng làn vượt trần tháng = lỗi; trần chưa biết thì không so", () => {
    expect(M.checkRule(rule({ roleHours: 10, lanes: { "b1|TikTok": 12 } }), [], ["b1"], name, 40).messages.join()).toMatch(/trần làn lớn hơn trần vai/);
    expect(M.checkRule(rule({ roleHours: 10, brands: { b1: { hours: 15, days: null, night: null } } }), [], ["b1"], name, 40).messages.join()).toMatch(/trần brand lớn hơn trần vai/);
    const h = rule({ maxHours: 40, lanes: { "b1|Shopee": 25 } });
    const a = rule({ maxHours: 40, lanes: { "b1|Shopee": 20 } }, "w", "assistant");
    expect(M.checkRule(h, [h, a], ["b1"], name, 30).messages.join()).toMatch(/Host \+ Trợ \(45h\) vượt trần tháng 40h/);
    expect(M.checkRule(h, [h, { ...a, lanes: { "b1|Shopee": 15 } }], ["b1"], name, 30).level).toBe("ok");
    const noCap = rule({ roleHours: 35 });
    expect(M.checkRule(noCap, [noCap, rule({ roleHours: 15 }, "w", "assistant")], ["b1"], name, 0).level).toBe("ok");
  });
  test("cộng trần brand của cả 2 vai mới so với trần tháng", () => {
    const h = rule({ maxHours: 50, brands: { b1: { hours: 30, days: null, night: null } } });
    const a = rule({ maxHours: 50, brands: { b1: { hours: 25, days: null, night: null } } }, "w", "assistant");
    expect(M.checkRule(h, [h, a], ["b1"], name, 30).level).toBe("ok"); // 30 + 25 ≥ 50
    expect(M.checkRule(h, [h, { ...a, brands: { b1: { hours: 10, days: null, night: null } } }], ["b1"], name, 30).messages.join()).toMatch(/cả 2 vai 40h/);
    expect(M.checkRule(h, [h, rule({ maxHours: 50 }, "w", "assistant")], ["b1"], name, 30).level).toBe("ok"); // vai Trợ tự do ⇒ không hụt
  });
  test("không nhận brand nào = lỗi; cộng trần brand thấp hơn trần tháng = cảnh báo hụt giờ", () => {
    const x = { hours: "x" as const, days: null, night: null };
    expect(M.checkRule(rule({ brands: { b1: x, b2: x } }), [], ["b1", "b2"], name, 30).level).toBe("bad");
    const r = rule({ maxHours: 60, brands: { b1: { hours: 20, days: null, night: null }, b2: { hours: 15, days: null, night: null } } });
    const c = M.checkRule(r, [], ["b1", "b2"], name, 30);
    expect(c.level).toBe("warn");
    expect(c.messages.join()).toMatch(/hụt 25h/);
  });
  test("câu đọc được", () => {
    const r = rule({ maxHours: 60, dayKinds: ["weekend", "camp"], night: "no", brands: { b1: { hours: 45, days: ["camp"], night: null }, b2: { hours: "x", days: null, night: null } }, lanes: { "b1|TikTok": 30 } });
    const t = M.describeMonthRule(r, (id) => id.toUpperCase(), 30);
    expect(t).toContain("≤60h/tháng");
    expect(t).toContain("6-7-CN+Camp");
    expect(t).toContain("B2 ✕");
    expect(t).toContain("B1: ≤45h, Camp, TikTok ≤30h");
  });
  test("chép sang tháng mới: copy giữ luật, reset xoá luật nhưng giữ người", () => {
    const r = rule({ maxHours: 60, brands: { b1: { hours: "x", days: null, night: null } } });
    const c = M.copyRulesToMonth([r], "2026-12", "copy")[0];
    expect(c.month).toBe("2026-12");
    expect(c.maxHours).toBe(60);
    expect(c.brands.b1.hours).toBe("x");
    const z = M.copyRulesToMonth([r], "2026-12", "reset")[0];
    expect(z.talentId).toBe("w");
    expect(M.hasContent(z)).toBe(false);
  });
});

describe("bộ xếp đọc luật tháng", () => {
  const talents = [tal("w", "Host", 100000), tal("o", "Host", 300000)]; // w rẻ hơn nên mặc định thắng
  const slots = [slot("s1", day(3)), slot("s2", day(4)), slot("s3", day(5))];
  const regs = slots.flatMap((s) => [reg(s.id, "w"), reg(s.id, "o")]);

  test("brand 'x': người đó không nhận brand, ca về người khác", () => {
    const base = run({ slots, talents, regs, tuning: tuning() });
    expect(hostOf(base, "s1")).toBe("w");
    const plan = run({ slots, talents, regs, tuning: withRule(rule({ brands: { b1: { hours: "x", days: null, night: null } } })) });
    expect(slots.every((s) => hostOf(plan, s.id) === "o")).toBe(true);
  });

  test("cứng: không còn ai khác thì ca để trống chứ không vượt", () => {
    const only = slots.map((s) => reg(s.id, "w"));
    const plan = run({ slots, talents: [talents[0]], regs: only, tuning: withRule(rule({ brands: { b1: { hours: "x", days: null, night: null } } })) });
    expect(slots.every((s) => hostOf(plan, s.id) === undefined)).toBe(true);
    expect(plan.unfilled.length).toBeGreaterThan(0);
  });

  test("trần giờ làn brand × sàn: 3 ca × 3h, trần làn 6h ⇒ tối đa 2 ca", () => {
    const only = slots.map((s) => reg(s.id, "w"));
    const plan = run({ slots, talents: [talents[0]], regs: only, tuning: withRule(rule({ lanes: { "b1|TikTok": 6 } })) });
    expect(hours(plan, "w")).toBeLessThanOrEqual(6 + 1e-9);
    expect(hours(plan, "w")).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  test("trần giờ brand và trần giờ vai", () => {
    const only = slots.map((s) => reg(s.id, "w"));
    const byBrand = run({ slots, talents: [talents[0]], regs: only, tuning: withRule(rule({ brands: { b1: { hours: 3, days: null, night: null } } })) });
    expect(hours(byBrand, "w")).toBeLessThanOrEqual(3 + 1e-9);
    const byRole = run({ slots, talents: [talents[0]], regs: only, tuning: withRule(rule({ roleHours: 3 })) });
    expect(hours(byRole, "w")).toBeLessThanOrEqual(3 + 1e-9);
  });

  test("trần của vai Trợ không chặn vai Host của cùng người", () => {
    const only = slots.map((s) => reg(s.id, "w"));
    const r = { w: { co_host: rule({ roleHours: 1 }, "w", "assistant") } };
    const plan = run({ slots, talents: [talents[0]], regs: only, tuning: { ...tuning(), monthRules: r } });
    expect(slots.every((s) => hostOf(plan, s.id) === "w")).toBe(true);
  });

  test("luật mềm ca đêm 'no': ca khuya nhường người khác, ca thường vẫn của người đó", () => {
    const late = slot("late", day(6), { startTime: "21:00", endTime: "23:59" });
    const s2 = [slots[0], late];
    const regs2 = s2.flatMap((s) => [reg(s.id, "w"), reg(s.id, "o")]);
    const plan = run({ slots: s2, talents, regs: regs2, tuning: withRule(rule({ night: "no" })) });
    expect(hostOf(plan, "s1")).toBe("w");
    expect(hostOf(plan, "late")).toBe("o");
  });

  test("người 2 vai cùng một làn: trần Host 6h và trần Trợ 3h tính riêng từng vai", () => {
    const four = [slot("d1", day(3)), slot("d2", day(4)), slot("d3", day(5)), slot("d4", day(6))];
    const ppl = [tal("d", "Host", 100000), tal("h", "Host", 300000)];
    const regs4 = four.flatMap((s) => [reg(s.id, "d"), reg(s.id, "h")]);
    const monthRules = { d: { host: rule({ lanes: { "b1|TikTok": 6 } }, "d", "host"), co_host: rule({ lanes: { "b1|TikTok": 3 } }, "d", "assistant") } };
    const plan = run({ slots: four, talents: ppl, regs: regs4, tuning: { ...tuning(), monthRules } });
    const n = (role: "host" | "co_host") => plan.assignments.filter((a) => a.talentId === "d" && a.role === role).length;
    expect(n("host")).toBeLessThanOrEqual(2);
    expect(n("co_host")).toBeLessThanOrEqual(1);
    expect(n("host") + n("co_host")).toBeGreaterThanOrEqual(2);
  });

  test("không có luật tháng thì chạy như cũ", () => {
    const a = run({ slots, talents, regs, tuning: tuning() });
    const b = run({ slots, talents, regs, tuning: { ...tuning(), monthRules: {} } });
    expect(b.assignments.map((x) => x.talentId)).toEqual(a.assignments.map((x) => x.talentId));
  });
});
