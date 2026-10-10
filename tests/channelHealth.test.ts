// Dashboard làm lại đợt 1 (10/10/2026) — luật của lib/performance/channelHealth.ts.
// Chạy: npx vitest run tests/channelHealth.test.ts
import { describe, expect, test } from "vitest";
import {
  channelVerdict,
  COMPLETE_DAY_SHARE,
  dataCoverage,
  dataDiscipline,
  gmvTree,
  likeForLike,
  matchedPrevDays,
  nextWaveReadiness,
  peopleLoad,
  runRateByWave,
  runRateThrough,
  runRateTone,
  targetFeasibility,
  TARGET_HIGH_RATIO
} from "../src/lib/performance/channelHealth";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { profileOf } from "../src/lib/platforms/profiles";
import { METRIC } from "../src/lib/metricGlossary";
import type { BrandMonthPlanSlot, LiveSession } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed", dataSource: "tiktok_reconciled",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 6_000, ctrAvg: 0, cvrAvg: 0, productImpressions: 100_000, productClicks: 3_000,
    liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
/** Ca đã chạy nhưng chưa có số (chưa up file, chưa đối soát). */
const noData = (date: string, extra: Partial<LiveSession> = {}) => ca(date, { actualGmv: 0, totalViews: 0, totalOrders: 0, dataSource: "manual", ...extra });
const fixed = (d: string) => resolveCampBucketType(d);

describe("dataCoverage — ngày đủ số (≥ 90% giờ ca có số)", () => {
  test("ngày 09/10 mới 6/21 ca có số ⇒ đủ số tới 08/10, không phải 09/10", () => {
    const xs = [
      ...Array.from({ length: 14 }, () => ca("2026-10-08")),
      ...Array.from({ length: 6 }, () => ca("2026-10-09")),
      ...Array.from({ length: 15 }, () => noData("2026-10-09"))
    ];
    const c = dataCoverage(xs, "2026-10-10");
    expect(c.lastAny).toBe("2026-10-09");
    expect(c.completeThrough).toBe("2026-10-08");
    expect(c.missingSessions).toBe(15);
    expect(c.oldestMissing).toBe("2026-10-09");
  });
  test("đúng ngưỡng 90% thì đủ; dưới thì không", () => {
    expect(COMPLETE_DAY_SHARE).toBe(0.9);
    const nine = [...Array.from({ length: 9 }, () => ca("2026-10-05")), noData("2026-10-05")];
    // 06–09/10 không có ca ⇒ không có gì để chờ: đủ tới hôm qua.
    expect(dataCoverage(nine, "2026-10-10").completeThrough).toBe("2026-10-09");
    const eight = [...Array.from({ length: 8 }, () => ca("2026-10-06")), noData("2026-10-06"), noData("2026-10-06")];
    expect(dataCoverage(eight, "2026-10-10").completeThrough).toBeNull();
  });
  test("hôm nay không bao giờ là ngày đủ số; ca huỷ không tính", () => {
    const xs = [ca("2026-10-09"), ca("2026-10-10"), noData("2026-10-09", { status: "Cancelled" })];
    const c = dataCoverage(xs, "2026-10-10");
    expect(c.completeThrough).toBe("2026-10-09");
    expect(c.missingSessions).toBe(0);
  });
  test("ngày thiếu số nằm trước mốc được liệt kê để nói số còn tạm", () => {
    const xs = [ca("2026-10-03"), noData("2026-10-03"), ca("2026-10-04"), noData("2026-10-07")];
    const c = dataCoverage(xs, "2026-10-10");
    expect(c.completeThrough).toBe("2026-10-06");
    expect(c.partialBefore).toEqual(["2026-10-03"]);
  });
  test("ngày trống không kéo lùi mốc: đủ 04/10, không ca 05–08/10, 09/10 chờ số ⇒ đủ tới 08/10", () => {
    const xs = [ca("2026-10-04"), noData("2026-10-09")];
    const c = dataCoverage(xs, "2026-10-10");
    expect(c.completeThrough).toBe("2026-10-08");
    expect(dataDiscipline({ coverage: c, today: "2026-10-10", monthSessions: xs }).lagDays).toBe(1);
  });
});

describe("matchedPrevDays / likeForLike — so cùng loại ngày", () => {
  test("01–09/10 ↔ ngày thường thứ k và D-Day cùng vị trí của tháng 9", () => {
    const days = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    const m = matchedPrevDays(days, fixed, fixed);
    // Ngày thường tháng 9: 01–06 rồi 10… (07–09/09 là D-Day) ⇒ 07/10 (ngày thường thứ 7) ↔ 10/09.
    expect(m.get("2026-10-01")).toBe("2026-09-01");
    expect(m.get("2026-10-07")).toBe("2026-09-10");
    // D-Day lịch cố định 08–10/10 ↔ 07–09/09, cùng vị trí.
    expect(m.get("2026-10-08")).toBe("2026-09-07");
    expect(m.get("2026-10-09")).toBe("2026-09-08");
  });
  test("khung D-Day nới 4 ngày theo kế hoạch: ngày thứ 4 không có cặp (không bịa)", () => {
    const camp = { dday: { start: "2026-10-08", end: "2026-10-11" } };
    const cur = (d: string) => resolveCampBucketType(d, camp);
    const m = matchedPrevDays(["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"], cur, fixed);
    expect([...m.entries()]).toEqual([["2026-10-08", "2026-09-07"], ["2026-10-09", "2026-09-08"], ["2026-10-10", "2026-09-09"]]);
  });
  test("tháng trước có trọn D-Day, tháng này D-Day còn dở ⇒ so theo lịch lệch, cùng loại ngày thì không", () => {
    // Ngày thường cả hai tháng 10M/giờ; D-Day tháng 9 đủ 3 ngày 30M/giờ; tháng 10 mới có ngày D-Day đầu.
    const sep = [
      ...["01", "02", "03", "04", "05", "06", "10"].map((d) => ca(`2026-09-${d}`, { actualGmv: 30_000_000 })),
      ...["07", "08", "09"].map((d) => ca(`2026-09-${d}`, { actualGmv: 90_000_000 }))
    ];
    const oct = [...["01", "02", "03", "04", "05", "06", "07"].map((d) => ca(`2026-10-${d}`, { actualGmv: 30_000_000 })), ca("2026-10-08", { actualGmv: 90_000_000 })];
    const all = [...sep, ...oct];
    const l = likeForLike(all, "2026-10", "2026-10-08", fixed);
    const gmv = (xs: LiveSession[]) => xs.reduce((a, s) => a + s.actualGmv, 0);
    // Theo lịch 01–08/10 vs 01–08/09: 300M vs 360M = −17%. Cùng loại ngày: 7 ngày thường + D-Day ngày 1 cả hai vế ⇒ bằng nhau.
    expect(gmv(l.cur)).toBe(gmv(l.prev));
    expect(l.prev.map((s) => s.date)).not.toContain("2026-09-08");
  });
});

describe("gmvTree — cây GMV/giờ cùng loại ngày", () => {
  const prof = profileOf("TikTok");
  test("lượt xem/giờ giảm 25% còn chuyển đổi giữ ⇒ nhánh tệ nhất là Views/giờ, GMV/giờ −25%", () => {
    const sep = ["01", "02", "03", "04"].map((d) => ca(`2026-09-${d}`, { actualGmv: 40_000_000, totalViews: 8_000, productClicks: 4_000, totalOrders: 40 }));
    const oct = ["01", "02", "03", "04"].map((d) => ca(`2026-10-${d}`, { actualGmv: 30_000_000, totalViews: 6_000, productClicks: 3_000, totalOrders: 30 }));
    const t = gmvTree(prof.metrics, likeForLike([...sep, ...oct], "2026-10", "2026-10-04", fixed, fixed, (b) => b === "daily"))!;
    expect(t.gmvPerHour.change).toBeCloseTo(-0.25, 5);
    expect(t.worst?.label).toBe(METRIC.viewsPerHour);
    expect(t.parts.map((p) => p.label)).not.toContain(METRIC.liveHours);
  });
  test("dưới 3 ca một vế ⇒ không kết luận", () => {
    const xs = [ca("2026-09-01"), ca("2026-09-02"), ca("2026-10-01"), ca("2026-10-02"), ca("2026-10-03")];
    expect(gmvTree(prof.metrics, likeForLike(xs, "2026-10", "2026-10-03", fixed, fixed, (b) => b === "daily"))).toBeNull();
  });
});

describe("targetFeasibility — target lúc chốt so với 28 ngày trước tháng", () => {
  test("VERA Shopee kiểu 10/10: cần ×1,5 lịch sử ⇒ vượt ngưỡng 1,3", () => {
    // 28 ngày trước tháng: 10 ca × 3h × 3,9M/giờ.
    const hist = Array.from({ length: 10 }, (_, i) => ca(`2026-09-${String(10 + i).padStart(2, "0")}`, { actualGmv: 3 * 3_900_000 }));
    const plan = Array.from({ length: 10 }, () => ({ startTime: "20:00", endTime: "23:00", targetGmv: 3 * 5_850_000 }));
    const f = targetFeasibility(hist, "2026-10", plan)!;
    expect(f.need).toBeCloseTo(5_850_000, 0);
    expect(f.trailing).toBeCloseTo(3_900_000, 0);
    expect(f.ratio).toBeCloseTo(1.5, 5);
    expect(f.ratio!).toBeGreaterThan(TARGET_HIGH_RATIO);
  });
  test("kênh mới (chưa đủ 5 ca trong 28 ngày) ⇒ chưa có tỷ số", () => {
    const f = targetFeasibility([ca("2026-09-30")], "2026-10", [{ startTime: "20:00", endTime: "22:00", targetGmv: 10_000_000 }])!;
    expect(f.trailing).toBeNull();
    expect(f.ratio).toBeNull();
  });
});

describe("nextWaveReadiness — đợt camp kế tiếp", () => {
  test("D-Day đang chạy tới 10/10 thì đợt kế tiếp hôm 10/10 vẫn là D-Day", () => {
    expect(nextWaveReadiness([], new Map(), "2026-10", "2026-10-10", fixed)?.bucket).toBe("dday");
  });
  test("Mid-Month 13–15/10 mới xếp 9 giờ, mọi khi 15 giờ; tính cả ca mở", () => {
    const hist = ["07", "08", "09"].flatMap((m) => ["13", "14", "15"].map((d) => ca(`2026-${m}-${d}`, { startTime: "18:00", endTime: "23:00" })));
    const cur = [ca("2026-10-13", { status: "Upcoming", actualGmv: 0, coHostId: "", coHostName: "" }), ca("2026-10-14", { status: "Upcoming", actualGmv: 0 })];
    const w = nextWaveReadiness([...hist, ...cur], new Map([["2026-10-15", 3]]), "2026-10", "2026-10-11", fixed)!;
    expect(w.bucket).toBe("midmonth");
    expect(w.status).toBe("next");
    expect(w.scheduledHours).toBe(9);
    expect(w.usualHours).toBe(15);
    expect(w.noAssistant).toBe(1);
  });
});

describe("channelVerdict — một kết luận + nguyên nhân gốc theo thứ tự", () => {
  test("số chưa về đứng trước target cao; nhãn theo khả năng đạt", () => {
    const sessions = [
      ...Array.from({ length: 10 }, (_, i) => ca(`2026-09-${String(10 + i).padStart(2, "0")}`, { actualGmv: 3 * 3_900_000 })),
      ca("2026-10-01", { actualGmv: 3 * 3_000_000 }),
      noData("2026-10-02"),
      ca("2026-10-20", { status: "Upcoming", actualGmv: 0, totalViews: 0, dataSource: "manual" })
    ];
    const target = monthTargetOf("2026-10", 60_000_000, [{ date: "2026-10-01", target: 20_000_000 }, { date: "2026-10-02", target: 20_000_000 }, { date: "2026-10-20", target: 20_000_000 }]);
    const o = monthOutlook("2026-10", "2026-10-10", sessions, [], target, undefined);
    const coverage = dataCoverage(sessions, "2026-10-10");
    const feas = targetFeasibility(sessions, "2026-10", [1, 2, 3].map(() => ({ startTime: "20:00", endTime: "23:00", targetGmv: 20_000_000 })));
    const v = channelVerdict({ outlook: o, coverage, feasibility: feas, tree: null, wave: null, today: "2026-10-10" });
    expect(v.causes.map((c) => c.key)).toEqual(["data", "target_high"]);
    expect(v.label).toBeTruthy();
    // Run-rate tới ngày đủ số (01/10): 9M ÷ 20M.
    expect(v.runRate).toBeCloseTo(0.45, 5);
  });
  test("số chưa về nhỏ (< 5% dự phóng) xuống cuối, không che nguyên nhân năng suất", () => {
    const hist = Array.from({ length: 20 }, (_, i) => ca(`2026-09-${String(5 + i).padStart(2, "0")}`, { actualGmv: 30_000_000 }));
    const oct = [...Array.from({ length: 25 }, (_, i) => ca(`2026-10-${String(1 + (i % 8)).padStart(2, "0")}`, { actualGmv: 15_000_000 })), noData("2026-10-08"), ca("2026-10-20", { status: "Upcoming", actualGmv: 0, totalViews: 0, dataSource: "manual" })];
    const o = monthOutlook("2026-10", "2026-10-10", [...hist, ...oct], [], null, undefined);
    const tree = { gmvPerHour: { cur: 5e6, prev: 1e7, change: -0.5 }, parts: [], worst: null, curSessions: 10, prevSessions: 10, curDays: 7 };
    const v = channelVerdict({ outlook: o, coverage: dataCoverage(oct, "2026-10-10"), feasibility: null, tree, wave: null, today: "2026-10-10" });
    expect(v.causes.map((c) => c.key)).toEqual(["productivity_down", "data"]);
    expect(v.causes[1].tone).toBe("info");
  });
  test("runRateThrough cắt ở ngày đủ số, không ở ngày cuối có số", () => {
    const o = { target: { total: 40, byDate: new Map([["2026-10-08", 20], ["2026-10-09", 20]]) }, actualByDate: new Map([["2026-10-08", 20], ["2026-10-09", 2]]) };
    expect(runRateThrough(o, "2026-10-08").runRate).toBe(1);
    expect(runRateThrough(o, "2026-10-09").runRate).toBeCloseTo(0.55, 5);
  });
});

describe("dataDiscipline", () => {
  test("cam kết giờ = 550.000.000 (gõ GMV vào ô giờ) bị bắt; target tháng ≠ tổng ca bị bắt", () => {
    const r = dataDiscipline({ coverage: dataCoverage([ca("2026-10-08")], "2026-10-10"), today: "2026-10-10", monthSessions: [ca("2026-10-08"), ca("2026-10-08", { dataSource: "manual" })], commitmentHours: 550_000_000, planTarget: 100_000_000, planSlotSum: 90_000_000 });
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/550\.000\.000 giờ/);
    expect(r.lagDays).toBe(0);
    expect(r.manualShare).toBe(0.5);
  });
});

describe("runRateByWave — tháng + từng đợt, cắt ở ngày đủ số, cùng luật planRunRate", () => {
  // Chuyển từ tests/runRateLadder.test.ts (thang cũ đã bỏ 10/10): 8–10/10 là D-Day theo lịch cố định.
  const targets: Record<string, number> = { "2026-10-06": 40_000_000, "2026-10-07": 40_000_000, "2026-10-08": 40_000_000, "2026-10-09": 60_000_000, "2026-10-10": 60_000_000, "2026-10-13": 50_000_000 };
  const gmvOf: Record<string, number> = { "2026-10-06": 40_000_000, "2026-10-07": 50_000_000, "2026-10-08": 20_000_000 };
  const build = () => {
    const sessions = Object.keys(gmvOf).map((d) => ca(d, { actualGmv: gmvOf[d] }));
    sessions.push(ca("2026-10-09", { status: "Upcoming", actualGmv: 0, totalViews: 0, totalOrders: 0, dataSource: "manual" }));
    const slotTargets = Object.entries(targets).map(([date, target]) => ({ date, target }));
    const target = monthTargetOf("2026-10", Object.values(targets).reduce((a, b) => a + b, 0), slotTargets);
    return { o: monthOutlook("2026-10", "2026-10-09", sessions, [], target, undefined), sessions, slotTargets };
  };
  const planSlot = (date: string, targetGmv: number) => ({ id: `ps-${date}`, planId: "p1", date, startTime: "20:00", endTime: "23:00", targetGmv, expectedGmv: 0, note: "" }) as BrandMonthPlanSlot;

  test("không target ⇒ rỗng", () => {
    expect(runRateByWave(monthOutlook("2026-10", "2026-10-09", [ca("2026-10-06")], [], null, undefined), "2026-10-06")).toEqual([]);
  });
  test("hàng tháng cắt ở ngày cuối có số = planRunRate", () => {
    const { o, sessions, slotTargets } = build();
    const [month] = runRateByWave(o, "2026-10-08");
    expect(month.actual).toBe(110_000_000);
    expect(month.targetToDate).toBe(120_000_000);
    const rr = planRunRate("2026-10", slotTargets.map((t) => planSlot(t.date, t.target)), [], sessions, "2026-10-09");
    expect(rr.total.runRate).toBeCloseTo(month.runRate!, 9);
    expect(rr.total.targetToDate).toBe(month.targetToDate);
  });
  test("đợt: D-Day đang chạy 1/3 ngày, Mid-Month sắp tới chỉ có target", () => {
    const { o } = build();
    const rows = runRateByWave(o, "2026-10-08");
    const dd = rows.find((r) => r.key === "dday")!;
    expect([dd.state, dd.actual, dd.targetToDate]).toEqual(["live", 20_000_000, 40_000_000]);
    const mid = rows.find((r) => r.key === "midmonth")!;
    expect([mid.state, mid.target]).toEqual(["next", 50_000_000]);
    expect(rows.find((r) => r.key === "daily")!.actual).toBe(90_000_000);
  });
  test("ngày đủ số lùi về 07/10 thì 08/10 chưa vào mẫu số lẫn tử số", () => {
    const { o } = build();
    const [month] = runRateByWave(o, "2026-10-07");
    expect([month.actual, month.targetToDate]).toEqual([90_000_000, 80_000_000]);
  });
  test("runRateTone: ngưỡng 85% / 95%", () => {
    expect([runRateTone(null), runRateTone(0.84), runRateTone(0.85), runRateTone(0.949), runRateTone(0.95)]).toEqual(["none", "bad", "warn", "warn", "good"]);
  });
});

describe("peopleLoad — giờ người theo đoạn, cả hai sàn", () => {
  test("đổi host giữa ca chia đúng phút; ngày quá 6 giờ và tuần nặng nhất", () => {
    const xs = [
      ca("2026-10-05", { platform: "TikTok", startTime: "09:00", endTime: "13:00", hostId: "A", hostName: "A", coHostId: "B", coHostName: "B" }),
      ca("2026-10-05", { platform: "Shopee", startTime: "14:00", endTime: "18:00", hostId: "A", hostName: "A", coHostId: "", coHostName: "",
        staffSegments: [{ talentId: "A", talentName: "A", role: "host", fromMin: 0, toMin: 120 }, { talentId: "C", talentName: "C", role: "host", fromMin: 120, toMin: 240 }] }),
      ca("2026-10-06", { status: "Cancelled", hostId: "A", hostName: "A" })
    ];
    const rows = peopleLoad(xs, "2026-10-01", "2026-10-31", (s) => s.platform, 5);
    const a = rows.find((r) => r.talentId === "A")!;
    expect([a.hostHours, a.assistantHours, a.heavyDays]).toEqual([6, 0, 1]);
    expect(a.peakWeek).toEqual({ start: "2026-10-05", hours: 6 });
    expect(a.channels).toEqual(["Shopee", "TikTok"]);
    expect(rows.find((r) => r.talentId === "C")!.hostHours).toBe(2);
    expect(rows.find((r) => r.talentId === "B")!.assistantHours).toBe(4);
  });
});
