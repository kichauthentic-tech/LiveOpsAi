import { describe, expect, test } from "vitest";
import { cleanReserve, reserveHours, reserveKey, suggestReservePool } from "../src/lib/scheduling/reservePlan";
import type { ReserveSlot } from "../src/types";

const R = (date: string, startTime: string, endTime: string, expectedGmv: number): ReserveSlot => ({ date, startTime, endTime, expectedGmv });

describe("ca dự phòng (0194)", () => {
  test("cleanReserve: bỏ dòng hỏng và trùng, sắp theo ngày-giờ, làm tròn GMV", () => {
    const out = cleanReserve([
      R("2026-11-20", "20:00", "23:00", 5.6),
      { date: "bad", startTime: "20:00", endTime: "23:00", expectedGmv: 1 },
      R("2026-11-14", "09:00", "12:00", 7),
      R("2026-11-14", "09:00", "12:00", 9),
      { date: "2026-11-15", startTime: "25:00", endTime: "23:00", expectedGmv: 1 }
    ]);
    expect(out.map(reserveKey)).toEqual(["2026-11-14|09:00|12:00", "2026-11-20|20:00|23:00"]);
    expect(out[1].expectedGmv).toBe(6);
    expect(cleanReserve(null)).toEqual([]);
  });


  test("suggestReservePool: tránh giờ ca chính, mỗi ngày một ca, ngày đầy ca và ngày cấm bị bỏ, đủ ngân sách giờ thì dừng", () => {
    const pool = suggestReservePool({
      month: "2026-11",
      fromDate: "2026-11-13",
      planned: [{ date: "2026-11-14", startTime: "19:00", endTime: "22:00" }, { date: "2026-11-15", startTime: "09:00", endTime: "12:00" }],
      windowStart: "09:00",
      windowEnd: "23:00",
      slotHours: 3,
      maxSlotsPerDay: 1,
      blackoutDates: ["2026-11-16"],
      budgetHours: 9,
      forecast: (slots) => slots.map((s) => Number(s.startTime.slice(0, 2)) * 1_000_000)
    });
    expect(pool).toHaveLength(3);
    expect(new Set(pool.map((p) => p.date)).size).toBe(3);
    for (const p of pool) {
      expect(p.date >= "2026-11-13").toBe(true);
      expect(["2026-11-14", "2026-11-15", "2026-11-16"]).not.toContain(p.date);
    }
    expect(pool.reduce((a, r) => a + reserveHours(r), 0)).toBe(9);
  });

  test("suggestReservePool: không có ngân sách hoặc dự báo 0 thì trả rỗng", () => {
    const base = { month: "2026-11", fromDate: "2026-11-13", planned: [], windowStart: "09:00", windowEnd: "23:00", slotHours: 3, maxSlotsPerDay: 5, blackoutDates: [] };
    expect(suggestReservePool({ ...base, budgetHours: 0, forecast: (s) => s.map(() => 1) })).toEqual([]);
    expect(suggestReservePool({ ...base, budgetHours: 9, forecast: (s) => s.map(() => 0) })).toEqual([]);
  });

});
