// Run-rate theo plan ban đầu — luật user chốt 2026-09-28 (lib/performance/planRunRate.ts).
// Chạy: npx vitest run tests/planRunRate.test.ts
import { describe, expect, test } from "vitest";
import { planRunRate, runRateLive } from "../src/lib/performance/planRunRate";
import { buildAccountRunRate } from "../src/lib/performance/runRateUpdate";
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
    const tgt = monthTargetOf("2026-10", 400e6, plan.map((p) => ({ date: p.date, target: p.targetGmv })));
    const o = monthOutlook("2026-10", "2026-10-07", sessions, [], tgt, undefined);
    expect(o.runRate).toBeCloseTo(r.total.runRate!);
  });
});

// Run-rate "tới ca mới nhất có số" (11/10/2026): ngày ≤ ngày đủ số = target cả ngày, ngày sau đó = từng ca có số ÷ target đúng ca.
describe("runRateLive — nhập tới đâu cập nhật tới đó, kể cả sửa report / đối soát / loại ca", () => {
  // Ngày 08 đủ số (2 ca × 100M, mỗi ca 90M). Ngày 09 (= "hôm nay" 10/10 trừ 1) có 3 ca × 100M, mới 1 ca có số.
  const at = (id: string, date: string, start: string, end: string, target: number, slotId: string) => ({ ...planSlot(id, date, target, slotId), startTime: start, endTime: end });
  const sl = (id: string, date: string, start: string, end: string, sessionId?: string) => ({ ...shift(id, date, sessionId), startTime: start, endTime: end });
  function build(over: { s9a?: Partial<LiveSession>; s9bGmv?: number; s9b?: Partial<LiveSession> } = {}) {
    const d8a = ca("2026-10-08", 90e6, { startTime: "09:00", endTime: "12:00" }), d8b = ca("2026-10-08", 90e6, { startTime: "20:00", endTime: "23:00" });
    const d9a = ca("2026-10-09", 110e6, { startTime: "09:00", endTime: "12:00", dataSource: "live_snapshot", ...over.s9a });
    const d9b = ca("2026-10-09", over.s9bGmv ?? 0, { startTime: "12:00", endTime: "15:00", status: "Upcoming", ...over.s9b });
    const shifts = [sl("a", "2026-10-08", "09:00", "12:00", d8a.id), sl("b", "2026-10-08", "20:00", "23:00", d8b.id), sl("c", "2026-10-09", "09:00", "12:00", d9a.id), sl("d", "2026-10-09", "12:00", "15:00", d9b.id), sl("e", "2026-10-09", "20:00", "23:00")];
    const plan = [at("p1", "2026-10-08", "09:00", "12:00", 100e6, "a"), at("p2", "2026-10-08", "20:00", "23:00", 100e6, "b"), at("p3", "2026-10-09", "09:00", "12:00", 100e6, "c"), at("p4", "2026-10-09", "12:00", "15:00", 100e6, "d"), at("p5", "2026-10-09", "20:00", "23:00", 100e6, "e")];
    return { sessions: [d8a, d8b, d9a, d9b], shifts, plan };
  }
  const rrOf = (b = build()) => planRunRate("2026-10", b.plan, b.shifts, b.sessions, "2026-10-10");

  test("ca đã có số của ngày chưa đủ số vào run-rate theo target đúng ca (không chia cho target cả ngày)", () => {
    const r = runRateLive(rrOf(), "2026-10-08");
    expect(r.actual).toBe(290e6);
    expect(r.expected).toBe(300e6); // 200M ngày 08 + 100M ca sáng ngày 09 — ca 12h/20h chưa có số thì chưa vào mẫu số
    expect(r.runRate).toBeCloseTo(290 / 300, 5);
    expect(r.tailShifts).toBe(1);
    expect(r.tailUnreconciled).toBe(1); // live_snapshot chưa đối soát
    expect(r.lastShift).toEqual({ date: "2026-10-09", startTime: "09:00", endTime: "12:00" });
    // Luật cũ (cắt cả ngày) sẽ ra 290 ÷ 500 = 58% — đúng cái bẫy mà ngày đủ số sinh ra để tránh.
    expect(rrOf().total.runRate).toBeCloseTo(290 / 500, 5);
  });

  test("nhập thêm ca 12h ⇒ ca đó vào ngay, mẫu số + 100M", () => {
    const r = runRateLive(rrOf(build({ s9b: { status: "Completed", dataSource: "live_snapshot" }, s9bGmv: 70e6 })), "2026-10-08");
    expect(r.actual).toBe(360e6);
    expect(r.expected).toBe(400e6);
    expect(r.tailShifts).toBe(2);
  });

  test("sửa report của ca (đổi GMV) ⇒ run-rate đổi theo; đối soát ⇒ hết 'chưa đối soát' và số mới thay số tạm", () => {
    const edited = runRateLive(rrOf(build({ s9a: { actualGmv: 60e6 } })), "2026-10-08");
    expect(edited.actual).toBe(240e6);
    expect(edited.runRate).toBeCloseTo(240 / 300, 5);
    const reconciled = runRateLive(rrOf(build({ s9a: { actualGmv: 120e6, dataSource: "tiktok_reconciled" } })), "2026-10-08");
    expect(reconciled.actual).toBe(300e6);
    expect(reconciled.tailUnreconciled).toBe(0);
  });

  test("ca bị loại khỏi report (không còn trong danh sách ca) ⇒ ra khỏi cả tử lẫn mẫu số của ngày sau mốc", () => {
    const b = build();
    const without = planRunRate("2026-10", b.plan, b.shifts, b.sessions.filter((s) => s.startTime !== "09:00" || s.date !== "2026-10-09"), "2026-10-10");
    const r = runRateLive(without, "2026-10-08");
    expect(r.actual).toBe(180e6);
    expect(r.expected).toBe(200e6);
    expect(r.tailShifts).toBe(0);
  });

  test("ca của ngày ĐÃ đủ số vẫn giữ luật cũ: thiếu số / huỷ giữ target, ca ngoài plan target 0", () => {
    const b = build();
    b.sessions[1] = { ...b.sessions[1], status: "Cancelled", actualGmv: 0, totalViews: 0 } as LiveSession; // ca 20h ngày 08 huỷ
    const off = ca("2026-10-09", 40e6, { startTime: "16:00", endTime: "18:00" });
    const r = runRateLive(planRunRate("2026-10", b.plan, b.shifts, [...b.sessions, off], "2026-10-10"), "2026-10-08");
    expect(r.expected).toBe(300e6); // 08: 100 + 100 (ca huỷ giữ target); 09: ca sáng 100; ca 16–18h ngoài plan target 0
    expect(r.actual).toBe(90e6 + 110e6 + 40e6);
  });

  test("chưa ngày nào đủ số ⇒ mọi ca có số tính theo ca", () => {
    const r = runRateLive(rrOf(), null);
    expect(r.expected).toBe(300e6 + 0);
    expect(r.actual).toBe(290e6);
  });

  test("module Run-rate: buildAccountRunRate(rr, asOf, đủ số) khớp runRateLive; không truyền đủ số = luật cũ", () => {
    const rr = rrOf();
    const live = buildAccountRunRate(rr, "2026-10-09", "2026-10-08");
    expect(live.total.targetToDate).toBe(300e6);
    expect(live.total.runRate).toBeCloseTo(290 / 300, 5);
    expect(live.tail).toMatchObject({ shifts: 1, unreconciled: 1 });
    const day9 = live.days.find((d) => d.date === "2026-10-09")!;
    expect(day9.state).toBe("partial");
    expect(day9.pctTarget).toBeCloseTo(1.1, 5);
    expect(buildAccountRunRate(rr, "2026-10-09").total.runRate).toBeCloseTo(290 / 500, 5);
  });
});
