// Audit 2026-09-28 mục 3: một công thức "Dự kiến cuối tháng" cho Dashboard brand, khối phương án bù và Bản Tin CEO.
// Chạy: npx vitest run tests/monthProjection.test.ts
import { describe, expect, test } from "vitest";
import { planRunRate, projectMonthEnd } from "../src/lib/performance/planRunRate";
import { monthOutlook, monthTargetOf } from "../src/lib/performance/ceoBrief";
import { trackMonth } from "../src/lib/opsSupport";
import { BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../src/types";
import type { HistorySummary } from "../src/lib/scheduling/suggestEngine";

let seq = 0;
function ca(date: string, gmv: number, extra: Partial<LiveSession> = {}): LiveSession {
  seq++;
  return {
    id: `s${seq}`, title: "", brandId: "vera", brandName: "VERA", shopTikTokHandle: "", monthPublished: true,
    studioId: "", studioName: "", hostId: "h1", hostName: "Host 1", assistantName: "", coHostName: "",
    platform: "TikTok", date, startTime: "20:00", endTime: "22:00", status: "Completed",
    targetGmv: 0, actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: gmv > 0 ? 5_000 : 0, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: 120, skus: [], checklist: [], minuteMetrics: [], ...extra
  } as LiveSession;
}
const planSlot = (id: string, date: string, target: number, slotId?: string): BrandMonthPlanSlot =>
  ({ id, planId: "p", date, startTime: "20:00", endTime: "22:00", targetGmv: target, expectedGmv: 0, slotId, note: "" });
const openSlot = (id: string, date: string): ShiftSlot =>
  ({ id, date, startTime: "20:00", endTime: "22:00", brandId: "vera", brandName: "VERA", platform: "TikTok", studioName: "", notes: "", status: "open" }) as ShiftSlot;
const noHistory = { brandGmvPerHour: 0 } as unknown as HistorySummary;

describe("Dự kiến cuối tháng — brand chưa có lịch sử 28 ngày (lỗi E2E #4)", () => {
  // Đúng hình lượt E2E VERA: 2 ca × 50M, ca 1 đã qua giờ nhưng chưa có số, ca 2 còn chờ đăng ký.
  test("không có GMV/giờ ⇒ không in 'Dự kiến 0 · thiếu 100%', rơi về run-rate hoặc không chiếu", () => {
    const plan = [planSlot("p1", "2026-10-05", 50e6), planSlot("p2", "2026-10-20", 50e6, "o2")];
    const s1 = ca("2026-10-05", 0, { totalViews: 0 }); // đã qua giờ, chưa có số
    const shifts = [openSlot("o2", "2026-10-20")];
    const rr = planRunRate("2026-10", plan, shifts, [s1], "2026-10-07");
    const target = monthTargetOf("2026-10", 100e6, plan.map((p) => ({ date: p.date, target: p.targetGmv })), null, undefined);
    const o = monthOutlook("2026-10", "2026-10-07", [s1], shifts, target, undefined);
    expect(o.rates).toBeNull();
    expect(o.projectionMethod).toBe("none");
    expect(o.gap).toBeNull(); // trước đây: gap = 0 − 100M ⇒ "Dự kiến thiếu 100M (100%)"
    expect(projectMonthEnd(rr, { projected: o.projected, projectionMethod: o.projectionMethod }).method).toBe("none");
  });

  test("ca đầu tiên có số ⇒ CEO và Dashboard ra cùng một dự phóng", () => {
    const plan = [planSlot("p1", "2026-10-05", 50e6), planSlot("p2", "2026-10-20", 50e6, "o2")];
    const s1 = ca("2026-10-05", 40e6);
    const shifts = [openSlot("o2", "2026-10-20")];
    const rr = planRunRate("2026-10", plan, shifts, [s1], "2026-10-07");
    // Dashboard gọi monthOutlook KHÔNG kèm target; CEO kèm target từ kế hoạch chốt.
    const dash = projectMonthEnd(rr, monthOutlook("2026-10", "2026-10-07", [s1], shifts, null, undefined));
    const target = monthTargetOf("2026-10", 100e6, plan.map((p) => ({ date: p.date, target: p.targetGmv })), null, undefined);
    const ceo = monthOutlook("2026-10", "2026-10-07", [s1], shifts, target, undefined);
    // Có 1 ca có số trong 28 ngày ⇒ rates có ⇒ cả hai chiếu theo giờ: 40M + 2h × 20M/giờ = 80M.
    expect(dash).toEqual({ value: 80e6, method: "gmv_per_hour" });
    expect(ceo.projected).toBe(80e6);
    expect(ceo.projectionMethod).toBe("gmv_per_hour");
  });
});

describe("trackMonth đọc trạng thái ca từ planRunRate", () => {
  test("ca kế hoạch mất shift_slot nhưng khớp ngày + giờ ⇒ 'done', không phải 'huỷ' như bản cũ", () => {
    const plan = [planSlot("p1", "2026-10-05", 50e6 /* slot_id null — ca chờ đăng ký đã bị xoá rồi chốt tay */)];
    const s1 = ca("2026-10-05", 40e6);
    const rr = planRunRate("2026-10", plan, [], [s1], "2026-10-07");
    const t = trackMonth(rr, noHistory, {});
    expect(t.slots.map((x) => x.state)).toEqual(["done"]);
    expect(t.cancelledCount).toBe(0);
    expect(t.offPlanCount).toBe(0);
    expect(t.actualAll).toBe(40e6);
  });
});
