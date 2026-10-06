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
export const platformOf = (x: { platform?: string | null }): ReportPlatform =>
  (REPORT_PLATFORMS as readonly string[]).includes(x.platform ?? "") ? (x.platform as ReportPlatform) : LEGACY_PLATFORM;

/** Sàn mặc định của dòng cũ (trước 0139 mọi thứ là TikTok) — khoá Map của sàn này không có hậu tố. */
export const LEGACY_PLATFORM: ReportPlatform = "TikTok";

/** Hậu tố khoá của sàn trong id việc / khoá cũ: TikTok "" (giữ khoá cũ), sàn khác "-shopee". */
export const platformIdSuffix = (p: ReportPlatform) => (p === LEGACY_PLATFORM ? "" : `-${p.toLowerCase()}`);

/** Tên kênh hiện trên màn: "VERA · Shopee"; brand chỉ một kênh trên sàn mặc định thì giữ tên brand ("CROCS"). */
export const channelTitle = (brandName: string, platform: ReportPlatform, multi: boolean) =>
  multi || platform !== LEGACY_PLATFORM ? `${brandName} · ${platform}` : brandName;

export const inPlatformScope = (s: { platform?: string | null }, scope: PlatformScope) => platformOf(s) === scope;

/**
 * Khoá brand × tháng × sàn dùng ở mọi Map (report, tổng target kế hoạch, target theo ngày…). TikTok giữ khoá cũ
 * "brandId|YYYY-MM" (mọi nơi đọc trước 0139 đều là TikTok); Shopee thêm hậu tố "|Shopee".
 */
export const brandMonthKey = (brandId: string, month: string, platform: ReportPlatform | string | null | undefined = "TikTok") =>
  `${brandId}|${month.slice(0, 7)}${platformOf({ platform }) === LEGACY_PLATFORM ? "" : `|${platformOf({ platform })}`}`;

/** Khoá brand × sàn (Map kế hoạch theo tháng: brandId cho TikTok, "brandId|Shopee" cho Shopee). */
export const brandPlatformKey = (brandId: string, platform: ReportPlatform | string | null | undefined = "TikTok") =>
  platformOf({ platform }) === LEGACY_PLATFORM ? brandId : `${brandId}|${platformOf({ platform })}`;

export const sessionBrandMonthKey = (s: Pick<LiveSession, "brandId" | "date" | "platform">) => brandMonthKey(s.brandId, s.date, s.platform);
