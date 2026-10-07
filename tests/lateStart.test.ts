// Huy hiệu "vào live trễ" trên thẻ ca. `actual_start_at` là giờ SỚM NHẤT của room trong file số liệu (0078) nên chỉ báo khi
// vào MUỘN; ca nối tiếp trong room đã live từ ca trước (giờ thật sớm hơn kế hoạch) không được báo bừa.
// Chạy: npx vitest run tests/lateStart.test.ts
import { describe, expect, it } from "vitest";
import { lateStartInfo, lateStartLabel } from "../src/lib/sessionStatus";
import { buildLateBadge } from "../src/components/ui/SessionEventCard";
import type { LiveSession } from "../src/types";

// Ca 11:00–14:00 giờ VN ngày 20/10 = 04:00Z.
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({ date: "2026-10-20", startTime: "11:00", endTime: "14:00", status: "Completed", actualStartAt: "2026-10-20T04:12:00+00:00", actualEndAt: "2026-10-20T07:03:00+00:00", ...over }) as LiveSession;

describe("lateStartInfo", () => {
  it("vào muộn 12 phút → báo, giờ đổi sang giờ VN bất kể múi giờ máy", () => {
    expect(lateStartInfo(ca())).toEqual({ minutes: 12, plannedStart: "11:00", actualStart: "11:12", actualEnd: "14:03" });
  });
  it("đúng giờ / muộn dưới ngưỡng / vào sớm → im lặng", () => {
    expect(lateStartInfo(ca({ actualStartAt: "2026-10-20T04:00:00Z" }))).toBeNull();
    expect(lateStartInfo(ca({ actualStartAt: "2026-10-20T04:09:00Z" }))).toBeNull();
    expect(lateStartInfo(ca({ actualStartAt: "2026-10-20T01:00:00Z" }))).toBeNull(); // room live từ ca trước
  });
  it("muộn quá 3 giờ (nhiều khả năng room khác), chưa có file, ca nạp bù, ca huỷ → không báo", () => {
    expect(lateStartInfo(ca({ actualStartAt: "2026-10-20T08:00:00Z" }))).toBeNull();
    expect(lateStartInfo(ca({ actualStartAt: undefined }))).toBeNull();
    expect(lateStartInfo(ca({ isBackfill: true }))).toBeNull();
    expect(lateStartInfo(ca({ status: "Cancelled" }))).toBeNull();
  });
  it("ca qua đêm tính theo ngày của ca", () => {
    const night = ca({ startTime: "22:00", endTime: "01:00", actualStartAt: "2026-10-20T15:20:00Z" }); // 22:20 VN
    expect(lateStartInfo(night)?.minutes).toBe(20);
  });
});

describe("huy hiệu", () => {
  it("nhãn ngắn", () => {
    expect(lateStartLabel(12)).toBe("+12p");
    expect(lateStartLabel(65)).toBe("+1h05");
  });
  it("brand không thấy", () => {
    expect(buildLateBadge(ca())?.label).toBe("+12p");
    expect(buildLateBadge(ca())?.title).toContain("kế hoạch 11:00, thật 11:12–14:03");
    expect(buildLateBadge(ca(), "brand")).toBeUndefined();
  });
});
