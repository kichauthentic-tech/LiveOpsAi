import type { Brand, LiveSession } from "../../types";
import type { CampDayBucket } from "../../lib/campaignDays";
import type { Issue, MonthOutlook, Totals } from "../../lib/performance/ceoBrief";
import type { ChannelVerdict, DataCoverage, DataDisciplineRow, GmvTree, TargetFeasibility, WaveReadiness } from "../../lib/performance/channelHealth";
import type { HandlingPlan } from "../../lib/performance/handlingPlan";
import type { PlanRunRate } from "../../lib/performance/planRunRate";
import type { CommitmentProgress } from "../../lib/performance/brandCommitment";
import type { ReportPlatform } from "../../lib/reportPlatform";

/** Sức khoẻ một kênh brand × sàn trong tháng đang xem (lib/performance/channelHealth.ts) — tính một lần ở CeoBrief. */
export interface ChannelHealth {
  coverage: DataCoverage;
  feasibility: TargetFeasibility | null;
  /** Cây GMV/giờ ngày thường, cùng loại ngày tháng trước. */
  tree: GmvTree | null;
  wave: WaveReadiness | null;
  verdict: ChannelVerdict;
  discipline: DataDisciplineRow;
  /** Cam kết giờ của tháng (CRM / Kế Hoạch Tháng); null = chưa có cam kết. */
  commitment: CommitmentProgress | null;
  bucketOf: (d: string) => CampDayBucket;
}

/**
 * Mọi thứ một sàn của Dashboard cần để vẽ, tính MỘT lần ở CeoBrief rồi truyền xuống các tab (09/10/2026; 10/10 thêm `health`,
 * `coverage`). Kênh = brand × sàn; mỗi brand trong `brands` đã là brand CHẠY SÀN NÀY (App lọc `brandsOn(p)`), nên khoá theo brandId là đủ.
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
  /** Sức khoẻ từng kênh (brandId → kênh của sàn này). */
  health: Map<string, ChannelHealth>;
  /** Độ phủ số của phạm vi đang xem — mốc "ngày đủ số" của các ô tổng. */
  coverage: DataCoverage;
  /** Totals kỳ đang xem của phạm vi (mọi ca tới ngày đủ số). */
  cur: Totals;
  prev: Totals;
  /** Hai vế để tính mũi tên so sánh: xem theo tháng = cùng loại ngày (channelHealth.likeForLike); kỳ khác = kỳ trước cùng độ dài. */
  cmp: { cur: Totals; prev: Totals };
  issues: Issue[];
  channelName: (b: Brand) => string;
}
