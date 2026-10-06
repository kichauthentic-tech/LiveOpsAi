// Tách theo sàn TikTok / Shopee (06/10, user chốt: kế hoạch, target, hợp đồng, report riêng từng sàn; xem cả riêng lẫn tổng).
// Chạy: npx vitest run tests/platformSplit.test.ts
import { describe, expect, test } from "vitest";
import { brandMonthKey, brandPlatformKey, inPlatformScope, sessionBrandMonthKey } from "../src/lib/reportPlatform";
import { deriveChannels, platformsOfBrand } from "../src/lib/channels";
import { applyAllocatedTargets } from "../src/lib/performance/targetAllocation";
import { lockedPlanTargetsFromRows } from "../src/lib/scheduling/lockedPlanTargets";
import { computeAllProgress, computeSchedulingGaps, monthCommitmentOf } from "../src/lib/performance/brandCommitment";
import { buildTodos } from "../src/lib/todoList";
import { parsePlatformParam, withPlatformParam } from "../src/lib/routes";
import type { Brand, BrandMonthPlan, BrandMonthlyCommitment, LiveSession, ShiftSlot } from "../src/types";

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
  test("sàn brand đang chạy = kênh (0149), TikTok trước; brand chưa có kênh ⇒ [] (không đoán TikTok)", () => {
    const ch = (platform: "TikTok" | "Shopee", status: "active" | "paused" = "active") => ({ id: platform, brandId: B, platform, shopName: "", shopRef: "", status, note: "" });
    expect(platformsOfBrand([ch("Shopee"), ch("TikTok")], B)).toEqual(["TikTok", "Shopee"]);
    expect(platformsOfBrand([ch("Shopee", "paused"), ch("TikTok")], B, false)).toEqual(["TikTok"]);
    expect(platformsOfBrand([ch("Shopee")], "khac")).toEqual([]);
    // DB chưa có bảng kênh: suy từ dòng đang có, mỗi cặp brand × sàn một kênh.
    expect(platformsOfBrand(deriveChannels([ca("a", "Shopee"), ca("b", "TikTok"), ca("c", "Shopee")]), B)).toEqual(["TikTok", "Shopee"]);
    expect(inPlatformScope(ca("a", "Shopee"), "Shopee")).toBe(true);
    expect(inPlatformScope(ca("a", "Shopee"), "TikTok")).toBe(false);
  });
  test("URL ?san=", () => {
    expect(parsePlatformParam("?san=shopee")).toBe("Shopee");
    expect(parsePlatformParam("?san=tong")).toBeNull(); // không còn "Tổng 2 sàn"
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
    const out = applyAllocatedTargets([tt, sp], new Map([["tt", 30_000_000]]), planTotals);
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
    const out = applyAllocatedTargets([tt, sp, off], new Map([["tt", 30_000_000], ["sp", 50_000_000]]), planTotals);
    expect(Object.fromEntries(out.map((s) => [s.id, s.targetGmv]))).toEqual({ tt: 30_000_000, sp: 50_000_000, off: 0 });
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
  test("cam kết TikTok không phải cam kết Shopee", () => {
    expect(monthCommitmentOf([commit("TikTok", 10)], [], B, "TikTok", "2026-10-01").hours).toBe(10);
    expect(monthCommitmentOf([commit("TikTok", 10)], [], B, "Shopee", "2026-10-01").source).toBe("none");
  });
});

describe("Việc cần làm theo sàn", () => {
  const brand = { id: B, name: "VERA" } as Brand;
  const plan = (platform: "TikTok" | "Shopee", status: BrandMonthPlan["status"]) => ({ id: platform, brandId: B, month: "2026-10", platform, status }) as BrandMonthPlan;
  test("kế hoạch TikTok đã chốt nhưng Shopee còn nháp ⇒ nhắc đúng 'VERA Shopee'", () => {
    const todos = buildTodos({
      today: "2026-10-20",
      brands: [brand],
      channels: (["TikTok", "Shopee"] as const).map((platform) => ({ id: platform, brandId: B, platform, shopName: "", shopRef: "", status: "active" as const, note: "" })),
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

describe("Bản Tin CEO: tập trung khách tính riêng từng sàn (07/10: không cộng GMV hai sàn)", () => {
  test("TikTok: Franklin 30 + VERA 35 ⇒ VERA 54% GMV TikTok; Shopee chỉ một khách ⇒ không báo", async () => {
    const { buildIssues } = await import("../src/lib/performance/ceoBrief");
    const o = (actual: number) => ({ actual, pending: [], runRate: null, target: null, gap: null, buckets: [], projectionMethod: "none", remainingDays: 20, projected: actual, expectedToDate: null }) as never;
    const issues = buildIssues({
      today: "2026-10-10",
      brands: [
        { brandId: "f", name: "Franklin", clientName: "Franklin", platform: "TikTok", outlook: o(30), lastData: "2026-10-09", nextPlan: "locked" },
        { brandId: "v", name: "VERA · TikTok", clientName: "VERA", platform: "TikTok", outlook: o(35), lastData: "2026-10-09", nextPlan: "locked" },
        { brandId: "v", name: "VERA · Shopee", clientName: "VERA", platform: "Shopee", outlook: o(35), lastData: "2026-10-09", nextPlan: "locked" }
      ],
      periodSessions: [],
      finance: null,
      agencyScope: true,
      fmt: String
    });
    const t = issues.map((i) => i.title).filter((x) => /một khách/.test(x));
    expect(t).toEqual(["54% GMV TikTok tháng đến từ một khách: VERA"]);
  });
});
