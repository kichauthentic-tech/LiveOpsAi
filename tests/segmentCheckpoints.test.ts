// Số lúc đổi HOST giữa ca (migration 0147): host A 0–60p, host B 60–150p. Trợ up số TỔNG lúc A xuống; B = số cuối − số lúc đổi.
// Chạy: npx vitest run tests/segmentCheckpoints.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const { hostBoundaries, missingCheckpoints, hostMetricShares } = await import("../src/lib/segmentCheckpoints");
const { hostPortions, byHost } = await import("../src/lib/performance/hostPerformance");
import type { LiveSession, StaffCheckpoint, StaffSegment } from "../src/types";

const seg = (talentId: string, role: StaffSegment["role"], fromMin: number, toMin: number): StaffSegment => ({ talentId, talentName: talentId, role, fromMin, toMin });
const cp = (over: Partial<StaffCheckpoint> = {}): StaffCheckpoint => ({
  atMin: 60, source: "file", link: undefined, liveRef: undefined, cumGmv: 8_000_000, cumViews: 1000, cumOrders: 40, baseGmv: 0, baseViews: 0, baseOrders: 0, baseAtc: 0, reportedAt: "t", ...over
});
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "s1", brandId: "vera", brandName: "VERA", platform: "TikTok", date: "2026-06-25", startTime: "15:00", endTime: "17:30",
    status: "Completed", hostId: "linh", hostName: "linh", coHostId: "nhu", coHostName: "nhu",
    actualGmv: 10_000_000, totalOrders: 100, totalViews: 10_000, dataSource: "tiktok_reconciled", liveDurationMinutes: 150,
    staffSegments: [seg("linh", "host", 0, 60), seg("mia", "host", 60, 150)],
    ...over
  }) as LiveSession;

describe("chỗ đổi host", () => {
  test("hai đoạn host liền nhau = một chỗ đổi, đúng giờ", () => {
    const b = hostBoundaries(ca());
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ atMin: 60, clock: "16:00", fromTalentId: "linh", toTalentId: "mia" });
  });
  test("ca không chia host (kể cả chỉ chia trợ) không có chỗ đổi", () => {
    expect(hostBoundaries(ca({ staffSegments: undefined }))).toEqual([]);
    expect(hostBoundaries(ca({ staffSegments: [seg("nhu", "co_host", 0, 60), seg("thao", "co_host", 60, 150)] }))).toEqual([]);
  });
  test("chưa up số thì còn thiếu", () => {
    expect(missingCheckpoints(ca())).toHaveLength(1);
    expect(missingCheckpoints(ca({ staffCheckpoints: [cp()] }))).toHaveLength(0);
  });
});

describe("chia theo số thật", () => {
  test("chưa có số lúc đổi: chia theo giờ như 0138 (40% / 60%)", () => {
    const parts = hostPortions(ca());
    expect(parts.find((p) => p.hostId === "linh")!.actualGmv).toBeCloseTo(4_000_000, 3);
  });

  test("A bán 8tr trong 60 phút đầu: A nhận 80% dù chỉ đứng 40% thời gian; cộng lại bằng GMV ca", () => {
    // Giao ca cuối: số TỔNG 10tr ⇒ B = 2tr.
    const s = ca({ staffCheckpoints: [cp()], report: { cumGmv: 10_000_000, cumViews: 1250, cumOrders: 50 } as LiveSession["report"] });
    const parts = hostPortions(s);
    const a = parts.find((p) => p.hostId === "linh")!;
    const b = parts.find((p) => p.hostId === "mia")!;
    expect(a.actualGmv).toBeCloseTo(8_000_000, 3);
    expect(b.actualGmv).toBeCloseTo(2_000_000, 3);
    expect(a.totalViews).toBeCloseTo(8_000, 3); // 1000 / 1250
    expect(a.totalOrders).toBeCloseTo(80, 6); // 40 / 50
    // giờ vẫn chia theo giờ đứng ca
    expect(a.liveDurationMinutes).toBeCloseTo(60, 6);
    expect(b.liveDurationMinutes).toBeCloseTo(90, 6);
  });

  test("số chốt cao hơn số lúc giao ca: lấy TỶ LỆ, không trừ thẳng", () => {
    // Lúc giao ca dashboard 10tr, file đối soát chốt 12tr; A đã bán 8tr/10tr = 80% ⇒ 9,6tr.
    const s = ca({ actualGmv: 12_000_000, staffCheckpoints: [cp()], report: { cumGmv: 10_000_000 } as LiveSession["report"] });
    const a = hostPortions(s).find((p) => p.hostId === "linh")!;
    expect(a.actualGmv).toBeCloseTo(9_600_000, 3);
  });

  test("chưa giao ca cuối: lấy số chính thức của ca làm số cuối", () => {
    const s = ca({ staffCheckpoints: [cp({ cumGmv: 4_000_000 })] });
    const a = hostPortions(s).find((p) => p.hostId === "linh")!;
    expect(a.actualGmv).toBeCloseTo(4_000_000, 3); // 4tr / 10tr
  });

  test("ca nối cùng phòng: trừ số nền của ca trước", () => {
    // Phòng đã có 5tr từ ca trước. Lúc A xuống 13tr (A bán 8tr), cuối ca 15tr (B bán 2tr).
    const s = ca({ staffCheckpoints: [cp({ cumGmv: 13_000_000, baseGmv: 5_000_000 })], report: { cumGmv: 15_000_000 } as LiveSession["report"] });
    const a = hostPortions(s).find((p) => p.hostId === "linh")!;
    expect(a.actualGmv).toBeCloseTo(8_000_000, 3);
  });

  test("thiếu số đơn (Shopee) thì chỉ GMV/view chia thật, đơn chia theo giờ", () => {
    const s = ca({ staffCheckpoints: [cp({ cumOrders: undefined })], report: { cumGmv: 10_000_000, cumViews: 1250 } as LiveSession["report"] });
    const shares = hostMetricShares(s);
    expect(shares.gmv?.get("linh")).toBeCloseTo(0.8, 6);
    expect(shares.orders).toBeUndefined();
    expect(hostPortions(s).find((p) => p.hostId === "linh")!.totalOrders).toBeCloseTo(40, 6); // 100 × 60/150
  });

  test("số lúc đổi mồ côi (phút không còn là chỗ đổi) bị bỏ qua", () => {
    const s = ca({ staffCheckpoints: [cp({ atMin: 90 })] });
    expect(missingCheckpoints(s)).toHaveLength(1);
    expect(hostPortions(s).find((p) => p.hostId === "linh")!.actualGmv).toBeCloseTo(4_000_000, 3);
  });

  test("ba host, một người đứng hai đoạn: phần của người đó cộng cả hai", () => {
    const s = ca({
      staffSegments: [seg("linh", "host", 0, 30), seg("mia", "host", 30, 90), seg("linh", "host", 90, 150)],
      staffCheckpoints: [cp({ atMin: 30, cumGmv: 2_000_000, cumViews: 200, cumOrders: 20 }), cp({ atMin: 90, cumGmv: 6_000_000, cumViews: 600, cumOrders: 60 })],
      report: { cumGmv: 10_000_000, cumViews: 1000, cumOrders: 100 } as LiveSession["report"]
    });
    const parts = hostPortions(s);
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.hostId === "linh")!.actualGmv).toBeCloseTo(6_000_000, 3); // 2tr + 4tr
    expect(parts.find((p) => p.hostId === "mia")!.actualGmv).toBeCloseTo(4_000_000, 3);
  });

  test("byHost: tổng GMV các host luôn bằng GMV ca", () => {
    const s = ca({ staffCheckpoints: [cp()], report: { cumGmv: 10_000_000 } as LiveSession["report"] });
    expect(byHost([s]).reduce((x, r) => x + r.gmv, 0)).toBeCloseTo(10_000_000, 3);
  });
});
