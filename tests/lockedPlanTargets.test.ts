// Lỗi E2E #1 (2026-09-28): xoá ca chờ đăng ký ⇒ slot_id của ca kế hoạch về null ⇒ target tháng tụt.
// Chạy: npx vitest run tests/lockedPlanTargets.test.ts
import { describe, expect, test } from "vitest";
import { lockedPlanTargetsFromRows } from "../src/lib/scheduling/lockedPlanTargets";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { LiveSession } from "../src/types";

const VERA = "vera";
// Đúng hình dạng lượt E2E: plan VERA T9 target 100M = 2 ca (14,7M + 85,3M); ca 30/09 đã bị xoá ở Nhân sự ca.
const rows = [
  { slot_id: "sl-28", target_gmv: 14_700_000, date: "2026-09-28", plan: { brand_id: VERA } },
  { slot_id: null, target_gmv: "85300000", date: "2026-09-30", plan: [{ brand_id: VERA }] }
];

describe("lockedPlanTargetsFromRows", () => {
  test("ca kế hoạch mất shift_slot vẫn nằm trong tổng tháng và target theo ngày", () => {
    const t = lockedPlanTargetsFromRows(rows);
    expect(t.monthTotals.get(`${VERA}|2026-09`)).toBe(100_000_000);
    expect(t.slotTargets.get(`${VERA}|2026-09`)).toEqual([
      { date: "2026-09-28", target: 14_700_000 },
      { date: "2026-09-30", target: 85_300_000 }
    ]);
    // Map theo shift_slot chỉ có ca còn liên kết — dùng để đổ target xuống ca thật.
    expect([...t.bySlotId.entries()]).toEqual([["sl-28", 14_700_000]]);
  });

  test("Bản Tin CEO: % đạt tính trên 100M, không phải 14,7M ('Đạt 124%' của lỗi cũ)", () => {
    const t = lockedPlanTargetsFromRows(rows);
    const key = `${VERA}|2026-09`;
    const target = monthTargetOf("2026-09", t.monthTotals.get(key), t.slotTargets.get(key) ?? [])!;
    expect(target.total).toBe(100_000_000);
    expect(target.byDate.get("2026-09-30")).toBe(85_300_000); // đúng ngày, không bị rải đều cả tháng
    const s = { id: "s1", brandId: VERA, date: "2026-09-28", startTime: "00:00", endTime: "00:30", status: "Completed", actualGmv: 18_200_000, totalViews: 500, liveDurationMinutes: 28 } as LiveSession;
    const o = monthOutlook("2026-09", "2026-09-28", [s], [], target, undefined);
    expect(o.expectedToDate).toBe(14_700_000);
    expect(o.actual / target.total).toBeCloseTo(0.182);
  });
});
