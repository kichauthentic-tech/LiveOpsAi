// Phạm vi dịch vụ theo brand × sàn (0190, 29/10): CROCS đủ Ads + Affiliate; VERA/JOCKEY chỉ live, brand có tự live.
// Chạy: npx vitest run tests/reportScope.test.ts
import { expect, test } from "vitest";
import type { BrandPlatformRate } from "../src/types";
import { DEFAULT_REPORT_SCOPE, outOfScopeLabel, reportScopeOf } from "../src/lib/report/reportScope";

const rate = (p: Partial<BrandPlatformRate>): BrandPlatformRate => ({ id: "r", brandId: "b", platform: "TikTok", ratePerHour: 0, returnRate: 0, ...p });

test("chưa có dòng giá hoặc DB chưa chạy 0190 ⇒ hành vi cũ", () => {
  expect(reportScopeOf([], "b", "TikTok")).toEqual(DEFAULT_REPORT_SCOPE);
  expect(reportScopeOf([rate({})], "b", "TikTok")).toEqual({ ads: true, affiliate: true, inhouseLive: false });
  expect(outOfScopeLabel(DEFAULT_REPORT_SCOPE)).toBeNull();
});

test("VERA: chỉ live + tự live, đúng sàn", () => {
  const rates = [rate({ scopeAds: false, scopeAffiliate: false, hasInhouseLive: true }), rate({ platform: "Shopee" })];
  expect(reportScopeOf(rates, "b", "TikTok")).toEqual({ ads: false, affiliate: false, inhouseLive: true });
  expect(reportScopeOf(rates, "b", "Shopee")).toEqual(DEFAULT_REPORT_SCOPE);
  expect(outOfScopeLabel(reportScopeOf(rates, "b", "TikTok"))).toBe("ngoài phạm vi YFB: Ads, Affiliate · brand có tự live — trang Toàn shop rút gọn");
});
