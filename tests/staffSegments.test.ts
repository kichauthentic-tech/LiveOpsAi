// Đổi người GIỮA CA (migration 0138): ca VERA Shopee 25/06 15:00–17:30 "Trợ: Trúc Như 2h, Thảo 30p" — Trúc Như trợ 2h
// đầu, Thảo vào thay 30 phút cuối. Một ca, một GMV; công và giờ tính theo từng người.
// Chạy: npx vitest run tests/staffSegments.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { clockAtOffset, effectiveSegments, offsetOfClock, personRoleMinutes, personWindows, roleShares, segmentRange, sessionMinutes, validateSegments } =
  await import("../src/lib/staffSegments");
const { computeSessionPnl, computeTalentMonthlyIncome } = await import("../src/lib/pnl");
const { personClash } = await import("../src/lib/scheduling/conflicts");
const { byHost, filterSessions, hostPortions } = await import("../src/lib/performance/hostPerformance");
import type { LiveSession, StaffSegment, Talent } from "../src/types";

const talent = (id: string, name: string, over: Partial<Talent> = {}): Talent =>
  ({ id, name, ratePerHour: 0, assistantRatePerHour: 0, ratePerSession: 0, commissionRate: 0, ...over }) as Talent;
const talents: Record<string, Talent> = {
  linh: talent("linh", "Khánh Linh", { ratePerHour: 100_000 }),
  nhu: talent("nhu", "Trúc Như", { assistantRatePerHour: 50_000 }),
  thao: talent("thao", "Thảo", { assistantRatePerHour: 40_000 }),
  mia: talent("mia", "Mia", { ratePerHour: 120_000 })
};

const seg = (talentId: string, role: StaffSegment["role"], fromMin: number, toMin: number): StaffSegment => ({
  talentId,
  talentName: talents[talentId].name,
  role,
  fromMin,
  toMin
});

const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "s1",
    brandId: "vera",
    brandName: "VERA",
    platform: "Shopee",
    date: "2026-06-25",
    startTime: "15:00",
    endTime: "17:30",
    status: "Completed",
    hostId: "linh",
    hostName: "Khánh Linh",
    coHostId: "nhu",
    coHostName: "Trúc Như",
    actualGmv: 8_361_687,
    totalOrders: 100,
    totalViews: 10_000,
    dataSource: "tiktok_reconciled",
    isBackfill: true,
    ...over
  }) as LiveSession;

const doiTro = ca({ staffSegments: [seg("nhu", "co_host", 0, 120), seg("thao", "co_host", 120, 150)] });
const pnlOf = (s: LiveSession) => computeSessionPnl(s, {}, talents, {}, [], [], []);

describe("giờ trong ca", () => {
  test("độ dài ca và đồng hồ theo offset, kể cả ca qua đêm", () => {
    expect(sessionMinutes(ca())).toBe(150);
    const dem = ca({ startTime: "21:00", endTime: "00:30" });
    expect(sessionMinutes(dem)).toBe(210);
    expect(clockAtOffset(dem, 210)).toBe("00:30");
    expect(offsetOfClock(dem, "23:00")).toBe(120);
    expect(offsetOfClock(dem, "00:15")).toBe(195);
    expect(offsetOfClock(dem, "25:99x")).toBeNull();
  });

  test("ca không chia đoạn: host + trợ làm cả ca (cách tính cũ)", () => {
    const segs = effectiveSegments(ca());
    expect(segs.map((g) => [g.talentId, g.role, g.fromMin, g.toMin])).toEqual([["linh", "host", 0, 150], ["nhu", "co_host", 0, 150]]);
  });

  test("vai có đoạn thì đoạn thắng; vai kia vẫn cả ca", () => {
    expect(personRoleMinutes(doiTro, "nhu", "co_host")).toBe(120);
    expect(personRoleMinutes(doiTro, "thao", "co_host")).toBe(30);
    expect(personRoleMinutes(doiTro, "linh", "host")).toBe(150);
    const sh = roleShares(doiTro, "co_host");
    expect(sh.map((p) => [p.talentId, Math.round(p.share * 100)])).toEqual([["nhu", 80], ["thao", 20]]);
  });
});

describe("validateSegments — cùng luật với RPC", () => {
  const s = ca();
  test("hợp lệ, có khoảng trống cũng được", () => {
    expect(validateSegments(s, [seg("nhu", "co_host", 0, 60), seg("thao", "co_host", 90, 150)])).toBeNull();
  });
  test("vượt ca / ngược giờ / chồng cùng vai / một người hai vai", () => {
    expect(validateSegments(s, [seg("nhu", "co_host", 0, 151)])).toMatch(/nằm trong ca/);
    expect(validateSegments(s, [seg("nhu", "co_host", 60, 60)])).toMatch(/sau giờ vào/);
    expect(validateSegments(s, [seg("nhu", "co_host", 0, 100), seg("thao", "co_host", 90, 150)])).toMatch(/cùng một vai/);
    expect(validateSegments(s, [seg("nhu", "co_host", 0, 100), seg("nhu", "host", 50, 150)])).toMatch(/hai vai/);
  });
});

describe("lương theo giờ từng người (computeSessionPnl)", () => {
  test("ca cũ không đổi người: trợ ăn cả 2,5h — số y như trước", () => {
    const p = pnlOf(ca());
    expect(p.segmented).toBe(false);
    expect(p.hostPayout).toBe(250_000); // 2,5h x 100k
    expect(p.coHostPayout).toBe(125_000); // 2,5h x 50k
    expect(p.payouts.map((x) => [x.talentId, x.role, x.hours])).toEqual([["linh", "host", 2.5], ["nhu", "co_host", 2.5]]);
  });

  test("Trúc Như 2h + Thảo 30p: mỗi người một dòng công, tổng trợ = 2h x 50k + 0,5h x 40k", () => {
    const p = pnlOf(doiTro);
    expect(p.segmented).toBe(true);
    const by = Object.fromEntries(p.payouts.map((x) => [`${x.role}:${x.talentId}`, x]));
    expect(by["co_host:nhu"].hours).toBe(2);
    expect(by["co_host:nhu"].payout).toBe(100_000);
    expect(by["co_host:thao"].hours).toBe(0.5);
    expect(by["co_host:thao"].payout).toBe(20_000);
    expect(p.coHostPayout).toBe(120_000);
    expect(p.hostPayout).toBe(250_000); // host không đổi
  });

  test("host đổi giữa ca: hai host ăn theo giờ của mình", () => {
    const s = ca({ coHostId: undefined, coHostName: "", staffSegments: [seg("linh", "host", 0, 60), seg("mia", "host", 60, 150)] });
    const p = pnlOf(s);
    expect(p.hostPayout).toBe(100_000 * 1 + 120_000 * 1.5);
    expect(p.coHostPayout).toBe(0);
  });

  test("OT/off sớm của ca gắn vào người đứng tới cuối ca của vai đó", () => {
    const s = ca({ staffSegments: doiTro.staffSegments, report: { otMinutes: 30, earlyLeaveMinutes: 0 } as LiveSession["report"] });
    const by = Object.fromEntries(pnlOf(s).payouts.map((x) => [x.talentId, x.hours]));
    expect(by.nhu).toBe(2); // ra giữa ca: không ăn OT
    expect(by.thao).toBe(1); // 0,5h + 0,5h OT
  });

  test("người chưa có rate bị gắn cờ thiếu rate, không ra 0 im lặng", () => {
    const s = ca({ staffSegments: [seg("nhu", "co_host", 0, 120), { ...seg("thao", "co_host", 120, 150), talentId: "la" }] });
    const p = pnlOf(s);
    expect(p.missingInputs).toContain("cohost_rate");
    expect(p.payouts.find((x) => x.talentId === "la")?.missingRate).toBe(true);
  });

  test("Thu nhập talent: mỗi người chỉ thấy phần giờ của mình", () => {
    const month = "2026-06";
    const s = { ...doiTro, isBackfill: false };
    const thao = computeTalentMonthlyIncome([s], "thao", month, {}, talents, []);
    expect(thao.rows.map((r) => [r.role, r.billableHours, r.payout])).toEqual([["co_host", 0.5, 20_000]]);
    const nhu = computeTalentMonthlyIncome([s], "nhu", month, {}, talents, []);
    expect(nhu.rows.map((r) => [r.role, r.billableHours, r.payout])).toEqual([["co_host", 2, 100_000]]);
  });
});

describe("kiểm trùng lịch theo khoảng đứng ca", () => {
  const sessions = [doiTro];
  test("Thảo chỉ bận 17:00–17:30; trước đó rảnh", () => {
    expect(personWindows(doiTro, "thao")).toEqual([{ date: "2026-06-25", startTime: "17:00", endTime: "17:30" }]);
    expect(personClash(sessions, { date: "2026-06-25", startTime: "15:00", endTime: "16:30" }, "thao")).toBeNull();
    expect(personClash(sessions, { date: "2026-06-25", startTime: "17:10", endTime: "18:00" }, "thao")?.id).toBe("s1");
  });
  test("Trúc Như ra lúc 17:00 nên nhận ca khác từ 17:00", () => {
    expect(personClash(sessions, { date: "2026-06-25", startTime: "17:00", endTime: "19:00" }, "nhu")).toBeNull();
    expect(personClash(sessions, { date: "2026-06-25", startTime: "16:00", endTime: "19:00" }, "nhu")?.id).toBe("s1");
  });
  test("ca không đổi người: bận cả ca như cũ", () => {
    expect(personClash([ca()], { date: "2026-06-25", startTime: "17:00", endTime: "19:00" }, "nhu")?.id).toBe("s1");
  });
  test("ca qua đêm: đoạn sau nửa đêm thuộc ngày hôm sau", () => {
    const dem = ca({ startTime: "21:00", endTime: "00:30", staffSegments: [seg("nhu", "co_host", 0, 150), seg("thao", "co_host", 150, 210)] });
    expect(segmentRange(dem, { fromMin: 150, toMin: 210 })).toEqual({ date: "2026-06-25", startTime: "23:30", endTime: "00:30" });
    expect(segmentRange(dem, { fromMin: 180, toMin: 210 })).toEqual({ date: "2026-06-26", startTime: "00:00", endTime: "00:30" });
    expect(personClash([dem], { date: "2026-06-26", startTime: "00:10", endTime: "01:00" }, "thao")?.id).toBe("s1");
    expect(personClash([dem], { date: "2026-06-26", startTime: "00:10", endTime: "01:00" }, "nhu")).toBeNull();
  });
});

describe("hiệu suất host khi đổi host giữa ca", () => {
  const doiHost = ca({ coHostId: undefined, coHostName: "", staffSegments: [seg("linh", "host", 0, 60), seg("mia", "host", 60, 150)] });

  test("GMV, view và giờ chia theo giờ đứng ca; cộng lại bằng đúng ca gốc", () => {
    const parts = hostPortions(doiHost);
    expect(parts.map((p) => p.hostId).sort()).toEqual(["linh", "mia"]);
    expect(parts.reduce((s, p) => s + p.actualGmv, 0)).toBeCloseTo(doiHost.actualGmv, 6);
    expect(parts.reduce((s, p) => s + p.totalViews, 0)).toBeCloseTo(doiHost.totalViews, 6);
    expect(parts.reduce((s, p) => s + (p.liveDurationMinutes ?? 0), 0)).toBeCloseTo(150, 6);
  });

  test("byHost: hai host cùng GMV/giờ của ca (không có phần thưởng cho người vào sau)", () => {
    const rows = byHost([doiHost]);
    expect(rows).toHaveLength(2);
    expect(rows[0].gmvPerHour).toBeCloseTo(rows[1].gmvPerHour ?? 0, 6);
    expect(rows.reduce((s, r) => s + r.gmv, 0)).toBeCloseTo(doiHost.actualGmv, 6);
  });

  test("lọc theo một host chỉ trả phần của host đó; chia lần hai không đổi gì", () => {
    const mine = filterSessions([doiHost], { hostId: "mia" });
    expect(mine).toHaveLength(1);
    expect(mine[0].actualGmv).toBeCloseTo(doiHost.actualGmv * 0.6, 6);
    expect(hostPortions(mine[0])).toEqual([mine[0]]);
  });

  test("ca không đổi host đi nguyên ca", () => {
    expect(hostPortions(ca())).toHaveLength(1);
    expect(byHost([ca()])[0].gmv).toBe(8_361_687);
  });
});
