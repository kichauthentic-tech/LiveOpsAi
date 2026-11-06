// Ca qua nửa đêm (21:00–00:00) từng có dự báo = 0 vì độ dài ra âm ⇒ lưới Kế Hoạch Tháng thiếu dự báo của mọi ca tối muộn.
import { expect, test } from "vitest";
import { LiveSession } from "../src/types";
import { buildHistory, estimateSlots } from "../src/lib/scheduling/suggestEngine";

const mk = (id: string, date: string, start: string, end: string, gmv: number): LiveSession =>
  ({
    id, title: "", brandId: "crocs", brandName: "CROCS", hostId: "h", hostName: "H", platform: "TikTok",
    date, startTime: start, endTime: end, status: "Completed", monthPublished: true,
    dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0,
    peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0
  }) as LiveSession;

const tuesdays = ["2026-08-04", "2026-08-11", "2026-08-18", "2026-08-25", "2026-09-01", "2026-09-08"];
const sessions = tuesdays.flatMap((d, i) => [mk(`a${i}`, d, "18:00", "21:00", 60_000_000), mk(`b${i}`, d, "21:00", "00:00", 54_000_000)]);

test("ca 21:00–00:00 có dự báo > 0 và cùng bậc với ca 18:00–21:00 cùng giờ dài", () => {
  const h = buildHistory(sessions, "crocs", "2026-09-30", {});
  const [evening, late] = estimateSlots(h, [
    { date: "2026-10-06", startTime: "18:00", endTime: "21:00" },
    { date: "2026-10-06", startTime: "21:00", endTime: "00:00" }
  ], {});
  expect(evening).toBeGreaterThan(0);
  expect(late).toBeGreaterThan(0);
  expect(late / evening).toBeGreaterThan(0.5);
  expect(late / evening).toBeLessThan(1.5);
});

// 06/11 (user): ca main campaign live tới 00:30–01:00 nhưng khung live chỉ tới 23:59 ⇒ engine không bao giờ gợi ý ca vắt qua 0h.
// Khung đóng ≤ 06:00 và sớm hơn giờ mở = rạng sáng hôm sau.
test("khung 09:00–01:00: bộ xếp ca gợi ý được ca vắt qua 0h — chỉ ở ngày Campaign; khung 23:59 thì không", async () => {
  const { suggestMonthPlan } = await import("../src/lib/scheduling/suggestEngine");
  const { getCampaignDayInfo } = await import("../src/lib/campaignDays");
  const h = buildHistory(sessions, "crocs", "2026-09-30", {});
  const base = { month: "2026-10", today: "2026-10-01", committedHours: 60, targetGmv: 0, liveWindowStart: "18:00", defaultSlotHours: 3, maxSlotsPerDay: 2 };
  const late = suggestMonthPlan(h, { ...base, liveWindowEnd: "01:00" });
  const overnight = late.slots.filter((s) => s.endTime < s.startTime);
  expect(overnight.length).toBeGreaterThan(0);
  expect(overnight.every((s) => s.endTime <= "01:00" && s.hours === 3)).toBe(true);
  // Kết thúc đúng 00:00 (21–00, hay gặp ở ngày Daily) vẫn được gợi ý mọi ngày; quá 00:00 chỉ ngày Campaign.
  const lateOnly = suggestMonthPlan(h, { ...base, liveWindowStart: "22:00", liveWindowEnd: "01:00" }).slots;
  expect(lateOnly.length).toBeGreaterThan(0);
  expect(lateOnly.every((s) => s.startTime === "22:00" && s.endTime === "01:00" && !!getCampaignDayInfo(s.date))).toBe(true);
  const sameDay = suggestMonthPlan(h, { ...base, liveWindowEnd: "23:59" });
  expect(sameDay.slots.some((s) => s.endTime < s.startTime)).toBe(false);
});
