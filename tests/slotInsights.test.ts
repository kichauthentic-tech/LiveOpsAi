// Phân tích khung giờ / vị trí ngày camp / nhịp tuần / soát kế hoạch — lib/performance/slotInsights.ts.
// Chạy: npx vitest run tests/slotInsights.test.ts
import { describe, expect, test } from "vitest";
import {
  campPositions,
  campRuleReliable,
  campWindows,
  planCheck,
  slotBlock,
  slotIndex,
  slotRuleReliable,
  targetWeightModel,
  targetWeights,
  walkForward,
  weeklySeries
} from "../src/lib/performance/slotInsights";
import { resolveCampBucketType } from "../src/lib/campaignDays";
import { eachDay } from "../src/lib/dateUtils";
import { LiveSession } from "../src/types";

const bucketOf = (d: string) => resolveCampBucketType(d);
let seq = 0;
function ca(date: string, startTime: string, hours: number, gmvPerHour: number): LiveSession {
  seq++;
  const h = Number(startTime.slice(0, 2)) + hours;
  return {
    id: `s${seq}`, title: "", brandId: "b", brandName: "B", shopTikTokHandle: "", monthPublished: true, studioId: "", studioName: "",
    hostId: "", hostName: "", assistantName: "", coHostName: "", platform: "TikTok", date, startTime, endTime: `${String(h % 24).padStart(2, "0")}:00`,
    status: "Completed", targetGmv: 0, actualGmv: gmvPerHour * hours, totalOrders: 10, avgWatchTimeSeconds: 0, peakViewers: 0,
    totalViews: 1000, ctrAvg: 0, cvrAvg: 0, liveDurationMinutes: hours * 60, skus: [], checklist: [], minuteMetrics: []
  } as LiveSession;
}

// 3 tháng: ngày thường có ca 11h (yếu, ±nhiễu) và ca 20h (mạnh); Mid-Month/Pay Day ngày 1 cao nhất.
function history(): LiveSession[] {
  const out: LiveSession[] = [];
  for (const m of ["2026-06", "2026-07", "2026-08"]) {
    for (const d of eachDay(`${m}-01`, `${m}-28`)) {
      const b = bucketOf(d);
      const wob = 1 + ((Number(d.slice(8)) % 5) - 2) * 0.03;
      if (b === "daily") {
        out.push(ca(d, "11:00", 3, 16e6 * wob), ca(d, "20:00", 3, 24e6 * wob));
      } else if (b === "midmonth" || b === "payday") {
        const pos = b === "midmonth" ? Number(d.slice(8)) - 13 : Number(d.slice(8)) - 23;
        out.push(ca(d, "10:00", 4, [34e6, 22e6, 18e6][pos] * wob), ca(d, "19:00", 4, [34e6, 22e6, 18e6][pos] * wob));
      } else out.push(ca(d, "09:00", 6, 26e6));
    }
  }
  return out;
}

describe("khung giờ", () => {
  test("slotBlock theo giờ bắt đầu", () => {
    expect(["08:00", "11:30", "15:00", "18:00", "19:00", "20:59", "21:00"].map(slotBlock)).toEqual(["A", "B", "C", "C", "D", "D", "E"]);
  });
  test("11h dưới mặt bằng, 20h trên mặt bằng, khoảng tin cậy không chạm 1", () => {
    const idx = slotIndex(history(), bucketOf, 300);
    expect(idx.B!.idx).toBeCloseTo(0.8, 1);
    expect(idx.D!.idx).toBeCloseTo(1.2, 1);
    expect(idx.B!.hi).toBeLessThan(1);
    expect(idx.D!.lo).toBeGreaterThan(1);
  });
  test("bootstrap tất định — gọi lại ra cùng số", () => {
    const h = history();
    expect(slotIndex(h, bucketOf, 200).B!.lo).toBe(slotIndex(h, bucketOf, 200).B!.lo);
  });
  test("walk-forward: quy tắc khung giờ có ích ⇒ đủ tin", () => {
    const h = history();
    const wf = walkForward(h, bucketOf, (s) => slotBlock(s.startTime));
    expect(wf.gain!).toBeGreaterThan(0.5);
    expect(slotRuleReliable(slotIndex(h, bucketOf, 200), wf)).toBe(true);
  });
  test("chỉ 1 tháng số ⇒ không đủ tin", () => {
    const h = history().filter((s) => s.date.startsWith("2026-06"));
    expect(slotRuleReliable(slotIndex(h, bucketOf, 100), walkForward(h, bucketOf, (s) => slotBlock(s.startTime)))).toBe(false);
  });
});

describe("vị trí ngày trong đợt camp", () => {
  test("ngày 1 cao nhất ở mọi đợt ⇒ đủ tin", () => {
    const wins = campWindows(history(), bucketOf);
    expect(wins).toHaveLength(6);
    const p = campPositions(wins)!;
    expect(p[0].idx).toBeGreaterThan(1.3);
    expect(p[2].idx).toBeLessThan(0.8);
    expect(campRuleReliable(p)).toBe(true);
  });
  test("đợt thiếu ngày có số thì không đưa vào so vị trí", () => {
    const h = history().filter((s) => s.date !== "2026-07-14");
    expect(campWindows(h, bucketOf)).toHaveLength(5);
  });
});

describe("nhịp tuần", () => {
  test("tuần tụt > 15% so với trung vị 8 tuần trước ⇒ cảnh báo; tuần chưa trọn không cảnh báo", () => {
    const xs: LiveSession[] = [];
    for (const d of eachDay("2026-06-01", "2026-08-16")) xs.push(ca(d, "20:00", 3, d >= "2026-08-10" ? 14e6 : 20e6));
    const w = weeklySeries(xs, "2026-08-16");
    expect(w.at(-1)!.weekStart).toBe("2026-08-10");
    expect(w.at(-1)!.alert).toBe(true);
    expect(w.at(-2)!.alert).toBe(false);
    expect(w.filter((x) => x.alert).map((x) => x.weekStart)).toEqual(["2026-08-10"]); // tuần đầu (chưa đủ số so) không bị tô đỏ
    const partial = weeklySeries(xs, "2026-08-12");
    expect(partial.at(-1)!.full).toBe(false);
    expect(partial.at(-1)!.alert).toBe(false);
  });
});

describe("chia target ca theo chỉ số khung", () => {
  test("ca 20h nhận nhiều target hơn ca 11h cùng số giờ; ngày 1 Mid-Month nhiều hơn ngày 3", () => {
    const model = targetWeightModel(history(), "2026-10", bucketOf)!;
    expect(model.useSlot && model.useCamp).toBe(true);
    const slots = [
      { date: "2026-10-01", startTime: "11:00", endTime: "14:00" },
      { date: "2026-10-01", startTime: "20:00", endTime: "23:00" },
      { date: "2026-10-13", startTime: "20:00", endTime: "23:00" },
      { date: "2026-10-14", startTime: "20:00", endTime: "23:00" },
      { date: "2026-10-15", startTime: "20:00", endTime: "23:00" }
    ];
    const w = targetWeights(slots, model, bucketOf);
    expect(w[1] / w[0]).toBeCloseTo(1.5, 1);
    expect(w[2]).toBeGreaterThan(w[4]);
  });
  test("chưa đủ 2 tháng lịch sử ⇒ null (Kế Hoạch Tháng dùng dự báo engine như cũ)", () => {
    expect(targetWeightModel(history().filter((s) => s.date < "2026-07-01"), "2026-10", bucketOf)).toBeNull();
  });
});

describe("soát kế hoạch", () => {
  test("bắt target ngày 1 < ngày 3 và giờ dồn vào khung yếu", () => {
    const plan = [
      { date: "2026-10-13", startTime: "20:00", endTime: "23:00", targetGmv: 60e6 },
      { date: "2026-10-14", startTime: "20:00", endTime: "23:00", targetGmv: 70e6 },
      { date: "2026-10-15", startTime: "20:00", endTime: "23:00", targetGmv: 80e6 },
      { date: "2026-10-02", startTime: "11:00", endTime: "14:00", targetGmv: 70e6 },
      { date: "2026-10-02", startTime: "20:00", endTime: "23:00", targetGmv: 70e6 }
    ];
    const h = history();
    const c = planCheck(plan, h, "2026-08-28", bucketOf, targetWeightModel(h, "2026-10", bucketOf))!;
    expect(c.invertedCamps.map((x) => x.bucket)).toEqual(["midmonth"]);
    expect(c.weakHours).toBe(3);
    expect(c.strongHours).toBe(3);
    expect(c.needPerHour).toBeCloseTo(350e6 / 15);
    expect(c.expectedAtRecent!).toBeGreaterThan(0);
  });
});
