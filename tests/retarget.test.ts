// Nhật ký chia lại target của kế hoạch đã chốt (0162, 10/10): summarizeRetargetBatches.
// Chạy: npx vitest run tests/retarget.test.ts
import { describe, expect, test } from "vitest";
import { summarizeRetargetBatches } from "../src/lib/scheduling/retarget";

const TODAY = "2026-10-10";

describe("summarizeRetargetBatches", () => {
  const row = (batch: string, at: string, date: string, o: number | string, nw: number | string, note = "") => ({ batch_id: batch, changed_at: at, changed_by: "u1", note, date, old_target: o, new_target: nw });
  test("gom theo vòng, mới nhất trước, tổng cũ/mới và số ca đã qua", () => {
    const rows = [
      row("b1", "2026-10-10T01:00:00Z", "2026-10-08", 100, 150, "vòng 1"), row("b1", "2026-10-10T01:00:00Z", "2026-10-20", 200, 250),
      row("b2", "2026-10-10T03:00:00Z", "2026-10-09", "150", "90", "vòng 2")
    ];
    const out = summarizeRetargetBatches(rows, TODAY);
    expect(out.map((b) => b.batchId)).toEqual(["b2", "b1"]);
    expect(out[1]).toMatchObject({ slots: 2, pastSlots: 1, oldSum: 300, newSum: 400, note: "vòng 1" });
    expect(out[0]).toMatchObject({ slots: 1, pastSlots: 1, oldSum: 150, newSum: 90 });
  });
  test("không có dòng nào ⇒ mảng rỗng", () => {
    expect(summarizeRetargetBatches([], TODAY)).toEqual([]);
  });
});
