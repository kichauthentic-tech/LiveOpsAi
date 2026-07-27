/**
 * Adaptive VND currency formatting: picks đ / triệu / tỷ based on magnitude
 * so a 500tr campaign doesn't render as "0.50 Tỷ".
 */
export function formatCurrencyAdaptive(amountVnd: number, unit = "đ"): string {
  const abs = Math.abs(amountVnd);
  const suffix = unit ? ` ${unit}` : "";

  if (abs >= 1_000_000_000) {
    return `${(amountVnd / 1_000_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ${suffix}`;
  }
  if (abs >= 1_000_000) {
    return `${(amountVnd / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} triệu${suffix}`;
  }
  return `${amountVnd.toLocaleString("vi-VN")}${suffix}`;
}
