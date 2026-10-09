// Chia lại target cả lưới của kế hoạch đã chốt (0162, 10/10): buildRetarget + summarizeRetargetBatches.
// Chạy: npx vitest run tests/retarget.test.ts
import { describe, expect, test } from "vitest";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { PlanDraftSlot, allocateDraftTargets } from "../src/lib/scheduling/monthPlanGrid";
import { buildRetarget, summarizeRetargetBatches } from "../src/lib/scheduling/retarget";

let n = 0;
const slot = (date: string, st: string, en: string, target: number, id?: string): PlanDraftSlot => ({ key: `k${n++}`, id, date, startTime: st, endTime: en, targetGmv: target, note: "" });
const TODAY = "2026-10-10";

describe("buildRetarget", () => {
  const before = [slot("2026-10-08", "11:00", "14:00", 100, "a"), slot("2026-10-10", "19:00", "22:00", 100, "b"), slot("2026-10-20", "19:00", "22:00", 100, "c")];

  test("gồm cả ca ngày đã qua, đếm riêng số ca đã qua, tổng cũ/mới đúng", () => {
    const after = allocateDraftTargets(before, 600, [1, 2, 3], [1, 2, 3]);
    const r = buildRetarget(before, after, TODAY);
    expect(r.updates).toEqual([{ id: "b", target: 200 }, { id: "c", target: 300 }]);
    expect(r.changed).toBe(2);
    expect(r.pastChanged).toBe(0); // ca ngày 08/10 giữ nguyên 100 ⇒ không đổi
    expect(r.oldTotal).toBe(300);
    expect(r.newTotal).toBe(600);
  });

  test("ca đã qua đổi target thì pastChanged đếm", () => {
    const after = allocateDraftTargets(before, 600, [3, 1, 2], [3, 1, 2]);
    const r = buildRetarget(before, after, TODAY);
    expect(r.updates.find((u) => u.id === "a")?.target).toBe(300);
    expect(r.pastChanged).toBe(1);
  });

  test("ca chưa có id DB không vào updates, chỉ đếm unsynced (RPC không với tới)", () => {
    const b = [...before, slot("2026-10-21", "19:00", "22:00", 0)];
    const after = allocateDraftTargets(b, 800, [1, 1, 1, 1], [1, 1, 1, 1]);
    const r = buildRetarget(b, after, TODAY);
    expect(r.unsynced).toBe(1);
    expect(r.updates.every((u) => ["a", "b", "c"].includes(u.id))).toBe(true);
    expect(r.newTotal).toBe(800);
  });

  test("target tròn số nguyên, không âm; không đổi thì không có update", () => {
    const r = buildRetarget(before, before.map((d) => ({ ...d })), TODAY);
    expect(r.updates).toEqual([]);
    expect(r.changed).toBe(0);
  });

  test("hai lưới lệch số ca hoặc lệch thứ tự thì báo lỗi, không đoán", () => {
    expect(() => buildRetarget(before, before.slice(1), TODAY)).toThrow();
    expect(() => buildRetarget(before, [before[1], before[0], before[2]], TODAY)).toThrow();
  });

  test("chia theo nhóm ngày trên ca đã qua: D-Day (08/10) nhận đúng số nhóm", () => {
    const g = [slot("2026-10-08", "11:00", "14:00", 0, "a"), slot("2026-10-09", "19:00", "22:00", 0, "b"), slot("2026-10-20", "19:00", "22:00", 0, "c")];
    const after = allocateDraftTargets(g, 1000, [1, 1, 1], [1, 1, 1], { bucketOf: (d) => resolveCampBucketType(d), targets: { dday: 700 } });
    const r = buildRetarget(g, after, TODAY);
    const dd = r.updates.filter((u) => u.id !== "c").reduce((a, u) => a + u.target, 0);
    expect(dd).toBe(700);
    expect(r.pastChanged).toBe(2);
  });
});

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
