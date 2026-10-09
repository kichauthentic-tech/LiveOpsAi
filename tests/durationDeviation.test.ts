// Nhãn OT / off sớm đo theo THỜI LƯỢNG LIVE (liveDurationMinutes − thời lượng kế hoạch), không theo giờ kết thúc room:
// team live luôn phải đủ duration nên vào trễ thì cuối ca tự OT, và ca nối cùng room không bị báo OT bừa. Chỉ agency thấy.
// Chạy: npx vitest run tests/durationDeviation.test.ts
import { describe, expect, it } from "vitest";
import { durationDeviationInfo, minutesLabel, targetPct } from "../src/lib/sessionStatus";
import { buildDurationBadge, buildPctBadge } from "../src/components/ui/SessionEventCard";
import type { LiveSession } from "../src/types";

// Ca 10:00–18:00 giờ VN ngày 20/10 (8 giờ = 480 phút) = 03:00Z–11:00Z; mặc định live đủ 8 giờ.
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "a", date: "2026-10-20", startTime: "10:00", endTime: "18:00", status: "Completed",
    liveDurationMinutes: 480, actualStartAt: "2026-10-20T03:00:00Z", actualEndAt: "2026-10-20T11:00:00Z",
    targetGmv: 25_000_000, actualGmv: 28_000_000, dataSource: "live_snapshot", monthPublished: true, ...over
  }) as LiveSession;

describe("durationDeviationInfo", () => {
  it("vào 10:12 ra 18:25 → live 8h13 = OT 13 phút (không phải 25), giờ room đổi sang giờ VN", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 493, actualStartAt: "2026-10-20T03:12:00Z", actualEndAt: "2026-10-20T11:25:00Z" })))
      .toEqual({ kind: "ot", minutes: 13, plannedMinutes: 480, liveMinutes: 493, actualStart: "10:12", actualEnd: "18:25" });
  });
  it("vào trễ 12 phút nhưng bù đủ giờ → không báo gì (trễ không còn nhãn riêng)", () => {
    expect(durationDeviationInfo(ca({ actualStartAt: "2026-10-20T03:12:00Z", actualEndAt: "2026-10-20T11:12:00Z" }))).toBeNull();
  });
  it("live thiếu 30 phút → off sớm", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 450 }))).toMatchObject({ kind: "early", minutes: 30 });
  });
  it("lệch dưới 10 phút → im lặng", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 489 }))).toBeNull();
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 471 }))).toBeNull();
  });
  it("OT quá 3 giờ (room khác / ca chưa tách) → không báo OT, nhưng thiếu giờ nhiều vẫn báo off sớm", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 480 + 181 }))).toBeNull();
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 200 }))?.kind).toBe("early");
  });
  it("ca nối cùng room: giờ kết thúc room muộn hàng giờ nhưng thời lượng của ca đủ → không OT bừa", () => {
    expect(durationDeviationInfo(ca({ endTime: "14:00", liveDurationMinutes: 240, actualEndAt: "2026-10-20T11:00:00Z" }))).toBeNull();
  });
  it("chưa có thời lượng (chưa up file), ca nạp bù, ca huỷ → không báo", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: undefined }))).toBeNull();
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 0 }))).toBeNull();
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 600, isBackfill: true }))).toBeNull();
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 600, status: "Cancelled" }))).toBeNull();
  });
  it("ca qua đêm: 22:00–01:00 là 180 phút", () => {
    const night = ca({ startTime: "22:00", endTime: "01:00", liveDurationMinutes: 200 });
    expect(durationDeviationInfo(night)).toMatchObject({ kind: "ot", minutes: 20, plannedMinutes: 180 });
  });
  it("không có giờ room trong file vẫn báo, chỉ thiếu giờ vào/ra", () => {
    expect(durationDeviationInfo(ca({ liveDurationMinutes: 500, actualStartAt: undefined, actualEndAt: undefined })))
      .toMatchObject({ kind: "ot", minutes: 20, actualStart: undefined, actualEnd: undefined });
  });
  it("nhãn phút", () => {
    expect(minutesLabel(25)).toBe("25p");
    expect(minutesLabel(65)).toBe("1h05");
    expect(minutesLabel(480)).toBe("8h");
  });
});

describe("targetPct", () => {
  it("28M / 25M = 112% đạt; 82% trung tính; 54% thấp", () => {
    expect(targetPct(ca())).toEqual({ pct: 112, level: "hit" });
    expect(targetPct(ca({ actualGmv: 20_500_000 }))?.level).toBe("mid");
    expect(targetPct(ca({ actualGmv: 13_500_000 }))).toEqual({ pct: 54, level: "low" });
  });
  it("mốc đỏ là 60% (hạ từ 70% ngày 09/10): 65% trung tính, 59% và 60% đúng mốc", () => {
    expect(targetPct(ca({ actualGmv: 16_250_000 }))).toEqual({ pct: 65, level: "mid" });
    expect(targetPct(ca({ actualGmv: 15_000_000 }))).toEqual({ pct: 60, level: "mid" });
    expect(targetPct(ca({ actualGmv: 14_750_000 }))).toEqual({ pct: 59, level: "low" });
  });
  it("chưa xong, chưa có số liệu, không có target, loại khỏi báo cáo, tháng chưa phát hành → null", () => {
    expect(targetPct(ca({ status: "Live Now" }))).toBeNull();
    expect(targetPct(ca({ dataSource: "manual", actualGmv: 0 }))).toBeNull();
    expect(targetPct(ca({ targetGmv: 0 }))).toBeNull();
    expect(targetPct(ca({ excludedFromReports: true }))).toBeNull();
    expect(targetPct(ca({ monthPublished: false }))).toBeNull();
  });
});

describe("huy hiệu: brand không thấy", () => {
  it("agency có nhãn, brand không", () => {
    const ot = ca({ liveDurationMinutes: 493 });
    expect(buildDurationBadge(ot, "agency")).toMatchObject({ kind: "ot", prefix: "OT ", value: "+13p" });
    expect(buildDurationBadge(ot, "agency")?.title).toContain("8h13 thật / 8h kế hoạch");
    expect(buildDurationBadge(ca({ liveDurationMinutes: 450 }), "agency")).toMatchObject({ kind: "early", prefix: "Off ", value: "−30p" });
    expect(buildDurationBadge(ot, "brand")).toBeUndefined();
    expect(buildPctBadge(ca(), "agency")).toMatchObject({ label: "112%", level: "hit" });
    expect(buildPctBadge(ca(), "brand")).toBeUndefined();
  });
});
