// Target theo nhóm ngày của Kế Hoạch Tháng (0161, 2026-10-09): allocateDraftTargets với `groups`, groupBreakdown, khối nhập.
// Chạy: npx vitest run tests/groupTargets.test.ts
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { PlanGroupTargetsBlock } from "../src/components/PlanGroupTargets";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { GROUP_BUCKETS, PlanDraftSlot, allocateDraftTargets, groupBreakdown, sumGroupTargets } from "../src/lib/scheduling/monthPlanGrid";

let n = 0;
const slot = (date: string, startTime: string, endTime: string): PlanDraftSlot => ({ key: `k${n++}`, date, startTime, endTime, targetGmv: 0, note: "" });
// Tháng 10/2026: D-Day 8–10, Mid-Month 13–15, Pay Day 23–25.
const grid: PlanDraftSlot[] = [
  slot("2026-10-09", "12:00", "15:00"), slot("2026-10-10", "18:00", "21:00"), // dday
  slot("2026-10-13", "20:00", "23:00"), slot("2026-10-14", "20:00", "23:00"), slot("2026-10-15", "20:00", "23:00"), // midmonth
  slot("2026-10-23", "20:00", "23:00"), // payday
  slot("2026-10-20", "11:00", "14:00"), slot("2026-10-20", "19:00", "22:00"), slot("2026-10-21", "19:00", "22:00") // daily
];
const bucketOf = (d: string) => resolveCampBucketType(d);
const spec = (targets: Parameters<typeof sumGroupTargets>[0]) => ({ bucketOf, targets: targets ?? {} });
const bySum = (out: PlanDraftSlot[], b: string) => out.filter((d) => bucketOf(d.date) === b).reduce((a, d) => a + d.targetGmv, 0);
const hoursW = grid.map(() => 1);

describe("allocateDraftTargets theo nhóm", () => {
  const all = { dday: 1_079_671_740, midmonth: 822_607_040, payday: 925_432_920, daily: 2_313_582_300 };
  test("nhập đủ 4 nhóm: mỗi nhóm khớp từng đồng, tổng = tổng 4 nhóm", () => {
    const out = allocateDraftTargets(grid, sumGroupTargets(all), hoursW, hoursW, spec(all));
    for (const b of GROUP_BUCKETS) expect(bySum(out, b)).toBe(all[b]);
    expect(out.reduce((a, d) => a + d.targetGmv, 0)).toBe(sumGroupTargets(all));
  });
  test("trong nhóm chia theo trọng số; ca nặng hơn nhận nhiều hơn", () => {
    const w = grid.map((_, i) => (i === 2 ? 3 : 1)); // ca 13/10 nặng gấp 3 trong nhóm midmonth
    const out = allocateDraftTargets(grid, sumGroupTargets(all), w, w, spec(all));
    const mid = out.filter((d) => bucketOf(d.date) === "midmonth");
    expect(mid[0].targetGmv).toBeGreaterThan(mid[1].targetGmv * 2.9);
    expect(mid[0].targetGmv).toBeLessThan(mid[1].targetGmv * 3.1);
  });
  test("nhập một phần: nhóm trống chia chung phần còn lại của target tháng", () => {
    const total = 1_000_000_000;
    const out = allocateDraftTargets(grid, total, hoursW, hoursW, spec({ dday: 300_000_000 }));
    expect(bySum(out, "dday")).toBe(300_000_000);
    expect(bySum(out, "midmonth") + bySum(out, "payday") + bySum(out, "daily")).toBe(700_000_000);
    expect(out.reduce((a, d) => a + d.targetGmv, 0)).toBe(total);
  });
  test("tổng nhóm đã nhập ≥ target tháng: nhóm trống nhận 0, không âm", () => {
    const out = allocateDraftTargets(grid, 500_000_000, hoursW, hoursW, spec({ dday: 400_000_000, daily: 200_000_000 }));
    expect(bySum(out, "midmonth")).toBe(0);
    expect(out.every((d) => d.targetGmv >= 0)).toBe(true);
  });
  test("nhóm đã nhập mà lưới chưa có ca: phần đó không chia đi đâu, không rò sang nhóm khác", () => {
    const noDday = grid.filter((d) => bucketOf(d.date) !== "dday");
    const out = allocateDraftTargets(noDday, 1_000_000_000, noDday.map(() => 1), undefined, spec({ dday: 300_000_000 }));
    expect(out.reduce((a, d) => a + d.targetGmv, 0)).toBe(700_000_000);
    const rows = groupBreakdown(noDday, bucketOf, { dday: 300_000_000 });
    expect(rows.find((r) => r.bucket === "dday")).toMatchObject({ slots: 0, orphaned: true, given: 300_000_000 });
  });
  test("phần dư làm tròn dồn vào ca nặng nhất của nhóm, tổng vẫn đúng", () => {
    const out = allocateDraftTargets(grid, 1_000_000_007, hoursW, hoursW, spec({ midmonth: 100_000_001 }));
    expect(bySum(out, "midmonth")).toBe(100_000_001);
    expect(out.reduce((a, d) => a + d.targetGmv, 0)).toBe(1_000_000_007);
  });
  test("trọng số toàn 0 thì chia theo giờ; không có target nhóm nào thì y hệt cách cũ", () => {
    const zero = grid.map(() => 0);
    const byHours = allocateDraftTargets(grid, 900, zero, zero, spec({ daily: 600 }));
    expect(bySum(byHours, "daily")).toBe(600);
    const a = allocateDraftTargets(grid, 1_000_000, hoursW, hoursW, spec({}));
    const b = allocateDraftTargets(grid, 1_000_000, hoursW, hoursW);
    expect(a.map((d) => d.targetGmv)).toEqual(b.map((d) => d.targetGmv));
  });
  test("khung camp nhập tay đổi nhóm của ca (bucketOf do caller quyết)", () => {
    const manual = (d: string) => (d === "2026-10-20" || d === "2026-10-21" ? "dday" : bucketOf(d));
    const out = allocateDraftTargets(grid, 1_000, hoursW, hoursW, { bucketOf: manual, targets: { dday: 500 } });
    expect(out.filter((d) => manual(d.date) === "dday").reduce((a, d) => a + d.targetGmv, 0)).toBe(500);
  });
});

describe("groupBreakdown + khối nhập", () => {
  test("đếm ca, giờ, Σ target từng nhóm", () => {
    const out = allocateDraftTargets(grid, 900, hoursW, hoursW, spec({ dday: 100 }));
    const rows = groupBreakdown(out, bucketOf, { dday: 100 });
    expect(rows.map((r) => [r.bucket, r.slots, r.hours])).toEqual([["dday", 2, 6], ["midmonth", 3, 9], ["payday", 1, 3], ["daily", 3, 9]]);
    expect(rows.reduce((a, r) => a + r.slotTarget, 0)).toBe(900);
  });
  const render = (targets: Parameters<typeof sumGroupTargets>[0], editable = true, locked = false, total = 1_000_000_000) =>
    renderToStaticMarkup(React.createElement(PlanGroupTargetsBlock, {
      rows: groupBreakdown(allocateDraftTargets(grid, total, hoursW, hoursW, spec(targets)), bucketOf, targets ?? {}),
      targets: targets ?? {}, targetTotal: total, historyRate: { dday: 25e6, midmonth: 20e6, payday: 22e6, daily: 21e6 }, editable, locked, onChange: () => {}
    }));
  test("không NaN/undefined; có 4 ô nhập và so với lịch sử", () => {
    const html = render({ dday: 300_000_000 });
    expect(html).not.toMatch(/NaN|undefined|Infinity|\[object/);
    expect((html.match(/<input/g) ?? []).length).toBe(4);
    expect(html).toContain("lịch sử");
    expect(html).toContain("Phần còn lại");
  });
  test("đã chốt: ô nhập khoá; hết phần còn lại: cảnh báo", () => {
    expect(render({ dday: 300_000_000 }, true, true)).toMatch(/disabled/);
    expect(render({ dday: 900_000_000, daily: 300_000_000 }, true, false, 1_000_000_000)).toContain("không còn phần nào");
  });
  test("nhóm có target mà chưa có ca: cảnh báo", () => {
    const noDday = grid.filter((d) => bucketOf(d.date) !== "dday");
    const html = renderToStaticMarkup(React.createElement(PlanGroupTargetsBlock, {
      rows: groupBreakdown(noDday, bucketOf, { dday: 1 }), targets: { dday: 1 }, targetTotal: 10, historyRate: null, editable: true, locked: false, onChange: () => {}
    }));
    expect(html).toContain("chưa có ca D-Day");
  });
});
