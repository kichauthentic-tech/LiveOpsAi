// Gộp cấu hình 06/10 (user: "nhập liệu 2–3 nơi … đưa vào cấu hình đúng 1 chỗ ở CRM"): mỗi điều khoản thương mại một
// chỗ nhập. Các test dưới chốt những luật đi kèm việc bỏ chỗ nhập thứ hai.
import { describe, expect, test, vi } from "vitest";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import { computeSessionPnl } from "../src/lib/pnl";
import { brandPriceLabel, brandPriceSet } from "../src/lib/brandPricing";
import { talentRateLabel } from "../src/lib/talentRate";
import { parsePath } from "../src/lib/routes";
import { sessionAdsCost } from "../src/lib/metrics/adsCost";
import { Brand, BrandPlatformRate, LiveSession, SessionFinance } from "../src/types";

const brand = (over: Partial<Brand> = {}) => ({ id: "vera", name: "VERA", billingModel: "gmv_commission", ...over }) as Brand;
const rate = (over: Partial<BrandPlatformRate> = {}): BrandPlatformRate => ({ id: "r", brandId: "vera", platform: "TikTok", ratePerHour: 0, returnRate: 0, ...over });
const ca = (over: Partial<LiveSession> = {}): LiveSession =>
  ({
    id: "s1", brandId: "vera", platform: "TikTok", date: "2026-10-10", startTime: "19:00", endTime: "21:00", status: "Completed",
    hostId: "", actualGmv: 100_000_000, dataSource: "tiktok_reconciled", ...over
  }) as LiveSession;

describe("% hoa hồng agency chỉ theo giá brand ở CRM", () => {
  test("ca có dòng Finance (vd đã Duyệt, cột DB mặc định 15%) vẫn ăn % của brand — trước 06/10 dòng Finance thắng", () => {
    const fin: SessionFinance = { sessionId: "s1", agencyCommissionRate: 15, studioCost: 0, adsCost: 0, approvalStatus: "approved", notes: "" };
    const p = computeSessionPnl(ca(), { s1: fin }, {}, { vera: brand() }, [rate({ commissionRate: 10 })], [], []);
    expect(p.agencyCommissionRate).toBe(10);
    expect(p.grossAgencyRev).toBe(10_000_000);
    expect(p.missingInputs).not.toContain("commission_default");
  });
  test("brand chưa đặt % ⇒ mặc định và báo thiếu, kể cả khi ca đã có dòng Finance", () => {
    const fin: SessionFinance = { sessionId: "s1", agencyCommissionRate: 15, studioCost: 0, adsCost: 0, approvalStatus: "pending", notes: "" };
    const p = computeSessionPnl(ca(), { s1: fin }, {}, { vera: brand() }, [], [], []);
    expect(p.missingInputs).toContain("commission_default");
  });
  test("Ads theo ca chỉ lấy từ report ca (bỏ ô thứ hai ở Finance)", () => {
    const fin: SessionFinance = { sessionId: "s1", agencyCommissionRate: 15, studioCost: 0, adsCost: 999, approvalStatus: "pending", notes: "" };
    const s = ca({ report: { adsCost: 300 } as LiveSession["report"] });
    expect(sessionAdsCost(s)).toBe(300);
    const p = computeSessionPnl(s, { s1: fin }, {}, { vera: brand() }, [rate({ commissionRate: 10 })], [], []);
    expect(p.grossAgencyRev - p.netProfit).toBe(300); // chi phí = Ads report ca, không phải 999 của dòng Finance
  });
});

describe("brand × sàn đã có giá — một luật cho Việc cần làm, Toàn Cảnh Brand, CRM", () => {
  test("thu theo %: % đã đặt (kể cả 0%) là có giá; đơn giá/giờ không tính", () => {
    expect(brandPriceSet(brand(), [rate({ ratePerHour: 300_000 })], "TikTok")).toBe(false);
    expect(brandPriceSet(brand(), [rate({ commissionRate: 0 })], "TikTok")).toBe(true);
    expect(brandPriceLabel(brand(), [rate({ commissionRate: 8 })], "TikTok")).toBe("8% NMV");
  });
  test("thu theo giờ: cần đơn giá/giờ > 0, đúng sàn", () => {
    const hourly = brand({ billingModel: "hourly" });
    expect(brandPriceSet(hourly, [rate({ commissionRate: 10 })], "TikTok")).toBe(false);
    expect(brandPriceSet(hourly, [rate({ ratePerHour: 300_000 })], "TikTok")).toBe(true);
    expect(brandPriceSet(hourly, [rate({ ratePerHour: 300_000 })], "Shopee")).toBe(false);
  });
});

test("rate talent đang áp: rate/giờ thắng rate/phiên (cùng thứ tự pnl.ts)", () => {
  expect(talentRateLabel({ ratePerHour: 0, ratePerSession: 0 })).toBeNull();
  expect(talentRateLabel({ ratePerHour: 0, ratePerSession: 500_000 })).toContain("/live");
  expect(talentRateLabel({ ratePerHour: 120_000, ratePerSession: 500_000 })).toContain("/giờ");
});

test("link cũ của tab đã gộp vẫn mở đúng chỗ mới", () => {
  expect(parsePath("/cam-ket-hop-dong")).toEqual({ type: "agency", tab: "crm" });
  expect(parsePath("/brand/vera/rate-card")).toEqual({ type: "brand", brandSlug: "vera", tab: "brand_commitment_view" });
});
