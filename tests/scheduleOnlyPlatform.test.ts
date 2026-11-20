// Sàn "chỉ lịch" Website (CROCS Website, 20/11): có ca → lịch → đăng ký → giờ công/lương, KHÔNG có số liệu/target/report.
// Canh 2 điều: (1) ca Website không bao giờ lọt vào chỗ tính GMV/target của TikTok (platformOf coi sàn lạ là TikTok);
// (2) ca Website vẫn ra công đúng giờ kế hoạch × rate theo giờ của người, không bị "thiếu giá brand".
// Chạy: npx vitest run tests/scheduleOnlyPlatform.test.ts
import { describe, expect, test, vi } from "vitest";

vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));

const rp = await import("../src/lib/reportPlatform");
const { hasLiveEvidence, isUnconfirmedPast } = await import("../src/lib/sessionStatus");
const { computeSessionPnl, computeTalentMonthlyIncome } = await import("../src/lib/pnl");
const { todayGroups } = await import("../src/components/control-room/ShiftBenchmarkBoard");
const { buildDailyTargetBrief } = await import("../src/lib/dailyTargetBrief");
const { scheduleChannelsOfBrand, channelsOfBrand } = await import("../src/lib/channels");
import type { BrandChannel, LiveSession, Talent } from "../src/types";

const talents: Record<string, Talent> = {
  h: { id: "h", name: "Host", ratePerHour: 100_000, assistantRatePerHour: 0, ratePerSession: 0, commissionRate: 0 } as Talent,
  a: { id: "a", name: "Trợ", ratePerHour: 0, assistantRatePerHour: 60_000, ratePerSession: 0, commissionRate: 0 } as Talent
};

const web = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "w1",
    brandId: "crocs",
    brandName: "CROCS",
    platform: "Website",
    date: "2026-11-10",
    startTime: "20:00",
    endTime: "22:00",
    status: "Completed",
    hostId: "h",
    hostName: "Host",
    coHostId: "a",
    coHostName: "Trợ",
    actualGmv: 0,
    dataSource: "manual",
    ...over
  }) as LiveSession;

describe("sàn chỉ lịch Website", () => {
  test("ReportPlatform vẫn chỉ hai sàn có số liệu; Website có nhận diện riêng", () => {
    expect(rp.REPORT_PLATFORMS).toEqual(["TikTok", "Shopee"]);
    expect(rp.SCHEDULE_PLATFORMS).toEqual(["TikTok", "Shopee", "Website"]);
    expect(rp.isScheduleOnly({ platform: "Website" })).toBe(true);
    expect(rp.isScheduleOnly({ platform: "TikTok" })).toBe(false);
    expect(rp.schedulePlatformOf({ platform: "Website" })).toBe("Website");
    // platformOf cũ giữ nguyên luật "sàn lạ = TikTok" — nên màn số liệu PHẢI lọc Website trước (withoutScheduleOnly).
    expect(rp.platformOf({ platform: "Website" })).toBe("TikTok");
    expect(rp.withoutScheduleOnly([web(), web({ id: "t", platform: "TikTok" })]).map((s) => s.id)).toEqual(["t"]);
  });

  test("khoá brand × sàn của Website không đụng khoá TikTok", () => {
    expect(rp.brandPlatformKey("crocs", "TikTok")).toBe("crocs");
    expect(rp.brandPlatformKey("crocs", "Website")).toBe("crocs|Website");
    expect(rp.brandMonthKey("crocs", "2026-11-01", "Website")).toBe("crocs|2026-11|Website");
    expect(rp.brandMonthKey("crocs", "2026-11-01", "TikTok")).toBe("crocs|2026-11");
  });

  test("ca Website qua giờ = đã diễn ra (không có file nào để làm bằng chứng)", () => {
    expect(hasLiveEvidence(web())).toBe(true);
    expect(isUnconfirmedPast(web())).toBe(false);
    // ca TikTok cùng dạng (không số, không report) vẫn là "chờ xác nhận"
    expect(isUnconfirmedPast(web({ platform: "TikTok" }))).toBe(true);
  });

  test("công = giờ kế hoạch × rate theo giờ, không thiếu giá brand / hoa hồng", () => {
    const pnl = computeSessionPnl(web(), {}, talents, {}, [], [], []);
    expect(pnl.missingInputs).toEqual([]);
    expect(pnl.hostPayout).toBe(200_000);
    expect(pnl.coHostPayout).toBe(120_000);
    expect(pnl.grossAgencyRev).toBe(0);
    // cùng ca nhưng TikTok không có giá brand ⇒ vẫn báo thiếu (luật cũ không đổi)
    expect(computeSessionPnl(web({ platform: "TikTok" }), {}, talents, {}, [], [], []).missingInputs).toContain("commission_default");
  });

  test("lương tháng của talent có ca Website", () => {
    const r = computeTalentMonthlyIncome([web()], "h", "2026-11", {}, talents, []);
    expect(r.total).toBe(200_000);
    expect(r.rows).toHaveLength(1);
  });

  test("bảng benchmark + bản tin target bỏ ca Website", () => {
    const rows = [web({ date: "2026-11-10" }), web({ id: "t", platform: "TikTok", date: "2026-11-10", dataSource: "manual" })];
    expect(todayGroups(rows, "2026-11-10").map((g) => g.key)).toEqual(["t"]);
    const brief = buildDailyTargetBrief(rows, "2026-11-10");
    expect(brief.channels.every((c) => c.platform !== ("Website" as never))).toBe(true);
  });

  test("kênh Website chỉ hiện ở màn lịch, không ở màn số liệu", () => {
    const ch = (platform: BrandChannel["platform"]): BrandChannel => ({ id: platform, brandId: "crocs", platform, shopName: "", shopRef: "", status: "active", note: "" }) as BrandChannel;
    const all = [ch("TikTok"), ch("Website")];
    expect(channelsOfBrand(all, "crocs").map((c) => c.platform)).toEqual(["TikTok"]);
    expect(scheduleChannelsOfBrand(all, "crocs").map((c) => c.platform)).toEqual(["TikTok", "Website"]);
  });
});
