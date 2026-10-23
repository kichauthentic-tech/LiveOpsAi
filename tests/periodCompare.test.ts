// So cùng kỳ của Dashboard (demo duyệt 22/10/2026) — luật của lib/performance/periodCompare.ts.
// Chạy: npx vitest run tests/periodCompare.test.ts
import { describe, expect, test } from "vitest";
import {
  aggregate,
  coRows,
  hostRows,
  indexBy,
  isWeak,
  lateMinutes,
  pairRows,
  LATE_MAX_MIN,
  ranIn,
  resolvePeriod,
  shiftLenOf,
  shiftMonth,
  slotOf
} from "../src/lib/performance/periodCompare";
import type { LiveSession } from "../src/types";

let seq = 0;
function ca(date: string, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostId: "a1", coHostName: "Trợ 1",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed", dataSource: "tiktok_reconciled",
    targetGmv: 0, actualGmv: 30_000_000, totalOrders: 30, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 6_000, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
/** Giờ lên sóng thật (giờ VN) của ca 20:00 ngày `date`, trễ `min` phút. */
const startedLate = (date: string, min: number) => new Date(Date.parse(`${date}T20:00:00+07:00`) + min * 60000).toISOString();

describe("resolvePeriod", () => {
  test("Tháng này: 01 → ngày đủ số, so cùng các ngày tháng trước", () => {
    const p = resolvePeriod({ key: "month", mode: "auto", completeEnd: "2026-10-18", today: "2026-10-22" });
    expect(p).toMatchObject({ start: "2026-10-01", end: "2026-10-18", prevStart: "2026-09-01", prevEnd: "2026-09-18", mode: "mom", isCurrentMonth: true });
  });
  test("Tháng trước: cả tháng, so cả tháng trước nữa", () => {
    const p = resolvePeriod({ key: "prev", mode: "auto", completeEnd: "2026-10-18", today: "2026-10-22" });
    expect(p).toMatchObject({ start: "2026-09-01", end: "2026-09-30", prevStart: "2026-08-01", prevEnd: "2026-08-31", isCurrentMonth: false });
  });
  test("7 ngày: so khoảng 7 ngày ngay trước", () => {
    const p = resolvePeriod({ key: "7d", mode: "auto", completeEnd: "2026-10-18", today: "2026-10-22" });
    expect(p).toMatchObject({ start: "2026-10-12", end: "2026-10-18", prevStart: "2026-10-05", prevEnd: "2026-10-11", mode: "prev" });
  });
  test("Tự chọn vượt ngày đủ số ⇒ cắt, đánh dấu cut; kỳ so sánh trước ngày đầu có dữ liệu ⇒ noBase", () => {
    const p = resolvePeriod({ key: "custom", mode: "auto", completeEnd: "2026-10-18", today: "2026-10-22", custom: { start: "2026-10-10", end: "2026-10-30" }, first: "2026-06-01" });
    expect([p.start, p.end, p.cut]).toEqual(["2026-10-10", "2026-10-18", true]);
    const q = resolvePeriod({ key: "custom", mode: "auto", completeEnd: "2026-10-18", today: "2026-10-22", custom: { start: "2026-06-01", end: "2026-06-20" }, first: "2026-06-01" });
    expect(q.noBase).toBe(true);
  });
  test("ép so tháng trước cho 7 ngày", () => {
    const p = resolvePeriod({ key: "7d", mode: "mom", completeEnd: "2026-10-18", today: "2026-10-22" });
    expect([p.prevStart, p.prevEnd]).toEqual(["2026-09-12", "2026-09-18"]);
  });
  test("shiftMonth giữ ngày cuối tháng", () => {
    expect(shiftMonth("2026-10-31", -1)).toBe("2026-09-30");
    expect(shiftMonth("2026-03-31", -1)).toBe("2026-02-28");
  });
});

describe("aggregate", () => {
  test("GMV/giờ chỉ trên ca có số; giờ gồm cả ca chưa có số; trễ > 3 tiếng đếm riêng", () => {
    const xs = [
      ca("2026-10-01", { actualStartAt: startedLate("2026-10-01", 2) }),
      ca("2026-10-02", { actualStartAt: startedLate("2026-10-02", 12) }),
      ca("2026-10-03", { actualGmv: 0, totalViews: 0, totalOrders: 0, dataSource: "manual" }),
      ca("2026-10-04", { actualStartAt: startedLate("2026-10-04", LATE_MAX_MIN + 400) })
    ];
    const a = aggregate(ranIn(xs, "2026-10-01", "2026-10-31"));
    expect(a.n).toBe(4);
    expect(a.noData).toBe(1);
    expect(a.hours).toBe(12);
    expect(a.gph).toBe(10_000_000);
    expect(a.lateMeasured).toBe(2);
    expect(a.late).toBe(1);
    expect(a.lateOdd).toBe(1);
    expect(a.lateRate).toBe(0.5);
    expect(a.people).toBe(2);
  });
  test("lateMinutes theo giờ VN", () => {
    expect(lateMinutes(ca("2026-10-01", { actualStartAt: startedLate("2026-10-01", 7) }))).toBe(7);
    expect(lateMinutes(ca("2026-10-01"))).toBeNull();
  });
  test("isWeak: dưới 5 ca một bên", () => {
    expect(isWeak({ n: 5 }, { n: 5 })).toBe(false);
    expect(isWeak({ n: 4 }, { n: 9 })).toBe(true);
    expect(isWeak({ n: 9 }, null)).toBe(true);
  });
});

describe("chỉ số so với chính kênh", () => {
  // Kênh to (CROCS 20M/giờ, ca dài) + kênh nhỏ (VERA 2M/giờ, ca ngắn). Chia cho trung bình sàn thì ca dài "giỏi" gấp mấy lần chỉ vì
  // toàn là CROCS; chia cho chính kênh thì cả hai nhóm = 100.
  const big = [1, 2, 3].map((d) => ca(`2026-10-0${d}`, { brandId: "crocs", startTime: "18:00", endTime: "23:00", liveDurationMinutes: 300, actualGmv: 100_000_000 }));
  const small = [1, 2, 3].map((d) => ca(`2026-10-0${d}`, { brandId: "vera", startTime: "10:00", endTime: "12:00", liveDurationMinutes: 120, actualGmv: 4_000_000 }));
  test("độ dài ca không bị cơ cấu brand làm lệch", () => {
    const m = indexBy([...big, ...small], shiftLenOf);
    expect(m.get(3)?.index).toBe(100);
    expect(m.get(0)?.index).toBe(100);
  });
  test("khung giờ bắt đầu", () => {
    expect(slotOf(big[0])).toBe(5);
    expect(slotOf(small[0])).toBe(1);
  });
});

describe("đội live", () => {
  test("host: chỉ ca làm host; trợ live: chỉ giờ, tính cả ca chưa có số", () => {
    const xs = [
      ca("2026-10-01", { hostId: "a", hostName: "An", coHostId: "b", coHostName: "Bình", actualGmv: 60_000_000 }),
      ca("2026-10-02", { hostId: "a", hostName: "An", coHostId: "b", coHostName: "Bình", actualGmv: 0, totalViews: 0, totalOrders: 0, dataSource: "manual" }),
      ca("2026-10-03", { hostId: "c", hostName: "Chi", coHostId: "a", coHostName: "An", actualGmv: 30_000_000 })
    ];
    const hosts = hostRows(xs);
    expect(hosts.map((h) => h.id).sort()).toEqual(["a", "c"]);
    const an = hosts.find((h) => h.id === "a")!;
    expect(an.n).toBe(1);
    expect(an.gmv).toBe(60_000_000);
    const cos = coRows(xs);
    expect(cos.find((c) => c.id === "b")).toMatchObject({ n: 2, hours: 6 });
    expect(cos.find((c) => c.id === "a")).toMatchObject({ n: 1, hours: 3 });
  });
  test("đổi host giữa ca: GMV chia theo giờ đứng", () => {
    const s = ca("2026-10-01", {
      hostId: "a", hostName: "An", actualGmv: 90_000_000,
      staffSegments: [
        { talentId: "a", talentName: "An", role: "host", fromMin: 0, toMin: 120 },
        { talentId: "c", talentName: "Chi", role: "host", fromMin: 120, toMin: 180 }
      ]
    });
    const hosts = hostRows([s]);
    expect(hosts.find((h) => h.id === "a")!.gmv).toBeCloseTo(60_000_000);
    expect(hosts.find((h) => h.id === "c")!.gmv).toBeCloseTo(30_000_000);
  });
});

describe("cặp host + trợ live", () => {
  test("chỉ ca một host + một trợ cả ca; đổi người giữa ca không vào cặp", () => {
    const xs = [
      ca("2026-10-01", { hostId: "a", hostName: "An", coHostId: "b", coHostName: "Bình" }),
      ca("2026-10-02", { hostId: "a", hostName: "An", coHostId: "b", coHostName: "Bình" }),
      ca("2026-10-03", { hostId: "a", hostName: "An", coHostId: "b", coHostName: "Bình", staffSegments: [{ talentId: "a", talentName: "An", role: "host", fromMin: 0, toMin: 90 }, { talentId: "c", talentName: "Chi", role: "host", fromMin: 90, toMin: 180 }] })
    ];
    const rows = pairRows(xs);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "a|b", name: "An + Bình", n: 2 });
  });
});

