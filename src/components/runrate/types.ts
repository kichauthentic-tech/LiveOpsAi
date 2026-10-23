import type { Brand } from "../../types";
import type { ReportPlatform } from "../../lib/reportPlatform";
import type { AccountRunRate } from "../../lib/performance/runRateUpdate";
import type { ChannelCard } from "../../lib/performance/channelCard";

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
  /** Dashboard (22/10): thẻ kênh của cùng kênh — có thì số cuối tháng = dự báo `card.forecast` + nhãn khả năng đạt (một luật với
   *  Chi tiết kênh), màu theo nhãn đó, không in "Giữ nhịp"/"Đúng tiến độ" (luật 21/10: run-rate trên thẻ chỉ là số). */
  card?: ChannelCard;
}
