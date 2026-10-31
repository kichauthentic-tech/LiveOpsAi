import type { Brand, BrandPlatformRate } from "../types";
import { fmtVndShort } from "./format";
import { currentStandard, termsLabel, validateTerms, type TermsPeriod } from "./commercial/terms";
import { todayVn } from "./performance/brandCommitment";

// "Brand × sàn đã có giá chưa" — MỘT luật cho Việc cần làm, Toàn Cảnh Brand và CRM (gộp cấu hình 06/10). Trước đó ba
// màn kiểm ba kiểu: Toàn Cảnh chỉ nhìn đơn giá/giờ (brand thu theo % hoa hồng luôn hiện "Chưa nhập"), Việc cần làm
// nhận bất kỳ sàn nào có số, còn P&L (lib/pnl.ts) xét theo cách thu phí. Luật ở đây bám đúng đường tính của P&L:
// thu theo giờ ⇒ cần đơn giá/giờ > 0; thu theo % ⇒ cần % hoa hồng đã đặt (0% là đã đặt — "không thu", khác chưa đặt).

export function rateOf(rates: BrandPlatformRate[], brandId: string, platform: "TikTok" | "Shopee"): BrandPlatformRate | undefined {
  return rates.find((r) => r.brandId === brandId && r.platform === platform);
}

// Điều khoản hợp tác (0191) đứng trước: đã khai và không còn lỗi (khoản theo giờ thiếu đơn giá, chưa có khoản phí nào…) là có giá,
// bất kể brand.billingModel cũ. Chưa khai điều khoản thì rơi về luật cũ bên dưới.
export function brandPriceSet(brand: Pick<Brand, "id" | "billingModel">, rates: BrandPlatformRate[], platform: "TikTok" | "Shopee", periods: TermsPeriod[] = [], today: string = todayVn()): boolean {
  const cur = periods.length > 0 ? currentStandard(periods, brand.id, platform, today) : undefined;
  if (cur) return !validateTerms(cur.terms).some((i) => i.level === "error");
  const r = rateOf(rates, brand.id, platform);
  if (!r) return false;
  return brand.billingModel === "hourly" ? r.ratePerHour > 0 : r.commissionRate != null;
}

/** Nhãn ngắn của giá đang áp dụng ("350K/giờ", "10% NMV"); null = chưa có giá. */
export function brandPriceLabel(brand: Pick<Brand, "id" | "billingModel">, rates: BrandPlatformRate[], platform: "TikTok" | "Shopee", periods: TermsPeriod[] = [], today: string = todayVn()): string | null {
  if (!brandPriceSet(brand, rates, platform, periods, today)) return null;
  const cur = periods.length > 0 ? currentStandard(periods, brand.id, platform, today) : undefined;
  if (cur) return termsLabel(cur.terms);
  const r = rateOf(rates, brand.id, platform)!;
  return brand.billingModel === "hourly" ? `${fmtVndShort(r.ratePerHour)}/giờ` : `${r.commissionRate}% NMV`;
}
