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
