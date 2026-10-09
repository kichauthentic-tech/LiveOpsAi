import type { Brand, LiveSession } from "../../types";
import type { Issue, MonthOutlook, Totals } from "../../lib/performance/ceoBrief";
import type { HandlingPlan } from "../../lib/performance/handlingPlan";
import type { PlanRunRate } from "../../lib/performance/planRunRate";
import type { ReportPlatform } from "../../lib/reportPlatform";

/**
 * Mọi thứ một sàn của Dashboard cần để vẽ, tính MỘT lần ở CeoBrief rồi truyền xuống các tab (09/10/2026).
 * Kênh = brand × sàn; mỗi brand trong `brands` đã là brand CHẠY SÀN NÀY (App lọc `brandsOn(p)`), nên khoá theo brandId là đủ.
 */
export interface DashModel {
  platform: ReportPlatform;
  today: string;
  month: string;
  /** Brand chạy sàn này. */
  brands: Brand[];
  /** Brand đang xem (rỗng = tất cả). */
  scopeIds: string[];
  /** Ca của sàn này (mọi brand) / ca của phạm vi đang xem. */
  platformSessions: LiveSession[];
  scopeSessions: LiveSession[];
  outlooks: Map<string, MonthOutlook>;
  /** Cộng các brand trong phạm vi (target chỉ của brand có kế hoạch — xem `targetScope`). */
  scopeOutlook: MonthOutlook;
  /** Run-rate theo kế hoạch đã chốt, từng brand; thiếu = brand chưa chốt kế hoạch tháng này. */
  planRR: Map<string, PlanRunRate>;
  handling: Map<string, HandlingPlan>;
  /** Totals kỳ đang xem của phạm vi. */
  cur: Totals;
  prev: Totals;
  issues: Issue[];
  channelName: (b: Brand) => string;
}
