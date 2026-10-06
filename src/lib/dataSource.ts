import type { LiveSession } from "../types";

// Thang nguồn số của một ca — MỘT thang cho mọi sàn (Bước 4 lộ trình đa sàn, 07/10). Giá trị DB giữ tên cũ:
//   'manual'            tự khai / nạp từ bảng tính (Working File)                       ⇒ bậc "Tạm tính"
//   'handover_typed'    số dashboard gõ lúc giao ca, app trừ ca nối (Shopee, 0150)       ⇒ bậc "Số lúc giao ca"
//   'live_snapshot'     file Creator-Live-Performance up lúc giao ca (TikTok, 0078)      ⇒ bậc "Số lúc giao ca"
//   'tiktok_reconciled' đối soát cuối kỳ bằng file của sàn (TikTok hoặc Shopee Live List) ⇒ bậc "Đã đối soát"
// Màn hình đọc BẬC qua `dataSourceTier`, không so chuỗi giá trị DB.
export type DataSourceTier = "manual" | "handover" | "reconciled";

export function dataSourceTier(s: Pick<LiveSession, "dataSource">): DataSourceTier {
  if (s.dataSource === "tiktok_reconciled") return "reconciled";
  if (s.dataSource === "live_snapshot" || s.dataSource === "handover_typed") return "handover";
  return "manual";
}

/** Ca có số từ giao ca trở lên (file hoặc gõ lúc giao ca, hoặc đối soát) — kể cả bán 0 đồng, đó là kết quả thật. */
export const hasHandoverOrBetter = (s: Pick<LiveSession, "dataSource">) => dataSourceTier(s) !== "manual";
