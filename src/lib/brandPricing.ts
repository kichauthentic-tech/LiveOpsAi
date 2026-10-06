import type { Brand, BrandPlatformRate } from "../types";
import { fmtVndShort } from "./format";

// "Brand × sàn đã có giá chưa" — MỘT luật cho Việc cần làm, Toàn Cảnh Brand và CRM (gộp cấu hình 06/10). Trước đó ba
// màn kiểm ba kiểu: Toàn Cảnh chỉ nhìn đơn giá/giờ (brand thu theo % hoa hồng luôn hiện "Chưa nhập"), Việc cần làm
// nhận bất kỳ sàn nào có số, còn P&L (lib/pnl.ts) xét theo cách thu phí. Luật ở đây bám đúng đường tính của P&L:
// thu theo giờ ⇒ cần đơn giá/giờ > 0; thu theo % ⇒ cần % hoa hồng đã đặt (0% là đã đặt — "không thu", khác chưa đặt).

export function rateOf(rates: BrandPlatformRate[], brandId: string, platform: "TikTok" | "Shopee"): BrandPlatformRate | undefined {
  return rates.find((r) => r.brandId === brandId && r.platform === platform);
}

export function brandPriceSet(brand: Pick<Brand, "id" | "billingModel">, rates: BrandPlatformRate[], platform: "TikTok" | "Shopee"): boolean {
  const r = rateOf(rates, brand.id, platform);
  if (!r) return false;
  return brand.billingModel === "hourly" ? r.ratePerHour > 0 : r.commissionRate != null;
}

/** Nhãn ngắn của giá đang áp dụng ("350K/giờ", "10% NMV"); null = chưa có giá. */
export function brandPriceLabel(brand: Pick<Brand, "id" | "billingModel">, rates: BrandPlatformRate[], platform: "TikTok" | "Shopee"): string | null {
  if (!brandPriceSet(brand, rates, platform)) return null;
  const r = rateOf(rates, brand.id, platform)!;
  return brand.billingModel === "hourly" ? `${fmtVndShort(r.ratePerHour)}/giờ` : `${r.commissionRate}% NMV`;
}
