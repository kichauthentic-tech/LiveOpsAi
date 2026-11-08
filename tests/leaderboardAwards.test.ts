// Leader Board (06/11) — Ca đạt target (chỉ ngày Campaign, mức 1 ≥ 100%, mức 2 ≥ 120%, chia theo phút) và Host hiệu suất (so khung giờ
// trong cùng account, co về 1,00, cần ≥ 8 ca). Chạy: npx vitest run tests/leaderboardAwards.test.ts
import { describe, expect, test } from "vitest";
import * as A from "../src/lib/leaderboard/awards";
import type { LiveSession } from "../src/types";

const MONTH = "2026-11";
const ACC: A.AwardAccount = { key: "crocs|TikTok", brandId: "crocs", brandName: "CROCS", platform: "TikTok" };
let seq = 0;
const ses = (o: Partial<LiveSession>): LiveSession =>
  ({
    id: `s${++seq}`,
    brandId: "crocs",
    brandName: "CROCS",
    platform: "TikTok",
    date: "2026-11-11",
    startTime: "19:00",
    endTime: "22:00",
    status: "Completed",
    targetGmv: 10_000_000,
    actualGmv: 0,
    hostId: "h1",
    hostName: "Host 1",
    coHostId: "c1",
    coHostName: "Trợ 1",
    ...o
  }) as LiveSession;

describe("campaignTargetBoard", () => {
  test("chỉ ca Campaign; Mức 1 từ 100%, Mức 2 từ 120%; ca Daily và ca không target không xét", () => {
    const board = A.campaignTargetBoard(
      [
        ses({ date: "2026-11-11", actualGmv: 9_900_000 }),
        ses({ date: "2026-11-11", actualGmv: 10_000_000 }),
        ses({ date: "2026-11-10", actualGmv: 12_000_000 }),
        ses({ date: "2026-11-05", actualGmv: 50_000_000 }),
        ses({ date: "2026-11-14", targetGmv: 0, actualGmv: 9_000_000 })
      ],
      ACC,
      MONTH
    );
    const dday = board.events.find((e) => e.type === "dday")!;
    expect(dday.withTarget).toBe(3);
    expect(dday.hit).toBe(2);
    expect(dday.tier2).toBe(1);
    expect(board.events.find((e) => e.type === "midmonth")!.noTarget).toBe(1);
    expect(board.events.some((e) => e.from === "2026-11-05")).toBe(false);
  });

  test("suất thưởng chia theo phút người có mặt; Mức 2 = 2 suất", () => {
    const s = ses({
      actualGmv: 12_500_000,
      staffSegments: [
        { talentId: "h1", talentName: "Host 1", role: "host", fromMin: 0, toMin: 120 },
        { talentId: "h2", talentName: "Host 2", role: "host", fromMin: 120, toMin: 180 }
      ]
    });
    const { payouts } = A.campaignTargetBoard([s], ACC, MONTH);
    const u = (id: string, role = "host") => payouts.find((p) => p.talentId === id && p.role === role)!.units;
    expect(u("h1")).toBeCloseTo(2 * (2 / 3));
    expect(u("h2")).toBeCloseTo(2 * (1 / 3));
    expect(u("c1", "co_host")).toBeCloseTo(2);
  });

  test("ca đang live chưa tính suất dù đã chạm target", () => {
    const board = A.campaignTargetBoard([ses({ status: "Live Now", actualGmv: 11_000_000 })], ACC, MONTH);
    expect(board.events[0].shifts[0].tier).toBe(1);
    expect(board.events[0].hit).toBe(0);
    expect(board.payouts).toHaveLength(0);
  });

  test("khung camp của Kế Hoạch Tháng thay lịch cố định", () => {
    const camp = { midmonth: { start: "2026-11-16", end: "2026-11-17" } };
    const board = A.campaignTargetBoard([ses({ date: "2026-11-14", actualGmv: 11e6 }), ses({ date: "2026-11-16", actualGmv: 11e6 })], ACC, MONTH, camp);
    const mid = board.events.find((e) => e.type === "midmonth")!;
    expect(mid.from).toBe("2026-11-16");
    expect(mid.withTarget).toBe(1);
  });

  test("chấm cả đợt (07/11): Σ GMV ÷ Σ target ≥ 100% ⇒ mọi ca có target của đợt Mức 1, kể cả ca tự hụt", () => {
    const xs = [ses({ date: "2026-11-10", actualGmv: 8e6 }), ses({ date: "2026-11-11", actualGmv: 13e6 })];
    const ev = A.campaignTargetBoard(xs, ACC, MONTH, undefined, "event");
    const dday = ev.events.find((e) => e.type === "dday")!;
    expect(dday.ratio).toBeCloseTo(1.05);
    expect(dday.final).toBe(true);
    expect(dday.tier).toBe(1);
    // h1 đứng cả 2 ca, mỗi ca 1 suất (Mức 1) ⇒ 2; chấm từng ca thì chỉ ca 13M (Mức 2) ⇒ 2 suất từ 1 ca.
    expect(ev.payouts.find((p) => p.talentId === "h1" && p.role === "host")!.tier1).toBe(2);
    const sh = A.campaignTargetBoard(xs, ACC, MONTH, undefined, "shift");
    expect(sh.payouts.find((p) => p.talentId === "h1" && p.role === "host")!.tier2).toBe(1);
  });

  test("chấm cả đợt: đợt còn ca sắp live ⇒ chưa chốt mức, chưa có suất", () => {
    const xs = [ses({ date: "2026-11-10", actualGmv: 15e6 }), ses({ date: "2026-11-11", status: "Upcoming" })];
    const b = A.campaignTargetBoard(xs, ACC, MONTH, undefined, "event");
    expect(b.events[0].final).toBe(false);
    expect(b.events[0].tier).toBeNull();
    expect(b.payouts).toHaveLength(0);
  });

  test("ca account khác không lẫn vào", () => {
    const board = A.campaignTargetBoard([ses({ platform: "Shopee", actualGmv: 20e6 })], ACC, MONTH);
    expect(board.events).toHaveLength(0);
  });
});

describe("hostPerformanceBoard", () => {
  // 3 host × khung tối: h1 gấp đôi trung vị, h2 bằng, h3 một nửa; h4 chỉ 3 ca.
  const month = (host: string, gmv: number, n: number, start = "19:00") =>
    Array.from({ length: n }, (_, i) => ses({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, startTime: start, hostId: host, hostName: host, actualGmv: gmv }));
  const rows = A.hostPerformanceBoard([...month("h1", 20e6, 10), ...month("h2", 10e6, 10), ...month("h3", 5e6, 10), ...month("h4", 40e6, 3)], ACC, MONTH);
  const by = (id: string) => rows.find((r) => r.talentId === id)!;

  test("chỉ số so trung vị khung giờ, co về 1,00 theo K = 6", () => {
    expect(by("h1").raw).toBeCloseTo(2);
    expect(by("h1").index).toBeCloseTo((2 * 10 + 6) / 16);
    expect(by("h2").index).toBeCloseTo(1);
  });

  test("người dưới 8 ca không có hạng dù chỉ số cao", () => {
    expect(by("h4").eligible).toBe(false);
    expect(by("h4").rank).toBeNull();
    expect(by("h1").rank).toBe(1);
    expect(rows.at(-1)!.talentId).toBe("h4");
  });

  test("ca đẹp giờ không tự thắng: khung sáng thấp hơn nhưng host khung sáng vượt trung vị khung đó", () => {
    const r = A.hostPerformanceBoard(
      [...month("a", 3e6, 9, "09:00"), ...month("b", 2e6, 9, "09:00"), ...month("c", 12e6, 9, "20:00"), ...month("d", 12e6, 9, "20:00")],
      ACC,
      MONTH
    );
    expect(r[0].talentId).toBe("a");
    expect(r.find((x) => x.talentId === "c")!.raw).toBeCloseTo(1);
  });

  test("vượt rõ cần cận dưới 80% > 1,00", () => {
    expect(by("h1").clearlyAbove).toBe(true);
    expect(by("h2").clearlyAbove).toBe(false);
    // Trung bình 1,25 nhưng dao động 0,25 ↔ 2,25 qua 8 ca ⇒ chưa rõ.
    const noisy = A.hostPerformanceBoard(
      [
        ...Array.from({ length: 8 }, (_, i) => ses({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, hostId: "n", hostName: "n", actualGmv: i % 2 ? 22.5e6 : 2.5e6 })),
        ...month("m", 10e6, 9)
      ],
      ACC,
      MONTH
    );
    expect(noisy.find((r) => r.talentId === "n")!.clearlyAbove).toBe(false);
  });
});

describe("assistantBoard", () => {
  const days = (n: number, coHost: string, hitEvery: number) =>
    Array.from({ length: n }, (_, i) =>
      ses({ date: `2026-11-${String(i + 1).padStart(2, "0")}`, coHostId: coHost, coHostName: coHost, actualGmv: i % hitEvery === 0 ? 11e6 : 5e6 })
    );

  test("xếp theo tỷ lệ ca đạt target (mọi ngày), co về tỷ lệ chung của account", () => {
    const b = A.assistantBoard([...days(10, "c1", 1), ...days(10, "c2", 2), ...days(4, "c3", 1)], ACC, MONTH);
    expect(b.accountRate).toBeCloseTo((10 + 5 + 4) / 24);
    const c1 = b.rows.find((r) => r.talentId === "c1")!;
    expect(c1.rank).toBe(1);
    expect(c1.hits).toBe(10);
    expect(c1.index).toBeCloseTo((10 + 6 * b.accountRate) / 16);
    expect(b.rows.find((r) => r.talentId === "c3")!.rank).toBeNull();
  });

  test("ca không có target kế hoạch không tính", () => {
    const b = A.assistantBoard([ses({ targetGmv: 0, actualGmv: 9e6 }), ses({ boostTarget: true, actualGmv: 20e6 })], ACC, MONTH);
    expect(b.shiftsWithTarget).toBe(0);
    expect(b.rows).toHaveLength(0);
  });
});

describe("campaignTargetBoard — ca sắp live", () => {
  test("ca đã xếp hiện trong đợt nhưng không vào số đạt", () => {
    const b = A.campaignTargetBoard([ses({ status: "Upcoming", actualGmv: 0 }), ses({ actualGmv: 11e6 })], ACC, MONTH);
    expect(b.events[0].upcoming).toBe(1);
    expect(b.events[0].withTarget).toBe(1);
    expect(b.events[0].shifts.at(-1)!.upcoming).toBe(true);
  });
});

describe("hostPerformanceBoard — gỡ ngày Campaign", () => {
  // Hai host cùng tay nghề, cùng khung tối. Ngày Campaign mọi ca cao gấp 1,5 lần. "sale" đứng toàn ngày Campaign, "daily" toàn ngày Daily.
  const camp = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-23", "2026-11-24"];
  const daily = ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08", "2026-11-16"];
  const rows = A.hostPerformanceBoard(
    [
      ...camp.map((date) => ses({ date, hostId: "sale", hostName: "sale", actualGmv: 15e6 })),
      ...daily.map((date) => ses({ date, hostId: "daily", hostName: "daily", actualGmv: 10e6 }))
    ],
    ACC,
    MONTH
  );
  test("người được xếp toàn ngày sale không tự lên hạng", () => {
    for (const r of rows) expect(r.index).toBeCloseTo(1);
  });
  test("khung camp của Kế Hoạch Tháng được dùng để nhận ngày Campaign", () => {
    const moved = A.hostPerformanceBoard(
      [...camp.map((date) => ses({ date, hostId: "sale", hostName: "sale", actualGmv: 15e6 })), ...daily.map((date) => ses({ date, hostId: "daily", hostName: "daily", actualGmv: 10e6 }))],
      ACC,
      MONTH,
      { dday: { start: "2026-11-02", end: "2026-11-04" } }
    );
    expect(moved.find((r) => r.talentId === "sale")!.index).not.toBeCloseTo(1);
  });
});
