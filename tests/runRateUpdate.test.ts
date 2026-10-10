// Module Run-rate (cập nhật cho sếp + brand): cắt planRunRate ở ngày "số tới", chia tháng/tuần/đợt/ngày/ca, soạn bản tin.
// Chạy: npx vitest run tests/runRateUpdate.test.ts
import { describe, expect, test } from "vitest";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { buildAccountRunRate, monthActualOf, resolveAsOf, runRateExportSheets, runRateVerdict } from "../src/lib/performance/runRateUpdate";
import type { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "Trợ 1", coHostName: "",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: gmv > 0 ? 5_000 : 0, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const shift = (id: string, date: string, sessionId?: string, status: ShiftSlot["status"] = "finalized"): ShiftSlot =>
  ({ id, date, startTime: "20:00", endTime: "23:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioName: "", notes: "", status, sessionId }) as ShiftSlot;
const planSlot = (id: string, date: string, target: number, slotId?: string): BrandMonthPlanSlot =>
  ({ id, planId: "p", date, startTime: "20:00", endTime: "23:00", targetGmv: target, expectedGmv: 0, slotId, note: "" });

// Ví dụ đã duyệt 28/09 (cùng tests/planRunRate.test.ts): 4 ca × 100M, ca ngày 04 huỷ, ca ngày 06 mở thêm ngoài plan.
// Ngày 02–03 là ngày thường, 05 cũng vậy; camp cố định của tháng 10 không rơi vào 02–06 (D-Day 8–10, Mid 13–15, Pay 23–25).
function example() {
  const s1 = ca("2026-10-02", 90e6), s2 = ca("2026-10-03", 90e6), s3 = ca("2026-10-04", 0, { status: "Cancelled" }), s4 = ca("2026-10-05", 90e6), s5 = ca("2026-10-06", 80e6);
  const shifts = [shift("a", "2026-10-02", s1.id), shift("b", "2026-10-03", s2.id), shift("c", "2026-10-04", s3.id, "cancelled"), shift("d", "2026-10-05", s4.id)];
  const plan = [planSlot("p1", "2026-10-02", 100e6, "a"), planSlot("p2", "2026-10-03", 100e6, "b"), planSlot("p3", "2026-10-04", 100e6, "c"), planSlot("p4", "2026-10-05", 100e6, "d"), planSlot("p5", "2026-10-12", 100e6)];
  return { sessions: [s1, s2, s3, s4, s5], shifts, plan };
}
const rrOf = (today = "2026-10-07") => {
  const { sessions, shifts, plan } = example();
  return planRunRate("2026-10", plan, shifts, sessions, today);
};

describe("buildAccountRunRate — cắt ở ngày số tới", () => {
  test("cắt ở ngày cuối có số trùng planRunRate: (270 + 80) ÷ 400 = 87,5%", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    expect(r.total.targetToDate).toBe(400e6);
    expect(r.total.actual).toBe(350e6);
    expect(r.total.runRate).toBeCloseTo(0.875);
    expect(r.total.target).toBe(500e6);
    expect(r.total.gap).toBe(-50e6);
  });

  test("lùi số tới về 03/10 thì chỉ tính 2 ngày đầu: 180 ÷ 200 = 90% và ca sau đó thành 'sắp tới'", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-03");
    expect(r.total.targetToDate).toBe(200e6);
    expect(r.total.actual).toBe(180e6);
    expect(r.total.runRate).toBeCloseTo(0.9);
    expect(r.days.find((d) => d.date === "2026-10-05")!.state).toBe("partial");
    expect(r.days.find((d) => d.date === "2026-10-05")!.counted).toBe(false);
    expect(r.days.find((d) => d.date === "2026-10-20")!.state).toBe("empty");
    expect(r.days.find((d) => d.date === "2026-10-12")!.state).toBe("future");
  });

  test("giữ nhịp = đạt + target còn lại × run-rate (cùng công thức planRunRate)", () => {
    const base = rrOf();
    const r = buildAccountRunRate(base, "2026-10-06");
    expect(r.total.keepPace).toBeCloseTo(base.total.keepPace!);
    expect(r.total.keepPacePct).toBeCloseTo(base.total.keepPace! / 500e6);
  });

  test("ca huỷ vẫn giữ target ở mẫu số; ca ngoài plan có số nhưng target 0", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    expect(r.cancelledCount).toBe(1);
    expect(r.days.find((d) => d.date === "2026-10-04")!.target).toBe(100e6);
    expect(r.days.find((d) => d.date === "2026-10-04")!.shifts).toBe(0);
    expect(r.offPlan).toHaveLength(1);
    expect(r.days.find((d) => d.date === "2026-10-06")!.actual).toBe(80e6);
    expect(r.days.find((d) => d.date === "2026-10-06")!.pctTarget).toBeNull();
  });

  test("tổng các tuần = tổng tháng, tổng các đợt = tổng tháng (không mất/trùng ngày)", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    expect(r.weeks.reduce((a, w) => a + w.target, 0)).toBe(r.total.target);
    expect(r.weeks.reduce((a, w) => a + w.actual, 0)).toBe(r.total.actual);
    expect(r.waves.reduce((a, w) => a + w.target, 0)).toBe(r.total.target);
    expect(r.waves.reduce((a, w) => a + w.actual, 0)).toBe(r.total.actual);
    expect(r.weeks.flatMap((w) => w.days)).toHaveLength(31);
  });

  test("đợt: D-Day 08–10/10 chưa tới ở số tới 06/10 ⇒ 'sắp tới'; ngày thường đang chạy", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    expect(r.waves.find((w) => w.bucket === "dday")?.status ?? "next").toBe("next");
    expect(r.waves.find((w) => w.bucket === "daily")!.status).toBe("live");
  });

  test("ca: giữ đủ ca kế hoạch theo thứ tự, ca huỷ có state cancelled, ca có số mang tên host + trợ", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    expect(r.shifts.map((s) => s.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-12"]);
    expect(r.shifts[2].state).toBe("cancelled");
    expect(r.shifts[0]).toMatchObject({ state: "done", hostName: "Host 1", assistantName: "Trợ 1", target: 100e6, actual: 90e6 });
    expect(r.shifts[0].pctTarget).toBeCloseTo(0.9);
  });

  test("đường lũy kế: thực tế dừng ở số tới, dự phóng nối tiếp từ đúng điểm đó", () => {
    const r = buildAccountRunRate(rrOf(), "2026-10-06");
    const at = (d: string) => r.cumulative.find((p) => p.date === d)!;
    expect(at("2026-10-06").actual).toBe(350e6);
    expect(at("2026-10-07").actual).toBeNull();
    expect(at("2026-10-06").projected).toBe(350e6);
    expect(at("2026-10-31").projected).toBeCloseTo(r.total.keepPace!);
    expect(at("2026-10-31").target).toBe(500e6);
  });

  test("tháng chưa có số: asOf null, run-rate null, không ném lỗi", () => {
    const { shifts, plan } = example();
    const r = buildAccountRunRate(planRunRate("2026-10", plan, shifts, [], "2026-10-07"), null);
    expect(r.asOf).toBeNull();
    expect(r.total.runRate).toBeNull();
    expect(r.total.keepPace).toBeNull();
    expect(r.total.target).toBe(500e6);
  });
});

describe("resolveAsOf", () => {
  test("kẹp trong [đầu tháng, ngày cuối có số]", () => {
    expect(resolveAsOf("2026-10", "2026-10-06", null, "2026-10-05")).toBe("2026-10-05");
    expect(resolveAsOf("2026-10", "2026-10-06", "2026-10-20", null)).toBe("2026-10-06");
    expect(resolveAsOf("2026-10", "2026-10-06", "2026-09-20", null)).toBe("2026-10-01");
    expect(resolveAsOf("2026-10", "2026-10-06", null, null)).toBe("2026-10-06");
    expect(resolveAsOf("2026-10", null, "2026-10-05", null)).toBeNull();
  });
});

describe("runRateVerdict — ngưỡng 85% / 95% dùng chung", () => {
  test("nhãn theo ngưỡng", () => {
    expect(runRateVerdict(null).label).toBe("Chưa có số");
    expect(runRateVerdict(1.2)).toEqual({ tone: "good", label: "Vượt tiến độ" });
    expect(runRateVerdict(0.95)).toEqual({ tone: "good", label: "Đúng tiến độ" });
    expect(runRateVerdict(0.9)).toEqual({ tone: "warn", label: "Hơi chậm" });
    expect(runRateVerdict(0.7)).toEqual({ tone: "bad", label: "Chậm tiến độ" });
  });
});

describe("monthActualOf", () => {
  test("cộng ca có số của MỘT kênh tới ngày chỉ định; từ chối mảng lẫn hai sàn", () => {
    const { sessions } = example();
    expect(monthActualOf(sessions, "2026-10", "2026-10-05")).toBe(270e6);
    expect(() => monthActualOf([...sessions, ca("2026-10-02", 1, { platform: "Shopee" })], "2026-10", "2026-10-05")).toThrow();
  });
});

describe("runRateExportSheets", () => {
  const report = buildAccountRunRate(rrOf(), "2026-10-06");

  test("4 sheet, mỗi dòng thuộc một tài khoản, không dòng tổng gộp", () => {
    const sheets = runRateExportSheets([
      { name: "CROCS", platform: "TikTok", report },
      { name: "JOCKEY · Shopee", platform: "Shopee", report: null, missing: "no_plan", actualOnly: 120e6 }
    ]);
    expect(sheets.map((s) => s.name)).toEqual(["Tổng quan", "Theo đợt", "Theo ngày", "Theo ca"]);
    const [overview, , , shifts] = sheets;
    expect(overview.rows).toHaveLength(2);
    expect(overview.rows[0]).toMatchObject({ "Tài khoản": "CROCS", "Số tới ngày": "2026-10-06", "Target tháng": 500e6, "Thực đạt": 350e6, "Run-rate (%)": 87.5 });
    expect(overview.rows[1]).toMatchObject({ "Tài khoản": "JOCKEY · Shopee", "Thực đạt": 120e6, "Run-rate (%)": "", "Ghi chú": "Chưa chốt Kế Hoạch Tháng" });
    expect(shifts.rows).toHaveLength(5);
    expect(shifts.rows.every((r) => r["Tài khoản"] === "CROCS")).toBe(true);
    expect(shifts.rows[2]["Trạng thái"]).toBe("Đã huỷ (giữ target)");
  });
});
