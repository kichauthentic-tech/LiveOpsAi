import type { BrandMonthlyReport, LiveSession } from "../types";
import { sessionBrandMonthKey } from "./reportPlatform";

// Phát hành Report Tháng = đóng sổ (0133): trigger DB chặn mọi ghi số/lịch/người/loại/huỷ/xoá ca của brand × sàn × tháng đó.
// `LiveSession.monthPublished` KHÔNG dùng được cho việc này — với ceo/admin/ops/talent nó luôn true (chỉ để che số của brand).
// Ops cần biết TRƯỚC khi bấm Lưu: hàm này đọc thẳng dòng report (App đã nạp `monthlyReports`).
export function isSessionMonthClosed(reports: ReadonlyMap<string, BrandMonthlyReport>, s: Pick<LiveSession, "brandId" | "date" | "platform">): boolean {
  return reports.get(sessionBrandMonthKey(s))?.status === "published";
}

export const CLOSED_MONTH_NOTICE =
  "Tháng này đã phát hành Report cho brand nên số, lịch và người đã đóng sổ. Muốn sửa: Toàn Cảnh Brand → cột Report Tháng → Thu hồi, sửa xong phát hành lại.";
