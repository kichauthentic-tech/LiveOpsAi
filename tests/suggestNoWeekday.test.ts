// 06/11 (user nghi engine xếp T7–CN ít ca): CROCS T12 270h ⇒ thứ 7 Daily chỉ 1 ca/ngày vì bộ xếp ca chấm ô thứ × khung, mà ô thứ 7 trong
// lịch sử hơi thấp (×0,90). Backtest 5 kênh: chấm theo thứ không chính xác hơn chấm theo khung (28,1% vs 28,2%) ⇒ bộ xếp ca chấm theo
// khung 2 giờ gộp mọi thứ (`blockCells`) × hệ số loại ngày. Thứ chỉ yếu hơn một chút thì không được làm ngày đó mất ca.
import { expect, test } from "vitest";
import type { LiveSession } from "../src/types";
import { buildHistory, suggestMonthPlan } from "../src/lib/scheduling/suggestEngine";
import { getCampaignDayInfo } from "../src/lib/campaignDays";

const mk = (id: string, date: string, start: string, end: string, gmv: number): LiveSession =>
  ({ id, title: "", brandId: "b", brandName: "B", hostId: "h", hostName: "H", platform: "TikTok", date, startTime: start, endTime: end, status: "Completed", monthPublished: true, dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, totalViews: 1000 }) as LiveSession;

test("thứ 7 lịch sử thấp hơn 12% vẫn được số ca như ngày Daily khác", () => {
  const hist: LiveSession[] = [];
  for (let d = new Date("2026-08-01T00:00:00"); d <= new Date("2026-10-31T00:00:00"); d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const f = d.getDay() === 6 ? 0.88 : 1;
    hist.push(mk(`${date}a`, date, "10:00", "13:00", 30e6 * f), mk(`${date}b`, date, "19:00", "22:00", 60e6 * f), mk(`${date}c`, date, "15:00", "18:00", 40e6 * f));
  }
  const h = buildHistory(hist, "b", "2026-11-06", {});
  expect(h.blockCells.every((c) => c.weekday === -1)).toBe(true);
  const r = suggestMonthPlan(h, { month: "2026-12", today: "2026-11-06", committedHours: 150, targetGmv: 0, liveWindowStart: "09:00", liveWindowEnd: "23:00", defaultSlotHours: 3, maxSlotsPerDay: 3 });
  const perDay = new Map<string, number>();
  for (const s of r.slots) if (!getCampaignDayInfo(s.date)) perDay.set(s.date, (perDay.get(s.date) ?? 0) + 1);
  const wd = (d: string) => new Date(`${d}T00:00:00`).getDay();
  const avg = (pred: (d: string) => boolean) => { const xs = [...perDay].filter(([d]) => pred(d)).map(([, n]) => n); return xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length); };
  // Ngày Daily nào cũng có ca; thứ 7 không ít hơn ngày khác quá nửa ca.
  expect(avg((d) => wd(d) === 6)).toBeGreaterThan(avg((d) => wd(d) !== 6) - 0.5);
});

test("ca dư khi điểm bằng nhau rải ra nhiều tuần, không dồn vào đầu tháng (CROCS T12 270h: ca thứ 3 dồn 1–5/12)", () => {
  const hist: LiveSession[] = [];
  for (let d = new Date("2026-08-03T00:00:00"); d <= new Date("2026-10-31T00:00:00"); d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (getCampaignDayInfo(date)) continue;
    hist.push(mk(`${date}a`, date, "11:00", "14:00", 30e6), mk(`${date}b`, date, "17:00", "20:00", 60e6), mk(`${date}c`, date, "20:00", "23:00", 60e6));
  }
  const h = buildHistory(hist, "b", "2026-11-06", {});
  const base = { month: "2026-12", today: "2026-11-06", targetGmv: 0, liveWindowStart: "09:00", liveWindowEnd: "23:00", defaultSlotHours: 3, maxSlotsPerDay: 3 };
  // Giờ đủ cho 2 ca tối mọi ngày + ca thứ 3 ngày Campaign; tìm mức giờ để còn đúng vài ca thứ 3 cho ngày Daily.
  const triplesAt = (hours: number) => {
    const r = suggestMonthPlan(h, { ...base, committedHours: hours });
    const per = new Map<string, number>();
    for (const s of r.slots) if (!getCampaignDayInfo(s.date)) per.set(s.date, (per.get(s.date) ?? 0) + 1);
    return [...per].filter(([, n]) => n >= 3).map(([d]) => d);
  };
  const triples = triplesAt(240);
  expect(triples.length).toBeGreaterThanOrEqual(4);
  expect(triples.length).toBeLessThanOrEqual(12);
  const weekOf = (d: string) => Math.floor((Number(d.slice(8)) - 1 + 2) / 7); // 1/12/2026 là thứ 3
  expect(new Set(triples.map(weekOf)).size).toBeGreaterThanOrEqual(3);
});

test("VERA TikTok: khung chỉ có vài ca ngày Campaign (15–18h) không chiếm chỗ ngày Daily — Daily dùng khung đã live nhiều", () => {
  const hist: LiveSession[] = [];
  for (let d = new Date("2026-08-03T00:00:00"); d <= new Date("2026-10-31T00:00:00"); d.setDate(d.getDate() + 1)) {
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const camp = !!getCampaignDayInfo(date);
    hist.push(mk(`${date}a`, date, "18:00", "21:00", 6.3e6), mk(`${date}b`, date, "21:00", "00:00", 6.6e6), mk(`${date}c`, date, "10:00", "13:00", 5.7e6));
    // Vài ca chiều ngày Campaign bán tốt (6 ca trong 3 tháng).
    if (camp && Number(date.slice(8)) % 2 === 1) hist.push(mk(`${date}d`, date, "15:00", "18:00", 11e6));
  }
  const h = buildHistory(hist, "b", "2026-11-06", {});
  const r = suggestMonthPlan(h, { month: "2026-12", today: "2026-11-06", committedHours: 200, targetGmv: 0, liveWindowStart: "09:00", liveWindowEnd: "00:30", defaultSlotHours: 3, maxSlotsPerDay: 5 });
  const daily = r.slots.filter((s) => !getCampaignDayInfo(s.date));
  expect(daily.length).toBeGreaterThan(15);
  expect(daily.filter((s) => s.startTime >= "13:00" && s.startTime < "18:00").length).toBe(0);
});
