// Audit workflow 2026-10-04 (hợp đồng → kế hoạch → ca → vận hành → report) — phần thuần phía client của các bản vá.
// Phần DB (0133) có bộ kiểm riêng: supabase/tests/0133_workflow_integrity.sql (chạy trên bản replay).
import { describe, expect, test } from "vitest";
import { effectiveCamp, resolveCampBucketType } from "../src/lib/campaignDays";
import { crossBrandCheck, PlanDraftSlot } from "../src/lib/scheduling/monthPlanGrid";
import { applyAllocatedTargets } from "../src/lib/performance/targetAllocation";
import { computeSessionPnl, isPnlSession } from "../src/lib/pnl";
import { hasLiveEvidence, hasSessionData, isUnconfirmedPast } from "../src/lib/sessionStatus";
import { BrandMonthlyReport, LiveSession, ShiftSlot, Talent } from "../src/types";

const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id, title: id, brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "p1", studioName: "Phòng 1", hostId: "h1", hostName: "Host", assistantName: "", coHostName: "",
    platform: "TikTok", date: "2026-10-10", startTime: "19:00", endTime: "21:00", status: "Upcoming",
    targetGmv: 0, actualGmv: 0, totalOrders: 0, avgWatchTimeSeconds: 0, peakViewers: 0, totalViews: 0,
    ctrAvg: 0, cvrAvg: 0, dataSource: "manual", ...over
  }) as LiveSession;

describe("#8 khung camp — một luật cho mọi màn", () => {
  // Đổi 2026-10-04 (audit người mới): tháng có Kế Hoạch Tháng thì CHỈ kế hoạch quyết khung camp — một chỗ nhập.
  test("tháng có Kế Hoạch Tháng: khung của kế hoạch, bỏ qua ô ở Nhập Ads", () => {
    const camp = effectiveCamp(
      { midmonth: { start: "2026-10-12", end: "2026-10-14" }, payday: { start: "2026-10-24", end: "2026-10-26" } },
      { campMidmonthStart: "2026-10-15", campMidmonthEnd: "2026-10-17" } as BrandMonthlyReport
    );
    expect(camp.midmonth).toEqual({ start: "2026-10-12", end: "2026-10-14" });
    expect(camp.payday).toEqual({ start: "2026-10-24", end: "2026-10-26" });
    // Kế hoạch có nhưng không đặt khung nào ({}) vẫn là "có kế hoạch": ô Nhập Ads không được chen vào.
    expect(effectiveCamp({}, { campMidmonthStart: "2026-10-15", campMidmonthEnd: "2026-10-17" } as BrandMonthlyReport)).toEqual({});
  });
  test("tháng không có Kế Hoạch Tháng: khoảng nhập ở Nhập Ads, thay thế lịch cố định", () => {
    const camp = effectiveCamp(undefined, { campMidmonthStart: "2026-10-15", campMidmonthEnd: "2026-10-17" } as BrandMonthlyReport);
    expect(camp.midmonth).toEqual({ start: "2026-10-15", end: "2026-10-17" });
    // Ngày 13 không còn là Mid-Month (khoảng ghi đè THAY THẾ, không cộng thêm).
    expect(resolveCampBucketType("2026-10-13", camp)).toBe("daily");
    expect(resolveCampBucketType("2026-10-16", camp)).toBe("midmonth");
  });
  test("không có gì ⇒ rỗng (lịch cố định)", () => {
    expect(effectiveCamp(undefined, null)).toEqual({});
  });
});

describe("#12 kiểm chéo brand khác khi lập kế hoạch", () => {
  const draft = (key: string, date: string, startTime: string, endTime: string): PlanDraftSlot => ({ key, date, startTime, endTime, targetGmv: 0, note: "" });
  const slot = (id: string, over: Partial<ShiftSlot>): ShiftSlot =>
    ({ id, date: "2026-10-10", startTime: "19:00", endTime: "21:00", brandId: "jockey", brandName: "JOCKEY", platform: "TikTok", studioName: "", notes: "", status: "open", ...over }) as ShiftSlot;
  const sessions = [
    ca("j1", { brandId: "jockey", brandName: "JOCKEY", studioId: "p1" }),
    ca("own", { studioId: "p1" }), // chính brand đang lập — không tính là trùng
    ca("vhuy", { brandId: "vera", brandName: "VERA", studioId: "p1", status: "Cancelled" })
  ];
  const slots = [slot("v-open", { brandId: "vera", brandName: "VERA", studioId: "p2" })];
  const r = crossBrandCheck(
    [draft("a", "2026-10-10", "20:00", "22:00"), draft("b", "2026-10-11", "20:00", "22:00"), draft("past", "2026-10-01", "19:00", "21:00")],
    { brandId: "crocs", studioId: "p1", sessions, shiftSlots: slots, today: "2026-10-04" }
  );
  test("trùng phòng mặc định với ca brand khác (ca huỷ và ca của chính brand không tính)", () => {
    expect(r.clashes.map((c) => c.key)).toEqual(["a"]);
    expect(r.clashes[0].roomTakenBy).toContain("JOCKEY");
  });
  test("đỉnh ca song song đếm cả ca chờ đăng ký của brand khác ở phòng khác", () => {
    expect(r.peak?.key).toBe("a");
    expect(r.peak?.concurrent).toBe(3); // chính nó + JOCKEY + VERA (chờ đăng ký)
  });
  test("ca ngày đã qua bị bỏ qua", () => {
    expect(r.clashes.some((c) => c.key === "past")).toBe(false);
  });
});

describe("#7 target khi tháng đã có Kế Hoạch Tháng chốt", () => {
  test("chưa ca kế hoạch nào có người ⇒ ca mở lẻ target 0, KHÔNG lấy từ ô 'Kế hoạch tháng sau' của Report", () => {
    const reports = new Map<string, BrandMonthlyReport>([
      ["crocs|2026-09", { brandId: "crocs", periodMonth: "2026-09-01", planTargetGmv: 90_000_000, planPctDaily: 100 } as BrandMonthlyReport]
    ]);
    const lone = ca("le", { date: "2026-10-10" });
    const out = applyAllocatedTargets([lone], reports, new Map(), new Map([["crocs|2026-10", 120_000_000]]));
    expect(out.find((s) => s.id === "le")?.targetGmv).toBe(0);
  });
});

describe("#5/#6 tiền", () => {
  test("bằng chứng diễn ra: số / report / giờ live / nạp bù", () => {
    expect(hasSessionData(ca("x", { dataSource: "live_snapshot" }))).toBe(true);
    expect(hasLiveEvidence(ca("x", { status: "Completed" }))).toBe(false);
    expect(hasLiveEvidence(ca("x", { status: "Completed", liveDurationMinutes: 30 }))).toBe(true);
    expect(isUnconfirmedPast(ca("x", { status: "Completed" }))).toBe(true);
    expect(isPnlSession(ca("x", { status: "Completed" }), { includeBackfill: true })).toBe(false);
  });

  test("ca loại khỏi báo cáo: vẫn trả công theo giờ, bỏ doanh thu + hoa hồng theo GMV", () => {
    const host = { id: "h1", name: "Host", ratePerHour: 200_000, commissionRate: 1 } as Talent;
    const s = ca("x", { status: "Completed", dataSource: "tiktok_reconciled", actualGmv: 100_000_000, excludedFromReports: true });
    const p = computeSessionPnl(s, {}, { h1: host }, {}, [], [], []);
    expect(p.excluded).toBe(true);
    expect(p.grossAgencyRev).toBe(0);
    expect(p.hostPayout).toBe(400_000); // 2h × 200k, không cộng 1% của 100M
    const normal = computeSessionPnl({ ...s, excludedFromReports: false }, {}, { h1: host }, {}, [], [], []);
    expect(normal.hostPayout).toBe(400_000 + 1_000_000);
  });
});
