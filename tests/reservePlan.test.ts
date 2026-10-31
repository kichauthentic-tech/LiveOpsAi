import { describe, expect, test } from "vitest";
import { baseShortfall, cleanReserve, pickReserve, reserveBudget, reserveKey, reserveLadder, reservePoolHours, suggestReservePool } from "../src/lib/scheduling/reservePlan";
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

  test("pickReserve: lấy ca GMV cao trước, dừng khi đủ giờ, bỏ ca trước mốc và ca đã mở", () => {
    const pool = [R("2026-11-12", "20:00", "23:00", 90), R("2026-11-14", "20:00", "23:00", 60), R("2026-11-16", "20:00", "23:00", 80), R("2026-11-18", "20:00", "23:00", 40)];
    const p = pickReserve(pool, 6, "2026-11-13", new Set([reserveKey(pool[2])]));
    expect(p.picked.map((r) => r.date)).toEqual(["2026-11-14", "2026-11-18"]);
    expect(p.hours).toBe(6);
    expect(p.shortHours).toBe(0);
    expect(p.expectedGmv).toBe(100);
  });

  test("pickReserve: nhóm dự phòng không đủ giờ thì báo thiếu, cần 0 giờ thì không mở ca nào", () => {
    const pool = [R("2026-11-14", "20:00", "23:00", 60)];
    expect(pickReserve(pool, 7, "2026-11-13").shortHours).toBe(4);
    expect(pickReserve(pool, 0, "2026-11-13").picked).toEqual([]);
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
    expect(reservePoolHours(pool)).toBe(9);
  });

  test("suggestReservePool: không có ngân sách hoặc dự báo 0 thì trả rỗng", () => {
    const base = { month: "2026-11", fromDate: "2026-11-13", planned: [], windowStart: "09:00", windowEnd: "23:00", slotHours: 3, maxSlotsPerDay: 5, blackoutDates: [] };
    expect(suggestReservePool({ ...base, budgetHours: 0, forecast: (s) => s.map(() => 1) })).toEqual([]);
    expect(suggestReservePool({ ...base, budgetHours: 9, forecast: (s) => s.map(() => 0) })).toEqual([]);
  });

  test("reserveLadder: hụt càng nhiều thì cần càng nhiều giờ; trần +cap kẹp giờ cần; mốc sau chỉ thấy phần còn lại", () => {
    const slots = Array.from({ length: 20 }, (_, i) => ({ date: `2026-11-${String(i + 5).padStart(2, "0")}`, hours: 3, forecast: 5_000_000 }));
    const pool = [R("2026-11-16", "20:00", "23:00", 4_000_000), R("2026-11-18", "20:00", "23:00", 4_000_000), R("2026-11-22", "20:00", "23:00", 4_000_000)];
    const cps = [{ key: "after_dday" as const, date: "2026-11-13" }, { key: "day20" as const, date: "2026-11-20" }];
    const rows = reserveLadder({ checkpoints: cps, target: 100_000_000, slots, pool, shortfalls: [0.02, 0.1], elasticity: 0.82, cap: 0.3 });
    expect(rows).toHaveLength(4);
    const [a, b, c, d] = rows;
    expect(b.advice!.extraHours).toBeGreaterThan(a.advice!.extraHours);
    expect(b.advice!.pct).toBeLessThanOrEqual(0.3 + 1e-9);
    expect(c.pick!.picked.every((r) => r.date >= "2026-11-20")).toBe(true);
    expect(d.pick!.shortHours).toBeGreaterThan(0);
  });
});

describe("ca dự phòng trong phương án xử lý", () => {
  test("khoá ca dự phòng khớp khoá ca thật ⇒ ca đã mở không được gợi ý lại", () => {
    const pool = [R("2026-11-14", "20:00", "23:00", 60), R("2026-11-16", "20:00", "23:00", 50)];
    const opened = new Set(["2026-11-14|20:00|23:00"]);
    expect(pickReserve(pool, 3, "2026-11-13", opened).picked.map((r) => r.date)).toEqual(["2026-11-16"]);
  });
});

describe("quy mô nhóm dự phòng theo chênh lệch target ↔ dự báo", () => {
  const slots = Array.from({ length: 24 }, (_, i) => ({ date: `2026-11-${String(i + 5).padStart(2, "0")}`, hours: 3, forecast: 5_000_000 }));
  const cp = [{ key: "after_dday" as const, date: "2026-11-13" }, { key: "after_midmonth" as const, date: "2026-11-16" }, { key: "day20" as const, date: "2026-11-20" }];

  test("baseShortfall: dự báo đã đạt target ⇒ 0; thiếu 10% ⇒ 0,1", () => {
    expect(baseShortfall(100, 120)).toBe(0);
    expect(baseShortfall(100, 90)).toBeCloseTo(0.1);
    expect(baseShortfall(0, 90)).toBe(0);
  });

  test("target cao hơn dự báo nhiều ⇒ nhóm dự phòng lớn hơn và chạm trần được báo", () => {
    const base = { checkpoints: cp, target: 100_000_000, slots, elasticity: 0.82, cap: 0.3, slotHours: 3 };
    const small = reserveBudget({ ...base, shortfall: 0 })!;
    const mid = reserveBudget({ ...base, shortfall: 0.1 })!;
    const huge = reserveBudget({ ...base, shortfall: 0.5 })!;
    expect(mid.hours).toBeGreaterThan(small.hours);
    expect(small.capped).toBe(false);
    expect(huge.capped).toBe(true);
    expect(huge.hours).toBeLessThanOrEqual(21 * 3 * 0.3 + 1e-9);
    expect(mid.hours % 3).toBe(0);
  });

  test("giữ phần cho mốc sau: mốc đầu dùng tối đa 60% giờ dự phòng, mốc giữa dùng được nhiều hơn", () => {
    const pool = Array.from({ length: 6 }, (_, i) => R(`2026-11-${String(21 + i).padStart(2, "0")}`, "20:00", "23:00", 1_000_000 - i));
    const rows = reserveLadder({ checkpoints: cp, target: 100_000_000, slots, pool, shortfalls: [0.3], elasticity: 0.82, cap: 0.3 });
    expect(rows[0].pick!.hours).toBeLessThanOrEqual(18 * 0.6 + 1e-9);
    expect(rows[1].pick!.hours).toBeGreaterThan(rows[0].pick!.hours);
  });
});
