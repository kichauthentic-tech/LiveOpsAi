// Host tách ngày thường / ngày camp — luật chốt 2026-09-26: GMV trọn cho host, trợ live chỉ ghi giờ.
import { expect, test } from "vitest";
import { byHostDayType } from "../src/lib/performance/hostPerformance";
import type { LiveSession } from "../src/types";

const ca = (date: string, host: string, coHost: string, gmv: number, minutes: number): LiveSession =>
  ({
    id: `${date}-${host}`, date, hostId: host, hostName: host, coHostId: coHost || undefined, coHostName: coHost,
    actualGmv: gmv, liveDurationMinutes: minutes, startTime: "20:00", endTime: "23:00", status: "Completed", platform: "TikTok"
  }) as LiveSession;

const isCamp = (d: string) => d === "2026-08-08" || d === "2026-08-25";

test("GMV trọn cho host, trợ live chỉ có giờ — không cộng vào giờ host của người đó", () => {
  const rows = byHostDayType(
    [
      ca("2026-08-01", "Hùng", "Toàn", 117_000_000, 372), // ngày thường
      ca("2026-08-08", "Hùng", "Toàn", 486_000_000, 900), // D-Day
      ca("2026-08-12", "Toàn", "Hùng", 80_000_000, 180), // Hùng làm trợ
      ca("2026-08-25", "Loan", "", 57_000_000, 252) // Pay Day, không có trợ
    ],
    isCamp
  );
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  expect(rows.map((r) => r.key)).toEqual(["Hùng", "Toàn", "Loan"]); // xếp theo tổng GMV host
  expect(by["Hùng"].daily).toEqual({ sessions: 1, gmv: 117_000_000, hours: 6.2 });
  expect(by["Hùng"].camp).toEqual({ sessions: 1, gmv: 486_000_000, hours: 15 });
  expect(by["Hùng"].assist).toEqual({ sessions: 1, gmv: 0, hours: 3 });
  expect(by["Toàn"].daily.gmv).toBe(80_000_000);
  expect(by["Toàn"].assist).toEqual({ sessions: 2, gmv: 0, hours: 21.2 });
  expect(by["Loan"].assist.sessions).toBe(0);
});

test("người chỉ làm trợ live vẫn có dòng (giờ trợ), ca chưa gán host không tính GMV cho ai", () => {
  const rows = byHostDayType(
    [ca("2026-08-02", "Hùng", "Giang", 32_000_000, 138), { ...ca("2026-08-03", "", "Giang", 50_000_000, 120), hostId: "", hostName: "" }],
    isCamp
  );
  const giang = rows.find((r) => r.key === "Giang")!;
  expect(giang.daily.sessions + giang.camp.sessions).toBe(0);
  expect(giang.assist.sessions).toBe(2);
  expect(rows.some((r) => r.key === "chua-gan-host")).toBe(false);
});
