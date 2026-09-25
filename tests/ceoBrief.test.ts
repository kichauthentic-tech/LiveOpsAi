// Bản Tin CEO — các luật số của lib/performance/ceoBrief.ts.
// Chạy: npx vitest run tests/ceoBrief.test.ts
import { describe, expect, test } from "vitest";
import {
  buildIssues,
  change,
  combineOutlooks,
  financeOf,
  lastDataDate,
  monthColumns,
  monthOutlook,
  monthTargetOf,
  pairRows,
  periodFor,
  projectionRates,
  totalsOf
} from "../src/lib/performance/ceoBrief";
import { LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 5_000, ctrAvg: 0, cvrAvg: 0, productImpressions: 100_000, productClicks: 3_000,
    liveDurationMinutes: 180, skus: [], checklist: [], minuteMetrics: [], ...extra
  } as LiveSession;
}
const slot = (date: string, extra: Partial<ShiftSlot> = {}): ShiftSlot =>
  ({ id: `sl-${date}`, date, startTime: "20:00", endTime: "23:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioName: "", notes: "", status: "open", ...extra }) as ShiftSlot;

describe("periodFor — cắt theo ngày cuối có số", () => {
  test("tháng đang chạy, số về tới 22/09 ⇒ so với 22 ngày đầu tháng 8", () => {
    const p = periodFor("month", "2026-09-25", "2026-09-25", "2026-09-22");
    expect([p.start, p.end, p.prevStart, p.prevEnd, p.cutByData]).toEqual(["2026-09-01", "2026-09-22", "2026-08-01", "2026-08-22", true]);
  });
  test("tháng trước ngắn hơn ⇒ kẹp về cuối tháng trước", () => {
    const p = periodFor("month", "2026-03-31", "2026-03-31", "2026-03-31");
    expect([p.prevStart, p.prevEnd]).toEqual(["2026-02-01", "2026-02-28"]);
  });
  test("tuần: thứ Hai → ngày có số, so với cùng số ngày tuần trước", () => {
    const p = periodFor("week", "2026-09-24", "2026-09-25", "2026-09-22");
    expect([p.start, p.end, p.prevStart, p.prevEnd]).toEqual(["2026-09-21", "2026-09-22", "2026-09-14", "2026-09-15"]);
  });
  test("ngày: so với cùng thứ tuần trước, không bị cắt", () => {
    const p = periodFor("day", "2026-09-24", "2026-09-25", "2026-09-22");
    expect([p.start, p.end, p.prevStart, p.cutByData]).toEqual(["2026-09-24", "2026-09-24", "2026-09-17", false]);
  });
  test("tuỳ chọn: so với đúng số ngày liền trước", () => {
    const p = periodFor("custom", "2026-09-01", "2026-09-25", "2026-09-22", "2026-09-10");
    expect([p.start, p.end, p.prevStart, p.prevEnd]).toEqual(["2026-09-01", "2026-09-10", "2026-08-22", "2026-08-31"]);
  });
  test("tháng cũ đã hết ⇒ không bị cắt", () => {
    const p = periodFor("month", "2026-08-10", "2026-09-25", "2026-09-22");
    expect([p.end, p.cutByData]).toEqual(["2026-08-31", false]);
  });
});

describe("totalsOf / change", () => {
  test("bỏ ca chưa có số và ca huỷ; tỷ lệ tính lại từ tổng", () => {
    const t = totalsOf([ca("2026-09-01"), ca("2026-09-02", { actualGmv: 0, totalViews: 0 }), ca("2026-09-03", { status: "Cancelled" }), ca("2026-09-04", { actualGmv: 10_000_000, totalOrders: 10, totalViews: 5_000 })]);
    expect(t.sessions).toBe(2);
    expect(t.gmv).toBe(40_000_000);
    expect(t.gmvPerHour).toBeCloseTo(40_000_000 / 6);
    expect(t.buyRate).toBeCloseTo(40 / 10_000);
  });
  test("kỳ trước = 0 ⇒ null, không phải 0% hay ∞", () => {
    expect(change(5, 0)).toBeNull();
    expect(change(null, 3)).toBeNull();
    expect(change(80, 100)).toBeCloseTo(-0.2);
  });
  test("lastDataDate bỏ ca tương lai và ca không có số", () => {
    expect(lastDataDate([ca("2026-09-20"), ca("2026-09-22"), ca("2026-09-24", { actualGmv: 0, totalViews: 0 }), ca("2026-09-30")], "2026-09-25")).toBe("2026-09-22");
  });
});

describe("monthTargetOf", () => {
  test("kế hoạch chốt: target rơi đúng ngày ca, phần chưa gắn ngày chia đều", () => {
    const t = monthTargetOf("2026-09", 300, [{ date: "2026-09-09", target: 100 }, { date: "2026-09-15", target: 170 }], null, undefined)!;
    expect(t.source).toBe("locked_plan");
    expect(t.byDate.get("2026-09-09")).toBeCloseTo(101);
    expect([...t.byDate.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(300);
  });
  test("Report Tháng: target khung chia đều các ngày của khung", () => {
    const t = monthTargetOf("2026-09", undefined, [], { brandId: "crocs", month: "2026-09", byBucket: { dday: 300, midmonth: 300, payday: 300, daily: 2100 }, camp: {}, source: "plan_pct" }, undefined)!;
    expect(t.byDate.get("2026-09-08")).toBeCloseTo(100); // D-Day 7–9
    expect(t.byDate.get("2026-09-02")).toBeCloseTo(100); // 21 ngày thường
    expect(t.total).toBe(3000);
  });
  test("không có gì ⇒ null", () => {
    expect(monthTargetOf("2026-09", undefined, [], null, undefined)).toBeNull();
  });
});

describe("monthOutlook — dự phóng theo lịch", () => {
  const hist = [ca("2026-09-01"), ca("2026-09-02"), ca("2026-09-03")]; // ngày thường, 10tr/giờ theo giờ ca
  test("doanh số/giờ lấy theo giờ ca kế hoạch", () => {
    expect(projectionRates(hist, "2026-09-03")).toEqual({ camp: 10_000_000, daily: 10_000_000 });
  });
  test("dự phóng = đã có + giờ ca còn lại × doanh số/giờ; ca huỷ không tính", () => {
    const future = [ca("2026-09-20", { status: "Upcoming", actualGmv: 0, totalViews: 0 }), ca("2026-09-21", { status: "Cancelled", actualGmv: 0, totalViews: 0 })];
    const o = monthOutlook("2026-09", "2026-09-10", [...hist, ...future], [], null, undefined);
    expect(o.actual).toBe(90_000_000);
    expect(o.projected).toBe(120_000_000);
  });
  test("thêm ca mở (chưa có người) ⇒ dự phóng tăng ngay", () => {
    const before = monthOutlook("2026-09", "2026-09-10", hist, [], null, undefined).projected;
    const after = monthOutlook("2026-09", "2026-09-10", hist, [slot("2026-09-18"), slot("2026-09-19", { sessionId: "x" }), slot("2026-09-05")], null, undefined).projected;
    expect(after - before).toBe(30_000_000); // chỉ ca mở chưa gắn session, không ở quá khứ
  });
  test("ca đã chạy mà chưa có số vẫn được chiếu, không bị coi là 0", () => {
    const o = monthOutlook("2026-09", "2026-09-10", [...hist, ca("2026-09-08", { actualGmv: 0, totalViews: 0 })], [], null, undefined);
    expect(o.pending.map((p) => p.date)).toEqual(["2026-09-08"]);
    expect(o.projected).toBe(120_000_000);
  });
  test("run-rate so với target TỚI NGÀY CÓ SỐ, không tới hôm nay", () => {
    const target = monthTargetOf("2026-09", 300_000_000, [], null, undefined)!; // 10tr/ngày
    const o = monthOutlook("2026-09", "2026-09-10", hist, [], target, undefined);
    expect(o.through).toBe("2026-09-03");
    expect(o.expectedToDate).toBeCloseTo(30_000_000);
    expect(o.runRate).toBeCloseTo(3);
    expect(o.remainingDays).toBe(21); // 10 → 30, tính cả hôm nay
  });
  test("gộp brand: run-rate chỉ trên brand có target", () => {
    const target = monthTargetOf("2026-09", 300_000_000, [], null, undefined)!;
    const a = monthOutlook("2026-09", "2026-09-10", hist, [], target, undefined);
    const b = monthOutlook("2026-09", "2026-09-10", hist.map((s) => ({ ...s, brandId: "vera" })), [], null, undefined);
    const all = combineOutlooks("2026-09", "2026-09-10", [a, b]);
    expect(all.actual).toBe(180_000_000);
    expect(all.runRate).toBeCloseTo(a.runRate!);
  });
});

describe("financeOf", () => {
  test("chỉ cộng ca đủ dữ liệu; ngày còn ca thiếu không kết luận lãi/lỗ", () => {
    const s = [ca("2026-09-01"), ca("2026-09-01", { hostId: "" }), ca("2026-09-02"), ca("2026-09-03", { actualGmv: 1_000_000 })];
    const f = financeOf(s, (x) => (x.hostId ? { revenue: x.actualGmv * 0.1, cost: 2_000_000, profit: x.actualGmv * 0.1 - 2_000_000, missing: [] } : { revenue: 0, cost: 0, profit: 0, missing: ["host_rate"] }));
    expect([f.sessions, f.priced, f.profitableSessions]).toEqual([4, 3, 2]);
    expect([f.days, f.profitableDays]).toEqual([2, 1]);
    expect(f.missing.get("host_rate")).toBe(1);
  });
});

describe("pairRows / monthColumns", () => {
  test("cặp dưới 3 ca không xếp hạng", () => {
    const s = [ca("2026-09-01"), ca("2026-09-02"), ca("2026-09-03"), ca("2026-09-04", { coHostId: "a2", coHostName: "Trợ 2" })];
    expect(pairRows(s).map((p) => p.assistant)).toEqual(["Trợ 1"]);
  });
  test("tháng đang chạy cộng tới ngày có số", () => {
    const cols = monthColumns([ca("2026-08-20"), ca("2026-09-02")], "2026-09", 2, "2026-09-22");
    expect(cols.map((c) => [c.month, c.partial, c.totals.sessions])).toEqual([["2026-08", false, 1], ["2026-09", true, 1]]);
  });
});

describe("buildIssues", () => {
  const fmt = (v: number) => `${Math.round(v / 1e6)}tr`;
  test("báo ca đã chạy chưa có số, tập trung khách, brand chưa chạy, tháng sau chưa chốt", () => {
    const crocs = monthOutlook("2026-09", "2026-09-25", [ca("2026-09-20"), ca("2026-09-23", { actualGmv: 0, totalViews: 0 })], [], null, undefined);
    const vera = monthOutlook("2026-09", "2026-09-25", [], [], null, undefined);
    const issues = buildIssues({
      today: "2026-09-25",
      brands: [
        { brandId: "crocs", name: "CROCS", outlook: crocs, lastData: "2026-09-20", nextPlan: "draft" },
        { brandId: "vera", name: "VERA", outlook: vera, lastData: null, nextPlan: null }
      ],
      periodSessions: [ca("2026-09-20")],
      finance: null,
      agencyScope: true,
      fmt
    });
    const titles = issues.map((i) => i.title);
    expect(titles).toContain("CROCS: 1 ca đã chạy chưa có số");
    expect(titles).toContain("100% doanh số tháng đến từ một khách: CROCS");
    expect(titles).toContain("VERA chưa có ca nào tháng 9");
    expect(titles.some((t) => t.startsWith("Tháng sau chưa chốt kế hoạch: CROCS (nháp), VERA"))).toBe(true);
    expect(issues[0].level).toBe("bad");
  });
});
