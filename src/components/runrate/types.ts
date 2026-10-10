import type { Brand } from "../../types";
import type { ReportPlatform } from "../../lib/reportPlatform";
import type { AccountRunRate } from "../../lib/performance/runRateUpdate";

/** Một tài khoản = một kênh brand × sàn. Không có trường nào cộng với tài khoản khác. */
export interface AccountVM {
  key: string;
  brand: Brand;
  platform: ReportPlatform;
  /** "CROCS" hoặc "VERA · Shopee" khi brand chạy hai sàn. */
  name: string;
  planStatus: "locked" | "draft" | "none";
  /** null = chưa có kế hoạch chốt (hoặc ca kế hoạch chưa nạp xong). */
  report: AccountRunRate | null;
  /** Số đã đạt trong tháng khi chưa có target. */
  actualOnly: number;
  /** Ngày đủ số của kênh trong tháng (dataCoverage) — số tới sau mốc này là tạm tính. */
  completeThrough: string | null;
  missingSessions: number;
  oldestMissing: string | null;
  /** Đang đọc ca kế hoạch của kênh. */
  loading: boolean;
}
