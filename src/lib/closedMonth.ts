import type { BrandMonthlyReport, LiveSession } from "../types";
import { sessionBrandMonthKey } from "./reportPlatform";

// Phát hành Report Tháng = đóng sổ (0133): trigger DB chặn mọi ghi số/lịch/người/loại/huỷ/xoá ca của brand × sàn × tháng đó.
// `LiveSession.monthPublished` KHÔNG dùng được cho việc này — với ceo/admin/ops/talent nó luôn true (chỉ để che số của brand).
// Ops cần biết TRƯỚC khi bấm Lưu: hàm này đọc thẳng dòng report (App đã nạp `monthlyReports`).
export function isSessionMonthClosed(reports: ReadonlyMap<string, BrandMonthlyReport>, s: Pick<LiveSession, "brandId" | "date" | "platform">): boolean {
  return reports.get(sessionBrandMonthKey(s))?.status === "published";
}

export const CLOSED_MONTH_NOTICE =
  "Tháng này đã phát hành Report nên số, lịch và người đã đóng sổ. Muốn sửa thì thu hồi report ở Toàn Cảnh Brand.";

/**
 * Hậu quả của việc phát hành, nói MỘT lần. Audit chữ 13/11: câu này trước đó viết riêng ở `BrandMonthlyReport` và
 * `useReportPublish` với hai cách diễn đạt khác nhau (phát hiện "một việc nói hai lần").
 */
export const publishClosesMonthNotice = (platform: string): string =>
  `Phát hành = đóng sổ ${platform} của tháng: không sửa/đối soát/huỷ ca ${platform} tháng này được nữa cho tới khi thu hồi report. Ca sàn kia không ảnh hưởng.`;
