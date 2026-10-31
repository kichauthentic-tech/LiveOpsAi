import type { BrandPlatformRate } from "../../types";
import { resolveTerms, type TermsPeriod } from "../commercial/terms";

// PHẠM VI DỊCH VỤ của một brand × sàn (0190, 29/10) — Report Tháng chọn trang/khối theo việc YFB thật sự làm, không
// theo "có file hay không" (VERA có file Ads + Affiliate nhiều tháng dù YFB chỉ live). Khai ở CRM → Hợp đồng & giá.
// Chưa có dòng giá / DB chưa chạy 0190 ⇒ hành vi cũ: bật Ads + Affiliate, không tự live.

export interface ReportScope {
  /** YFB chạy Ads toàn shop ⇒ trang Ads, khối Ads ở Tổng quan / Tháng sau, Chốt tháng đòi số Ads. */
  ads: boolean;
  /** YFB book creator affiliate ⇒ trang Affiliate, khối Booking ở Tháng sau, Chốt tháng đòi file Affiliate. */
  affiliate: boolean;
  /** Brand tự live cùng tài khoản shop ⇒ trang Toàn shop rút gọn (không nhóm đối chứng, không Direct/Indirect). */
  inhouseLive: boolean;
}

export const DEFAULT_REPORT_SCOPE: ReportScope = { ads: true, affiliate: true, inhouseLive: false };

/**
 * Phạm vi của brand × sàn. Có điều khoản hợp tác (0191) phủ ngày `asOf` (report: ngày cuối tháng) thì phạm vi lấy từ dịch vụ
 * đã chọn trong điều khoản; không thì dùng ba cột cũ ở brand_platform_rates.
 */
export function reportScopeOf(rates: BrandPlatformRate[], brandId: string, platform: BrandPlatformRate["platform"], periods: TermsPeriod[] = [], asOf?: string): ReportScope {
  const period = periods.length > 0 && asOf ? resolveTerms(periods, brandId, platform, asOf) : undefined;
  if (period) return { ads: period.terms.services.includes("ads"), affiliate: period.terms.services.includes("affiliate"), inhouseLive: period.terms.inhouseLive };
  const r = rates.find((x) => x.brandId === brandId && x.platform === platform);
  return {
    ads: r?.scopeAds ?? DEFAULT_REPORT_SCOPE.ads,
    affiliate: r?.scopeAffiliate ?? DEFAULT_REPORT_SCOPE.affiliate,
    inhouseLive: r?.hasInhouseLive ?? DEFAULT_REPORT_SCOPE.inhouseLive
  };
}

/** Dòng "ngoài phạm vi" ops thấy ở đầu report thay vì trang trống; null = đủ phạm vi. */
export function outOfScopeLabel(scope: ReportScope): string | null {
  const off = [!scope.ads && "Ads", !scope.affiliate && "Affiliate"].filter(Boolean) as string[];
  const parts = [off.length ? `ngoài phạm vi YFB: ${off.join(", ")}` : null, scope.inhouseLive ? "brand có tự live — trang Toàn shop rút gọn" : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
