import type { BrandChannel } from "../types";
import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "./reportPlatform";

// Kênh = brand × sàn (0149). Mọi màn hỏi "brand này chạy sàn nào / có những kênh nào" đều đi qua đây, đọc từ bảng
// brand_channels — KHÔNG suy từ ca/phòng/kế hoạch như trước (7 chỗ đoán theo 5 kiểu khác nhau, audit 07/10).

/** Kênh của brand, TikTok trước. `includePaused` = cả kênh tạm dừng (màn lịch sử / report vẫn cần thấy). */
export function channelsOfBrand(channels: readonly BrandChannel[], brandId: string, includePaused = true): BrandChannel[] {
  return REPORT_PLATFORMS.flatMap((p) => channels.filter((c) => c.brandId === brandId && c.platform === p && (includePaused || c.status === "active")));
}

/** Sàn brand đang có kênh, TikTok trước. Brand chưa có kênh nào ⇒ [] (màn tự nói "chưa có kênh", không đoán TikTok). */
export const platformsOfBrand = (channels: readonly BrandChannel[], brandId: string, includePaused = true): ReportPlatform[] =>
  channelsOfBrand(channels, brandId, includePaused).map((c) => c.platform);

export const findChannel = (channels: readonly BrandChannel[], brandId: string, platform: ReportPlatform) =>
  channels.find((c) => c.brandId === brandId && c.platform === platform);

/**
 * Chỉ dùng khi DB CHƯA có bảng brand_channels (0149 chưa chạy): suy kênh từ dòng đang có (ca, ca mở, phòng mặc định,
 * giá…) như cách cũ, để app vẫn chạy trong khoảng giữa deploy và migration. Có bảng rồi thì không bao giờ gọi.
 */
export function deriveChannels(rows: readonly { brandId?: string; platform?: string | null }[]): BrandChannel[] {
  const seen = new Map<string, BrandChannel>();
  for (const r of rows) {
    if (!r.brandId) continue;
    const platform = platformOf(r);
    const key = `${r.brandId}|${platform}`;
    if (!seen.has(key)) seen.set(key, { id: `derived:${key}`, brandId: r.brandId, platform, shopName: "", shopRef: "", status: "active", note: "" });
  }
  return [...seen.values()];
}
