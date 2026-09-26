// Host tách ngày thường + từng camp (D-Day / Mid-Month / Pay Day riêng) — luật chốt 2026-09-26: GMV trọn cho host, trợ live chỉ ghi giờ.
import { expect, test } from "vitest";
import { byHostDayType, dayTypeDriverLines, dayTypeMetrics, dayTypeTeamTotals } from "../src/lib/performance/hostPerformance";
import type { LiveSession } from "../src/types";
import type { CampDayBucket } from "../src/lib/campaignDays";

const ca = (date: string, host: string, coHost: string, gmv: number, minutes: number): LiveSession =>
  ({
    id: `${date}-${host}`, date, hostId: host, hostName: host, coHostId: coHost || undefined, coHostName: coHost,
    actualGmv: gmv, liveDurationMinutes: minutes, startTime: "20:00", endTime: "23:00", status: "Completed", platform: "TikTok"
  }) as LiveSession;

const bucketOf = (d: string): CampDayBucket => (d === "2026-08-08" ? "dday" : d === "2026-08-14" ? "midmonth" : d === "2026-08-25" ? "payday" : "daily");

test("GMV trọn cho host, trợ live chỉ có giờ — không cộng vào giờ host của người đó", () => {
  const rows = byHostDayType(
    [
      ca("2026-08-01", "Hùng", "Toàn", 117_000_000, 372), // ngày thường
      ca("2026-08-08", "Hùng", "Toàn", 486_000_000, 900), // D-Day
      ca("2026-08-12", "Toàn", "Hùng", 80_000_000, 180), // Hùng làm trợ
      ca("2026-08-25", "Loan", "", 57_000_000, 252) // Pay Day, không có trợ
    ],
    bucketOf
  );
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(rows.map((r) => r.key)).toEqual(["Hùng", "Toàn", "Loan"]); // xếp theo tổng GMV host
  expect(by["Hùng"].byBucket.daily).toMatchObject({ sessions: 1, gmv: 117_000_000, hours: 6.2 });
  expect(by["Hùng"].byBucket.dday).toMatchObject({ sessions: 1, gmv: 486_000_000, hours: 15 });
  expect(by["Hùng"].byBucket.payday.sessions).toBe(0);
  expect(by["Hùng"].assist).toMatchObject({ sessions: 1, gmv: 0, hours: 3 });
  expect(by["Toàn"].byBucket.daily.gmv).toBe(80_000_000);
  expect(by["Toàn"].assist).toMatchObject({ sessions: 2, gmv: 0, hours: 21.2 });
  expect(by["Loan"].assist.sessions).toBe(0);
  expect(by["Loan"].byBucket.payday).toMatchObject({ sessions: 1, gmv: 57_000_000, hours: 4.2 });
});

test("người chỉ làm trợ live vẫn có dòng (giờ trợ), ca chưa gán host không tính GMV cho ai", () => {
  const rows = byHostDayType(
    [ca("2026-08-02", "Hùng", "Giang", 32_000_000, 138), { ...ca("2026-08-03", "", "Giang", 50_000_000, 120), hostId: "", hostName: "" }],
    bucketOf
  );
  const giang = rows.find((r) => r.key === "Giang")!;
  expect(Object.values(giang.byBucket).reduce((a, p) => a + p.sessions, 0)).toBe(0);
  expect(giang.assist.sessions).toBe(2);
  expect(rows.some((r) => r.key === "chua-gan-host")).toBe(false);
});

test("3 camp tách riêng, không gộp; dòng Cả team cộng đúng từng loại ngày và không cộng giờ trợ", () => {
  const rows = byHostDayType(
    [
      ca("2026-08-08", "Hùng", "Toàn", 486_000_000, 900), // D-Day
      ca("2026-08-14", "Hùng", "", 200_000_000, 300), // Mid-Month
      ca("2026-08-14", "Loan", "", 60_000_000, 180), // Mid-Month
      ca("2026-08-25", "Loan", "Hùng", 57_000_000, 252) // Pay Day
    ].map((s, i) => ({ ...s, id: `ca-${i}` })),
    bucketOf
  );
  const hung = rows.find((r) => r.key === "Hùng")!;
  expect(hung.byBucket.dday.gmv).toBe(486_000_000);
  expect(hung.byBucket.midmonth.gmv).toBe(200_000_000);
  expect(hung.byBucket.payday.sessions).toBe(0);
  const team = dayTypeTeamTotals(rows);
  expect(team.midmonth).toMatchObject({ sessions: 2, gmv: 260_000_000, hours: 8 });
  expect(team.payday).toMatchObject({ sessions: 1, gmv: 57_000_000, hours: 4.2 });
  expect(team.daily.sessions).toBe(0);
});

// Ca có đủ phễu: views, click SP, đơn, món, thời gian xem.
const caFull = (id: string, date: string, host: string, minutes: number, gmv: number, views: number, clicks: number, orders: number, items: number, watch: number): LiveSession =>
  ({ ...ca(date, host, "", gmv, minutes), id, totalViews: views, productClicks: clicks, totalOrders: orders, attributedItemsSold: items, avgWatchTimeSeconds: watch }) as LiveSession;

test("chỉ số host × loại ngày: CTOR = Orders ÷ clicks, 4 thừa số nhân ra đúng GMV/giờ, Avg. view bình quân theo Views", () => {
  const rows = byHostDayType(
    [
      caFull("h1", "2026-08-01", "Hùng", 180, 110_000_000, 14_000, 9_000, 110, 115, 40),
      caFull("h2", "2026-08-02", "Hùng", 180, 100_000_000, 13_000, 8_200, 100, 106, 36),
      caFull("v1", "2026-08-03", "Vân", 180, 70_000_000, 9_000, 4_900, 60, 63, 41),
      caFull("v2", "2026-08-04", "Vân", 180, 70_000_000, 8_000, 4_400, 58, 61, 41)
    ],
    bucketOf
  );
  const hung = dayTypeMetrics(rows.find((r) => r.key === "Hùng")!.byBucket.daily);
  expect(hung.ctor).toBeCloseTo((210 / 17_200) * 100, 6);
  expect(hung.upt).toBeCloseTo(221 / 210, 6);
  expect(hung.avgViewSec).toBeCloseTo((40 * 14_000 + 36 * 13_000) / 27_000, 6);
  const product = hung.viewsPerHour! * (hung.liveCtr! / 100) * (hung.ctor! / 100) * hung.aov!;
  expect(product).toBeCloseTo(hung.gmvPerHour!, 3);
});

test("câu vì sao: nêu host lệch nhiều tiền nhất, tách thừa số cùng chiều / ngược chiều, bỏ host chỉ 1 ca", () => {
  const rows = byHostDayType(
    [
      caFull("h1", "2026-08-01", "Hùng", 180, 110_000_000, 14_000, 9_000, 110, 115, 40),
      caFull("h2", "2026-08-02", "Hùng", 180, 100_000_000, 13_000, 8_200, 100, 106, 36),
      caFull("v1", "2026-08-03", "Vân", 180, 70_000_000, 9_000, 4_900, 60, 63, 41),
      caFull("v2", "2026-08-04", "Vân", 180, 70_000_000, 8_000, 4_400, 58, 61, 41),
      caFull("a1", "2026-08-05", "An", 180, 20_000_000, 5_000, 2_000, 20, 21, 30) // 1 ca: không được nêu
    ],
    bucketOf
  );
  const team = dayTypeMetrics(dayTypeTeamTotals(rows).daily);
  const lines = dayTypeDriverLines(rows.map((r) => ({ name: r.name, m: dayTypeMetrics(r.byBucket.daily) })), team, 5);
  expect(lines).toHaveLength(2);
  expect(lines[0]).toMatch(/^Hùng: GMV\/giờ \+\d+% so với cả team — nhờ Views\/giờ \+\d+%/);
  expect(lines[0]).toMatch(/bị kéo lại bởi .*AOV −\d+%/);
  expect(lines[1]).toMatch(/^Vân: GMV\/giờ −\d+% so với cả team — do Views\/giờ −\d+%/);
  expect(lines.join(" ")).not.toMatch(/An:/);
});
