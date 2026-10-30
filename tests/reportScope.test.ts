// Phạm vi dịch vụ theo brand × sàn (0190, 29/10): CROCS đủ Ads + Affiliate; VERA/JOCKEY chỉ live, brand có tự live.
// Chạy: npx vitest run tests/reportScope.test.ts
import { expect, test } from "vitest";
import type { BrandPlatformRate } from "../src/types";
import { DEFAULT_REPORT_SCOPE, outOfScopeLabel, reportScopeOf } from "../src/lib/report/reportScope";
import { shopBlocks } from "../src/lib/report/pageInsights";

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

// 30/10: shop chỉ nhận livestream + brand tự live vẫn có nhóm đối chứng; việc ở kênh khác là thông tin cho brand.
test("Toàn shop VERA: so với các kênh còn lại, tách brand tự live, không nhận việc kênh khác", () => {
  const b = shopBlocks({
    totalChange: 4.3,
    windowLabel: "1–30/09",
    channels: [
      { label: "Livestream YFB", delta: -126e6, yfb: true },
      { label: "Brand tự live", delta: 54e6 },
      { label: "Product card", delta: -20e6 }
    ],
    control: [{ label: "Daily", liveChg: -23, restChg: 29, verdict: "ops" }],
    inhouseLive: true,
    liveOnly: true
  });
  expect(b.cause).toContain("YFB chỉ vận hành livestream nên các kênh còn lại là nhóm đối chứng");
  expect(b.cause).toContain("Phiên brand tự live không tính vào bên nào.");
  expect(b.cause).not.toContain("Không so livestream");
  expect(b.advise).toContain("Rà soát khung giờ");
  expect(b.advise).not.toContain("Trao đổi với brand kế hoạch Livestream YFB");
  const other = shopBlocks({ totalChange: 1, windowLabel: "", channels: [{ label: "Video", delta: -50e6 }], control: [], liveOnly: true });
  expect(other.advise).toMatch(/^Thông tin cho brand: Video giảm .* YFB không có việc ở kênh này\.$/);
  // CROCS (đủ phạm vi) giữ lời cũ.
  const crocs = shopBlocks({ totalChange: 1, windowLabel: "", channels: [{ label: "Video", delta: -50e6 }], control: [] });
  expect(crocs.advise).toBe("Trao đổi với brand kế hoạch Video cho tháng sau và theo dõi tỷ trọng kênh.");
});
