// Ca có sẵn kết thúc qua nửa đêm (21:00–00:00) phải được engine giữ như ca cố định — trước đây bị bỏ qua (`end <= start`),
// engine coi như lưới thiếu giờ và "bù" thêm ở chỗ khác (CROCS T11: gợi ý bù 87h thay vì ~15h).
// Chạy: npx vitest run tests/suggestEngineMidnight.test.ts
import { expect, test } from "vitest";
import { LiveSession } from "../src/types";
import { SuggestConstraints, buildHistory, suggestMonthPlan } from "../src/lib/scheduling/suggestEngine";

const mk = (id: string, date: string, start: string, end: string, gmv: number): LiveSession =>
  ({
    id, title: "", brandId: "crocs", brandName: "crocs", hostId: "h", hostName: "H", platform: "TikTok",
    date, startTime: start, endTime: end, status: "Completed", monthPublished: true,
    dataSource: "tiktok_reconciled", actualGmv: gmv, totalOrders: 10, avgWatchTimeSeconds: 0,
    peakViewers: 0, totalViews: 1000, ctrAvg: 0, cvrAvg: 0
  }) as LiveSession;

const sessions: LiveSession[] = [];
for (let d = 1; d <= 24; d++) {
  const day = `2026-08-${`${d}`.padStart(2, "0")}`;
  sessions.push(mk(`m${d}`, day, "09:00", "12:00", 30_000_000));
  sessions.push(mk(`e${d}`, day, "19:00", "22:00", 90_000_000));
}

const ASOF = "2026-09-24";
const hist = buildHistory(sessions, "crocs", ASOF, {});
const base: SuggestConstraints = {
  month: "2026-10",
  today: ASOF,
  committedHours: 3,
  targetGmv: 0,
  mode: "hours",
  liveWindowStart: "09:00",
  liveWindowEnd: "23:59",
  defaultSlotHours: 3,
  maxSlotsPerDay: 5,
  blackoutDates: [],
  strategy: "max"
};

test("ca 21:00–00:00 có sẵn được tính vào giờ cam kết, engine không xếp thêm", () => {
  const r = suggestMonthPlan(hist, { ...base, fixedSlots: [{ date: "2026-10-10", startTime: "21:00", endTime: "00:00" }] });
  expect(r.totalHours).toBeCloseTo(3, 6);
  expect(r.slots.filter((s) => s.date === "2026-10-10" && s.startTime === "21:00" && s.endTime === "00:00")).toHaveLength(1);
  expect(r.slots).toHaveLength(1);
});

test("ca 21:00–00:30 có sẵn giữ nguyên giờ kết thúc và đủ 3,5 giờ", () => {
  const r = suggestMonthPlan(hist, { ...base, committedHours: 3.5, fixedSlots: [{ date: "2026-10-10", startTime: "21:00", endTime: "00:30" }] });
  expect(r.slots.filter((s) => s.date === "2026-10-10" && s.startTime === "21:00" && s.endTime === "00:30")).toHaveLength(1);
  expect(r.totalHours).toBeCloseTo(3.5, 6);
});
