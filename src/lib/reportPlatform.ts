// Sàn (TikTok / Shopee) là một chiều ngang hàng brand (user chốt 06/10): mỗi brand × sàn có report (0139), kế hoạch +
// target (0140), hợp đồng riêng. Mọi so sánh (target, run-rate, benchmark, xếp host) chỉ tính TRONG một sàn; chỉ GMV tổng
// mới cộng hai sàn. Dòng cũ trước 0139/0140 đều là TikTok.
import type { LiveSession } from "../types";

export type ReportPlatform = "TikTok" | "Shopee";
export const REPORT_PLATFORMS: ReportPlatform[] = ["TikTok", "Shopee"];

/**
 * Sàn đang xem. 07/10 (user chốt): hai sàn khác bản chất dữ liệu nên KHÔNG có phạm vi "tất cả sàn" cho bất kỳ màn số liệu nào —
 * chỉ lịch (Bảng Vận Hành, Nhân sự ca) và tài nguyên chung (talent, studio, lương theo người) nhìn xuyên sàn. Giữ tên
 * `PlatformScope` cho chỗ đã dùng; kiểu này không còn giá trị "all" nên màn nào muốn "cả hai" là lỗi compile.
 */
export type PlatformScope = ReportPlatform;
export const PLATFORM_SCOPE_LABEL: Record<PlatformScope, string> = { TikTok: "TikTok", Shopee: "Shopee" };

/** Sàn của một dòng (ca, ca mở, kế hoạch…). Dòng cũ thiếu cột sàn = TikTok. */
export const platformOf = (x: { platform?: string | null }): ReportPlatform => (x.platform === "Shopee" ? "Shopee" : "TikTok");

export const inPlatformScope = (s: { platform?: string | null }, scope: PlatformScope) => platformOf(s) === scope;

/**
 * Khoá brand × tháng × sàn dùng ở mọi Map (report, tổng target kế hoạch, target theo ngày…). TikTok giữ khoá cũ
 * "brandId|YYYY-MM" (mọi nơi đọc trước 0139 đều là TikTok); Shopee thêm hậu tố "|Shopee".
 */
export const brandMonthKey = (brandId: string, month: string, platform: ReportPlatform | string | null | undefined = "TikTok") =>
  `${brandId}|${month.slice(0, 7)}${platform === "Shopee" ? "|Shopee" : ""}`;

/** Khoá brand × sàn (Map kế hoạch theo tháng: brandId cho TikTok, "brandId|Shopee" cho Shopee). */
export const brandPlatformKey = (brandId: string, platform: ReportPlatform | string | null | undefined = "TikTok") =>
  platform === "Shopee" ? `${brandId}|Shopee` : brandId;

export const sessionBrandMonthKey = (s: Pick<LiveSession, "brandId" | "date" | "platform">) => brandMonthKey(s.brandId, s.date, s.platform);

/** Sàn brand đang chạy (có ít nhất một ca hoặc một phòng gắn sàn đó), TikTok trước. Brand chưa có gì ⇒ ["TikTok"]. */
export function brandPlatformsOf(
  brandId: string,
  sessions: { brandId?: string; platform?: string | null }[],
  extra: { brandId?: string; platform?: string | null }[] = []
): ReportPlatform[] {
  const seen = new Set<ReportPlatform>();
  for (const s of sessions) if (s.brandId === brandId) seen.add(s.platform === "Shopee" ? "Shopee" : "TikTok");
  for (const s of extra) if (s.brandId === brandId) seen.add(s.platform === "Shopee" ? "Shopee" : "TikTok");
  const out = REPORT_PLATFORMS.filter((p) => seen.has(p));
  return out.length ? out : ["TikTok"];
}
