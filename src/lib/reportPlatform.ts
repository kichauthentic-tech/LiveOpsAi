// Sàn (TikTok / Shopee) là một chiều ngang hàng brand (user chốt 06/10): mỗi brand × sàn có report (0139), kế hoạch +
// target (0140), hợp đồng riêng. Mọi so sánh (target, run-rate, benchmark, xếp host) chỉ tính TRONG một sàn; chỉ GMV tổng
// mới cộng hai sàn. Dòng cũ trước 0139/0140 đều là TikTok.
import type { LiveSession } from "../types";

export type ReportPlatform = "TikTok" | "Shopee";
export const REPORT_PLATFORMS: ReportPlatform[] = ["TikTok", "Shopee"];

/**
 * Sàn "chỉ lịch" (user chốt 20/11, CROCS Website): có ca, đăng ký, lịch, giờ công, lương — KHÔNG có report, target, file số
 * liệu, tracking. `ReportPlatform` / `REPORT_PLATFORMS` vẫn chỉ là hai sàn có số liệu: mọi màn số liệu lặp theo chúng nên
 * Website tự động không xuất hiện ở đó. Chỉ lịch + lương mới dùng `SchedulePlatform` / `SCHEDULE_PLATFORMS`.
 */
export type SchedulePlatform = ReportPlatform | "Website";
export const WEBSITE_PLATFORM = "Website" as const;
export const SCHEDULE_PLATFORMS: SchedulePlatform[] = ["TikTok", "Shopee", "Website"];
export const isScheduleOnly = (x: { platform?: string | null }) => x.platform === WEBSITE_PLATFORM;
/** Bỏ dòng của sàn chỉ lịch — dùng ở đường vào của mọi màn số liệu (GMV, run-rate, target, xếp hạng host). */
export const withoutScheduleOnly = <T extends { platform?: string | null }>(rows: readonly T[]): T[] => rows.filter((r) => !isScheduleOnly(r));

/**
 * Sàn đang xem. 07/10 (user chốt): hai sàn khác bản chất dữ liệu nên KHÔNG có phạm vi "tất cả sàn" cho bất kỳ màn số liệu nào —
 * chỉ lịch (Bảng Vận Hành, Nhân sự ca) và tài nguyên chung (talent, studio, lương theo người) nhìn xuyên sàn. Giữ tên
 * `PlatformScope` cho chỗ đã dùng; kiểu này không còn giá trị "all" nên màn nào muốn "cả hai" là lỗi compile.
 */
export type PlatformScope = ReportPlatform;
/**
 * Bộ lọc kênh của một màn (Bước 3 lộ trình đa sàn, 07/10): màn "mọi kênh" (Dashboard CEO, Sổ Ca, Hiệu Suất Host, Toàn Cảnh,
 * Điều Phối Phát Hành, Lịch) nhận thêm "all" và hiện KHỐI RIÊNG từng sàn — không bao giờ một con số hiệu suất gộp hai sàn.
 */
export type ChannelScope = ReportPlatform | "all";
/**
 * Phạm vi thật của một màn từ lựa chọn của người dùng: màn mọi kênh giữ "Tất cả" khi có hơn một sàn; màn một kênh (hoặc lựa
 * chọn là sàn không có ở đây) quy về sàn đơn gần nhất, không thì sàn đầu.
 */
export function resolveChannelScope(choice: ChannelScope, single: ReportPlatform, platforms: ReportPlatform[], tabScope: "all" | "one"): ChannelScope {
  if (tabScope === "all" && choice === "all" && platforms.length > 1) return "all";
  if (choice !== "all" && platforms.includes(choice)) return choice;
  return platforms.includes(single) ? single : platforms[0] ?? LEGACY_PLATFORM;
}

export const inChannelScope = (s: { platform?: string | null }, scope: ChannelScope) => scope === "all" || platformOf(s) === scope;


/** Sàn của một dòng (ca, ca mở, kế hoạch…). Dòng cũ thiếu cột sàn = TikTok. */
export const platformOf = (x: { platform?: string | null }): ReportPlatform =>
  (REPORT_PLATFORMS as readonly string[]).includes(x.platform ?? "") ? (x.platform as ReportPlatform) : LEGACY_PLATFORM;

/** Như `platformOf` nhưng giữ "Website" — dùng ở lịch/lương/khoá Map brand × sàn. Màn số liệu dùng `platformOf` (Website đã bị lọc trước). */
export const schedulePlatformOf = (x: { platform?: string | null }): SchedulePlatform => (x.platform === WEBSITE_PLATFORM ? WEBSITE_PLATFORM : platformOf(x));

/** Sàn mặc định của dòng cũ (trước 0139 mọi thứ là TikTok) — khoá Map của sàn này không có hậu tố. */
export const LEGACY_PLATFORM: ReportPlatform = "TikTok";

/** Hậu tố khoá của sàn trong id việc / khoá cũ: TikTok "" (giữ khoá cũ), sàn khác "-shopee". */
export const platformIdSuffix = (p: SchedulePlatform) => (p === LEGACY_PLATFORM ? "" : `-${p.toLowerCase()}`);

/** Tên kênh hiện trên màn: "VERA · Shopee"; brand chỉ một kênh trên sàn mặc định thì giữ tên brand ("CROCS"). */
export const channelTitle = (brandName: string, platform: SchedulePlatform, multi: boolean) =>
  multi || platform !== LEGACY_PLATFORM ? `${brandName} · ${platform}` : brandName;

export const inPlatformScope = (s: { platform?: string | null }, scope: PlatformScope) => platformOf(s) === scope;

/**
 * Khoá brand × tháng × sàn dùng ở mọi Map (report, tổng target kế hoạch, target theo ngày…). TikTok giữ khoá cũ
 * "brandId|YYYY-MM" (mọi nơi đọc trước 0139 đều là TikTok); Shopee thêm hậu tố "|Shopee".
 */
export const brandMonthKey = (brandId: string, month: string, platform: SchedulePlatform | string | null | undefined = "TikTok") =>
  `${brandId}|${month.slice(0, 7)}${schedulePlatformOf({ platform }) === LEGACY_PLATFORM ? "" : `|${schedulePlatformOf({ platform })}`}`;

/** Khoá brand × sàn (Map kế hoạch theo tháng: brandId cho TikTok, "brandId|Shopee" cho Shopee). */
export const brandPlatformKey = (brandId: string, platform: ReportPlatform | string | null | undefined = "TikTok") =>
  schedulePlatformOf({ platform }) === LEGACY_PLATFORM ? brandId : `${brandId}|${schedulePlatformOf({ platform })}`;

export const sessionBrandMonthKey = (s: Pick<LiveSession, "brandId" | "date" | "platform">) => brandMonthKey(s.brandId, s.date, s.platform);
