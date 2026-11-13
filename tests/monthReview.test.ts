import { describe, expect, test } from "vitest";
import { buildMonthReview, castPctOf, prevMonthOf } from "../src/lib/roster/monthReview";
import type { LiveSession, Talent } from "../src/types";

const ca = (id: string, over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id,
    brandId: "crocs",
    brandName: "CROCS",
    platform: "TikTok",
    studioId: "r",
    studioName: "R",
    date: "2026-09-10",
    startTime: "10:00",
    endTime: "13:00",
    status: "Completed",
    hostId: "henry",
    hostName: "Henry",
    coHostId: "loan",
    coHostName: "Loan",
    actualGmv: 30_000_000,
    totalViews: 100,
    dataSource: "manual",
    ...over
  }) as LiveSession;
const tal = (id: string, over: Partial<Talent> = {}): Talent =>
  ({ id, name: id, nickname: id, role: "Host", ratePerHour: 0, assistantRatePerHour: 0, ratePerSession: 0, ...over }) as Talent;
const talents = [tal("henry", { ratePerHour: 300000 }), tal("loan", { role: "Assistant", assistantRatePerHour: 100000 })];

describe("tổng kết tháng theo người", () => {
  test("prevMonthOf qua ranh năm", () => {
    expect(prevMonthOf("2026-09")).toBe("2026-08");
    expect(prevMonthOf("2026-01")).toBe("2025-12");
  });

  test("giờ + tiền Plan vs Nghiệm thu: ca chưa diễn ra chỉ vào Plan; OT cộng vào giờ nghiệm thu", () => {
    const sessions = [
      ca("a"),
      ca("b", { date: "2026-09-11", report: { otMinutes: 30 } as LiveSession["report"] }),
      ca("c", { date: "2026-09-28", status: "Upcoming", actualGmv: 0 }),
      ca("x", { date: "2026-09-12", status: "Cancelled" }),
      ca("old", { date: "2026-08-10" })
    ];
    const r = buildMonthReview({ sessions, talents, history: [], month: "2026-09", role: "host", today: "2026-09-20" });
    const h = r.rows.find((x) => x.talentId === "henry")!;
    expect(h.planHours).toBe(9); // 3 ca chưa huỷ × 3h
    expect(h.planCost).toBe(2_700_000);
    expect(h.actualHours).toBe(6.5); // 3 + 3 + 0,5 OT
    expect(h.actualCost).toBe(1_950_000);
    expect(h.rateMin).toBe(300000);
    expect(h.rateMax).toBe(300000);
    expect(r.hasUpcoming).toBe(true);
    expect(r.totals.actualCost).toBe(1_950_000);
  });

  test("GMV tách theo sàn, cast % theo từng sàn; không có tổng gộp hai sàn", () => {
    const sessions = [
      ca("a", { platform: "TikTok", actualGmv: 30_000_000 }),
      ca("b", { date: "2026-09-11", platform: "Shopee", actualGmv: 10_000_000 })
    ];
    const r = buildMonthReview({ sessions, talents, history: [], month: "2026-09", role: "host", today: "2026-10-01" });
    const h = r.rows[0];
    expect(h.byPlatform.TikTok.gmv).toBe(30_000_000);
    expect(h.byPlatform.Shopee.gmv).toBe(10_000_000);
    expect(castPctOf(h.byPlatform.TikTok)).toBeCloseTo(0.03, 5); // 900K / 30M
    expect(castPctOf(h.byPlatform.Shopee)).toBeCloseTo(0.09, 5); // 900K / 10M
    expect(r.hasUpcoming).toBe(false);
  });

  test("đổi host giữa ca: mỗi người ăn phần giờ và phần GMV của mình", () => {
    const s = ca("seg", {
      actualGmv: 20_000_000,
      staffSegments: [
        { talentId: "henry", talentName: "Henry", role: "host", fromMin: 0, toMin: 60 },
        { talentId: "khanh", talentName: "Khanh", role: "host", fromMin: 60, toMin: 180 }
      ]
    });
    const r = buildMonthReview({ sessions: [s], talents: [...talents, tal("khanh", { ratePerHour: 100000 })], history: [], month: "2026-09", role: "host", today: "2026-10-01" });
    const h = r.rows.find((x) => x.talentId === "henry")!;
    const k = r.rows.find((x) => x.talentId === "khanh")!;
    expect(h.actualHours).toBe(1);
    expect(k.actualHours).toBe(2);
    expect(h.byPlatform.TikTok.gmv).toBeCloseTo(20_000_000 / 3, 0);
    expect(k.byPlatform.TikTok.gmv).toBeCloseTo((20_000_000 * 2) / 3, 0);
  });

  test("vai trợ: có giờ + tiền, không có GMV; thiếu rate báo costMissing", () => {
    const r = buildMonthReview({ sessions: [ca("a")], talents: [...talents, tal("loan2")], history: [], month: "2026-09", role: "co_host", today: "2026-10-01" });
    const l = r.rows[0];
    expect(l.talentId).toBe("loan");
    expect(l.actualCost).toBe(300000);
    expect(l.byPlatform.TikTok.gmv).toBe(0);
    const noRate = buildMonthReview({ sessions: [ca("a", { coHostId: "loan2" })], talents: [...talents, tal("loan2", { role: "Assistant" })], history: [], month: "2026-09", role: "co_host", today: "2026-10-01" });
    expect(noRate.rows[0].costMissing).toBe(true);
  });

  test("lý do tự tính: giờ giảm mạnh so tháng trước và làm ít hơn plan", () => {
    const aug = Array.from({ length: 5 }, (_, i) => ca(`g${i}`, { date: `2026-08-${String(10 + i).padStart(2, "0")}` })); // 15h
    const sep = [
      ca("s1", { date: "2026-09-10" }),
      ca("s2", { date: "2026-09-11", status: "Cancelled" }),
      ca("s3", { date: "2026-09-12", status: "Upcoming", actualGmv: 0 }),
      ca("s4", { date: "2026-09-13", status: "Upcoming", actualGmv: 0 }),
      ca("s5", { date: "2026-09-14", status: "Upcoming", actualGmv: 0 })
    ];
    const r = buildMonthReview({ sessions: [...aug, ...sep], talents, history: [], month: "2026-09", role: "host", today: "2026-10-01" });
    const reasons = r.rows[0].reasons.join(" | ");
    expect(reasons).toMatch(/Làm ít hơn plan/);
    expect(reasons).toMatch(/giảm 80% so T8/);
  });
});
