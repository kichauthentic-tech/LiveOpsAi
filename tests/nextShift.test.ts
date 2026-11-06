// 06/11: "Thêm ca" ở Điều Phối gợi ý ca tốt nhất còn trống bằng bộ xếp ca của Kế Hoạch Tháng (trước: ngày ít ca nhất + 19:00).
import { expect, test } from "vitest";
import type { LiveSession, ShiftSlot } from "../src/types";
import { suggestNextShift } from "../src/lib/scheduling/nextShift";

const mk = (id: string, date: string, start: string, end: string, gmv: number, status: LiveSession["status"] = "Completed"): LiveSession =>
  ({ id, title: "", brandId: "b", brandName: "B", hostId: "h", hostName: "H", platform: "TikTok", date, startTime: start, endTime: end, status, monthPublished: true, dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, totalViews: 1000 }) as LiveSession;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

test("lịch tháng đã có 11–14 + 19–22 mọi ngày, trừ 20/12 thiếu ca tối ⇒ gợi ý 19–22 ngày 20/12", () => {
  const ses: LiveSession[] = [];
  for (let d = new Date("2026-09-01T00:00:00"); d <= new Date("2026-11-30T00:00:00"); d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    ses.push(mk(`${date}a`, date, "11:00", "14:00", 30e6), mk(`${date}b`, date, "19:00", "22:00", 60e6));
  }
  for (let d = new Date("2026-12-01T00:00:00"); d <= new Date("2026-12-31T00:00:00"); d.setDate(d.getDate() + 1)) {
    const date = iso(d);
    ses.push(mk(`${date}x`, date, "11:00", "14:00", 0, "Upcoming"));
    if (date !== "2026-12-20") ses.push(mk(`${date}y`, date, "19:00", "22:00", 0, "Upcoming"));
  }
  const next = suggestNextShift(ses, [] as ShiftSlot[], "b", "TikTok", "2026-12", "2026-12-05");
  expect(next).toMatchObject({ date: "2026-12-20", startTime: "19:00", endTime: "22:00" });
  expect(next!.expectedGmv).toBeGreaterThan(0);
});

test("kênh chưa có lịch sử ⇒ null (nơi gọi giữ cách cũ)", () => {
  expect(suggestNextShift([], [], "b", "TikTok", "2026-12", "2026-12-05")).toBeNull();
});
