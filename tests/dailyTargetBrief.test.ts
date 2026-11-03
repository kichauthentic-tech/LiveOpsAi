// Bản tin target ngày: target ngày theo phiên, tiến độ tháng theo kênh (không cộng TikTok với Shopee), ca huỷ/tăng cường không tính.
import { expect, test } from "vitest";
import { briefToText, buildDailyTargetBrief } from "../src/lib/dailyTargetBrief";
import type { LiveSession } from "../src/types";

const mk = (o: Partial<LiveSession>): LiveSession =>
  ({ id: Math.random().toString(), brandName: "CROCS", platform: "TikTok", date: "2026-11-03", startTime: "09:00", endTime: "12:00", status: "Upcoming", targetGmv: 10_000_000, actualGmv: 0, hostName: "An", coHostName: "", ...o }) as LiveSession;

test("target ngày + tiến độ tháng theo kênh, tách sàn", () => {
  const b = buildDailyTargetBrief(
    [
      mk({ startTime: "14:00" }),
      mk({ startTime: "09:00", targetGmv: 20_000_000 }),
      mk({ date: "2026-11-01", status: "Completed", targetGmv: 10_000_000, actualGmv: 8_000_000 }),
      mk({ date: "2026-11-05", targetGmv: 10_000_000 }),
      mk({ platform: "Shopee", targetGmv: 5_000_000 }),
      mk({ status: "Cancelled", targetGmv: 99_000_000 }),
      mk({ boostTarget: true, targetGmv: 7_000_000 }),
      mk({ date: "2026-10-30", targetGmv: 50_000_000 })
    ],
    "2026-11-03"
  );
  expect(b.channels.map((c) => c.key)).toEqual(["CROCS|Shopee", "CROCS|TikTok"]);
  const tt = b.channels.find((c) => c.platform === "TikTok")!;
  expect(tt.sessions.map((s) => s.startTime)).toEqual(["09:00", "09:00", "14:00"]);
  expect(tt.dayTarget).toBe(30_000_000);
  expect(tt.monthTarget).toBe(50_000_000);
  expect(tt.monthActual).toBe(8_000_000);
  expect(tt.remainingDays).toBe(28);
  expect(b.dayTargetByPlatform).toEqual({ TikTok: 30_000_000, Shopee: 5_000_000 });
});

test("tin Zalo: Shopee ghi Sales, ngày trống nói rõ", () => {
  const txt = briefToText(buildDailyTargetBrief([mk({ platform: "Shopee" })], "2026-11-03"));
  expect(txt).toContain("Sales");
  expect(txt).toContain("09:00–12:00 An");
  expect(briefToText(buildDailyTargetBrief([], "2026-11-03"))).toContain("không có phiên live");
});
