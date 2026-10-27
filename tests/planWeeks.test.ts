import { expect, test } from "vitest";
import { summarizePlanSpan, type SlotOutcome } from "../src/lib/scheduling/planWeeks";
import type { PlanDraftSlot } from "../src/lib/scheduling/monthPlanGrid";

const d = (id: string, date: string, targetGmv: number, startTime = "20:00", endTime = "23:00"): PlanDraftSlot => ({ key: id, id, date, startTime, endTime, targetGmv, note: "" });

// Tuần 19–25/10 CROCS rút gọn: 2 ca có số, 1 ca huỷ, 1 ca qua giờ chưa có số, 1 ca chưa tới.
const slots = [
  d("a", "2026-10-19", 62_000_000),
  d("b", "2026-10-20", 49_300_000, "21:00", "00:00"),
  d("c", "2026-10-21", 46_200_000, "11:00", "14:00"),
  d("e", "2026-10-22", 50_000_000),
  d("f", "2026-10-25", 60_000_000),
  d("x", "2026-10-26", 99_000_000) // tuần sau — không thuộc khoảng
];
const out: Record<string, SlotOutcome> = {
  a: { state: "done", actual: 66_100_000 },
  b: { state: "done", actual: 17_500_000 },
  c: { state: "cancelled", actual: 0 },
  e: { state: "no_data", actual: 0 },
  f: { state: "pending", actual: 0 }
};
const week = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"];

test("tuần: ca huỷ + ca qua giờ chưa số giữ target trong mẫu số tới nay (luật run-rate)", () => {
  const s = summarizePlanSpan(week, slots, (x) => out[x.id!]);
  expect(s.slots).toBe(5);
  expect(s.hours).toBe(15);
  expect(s.target).toBe(267_500_000);
  expect(s.dueCount).toBe(4);
  expect(s.noDataCount).toBe(1);
  expect(s.targetToDate).toBe(62_000_000 + 49_300_000 + 46_200_000 + 50_000_000);
  expect(s.actual).toBe(83_600_000);
  expect(s.pct).toBeCloseTo(83_600_000 / 207_500_000, 6);
});

test("chưa có ca nào tới hạn (lưới nháp / tháng sau) ⇒ pct null, vẫn có tổng target", () => {
  const s = summarizePlanSpan(week, slots, () => undefined);
  expect(s.pct).toBeNull();
  expect(s.dueCount).toBe(0);
  expect(s.target).toBe(267_500_000);
});

test("một ngày: chỉ ca của ngày đó", () => {
  const s = summarizePlanSpan(["2026-10-19"], slots, (x) => out[x.id!]);
  expect(s.slots).toBe(1);
  expect(s.pct).toBeCloseTo(66.1 / 62, 6);
});
