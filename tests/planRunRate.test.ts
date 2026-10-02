// Run-rate theo plan ban đầu — luật user chốt 2026-09-28 (lib/performance/planRunRate.ts).
// Chạy: npx vitest run tests/planRunRate.test.ts
import { describe, expect, test } from "vitest";
import { planRunRate } from "../src/lib/performance/planRunRate";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";

let seq = 0;
function ca(date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "crocs", brandName: "CROCS", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: "20:00", endTime: "23:00", status: "Completed",
    targetGmv: 0, actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: gmv > 0 ? 5_000 : 0, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 180, ...extra
  } as LiveSession;
}
const shift = (id: string, date: string, sessionId?: string, status: ShiftSlot["status"] = "finalized"): ShiftSlot =>
  ({ id, date, startTime: "20:00", endTime: "23:00", brandId: "crocs", brandName: "CROCS", platform: "TikTok", studioName: "", notes: "", status, sessionId }) as ShiftSlot;
const planSlot = (id: string, date: string, target: number, slotId?: string): BrandMonthPlanSlot =>
  ({ id, planId: "p", date, startTime: "20:00", endTime: "23:00", targetGmv: target, expectedGmv: 0, slotId, note: "" });

// Ví dụ user duyệt 28/09: 4 ca × 100M, ca 3 huỷ, ca 5 mở thêm ngoài plan.
function example() {
  const s1 = ca("2026-10-02", 90e6), s2 = ca("2026-10-03", 90e6), s3 = ca("2026-10-04", 0, { status: "Cancelled" }), s4 = ca("2026-10-05", 90e6);
  const s5 = ca("2026-10-06", 80e6);
  const shifts = [shift("a", "2026-10-02", s1.id), shift("b", "2026-10-03", s2.id), shift("c", "2026-10-04", s3.id, "cancelled"), shift("d", "2026-10-05", s4.id)];
  const plan = [planSlot("p1", "2026-10-02", 100e6, "a"), planSlot("p2", "2026-10-03", 100e6, "b"), planSlot("p3", "2026-10-04", 100e6, "c"), planSlot("p4", "2026-10-05", 100e6, "d")];
  return { sessions: [s1, s2, s3, s4, s5], shifts, plan };
}

describe("planRunRate — luật plan ban đầu", () => {
  test("ví dụ đã duyệt: (270 + 80) ÷ 400 = 88%", () => {
    const { sessions, shifts, plan } = example();
    const r = planRunRate("2026-10", plan, shifts, sessions, "2026-10-07");
    expect(r.through).toBe("2026-10-06");
    expect(r.total.targetToDate).toBe(400e6);
    expect(r.total.actual).toBe(350e6);
    expect(r.total.runRate).toBeCloseTo(0.875);
    expect(r.offPlan.map((x) => x.session.actualGmv)).toEqual([80e6]);
    expect(r.cancelledCount).toBe(1);
    expect(r.cancelledTargetToDate).toBe(100e6);
  });

  test("ca huỷ giữ target — bỏ nó ra thì run-rate sẽ là 90% (sai)", () => {
    const { sessions, shifts, plan } = example();
    const r = planRunRate("2026-10", plan, shifts, sessions.slice(0, 4), "2026-10-07");
    expect(r.total.runRate).toBeCloseTo(270 / 400);
    expect(r.slots.find((t) => t.planSlot.id === "p3")!.state).toBe("cancelled");
  });

  test("ca ngoài plan không có target, không có % Target ca", () => {
    const { sessions, shifts, plan } = example();
    const r = planRunRate("2026-10", plan, shifts, sessions, "2026-10-07");
    expect(r.total.target).toBe(400e6);
    expect(r.slots.map((t) => t.pctTarget)).toEqual([0.9, 0.9, null, 0.9]);
  });

  test("ca kế hoạch mất shift_slot (slot_id null) vẫn giữ target và khớp lại ca thật theo ngày giờ", () => {
    const { sessions, shifts, plan } = example();
    plan[0] = { ...plan[0], slotId: undefined };
    const r = planRunRate("2026-10", plan, shifts.slice(1), sessions, "2026-10-07");
    expect(r.total.targetToDate).toBe(400e6);
    expect(r.slots[0].state).toBe("done");
    expect(r.offPlan).toHaveLength(1); // vẫn chỉ có ca 5
  });

  test("target tới nay chỉ cộng ca có ngày ≤ ngày cuối có số; ca đã qua mà chưa có số vẫn giữ target", () => {
    const s1 = ca("2026-10-02", 90e6), s2 = ca("2026-10-03", 0, { status: "Completed" });
    const shifts = [shift("a", "2026-10-02", s1.id), shift("b", "2026-10-03", s2.id), shift("c", "2026-10-20")];
    const plan = [planSlot("p1", "2026-10-02", 100e6, "a"), planSlot("p2", "2026-10-02", 50e6, "b"), planSlot("p3", "2026-10-20", 100e6, "c")];
    plan[1] = { ...plan[1], date: "2026-10-02" };
    const r = planRunRate("2026-10", plan, shifts, [s1, s2], "2026-10-05");
    expect(r.through).toBe("2026-10-02");
    expect(r.total.targetToDate).toBe(150e6);
    expect(r.total.runRate).toBeCloseTo(0.6);
    expect(r.slots.map((t) => t.state)).toEqual(["done", "no_data", "pending"]);
    expect(r.total.keepPace).toBeCloseTo(90e6 + 100e6 * 0.6);
  });

  test("theo khung: D-Day 8–10/10 tách khỏi ngày thường", () => {
    const d = ca("2026-10-10", 120e6), n = ca("2026-10-02", 50e6);
    const shifts = [shift("a", "2026-10-10", d.id), shift("b", "2026-10-02", n.id)];
    const plan = [planSlot("p1", "2026-10-10", 100e6, "a"), planSlot("p2", "2026-10-02", 100e6, "b")];
    const r = planRunRate("2026-10", plan, shifts, [d, n], "2026-10-11");
    const b = Object.fromEntries(r.buckets.map((x) => [x.bucket, x]));
    expect(b.dday.runRate).toBeCloseTo(1.2);
    expect(b.daily.runRate).toBeCloseTo(0.5);
    expect(b.midmonth.status).toBe("next");
    expect(b.dday.status).toBe("done");
  });

  test("khớp Bản Tin CEO (monthOutlook) khi cùng kế hoạch đã chốt", () => {
    const { sessions, shifts, plan } = example();
    const r = planRunRate("2026-10", plan, shifts, sessions, "2026-10-07");
    const tgt = monthTargetOf("2026-10", 400e6, plan.map((p) => ({ date: p.date, target: p.targetGmv })), null, undefined);
    const o = monthOutlook("2026-10", "2026-10-07", sessions, [], tgt, undefined);
    expect(o.runRate).toBeCloseTo(r.total.runRate!);
  });
});
