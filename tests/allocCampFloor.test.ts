import { describe, expect, it } from "vitest";
import { applyCampFloor } from "../src/lib/performance/allocationModel";
import type { CampDayBucket } from "../src/lib/campaignDays";

// Sàn target ngày Campaign (15/11): ngày camp phải nhận target/giờ ít nhất X lần ngày thường, phần nâng lấy từ ngày
// thường nên tổng không đổi.
const slot = (date: string) => ({ date, startTime: "19:00", endTime: "22:00" });
// 2 ngày Mid-Month + 4 ngày thường, mỗi ngày một ca 3h, trọng số ban đầu bằng nhau ⇒ camp đang NGANG ngày thường.
const slots = ["2026-11-13", "2026-11-14", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"].map(slot);
const bucketOf = (d: string): CampDayBucket => (d === "2026-11-13" || d === "2026-11-14" ? "midmonth" : "daily");
const even = slots.map(() => 1 / slots.length);
const rate = (w: number[], pick: (d: string) => boolean) => {
  const i = slots.map((s, k) => (pick(s.date) ? k : -1)).filter((k) => k >= 0);
  return i.reduce((a, k) => a + w[k], 0) / (i.length * 3);
};

describe("applyCampFloor", () => {
  it("nâng ngày camp lên đúng sàn và giữ nguyên tổng", () => {
    const out = applyCampFloor(even, slots, bucketOf, { midmonth: 1.5 });
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
    const camp = rate(out, (d) => bucketOf(d) === "midmonth");
    const daily = rate(out, (d) => bucketOf(d) === "daily");
    expect(camp / daily).toBeCloseTo(1.5, 6);
  });

  it("không đụng gì khi lịch sử đã trên sàn", () => {
    const w = [0.3, 0.3, 0.1, 0.1, 0.1, 0.1]; // camp đã ×3 ngày thường
    expect(applyCampFloor(w, slots, bucketOf, { midmonth: 1.2 })).toEqual(w);
  });

  it("sàn 0 = tắt", () => {
    expect(applyCampFloor(even, slots, bucketOf, { midmonth: 0, dday: 0, payday: 0 })).toEqual(even);
  });

  it("không rút ngày thường quá nửa khi sàn đặt quá cao", () => {
    const out = applyCampFloor(even, slots, bucketOf, { midmonth: 99 });
    const dailyBefore = even.filter((_, k) => bucketOf(slots[k].date) === "daily").reduce((a, b) => a + b, 0);
    const dailyAfter = out.filter((_, k) => bucketOf(slots[k].date) === "daily").reduce((a, b) => a + b, 0);
    expect(dailyAfter).toBeGreaterThanOrEqual(dailyBefore * 0.5 - 1e-9);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it("không có ngày thường thì giữ nguyên (không có chỗ lấy phần bù)", () => {
    const only = [slot("2026-11-13"), slot("2026-11-14")];
    const w = [0.5, 0.5];
    expect(applyCampFloor(w, only, bucketOf, { midmonth: 2 })).toEqual(w);
  });
});
