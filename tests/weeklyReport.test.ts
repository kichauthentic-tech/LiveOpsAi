// Báo Cáo Tuần (agency) — lib/performance/weeklyReport.ts
// Chạy: npx vitest run tests/weeklyReport.test.ts
import { describe, expect, test } from "vitest";
import { buildWeeklyChannel, paceLevel, prevRange, rollupChannels, shiftWeeklyAnchor, weeklyBounds } from "../src/lib/performance/weeklyReport";
import { buildAccountRunRate } from "../src/lib/performance/runRateUpdate";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { isoWeekStart } from "../src/lib/dateUtils";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import type { ChannelCard } from "../src/lib/performance/channelCard";
import type { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "vera", brandName: "VERA", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Linh", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: gmv, totalOrders: 30, avgWatchTimeSeconds: 40, peakViewers: 0,
    totalViews: 6_000, impressions: 100_000, productImpressions: 20_000, productClicks: 900, attributedItemsSold: 40,
    ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, dataSource: "live_snapshot", ...extra
  } as LiveSession;
}
const plan = (id: string, date: string, target: number, slotId: string): BrandMonthPlanSlot =>
  ({ id, planId: "p", date, startTime: "20:00", endTime: "23:00", targetGmv: target, expectedGmv: 0, slotId, note: "" });
const shift = (id: string, date: string, sessionId?: string, status: ShiftSlot["status"] = "finalized"): ShiftSlot =>
  ({ id, date, startTime: "20:00", endTime: "23:00", brandId: "vera", brandName: "VERA", platform: "TikTok", studioName: "", notes: "", status, sessionId }) as ShiftSlot;

// Tháng 11/2026. D-Day 11/11 = dải 9–11. Hôm nay 12/11, số có tới 11/11.
function fixture() {
  // Nền 28 ngày trước: 6 ca tốt ở cuối tháng 10 (GMV 50M, ERR cao)
  const base = ["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-26", "2026-10-27", "2026-10-28"].map((d) => ca(d, 50e6));
  const a = ca("2026-11-02", 90e6); // đạt 90%
  const weak = ca("2026-11-03", 20e6, { impressions: 400_000, totalViews: 6_000 }); // ERR 1,5% so nền 6% ⇒ gãy; 20% target
  const strong = ca("2026-11-04", 130e6, { productClicks: 2_000 }); // 130%
  const dday = ca("2026-11-10", 150e6); // D-Day
  const noData = ca("2026-11-05", 0, { totalViews: 0, impressions: 0, dataSource: "manual" });
  const cancelled = ca("2026-11-06", 0, { status: "Cancelled" });
  const sessions = [...base, a, weak, strong, dday, noData, cancelled];
  const shifts = [
    shift("a", "2026-11-02", a.id), shift("w", "2026-11-03", weak.id), shift("s", "2026-11-04", strong.id), shift("n", "2026-11-05", noData.id),
    shift("c", "2026-11-06", cancelled.id, "cancelled"), shift("d", "2026-11-10", dday.id)
  ];
  const slots = [
    plan("p1", "2026-11-02", 100e6, "a"), plan("p2", "2026-11-03", 100e6, "w"), plan("p3", "2026-11-04", 100e6, "s"),
    plan("p4", "2026-11-05", 80e6, "n"), plan("p5", "2026-11-06", 70e6, "c"), plan("p6", "2026-11-10", 200e6, "d"), plan("p7", "2026-11-14", 100e6, "")
  ];
  const rr = planRunRate("2026-11", slots, shifts, sessions, "2026-11-12");
  const card = { key: "vera|TikTok", brandId: "vera", brandName: "VERA", platform: "TikTok", name: "VERA", month: "2026-11", rr, bucketOf: (d: string) => resolveCampBucketType(d) } as unknown as ChannelCard;
  return { card, sessions };
}

describe("buildWeeklyChannel", () => {
  test("target tới nay / thực đạt / % lấy từ planRunRate, cắt ở ngày cuối có số", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    expect(w.through).toBe("2026-11-10");
    // target ≤ 10/11: 100+100+100+80+70+200 = 650M (ca huỷ GIỮ target); thực đạt 90+20+130+150 = 390M
    expect(w.range.targetToDate).toBe(650e6);
    expect(w.range.actual).toBe(390e6);
    expect(w.range.target).toBe(750e6); // ca ngày 14 còn tương lai
    // % = thực đạt ÷ target TỔNG của kỳ (không phải target tới nay): 390 ÷ 750
    expect(w.range.pct).toBeCloseTo(0.52, 5);
    expect(w.range.gap).toBe(390e6 - 750e6);
    expect(w.level).toBe("behind");
    expect(w.targetSource).toBe("plan");
  });

  test("theo ngày: ngày camp gắn bucket, ngày chưa tới là future, ngày chưa có số là waiting", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-09", to: "2026-11-14", today: "2026-11-12" });
    const by = Object.fromEntries(w.days.map((d) => [d.date, d]));
    expect(by["2026-11-10"].bucket).toBe("dday");
    expect(by["2026-11-10"].state).toBe("done");
    expect(by["2026-11-10"].pct).toBeCloseTo(0.75, 5);
    expect(by["2026-11-12"].state).toBe("waiting");
    expect(by["2026-11-14"].state).toBe("future");
    expect(by["2026-11-14"].target).toBe(100e6);
    expect(by["2026-11-14"].bucket).toBe("midmonth");
  });

  test("đợt: dải D-Day 9–11 là MỘT dòng, tổng target/actual của dải", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    const dd = w.events.find((e) => e.bucket === "dday")!;
    expect([dd.from, dd.to]).toEqual(["2026-11-09", "2026-11-11"]);
    expect(dd.target).toBe(200e6);
    expect(dd.actual).toBe(150e6);
    expect(dd.pct).toBeCloseTo(0.75, 5);
    expect(dd.status).toBe("live");
    const mid = w.events.find((e) => e.bucket === "midmonth")!;
    expect(mid.status).toBe("next");
  });

  test("ca đáng lưu ý: ca 20% target + ERR tụt so nền được nêu đúng chỉ số; ca 130% vào danh sách tốt", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    expect(w.weak.map((n) => n.session.date)).toContain("2026-11-03");
    const weak = w.weak.find((n) => n.session.date === "2026-11-03")!;
    expect(weak.pct).toBeCloseTo(0.2, 5);
    // ERR 1,5% vs nền ~4,6% và AOV tụt vì GMV thấp trên cùng số đơn — nặng nhất trước
    expect(weak.breaks.map((b) => b.key)).toContain("err");
    expect(weak.breaks.every((b) => b.ratio < 0.8)).toBe(true);
    expect(weak.breaks[0].ratio).toBeLessThanOrEqual(weak.breaks[weak.breaks.length - 1].ratio);
    expect(w.strong.map((n) => n.session.date)).toContain("2026-11-04");
    expect(w.strong.find((n) => n.session.date === "2026-11-04")!.wins.map((m) => m.key)).toContain("liveCtr");
  });

  test("ca đã qua chưa có số và ca huỷ có target được liệt kê, không tính vào ca tốt/xấu", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    expect(w.missing.map((m) => `${m.date}:${m.kind}`).sort()).toEqual(["2026-11-05:no_data", "2026-11-06:cancelled"]);
    expect(w.weak.some((n) => n.session.date === "2026-11-05")).toBe(false);
    expect(w.range.cancelled).toBe(1);
    expect(w.range.waiting).toBe(1);
  });

  test("luỹ kế tháng: đường thực đạt dừng sau ngày cuối có số", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    const at = (d: string) => w.cum.find((c) => c.date === d)!;
    expect(at("2026-11-10").cumActual).toBe(390e6);
    expect(at("2026-11-11").cumActual).toBeNull();
    expect(at("2026-11-30").cumTarget).toBe(750e6);
  });

  test("so kỳ trước CÙNG SỐ NGÀY: kỳ chưa hết chỉ so với đúng bấy nhiêu ngày trước đó", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    // số tới 10/11 ⇒ 10 ngày (01–10/11) so với 22–31/10: 4 ca × 50M (ca 20–21/10 nằm ngoài, không lẫn vào)
    expect(w.range.prevActual).toBe(200e6);
    expect(w.range.prevDelta).toBeCloseTo(390 / 200 - 1, 5);
  });

  test("tới nay khớp Dashboard: ngày cuối mới có một phần ca chỉ lấy target các ca đã có số", () => {
    const d10 = ca("2026-11-10", 150e6);
    const d11 = ca("2026-11-11", 60e6, { startTime: "14:00", endTime: "17:00" });
    const sessions = [d10, d11];
    const shifts = [shift("d", "2026-11-10", d10.id), shift("e", "2026-11-11", d11.id), shift("f", "2026-11-11", undefined, "open" as ShiftSlot["status"])];
    const slots = [plan("p1", "2026-11-10", 200e6, "d"), plan("p2", "2026-11-11", 100e6, "e"), plan("p3", "2026-11-11", 100e6, "f")];
    const rr = planRunRate("2026-11", slots, shifts, sessions, "2026-11-12");
    const report = buildAccountRunRate(rr, rr.through, "2026-11-10");
    const base = { key: "vera|TikTok", brandId: "vera", brandName: "VERA", platform: "TikTok", name: "VERA", month: "2026-11", rr, bucketOf: (d: string) => resolveCampBucketType(d) };
    const range = { from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" };
    const live = buildWeeklyChannel({ card: { ...base, report } as unknown as ChannelCard, sessions, ...range });
    // 10/11: 200M; 11/11 chỉ ca 14h có số: 100M ⇒ mẫu số 300M (không phải 400M của cả hai ngày)
    expect(live.range.targetToDate).toBe(300e6);
    expect(live.range.actual).toBe(210e6);
    expect(live.range.targetToDate).toBe(report.total.targetToDate); // mẫu số run-rate vẫn khớp Dashboard "Tháng này" (không còn hiện ra ngoài)
    // % hiển thị = ÷ target tổng cả tháng (400M): 210 ÷ 400
    expect(live.range.target).toBe(400e6);
    expect(live.range.pct).toBeCloseTo(0.525, 5);
    expect(live.monthTotal.pct).toBeCloseTo(0.525, 5);
    expect(live.days.find((d) => d.date === "2026-11-11")!.pct).toBeCloseTo(0.3, 5); // 60M ÷ 200M target cả ngày
    // đợt/ngày thường cộng lại cũng đi theo mẫu số này
    expect(live.events.reduce((a, e) => a + e.targetToDate, 0) + live.daily.targetToDate).toBe(300e6);
    // không truyền report: rơi về luật cũ (target cả ngày)
    const legacy = buildWeeklyChannel({ card: base as unknown as ChannelCard, sessions, ...range });
    expect(legacy.range.targetToDate).toBe(400e6);
  });

  test("kênh chưa chốt kế hoạch: rơi về target của ca và ghi nguồn", () => {
    const { card, sessions } = fixture();
    const noPlan = { ...card, rr: null } as unknown as ChannelCard;
    const withTarget = sessions.map((s) => (s.date === "2026-11-02" ? { ...s, targetGmv: 100e6 } : s));
    const w = buildWeeklyChannel({ card: noPlan, sessions: withTarget, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    expect(w.targetSource).toBe("sessions");
    expect(w.range.targetToDate).toBe(100e6);
  });
});

describe("helpers", () => {
  test("paceLevel", () => {
    expect(paceLevel(1.02)).toBe("on");
    expect(paceLevel(0.85)).toBe("near");
    expect(paceLevel(0.5)).toBe("behind");
    expect(paceLevel(null)).toBe("none");
  });
  test("weeklyBounds cắt tuần theo tháng", () => {
    expect(weeklyBounds("week", "2026-11-02", isoWeekStart)).toEqual({ from: "2026-11-02", to: "2026-11-08", month: "2026-11" });
    expect(weeklyBounds("week", "2026-11-01", isoWeekStart)).toEqual({ from: "2026-11-01", to: "2026-11-01", month: "2026-11" });
    expect(weeklyBounds("week", "2026-11-30", isoWeekStart)).toEqual({ from: "2026-11-30", to: "2026-11-30", month: "2026-11" });
    expect(weeklyBounds("mtd", "2026-11-17", isoWeekStart)).toEqual({ from: "2026-11-01", to: "2026-11-30", month: "2026-11" });
  });
  test("prevRange cùng độ dài", () => {
    expect(prevRange("2026-11-09", "2026-11-15")).toEqual({ from: "2026-11-02", to: "2026-11-08" });
  });
  test("đi tuần lùi/tiến không bỏ ngày nào, kể cả tuần vắt hai tháng (01/11 là Chủ nhật của tuần 26/10)", () => {
    expect(shiftWeeklyAnchor("week", "2026-11-02", -1, isoWeekStart)).toBe("2026-11-01");
    expect(weeklyBounds("week", "2026-11-01", isoWeekStart)).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    expect(shiftWeeklyAnchor("week", "2026-11-01", -1, isoWeekStart)).toBe("2026-10-31");
    expect(shiftWeeklyAnchor("week", "2026-11-01", 1, isoWeekStart)).toBe("2026-11-02");
    // Đi hết tháng 11 từ trên xuống: các đoạn liền nhau, phủ đủ 30 ngày, không đoạn nào qua tháng khác.
    const seen: string[] = [];
    let anchor = "2026-11-01";
    for (let i = 0; i < 8; i++) {
      const b = weeklyBounds("week", anchor, isoWeekStart);
      expect(b.month).toBe("2026-11");
      seen.push(`${b.from}..${b.to}`);
      const nxt = shiftWeeklyAnchor("week", anchor, 1, isoWeekStart);
      if (nxt.slice(0, 7) !== "2026-11") break;
      anchor = nxt;
    }
    expect(seen).toEqual(["2026-11-01..2026-11-01", "2026-11-02..2026-11-08", "2026-11-09..2026-11-15", "2026-11-16..2026-11-22", "2026-11-23..2026-11-29", "2026-11-30..2026-11-30"]);
    expect(shiftWeeklyAnchor("mtd", "2026-11-17", -1, isoWeekStart)).toBe("2026-10-01");
    expect(shiftWeeklyAnchor("mtd", "2026-12-01", -1, isoWeekStart)).toBe("2026-11-01");
  });
  test("rollupChannels cộng cùng sàn và đếm mức", () => {
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    const r = rollupChannels([w, w]);
    expect(r.actual).toBe(780e6);
    expect(r.behind).toBe(2);
    expect(r.target).toBe(1500e6);
    expect(r.pct).toBeCloseTo(0.52, 5);
  });
});

describe("channelHeadline", () => {
  test("nêu % tới nay, đợt kéo xuống, ca xấu/tốt và ca chưa có số", async () => {
    const { channelHeadline } = await import("../src/lib/performance/weeklyReport");
    const { card, sessions } = fixture();
    const w = buildWeeklyChannel({ card, sessions, from: "2026-11-01", to: "2026-11-30", today: "2026-11-12" });
    const lines = channelHeadline(w);
    expect(lines[0]).toContain("52%");
    expect(lines[0]).toContain("target tổng");
    expect(lines[0]).not.toContain("tới nay");
    expect(lines.join("\n")).toMatch(/D-Day/);
    expect(lines.join("\n")).toMatch(/Ca đáng lưu ý nhất: .*20% target/);
    expect(lines.join("\n")).toMatch(/Ca tốt nhất: .*130% target/);
    expect(lines.join("\n")).toMatch(/1 ca đã qua chưa có số/);
  });
});
