import { describe, expect, it } from "vitest";
import { buildChannelCalendar, channelTitle, fmtFrame, monthBounds } from "../src/lib/roster/brandScheduleExport";

// T10/2026 của VERA TikTok (file mẫu brand): 1/10 là Thứ Năm, 31/10 là Thứ Sáu.
const sh = (date: string, startTime: string, endTime: string) => ({ date, startTime, endTime });

describe("brandScheduleExport", () => {
  it("giới hạn tháng + nhãn khung giờ như file mẫu", () => {
    expect(monthBounds("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(monthBounds("2026-02").to).toBe("2026-02-28");
    expect(fmtFrame("09:00", "12:00")).toBe("9:00 - 12:00");
    expect(channelTitle({ brandName: "Vera", platform: "TikTok" }, "2026-10")).toBe("TTS VERA THÁNG 10 - 2026");
  });

  it("tuần đầu bắt đầu ở T5, tuần cuối dừng ở T6, ô ngoài tháng để trống", () => {
    const cal = buildChannelCalendar([sh("2026-10-01", "10:00", "13:00"), sh("2026-10-01", "19:00", "22:00"), sh("2026-10-31", "10:00", "13:00")], "2026-10");
    expect(cal.weeks).toHaveLength(5);
    expect(cal.weeks[0].dates).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(cal.weeks[4].dates).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(cal.weeks[0].rows).toEqual([
      [null, null, null, "10:00 - 13:00", null, null, null],
      [null, null, null, "19:00 - 22:00", null, null, null]
    ]);
    expect(cal.weeks[4].rows[0][5]).toBe("10:00 - 13:00");
  });

  it("bảng khung giờ cộng đúng số ca / số giờ, ca qua đêm tính 3,5 giờ", () => {
    const cal = buildChannelCalendar(
      [sh("2026-10-05", "10:00", "13:00"), sh("2026-10-06", "10:00", "13:00"), sh("2026-10-06", "21:00", "00:30"), sh("2026-11-01", "10:00", "13:00")],
      "2026-10"
    );
    expect(cal.summary).toEqual([
      { frame: "10:00 - 13:00", count: 2, hours: 6 },
      { frame: "21:00 - 00:30", count: 1, hours: 3.5 }
    ]);
    expect(cal.totalCount).toBe(3);
    expect(cal.totalHours).toBe(9.5);
  });

  it("tháng chưa có ca vẫn ra lịch trống (mỗi tuần 1 hàng)", () => {
    const cal = buildChannelCalendar([], "2026-10");
    expect(cal.weeks.every((w) => w.rows.length === 1)).toBe(true);
    expect(cal.totalCount).toBe(0);
  });
});
