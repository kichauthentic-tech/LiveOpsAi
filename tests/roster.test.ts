// Điều Phối Lịch Live (13/10): luật lịch tuần, độ quen kênh, gợi ý người, chi phí, tự lấp chỗ trống, giảm chi phí trên nháp.
// Tình huống lấy từ lịch thật T10: T.Toàn 51,5 giờ tuần 12/10, trùng ca CROCS/JOCKEY 14/10, tan 23:30 rồi vào 9:00 sáng.
// Chạy: npx vitest run tests/roster.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const R = await import("../src/lib/roster/rules");
const C = await import("../src/lib/roster/candidates");
import type { LiveSession, ShiftSlot, Talent, TalentRateHistoryEntry } from "../src/types";
import type { RosterShift } from "../src/lib/roster/rules";
import type { RankContext, RankMode } from "../src/lib/roster/candidates";

const WEEK = "2026-10-12";
const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "crocs",
    brandName: "CROCS",
    platform: "TikTok",
    studioId: "r-crocs",
    studioName: "CROCS",
    date: "2026-10-13",
    startTime: "10:00",
    endTime: "13:00",
    status: "Upcoming",
    hostId: "toan",
    hostName: "Thái Toàn",
    coHostId: "giang",
    coHostName: "Trà Giang",
    actualGmv: 0,
    totalViews: 0,
    dataSource: "manual",
    ...over
  }) as LiveSession;
const slot = (id: string, over: Partial<ShiftSlot> = {}): ShiftSlot => ({
  id,
  date: "2026-10-14",
  startTime: "19:00",
  endTime: "22:00",
  brandId: "crocs",
  brandName: "CROCS",
  platform: "TikTok",
  studioId: "r-crocs",
  studioName: "CROCS",
  notes: "",
  status: "open",
  ...over
});
const tal = (id: string, over: Partial<Talent> = {}): Talent =>
  ({ id, name: id, nickname: id, role: "Host", ratePerHour: 0, assistantRatePerHour: 0, ratePerSession: 0, ...over }) as Talent;
const name = (id: string) => id;
const rules = R.DEFAULT_ROSTER_RULES;

describe("analyzeRoster", () => {
  test("trùng người (chặn), nghỉ ngắn sau ca khuya, chạy phòng, quá 9 giờ/ngày", () => {
    const sessions = [
      ca("a", { date: "2026-10-12", startTime: "20:30", endTime: "23:30" }),
      ca("b", { date: "2026-10-13", startTime: "09:00", endTime: "12:00" }), // nghỉ 9,5h sau ca tan 23:30
      ca("c", { date: "2026-10-14", startTime: "09:00", endTime: "12:00" }),
      ca("d", { date: "2026-10-14", brandId: "jockey", brandName: "JOCKEY", studioId: "r-jockey", studioName: "JOCKEY", startTime: "11:00", endTime: "13:00", coHostId: "vuong" }), // trùng T.Toàn
      ca("e", { date: "2026-10-15", startTime: "08:00", endTime: "12:00" }),
      ca("f", { date: "2026-10-15", brandId: "jockey", brandName: "JOCKEY", studioId: "r-jockey", studioName: "JOCKEY", startTime: "12:15", endTime: "18:00", coHostId: "vuong" }) // 15' đổi phòng, 9,75h/ngày
    ];
    const shifts = R.buildRosterShifts(sessions, [], [], [], "2026-10-05", "2026-10-18");
    const an = R.analyzeRoster(shifts, rules, WEEK, name);
    const codes = (k: string) => (an.byShift.get(k) ?? []).map((i) => i.code);
    expect(codes("s:b")).toContain("rest");
    expect(codes("s:d")).toContain("clash");
    // Hai ca đã lên lịch trùng người (lịch nhập từ sheet, cờ 0160): DB không chặn công bố ⇒ chỉ cảnh báo.
    expect(R.worstSeverity(an.byShift.get("s:d"))).toBe("warn");
    expect(codes("s:f")).toContain("room");
    expect(an.issues.some((i) => i.code === "day" && i.talentId === "toan")).toBe(true);
    expect(an.weekHours.get("toan")).toBeCloseTo(3 + 3 + 3 + 2 + 4 + 5.75);
  });

  test("trùng người do ca NHÁP sắp chốt thì chặn công bố (đúng chỗ DB 0143 từ chối)", () => {
    const sessions = [ca("x", { date: "2026-10-14", startTime: "19:00", endTime: "22:00" })];
    const shifts = R.buildRosterShifts(sessions, [slot("o1", { date: "2026-10-14", startTime: "20:00", endTime: "23:00", brandId: "jockey", brandName: "JOCKEY", studioId: "r-jockey" })], [{ slotId: "o1", hostId: "toan" }], [], "2026-10-05", "2026-10-18");
    const an = R.analyzeRoster(shifts, rules, WEEK, name);
    const clash = an.issues.filter((i) => i.code === "clash");
    expect(clash.length).toBeGreaterThan(0);
    expect(clash.every((i) => i.severity === "block")).toBe(true);
  });

  test("quá 48 giờ/tuần là lỗi chặn; 40–48 chỉ cảnh báo; tuần trước không cộng vào", () => {
    const many = Array.from({ length: 17 }, (_, i) =>
      ca(`m${i}`, { date: `2026-10-${String(12 + (i % 7)).padStart(2, "0")}`, startTime: `${String(6 + Math.floor(i / 7) * 3).padStart(2, "0")}:00`, endTime: `${String(9 + Math.floor(i / 7) * 3).padStart(2, "0")}:00`, coHostId: undefined })
    );
    const prevWeek = ca("old", { date: "2026-10-10", startTime: "10:00", endTime: "20:00", coHostId: undefined });
    const an = R.analyzeRoster(R.buildRosterShifts([...many, prevWeek], [], [], [], "2026-10-05", "2026-10-18"), rules, WEEK, name);
    expect(an.weekHours.get("toan")).toBe(51);
    expect(an.issues.filter((i) => i.code === "week_over")).toHaveLength(1);
    const an2 = R.analyzeRoster(R.buildRosterShifts(many.slice(0, 14), [], [], [], "2026-10-05", "2026-10-18"), rules, WEEK, name);
    expect(an2.issues.find((i) => i.code === "week_warn")?.severity).toBe("warn");
  });

  test("ca mở: nháp chỉ có trợ = chặn công bố; ca trống = 'hole'; host chưa quen kênh = cảnh báo", () => {
    const shifts = R.buildRosterShifts([], [slot("o1"), slot("o2", { startTime: "10:00", endTime: "13:00" })], [{ slotId: "o1", coHostId: "giang" }], [], WEEK, "2026-10-18");
    const an = R.analyzeRoster(shifts, rules, WEEK, name);
    expect(an.byShift.get("o:o1")?.map((i) => i.code)).toContain("draft_no_host");
    expect(R.worstSeverity(an.byShift.get("o:o2"))).toBe("hole");
    const withHost = R.buildRosterShifts([], [slot("o3")], [{ slotId: "o3", hostId: "moi" }], [], WEEK, "2026-10-18");
    const an3 = R.analyzeRoster(withHost, rules, WEEK, name, () => 0);
    expect(an3.byShift.get("o:o3")?.map((i) => i.code)).toContain("new_channel");
  });

  test("ca đổi người giữa ca chỉ tính phút người đó đứng", () => {
    const seg = ca("g", {
      startTime: "10:00",
      endTime: "13:00",
      staffSegments: [
        { talentId: "toan", talentName: "T", role: "host", fromMin: 0, toMin: 60 },
        { talentId: "phu", talentName: "P", role: "host", fromMin: 60, toMin: 180 }
      ]
    } as Partial<LiveSession>);
    const an = R.analyzeRoster(R.buildRosterShifts([seg], [], [], [], WEEK, "2026-10-18"), rules, WEEK, name);
    expect(an.weekHours.get("toan")).toBe(1);
    expect(an.weekHours.get("phu")).toBe(2);
  });
});

describe("familiarity + candidates", () => {
  const history: TalentRateHistoryEntry[] = [];
  const past = [
    ...Array.from({ length: 5 }, (_, i) => ca(`p${i}`, { date: `2026-09-${String(10 + i).padStart(2, "0")}`, hostId: "henry", coHostId: "loan", status: "Completed" })),
    ...Array.from({ length: 4 }, (_, i) => ca(`q${i}`, { date: `2026-09-${String(20 + i).padStart(2, "0")}`, hostId: "khanh", coHostId: "loan", status: "Completed" })),
    ca("x", { date: "2026-06-01", hostId: "cu", status: "Completed" }) // ngoài 90 ngày
  ];
  const fam = C.buildFamiliarity(past, "2026-10-13");
  test("đếm ca 90 ngày theo vai, bỏ ca ngoài khung", () => {
    expect(C.famOf(fam, "henry", "crocs|TikTok")).toEqual({ host: 5, co: 0 });
    expect(C.famOf(fam, "loan", "crocs|TikTok")).toEqual({ host: 0, co: 9 });
    expect(C.famOf(fam, "cu", "crocs|TikTok")).toEqual({ host: 0, co: 0 });
  });

  const talents = [
    tal("henry", { ratePerHour: 300000 }),
    tal("khanh", { ratePerHour: 120000 }),
    tal("loan", { role: "Assistant", assistantRatePerHour: 40000 }),
    tal("busy", { ratePerHour: 100000 }),
    tal("tro", { role: "Assistant" })
  ];
  const ctxOf = (shifts: RosterShift[], mode: RankMode): RankContext => ({ shifts, rules, weekStart: WEEK, fam, talents, history, mode, nameOf: name });

  test("cân bằng: người đã báo rảnh + quen kênh lên đầu; người trùng ca bị chặn; trợ không có lịch sử host không vào vai host", () => {
    const shifts = R.buildRosterShifts([ca("busy1", { hostId: "busy", coHostId: undefined, date: "2026-10-14", startTime: "18:00", endTime: "21:00" })], [slot("o1")], [], [{ id: "r", slotId: "o1", talentId: "khanh", registeredAt: "" }], WEEK, "2026-10-18");
    const target = shifts.find((s) => s.key === "o:o1")!;
    const an = R.analyzeRoster(shifts, rules, WEEK, name);
    const list = C.rankCandidates(target, "host", ctxOf(shifts, "balance"), an);
    expect(list[0].talentId).toBe("khanh");
    expect(list.find((c) => c.talentId === "busy")?.blocked).toMatch(/Đang ở ca/);
    expect(list.some((c) => c.talentId === "tro")).toBe(false);
  });

  test("chi phí: rate tại ngày ca, trợ ưu tiên rate trợ, không rate = 'missing' (không phải 0)", () => {
    expect(C.plannedCost(talents[0], history, "host", "2026-10-14", 3)).toEqual({ amount: 900000, hourly: true, missing: false });
    expect(C.plannedCost(talents[2], history, "co_host", "2026-10-14", 3).amount).toBe(120000);
    expect(C.plannedCost(talents[4], history, "co_host", "2026-10-14", 3).missing).toBe(true);
    const hist: TalentRateHistoryEntry[] = [{ id: "h", talentId: "henry", ratePerHour: 200000, ratePerSession: 0, assistantRatePerHour: 0, commissionRate: 0, effectiveFrom: "2026-10-01" }];
    expect(C.plannedCost(talents[0], hist, "host", "2026-10-14", 2).amount).toBe(400000);
    expect(C.plannedCost(tal("flat", { ratePerSession: 500000 }), [], "host", "2026-10-14", 4)).toEqual({ amount: 500000, hourly: false, missing: false });
  });

  test("chế độ chi phí: người đủ điều kiện rẻ nhất lên đầu", () => {
    const shifts = R.buildRosterShifts([], [slot("o1")], [], [], WEEK, "2026-10-18");
    const target = shifts[0];
    const an = R.analyzeRoster(shifts, rules, WEEK, name);
    const list = C.rankCandidates(target, "host", ctxOf(shifts, "cost"), an);
    expect(list[0].talentId).toBe("khanh"); // 4 ca host CROCS, 120K < Henry 300K
    expect(list[0].qualified).toBe(true);
  });

  test("tự lấp: chỉ ca mở, không xếp một người vào hai ca trùng giờ", () => {
    const shifts = R.buildRosterShifts([], [slot("o1"), slot("o2", { brandId: "crocs", startTime: "19:30", endTime: "22:30", studioId: "r-2" })], [], [], WEEK, "2026-10-18");
    const res = C.autofillWeek(ctxOf(shifts, "balance"));
    const hosts = res.assignments.filter((a) => a.role === "host").map((a) => a.talentId);
    expect(hosts).toHaveLength(2);
    expect(new Set(hosts).size).toBe(2);
    const an = R.analyzeRoster(res.shifts, rules, WEEK, name);
    expect(an.issues.filter((i) => i.code === "clash")).toHaveLength(0);
  });

  test("giảm chi phí: chỉ đổi nháp, rẻ hơn ≥ 15%, dừng ở giới hạn", () => {
    const shifts = R.buildRosterShifts([], [slot("o1"), slot("o2", { date: "2026-10-15" }), slot("o3", { date: "2026-10-16" })], [
      { slotId: "o1", hostId: "henry", coHostId: "loan" },
      { slotId: "o2", hostId: "henry", coHostId: "loan" },
      { slotId: "o3", hostId: "henry", coHostId: "loan" }
    ], [], WEEK, "2026-10-18");
    const one = C.planCostCut(ctxOf(shifts, "balance"), 1);
    expect(one.moves).toHaveLength(1);
    expect(one.moves[0]).toMatchObject({ role: "host", from: "henry", to: "khanh", save: 540000 });
    const all = C.planCostCut(ctxOf(shifts, "balance"), 10);
    expect(all.moves).toHaveLength(3); // Khánh nhận thêm 9 giờ là chạm trần
    expect(all.save).toBe(3 * 540000);
  });
});

// ---- Điều khoản về host với brand (0191) ----
describe("điều khoản về host với brand", () => {
  const idx = R.buildBrandRuleIndex(
    [
      { brandId: "b1", talentId: "x", rule: "blocked" },
      { brandId: "b2", talentId: "y", rule: "exclusive" },
      { brandId: "b1", talentId: "z", rule: "preferred" }
    ],
    (id) => id.toUpperCase()
  );
  test("host brand không nhận / độc quyền brand khác bị báo; host hợp lệ thì không", () => {
    expect(R.brandRuleViolation(idx, "b1", "x")?.code).toBe("brand_blocked");
    expect(R.brandRuleViolation(idx, "b1", "y")?.code).toBe("brand_exclusive");
    expect(R.brandRuleViolation(idx, "b2", "y")).toBeUndefined();
    expect(R.brandRuleViolation(idx, "b1", "z")).toBeUndefined();
    expect(R.brandRuleViolation(undefined, "b1", "x")).toBeUndefined();
  });
});
