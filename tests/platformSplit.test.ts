// Tách theo sàn TikTok / Shopee (06/10, user chốt: kế hoạch, target, hợp đồng, report riêng từng sàn; xem cả riêng lẫn tổng).
// Chạy: npx vitest run tests/platformSplit.test.ts
import { describe, expect, test } from "vitest";
import { brandMonthKey, brandPlatformKey, brandPlatformsOf, inPlatformScope, sessionBrandMonthKey } from "../src/lib/reportPlatform";
import { applyAllocatedTargets, buildMonthTargetPlan } from "../src/lib/performance/targetAllocation";
import { lockedPlanTargetsFromRows } from "../src/lib/scheduling/lockedPlanTargets";
import { brandsMissingCommitment, computeAllProgress, computeSchedulingGaps } from "../src/lib/performance/brandCommitment";
import { buildTodos } from "../src/lib/todoList";
import { parsePlatformParam, withPlatformParam } from "../src/lib/routes";
import type { Brand, BrandMonthPlan, BrandMonthlyCommitment, BrandMonthlyReport, LiveSession, ShiftSlot } from "../src/types";

const B = "brand-vera";
const ca = (id: string, platform: "TikTok" | "Shopee", extra: Partial<LiveSession> = {}): LiveSession =>
  ({
    id, title: id, brandId: B, brandName: "VERA", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "h1", hostName: "Host", assistantName: "", coHostName: "", platform, date: "2026-10-10", startTime: "09:00", endTime: "12:00",
    status: "Upcoming", targetGmv: 0, actualGmv: 0, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 0, ctrAvg: 0, cvrAvg: 0, ...extra
  }) as LiveSession;

describe("khoá brand × tháng × sàn", () => {
  test("TikTok giữ khoá cũ, Shopee thêm hậu tố", () => {
    expect(brandMonthKey(B, "2026-10")).toBe(`${B}|2026-10`);
    expect(brandMonthKey(B, "2026-10-15", "TikTok")).toBe(`${B}|2026-10`);
    expect(brandMonthKey(B, "2026-10", "Shopee")).toBe(`${B}|2026-10|Shopee`);
    expect(sessionBrandMonthKey(ca("x", "Shopee"))).toBe(`${B}|2026-10|Shopee`);
    expect(brandPlatformKey(B, "TikTok")).toBe(B);
    expect(brandPlatformKey(B, "Shopee")).toBe(`${B}|Shopee`);
  });
  test("sàn brand đang chạy: từ ca + slot/phòng, TikTok trước; chưa có gì ⇒ TikTok", () => {
    expect(brandPlatformsOf(B, [ca("a", "Shopee"), ca("b", "TikTok")])).toEqual(["TikTok", "Shopee"]);
    expect(brandPlatformsOf(B, [], [{ brandId: B, platform: "Shopee" }])).toEqual(["Shopee"]);
    expect(brandPlatformsOf("khac", [ca("a", "Shopee")])).toEqual(["TikTok"]);
    expect(inPlatformScope(ca("a", "Shopee"), "all")).toBe(true);
    expect(inPlatformScope(ca("a", "Shopee"), "TikTok")).toBe(false);
  });
  test("URL ?san=", () => {
    expect(parsePlatformParam("?san=shopee")).toBe("Shopee");
    expect(parsePlatformParam("?san=tong")).toBe("all");
    expect(parsePlatformParam("?x=1")).toBeNull();
    expect(withPlatformParam("?x=1", "TikTok")).toBe("?x=1&san=tiktok");
    expect(withPlatformParam("?san=tiktok", null)).toBe("");
  });
});

describe("target từng ca theo sàn (0140)", () => {
  test("kế hoạch TikTok đã chốt KHÔNG gán target 0 cho ca Shopee cùng tháng (trước 06/10: ca Shopee bị coi là ngoài kế hoạch)", () => {
    const tt = ca("tt", "TikTok");
    const sp = ca("sp", "Shopee", { targetGmv: 7_000_000 }); // số target cũ trong DB của ca Shopee
    const planTotals = new Map([[brandMonthKey(B, "2026-10", "TikTok"), 30_000_000]]);
    const out = applyAllocatedTargets([tt, sp], new Map(), new Map([["tt", 30_000_000]]), planTotals);
    expect(out.find((s) => s.id === "tt")!.targetGmv).toBe(30_000_000);
    // Shopee chưa có kế hoạch nào ⇒ giữ nguyên số đang có, không bị kế hoạch TikTok xoá về 0.
    expect(out.find((s) => s.id === "sp")!.targetGmv).toBe(7_000_000);
  });
  test("mỗi sàn một kế hoạch: target kế hoạch Shopee chỉ đổ xuống ca Shopee", () => {
    const tt = ca("tt", "TikTok");
    const sp = ca("sp", "Shopee");
    const off = ca("off", "Shopee", { startTime: "20:00", endTime: "22:00" });
    const planTotals = new Map([
      [brandMonthKey(B, "2026-10", "TikTok"), 30_000_000],
      [brandMonthKey(B, "2026-10", "Shopee"), 50_000_000]
    ]);
    const out = applyAllocatedTargets([tt, sp, off], new Map(), new Map([["tt", 30_000_000], ["sp", 50_000_000]]), planTotals);
    expect(Object.fromEntries(out.map((s) => [s.id, s.targetGmv]))).toEqual({ tt: 30_000_000, sp: 50_000_000, off: 0 });
  });
  test("target khung camp (tháng không có kế hoạch) đọc report ĐÚNG SÀN và chỉ chia cho ca sàn đó", () => {
    const reports = new Map<string, BrandMonthlyReport>([
      [brandMonthKey(B, "2026-10", "Shopee"), { brandId: B, periodMonth: "2026-10-01", platform: "Shopee", campMidmonthStart: "2026-10-10", campMidmonthEnd: "2026-10-10", campMidmonthTargetGmv: 9_000_000 } as BrandMonthlyReport]
    ]);
    expect(buildMonthTargetPlan(B, "2026-10", reports, "TikTok")).toBeNull();
    expect(buildMonthTargetPlan(B, "2026-10", reports, "Shopee")?.platform).toBe("Shopee");
    const out = applyAllocatedTargets([ca("tt", "TikTok"), ca("sp", "Shopee")], reports, new Map(), new Map());
    expect(out.find((s) => s.id === "sp")!.targetGmv).toBe(9_000_000);
    expect(out.find((s) => s.id === "tt")!.targetGmv).toBe(0);
  });
  test("tổng target đã chốt tách theo sàn của kế hoạch; DB chưa chạy 0140 (thiếu platform) = TikTok", () => {
    const t = lockedPlanTargetsFromRows([
      { slot_id: "s1", target_gmv: 10, date: "2026-10-01", plan: { brand_id: B } },
      { slot_id: "s2", target_gmv: 20, date: "2026-10-02", plan: { brand_id: B, platform: "TikTok" } },
      { slot_id: "s3", target_gmv: 40, date: "2026-10-02", plan: [{ brand_id: B, platform: "Shopee" }] }
    ]);
    expect(t.monthTotals.get(brandMonthKey(B, "2026-10"))).toBe(30);
    expect(t.monthTotals.get(brandMonthKey(B, "2026-10", "Shopee"))).toBe(40);
    expect(t.slotTargets.get(brandMonthKey(B, "2026-10", "Shopee"))).toEqual([{ date: "2026-10-02", target: 40 }]);
  });
});

describe("cam kết hợp đồng theo sàn (0141)", () => {
  const commit = (platform: "TikTok" | "Shopee", hours: number): BrandMonthlyCommitment => ({ id: platform, brandId: B, periodMonth: "2026-10-01", platform, committedHours: hours, isOverride: false });
  test("giờ đã xếp chỉ đếm ca cùng sàn", () => {
    const sessions = [ca("tt", "TikTok"), ca("sp1", "Shopee"), ca("sp2", "Shopee", { date: "2026-10-11" })];
    const rows = computeAllProgress([commit("TikTok", 10), commit("Shopee", 10)], { [B]: "VERA" }, sessions, "2026-10-01", "2026-10-05");
    const by = Object.fromEntries(rows.map((r) => [r.platform, r.scheduledHours]));
    expect(by).toEqual({ TikTok: 3, Shopee: 6 });
  });
  test("ca mở chờ đăng ký trừ vào đúng sàn", () => {
    const slots = [{ id: "o1", brandId: B, platform: "Shopee", status: "open", date: "2026-10-20", startTime: "10:00", endTime: "14:00" }] as ShiftSlot[];
    const g = computeSchedulingGaps([commit("TikTok", 10), commit("Shopee", 10)], { [B]: "VERA" }, [], slots, "2026-10-01", "2026-10-05");
    expect(Object.fromEntries(g.map((r) => [r.platform, r.openSlotHours]))).toEqual({ TikTok: 0, Shopee: 4 });
  });
  test("có cam kết TikTok mà ca Shopee chưa có cam kết vẫn bị nhắc", () => {
    expect(brandsMissingCommitment([commit("TikTok", 10)], [ca("tt", "TikTok"), ca("sp", "Shopee")], "2026-10-01")).toEqual([`${B}|Shopee`]);
  });
});

describe("Việc cần làm theo sàn", () => {
  const brand = { id: B, name: "VERA" } as Brand;
  const plan = (platform: "TikTok" | "Shopee", status: BrandMonthPlan["status"]) => ({ id: platform, brandId: B, month: "2026-10", platform, status }) as BrandMonthPlan;
  test("kế hoạch TikTok đã chốt nhưng Shopee còn nháp ⇒ nhắc đúng 'VERA Shopee'", () => {
    const todos = buildTodos({
      today: "2026-10-20",
      brands: [brand],
      sessions: [ca("tt", "TikTok"), ca("sp", "Shopee")],
      shiftSlots: [],
      plansThisMonth: new Map([[brandPlatformKey(B, "TikTok"), plan("TikTok", "locked")], [brandPlatformKey(B, "Shopee"), plan("Shopee", "draft")]]),
      plansNextMonth: new Map(),
      commitments: [],
      rates: [],
      monthlyReports: new Map(),
      talents: [],
      canSeeMoney: false
    });
    const titles = todos.map((t) => t.title);
    expect(titles).toContain("Kế hoạch tháng 10/2026 của VERA Shopee còn nháp");
    expect(titles.some((t) => /của VERA TikTok còn nháp/.test(t))).toBe(false);
    // Tháng sau: nhắc riêng từng sàn.
    expect(titles).toContain("Kế hoạch tháng 11/2026 của VERA TikTok chưa chốt");
    expect(titles).toContain("Kế hoạch tháng 11/2026 của VERA Shopee chưa chốt");
  });
});

describe("Bản Tin CEO: tập trung khách cộng theo brand, không theo sàn", () => {
  test("Franklin TikTok 30 + VERA TikTok 35 + VERA Shopee 35 ⇒ khách lớn nhất là VERA 70%, không phải 'Franklin · TikTok'", async () => {
    const { buildIssues } = await import("../src/lib/performance/ceoBrief");
    const o = (actual: number) => ({ actual, pending: [], runRate: null, target: null, gap: null, buckets: [], projectionMethod: "none", remainingDays: 20, projected: actual, expectedToDate: null }) as never;
    const issues = buildIssues({
      today: "2026-10-10",
      brands: [
        { brandId: "f", name: "Franklin", clientName: "Franklin", outlook: o(30), lastData: "2026-10-09", nextPlan: "locked" },
        { brandId: "v", name: "VERA · TikTok", clientName: "VERA", outlook: o(35), lastData: "2026-10-09", nextPlan: "locked" },
        { brandId: "v", name: "VERA · Shopee", clientName: "VERA", outlook: o(35), lastData: "2026-10-09", nextPlan: "locked" }
      ],
      periodSessions: [],
      finance: null,
      agencyScope: true,
      fmt: String
    });
    const t = issues.map((i) => i.title).find((x) => /một khách/.test(x));
    expect(t).toBe("70% GMV tháng đến từ một khách: VERA");
  });
});
