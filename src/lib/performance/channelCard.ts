import type { BrandMonthPlan, BrandMonthPlanSlot, LiveSession, ShiftSlot } from "../../types";
import type { EngineParams } from "../scheduling/engineParams";
import { effectiveCamp, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../campaignDays";
import { assertOnePlatform } from "../platforms/perf";
import { profileOf } from "../platforms/profiles";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { addDays } from "../dateUtils";
import { monthEndOf, monthOutlook, prevMonthOf, type MonthOutlook } from "./ceoBrief";
import { planRunRate, type PlanRunRate } from "./planRunRate";
import { buildAccountRunRate, resolveAsOf, type AccountRunRate } from "./runRateUpdate";
import {
  channelVerdict,
  dataCoverage,
  gmvTree,
  likeForLike,
  nextWaveReadiness,
  targetFeasibility,
  type Cause,
  type DataCoverage,
  type GmvTree,
  type TargetFeasibility,
  type WaveReadiness
} from "./channelHealth";
import { coneHalf, landingOf, type LandingKey } from "./forecastCone";
import { handlingPlan, type HandlingPlan } from "./handlingPlan";
import { isCountable, sessionHours } from "./hostPerformance";
import type { CommitmentProgress } from "./brandCommitment";

// THẺ KÊNH (21/10/2026, đề xuất https://claude.ai/artifact/8tca7KBXNqqdyMAqzTWcTG — user chốt cả 4 điểm).
// Một kênh brand × sàn trong một tháng được dựng ĐÚNG MỘT LẦN ở đây; Dashboard agency (màn sếp), Chi tiết kênh (Dashboard brand
// của ops) và cổng brand chỉ vẽ lại thẻ này. Trước đó mỗi màn tự gọi monthOutlook / planRunRate / landingOf / buildChannelRoom
// nên 21/10 cùng kênh Franklin TikTok ra 4 nhãn, 3 số cuối tháng, 2 ngày "số đủ tới".
//
// Luật (user chốt 21/10):
//   1. Một thang nhãn: Chắc đạt / Có thể đạt / Khó đạt / Sẽ hụt (forecastCone.LANDING_LABEL), luôn kèm %.
//   2. "Tới nay" = đúng con số của module Run-rate (planRunRate → buildAccountRunRate, tới ca mới nhất có số) — trên thẻ chỉ là SỐ,
//      không kèm chữ "Đúng/Chậm tiến độ" (backtest 14/10: run-rate ≥ 95% mà khả năng < 50% thì chỉ 17% đạt target).
//   3. Kênh chưa đủ lịch sử để engine v3 chiếu (dưới 15 ca — buildMonthForecaster null ⇒ forecastModel ≠ "shape") KHÔNG có dự báo
//      cuối tháng, chỉ có "tới nay" (cùng luật Phòng Điều Hành dùng trước đó).
//   4. Brand không thấy nhãn/xác suất — cổng brand chỉ đọc `pace`, `forecast.p50` qua bản tin ops gửi.

/** Dự báo "đứng ở mức này từ ngày X": các dòng sổ dự báo liền nhau lệch ≤ 5% so với dự báo hiện tại. */
export const STABLE_FORECAST_TOLERANCE = 0.05;
/** Số tháng của hàng xu hướng (gồm tháng đang xem). */
export const TREND_MONTHS = 5;

export type ChannelState =
  /** Tháng này không có ca, không có kế hoạch. */
  | "off"
  /** Có ca nhưng chưa có Kế Hoạch Tháng đã chốt ⇒ chưa có target. */
  | "no_plan"
  /** Có kế hoạch đã chốt. */
  | "live";

export interface CardPace {
  /** Thực đạt ÷ target các ca tới mốc (buildAccountRunRate.total.runRate). */
  runRate: number | null;
  actual: number;
  targetToDate: number;
  /** Ngày "số tới" (module Run-rate). */
  asOf: string | null;
  /** Ca có số muộn nhất sau ngày đủ số (nhãn "tới ca …"); null = số tới hết ngày. */
  lastShift: { date: string; startTime: string; endTime: string } | null;
}

export interface CardForecast {
  p50: number;
  lo: number;
  hi: number;
}

export interface TrendPoint {
  month: string;
  /** GMV ÷ giờ live của ca có số; null = tháng không có ca có số. */
  gmvPerHour: number | null;
  gmv: number;
  hours: number;
}

export interface CardAction {
  kind: "reconcile" | "month_plan" | "detail";
  label: string;
}

export interface ChannelCard {
  key: string;
  brandId: string;
  brandName: string;
  /** Logo brand (chỉ để vẽ). */
  brandLogo?: string;
  platform: ReportPlatform;
  /** "CROCS" hoặc "VERA · Shopee" khi brand chạy hai sàn. */
  name: string;
  month: string;
  state: ChannelState;
  planStatus: "locked" | "draft" | "none";
  target: number | null;
  /** GMV đã có trong tháng (mọi ca có số tới hôm nay, kể cả khi chưa có kế hoạch). */
  monthActual: number;
  pace: CardPace | null;
  /** null = chưa có dự báo (kênh mới, hoặc chưa có số + lịch để chiếu). */
  forecast: CardForecast | null;
  /** null = chưa có target hoặc chưa có dự báo. */
  landing: { key: Exclude<LandingKey, "no_target" | "no_forecast">; pHit: number } | null;
  /** Kênh chưa đủ lịch sử để chiếu cuối tháng (luật 3). */
  newChannel: boolean;
  coverage: DataCoverage;
  /** Ngày hiện ở "số đủ tới": ngày đủ số, kéo về ngày cuối có số nếu sau đó không có ca nào (ngày trống không phải "đã có số"). */
  shownThrough: string | null;
  /** Nguyên nhân, dòng đầu là nguyên nhân chính (channelHealth.channelVerdict). */
  causes: Cause[];
  /** GMV/giờ cần trên các giờ ca còn trong lịch để chạm target (handlingPlan.needRate). */
  need: { perHour: number; hours: number; blended: number | null } | null;
  /** Dự báo đã đứng ở mức này từ ngày (sổ dự báo 0163); null = không đủ dòng sổ hoặc mới đổi. */
  stableSince: string | null;
  commitment: CommitmentProgress | null;
  trend: TrendPoint[];
  action: CardAction | null;
  // ---- cho Chi tiết kênh (cùng một lần tính) ----
  outlook: MonthOutlook;
  rr: PlanRunRate | null;
  report: AccountRunRate | null;
  plan: HandlingPlan | null;
  tree: GmvTree | null;
  feasibility: TargetFeasibility | null;
  wave: WaveReadiness | null;
  camp: CampOverrides | undefined;
  bucketOf: (d: string) => CampDayBucket;
}

export interface ChannelCardInput {
  brandId: string;
  brandName: string;
  brandLogo?: string;
  platform: ReportPlatform;
  name: string;
  month: string;
  today: string;
  /** Mọi ca của ĐÚNG kênh này (mọi tháng — cần lịch sử cho dự báo, xu hướng, so cùng loại ngày). */
  sessions: LiveSession[];
  /** Ca chờ đăng ký của brand (mọi sàn — planRunRate tự lọc theo ca kế hoạch); ca mở của kênh được lọc ở đây. */
  shiftSlots: ShiftSlot[];
  plan: BrandMonthPlan | null;
  /** Ca của Kế Hoạch Tháng (chỉ dùng khi kế hoạch đã chốt). */
  planSlots: BrandMonthPlanSlot[] | null;
  engineParams: EngineParams;
  commitment?: CommitmentProgress | null;
  /** Sổ dự báo của kênh (mọi tháng, cũ → mới) — để tính `stableSince`. */
  ledger?: { month: string; asOf: string; kind: string; p50: number }[];
}


/**
 * MỘT phép nối kế hoạch đã chốt → run-rate → dự báo cuối tháng cho một kênh. Thẻ kênh và Report Tuần (brand) cùng gọi hàm này:
 * trước đây Report Tuần tự gọi monthOutlook không tham số engine, không target, ca mở lẫn sàn ⇒ cuối tháng lệch thẻ kênh.
 * `sessions` phải là ca của ĐÚNG kênh; `shiftSlots` có thể lẫn brand/sàn khác — lọc ở đây.
 */
export function planMonthOutlook(x: {
  brandId: string;
  platform: ReportPlatform;
  month: string;
  today: string;
  sessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  locked: boolean;
  planSlots: BrandMonthPlanSlot[] | null;
  camp: CampOverrides | undefined;
  engineParams: EngineParams;
}) {
  const brandSlots = x.shiftSlots.filter((sl) => sl.brandId === x.brandId);
  const openSlots = brandSlots.filter((sl) => platformOf(sl) === x.platform && sl.status === "open" && !sl.sessionId);
  const rr = x.locked && x.planSlots && x.planSlots.length > 0 ? planRunRate(x.month, x.planSlots, brandSlots, x.sessions, x.today, x.camp) : null;
  const target = rr ? { total: rr.total.target, byDate: rr.targetByDate } : null;
  const outlook = monthOutlook(x.month, x.today, x.sessions, openSlots, target, x.camp, x.engineParams);
  return { rr, target, outlook };
}

/** Ngày hiện ở "số đủ tới" = ngày đủ số, nhưng không vượt ngày cuối có số (ngày sau đó không có ca). */
export function shownThroughOf(coverage: DataCoverage, sessions: LiveSession[]): string | null {
  const c = coverage.completeThrough;
  if (!c) return null;
  let last: string | null = null;
  for (const s of sessions) if (s.date <= c && isCountable(s) && (!last || s.date > last)) last = s.date;
  return last && last < c ? last : c;
}

/** GMV/giờ (giờ live) từng tháng; tháng đang chạy cắt ở `through`. */
export function monthlyTrend(sessions: LiveSession[], month: string, through: string | null, months = TREND_MONTHS): TrendPoint[] {
  const list: string[] = [month];
  while (list.length < months) list.unshift(prevMonthOf(list[0]));
  return list.map((m) => {
    const from = `${m}-01`, to = m === month && through ? (through < monthEndOf(from) ? through : monthEndOf(from)) : monthEndOf(from);
    let gmv = 0, hours = 0;
    for (const s of sessions) {
      if (s.date < from || s.date > to || !isCountable(s)) continue;
      gmv += s.actualGmv ?? 0;
      hours += sessionHours(s);
    }
    return { month: m, gmv, hours, gmvPerHour: hours > 0 ? gmv / hours : null };
  });
}

/** Ngày đầu của chuỗi dòng sổ (cùng tháng, loại daily, liền nhau tính từ mới nhất) lệch ≤ 5% so với `p50`. */
export function stableSinceOf(ledger: ChannelCardInput["ledger"], month: string, p50: number, today: string): string | null {
  if (!ledger || p50 <= 0) return null;
  const rows = ledger.filter((r) => r.month === month && r.kind === "daily" && r.asOf <= today).sort((a, b) => b.asOf.localeCompare(a.asOf));
  let since: string | null = null;
  for (const r of rows) {
    if (Math.abs(r.p50 / p50 - 1) > STABLE_FORECAST_TOLERANCE) break;
    since = r.asOf;
  }
  // Chỉ đáng nói khi đã đứng yên ít nhất 3 ngày.
  return since && since <= addDays(today, -3) ? since : null;
}

export function buildChannelCard(x: ChannelCardInput): ChannelCard {
  assertOnePlatform(x.sessions, "buildChannelCard");
  const { month, today, platform } = x;
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const locked = x.plan?.status === "locked";
  const camp: CampOverrides | undefined = effectiveCamp(x.plan?.campRanges);
  const bucketOf = (d: string) => resolveCampBucketType(d, camp);

  const coverage = dataCoverage(x.sessions, today, mStart, mEnd);
  const shownThrough = shownThroughOf(coverage, x.sessions.filter((s) => s.date >= mStart && s.date <= mEnd));
  const { rr, target, outlook } = planMonthOutlook({ brandId: x.brandId, platform, month, today, sessions: x.sessions, shiftSlots: x.shiftSlots, locked, planSlots: x.planSlots, camp, engineParams: x.engineParams });
  const report = rr ? buildAccountRunRate(rr, resolveAsOf(month, rr.through, null, rr.through), coverage.completeThrough) : null;
  const newChannel = outlook.forecastModel !== "shape";

  const feasibility = rr && x.planSlots ? targetFeasibility(x.sessions, month, x.planSlots) : null;
  const tree = gmvTree(profileOf(platform).metrics, likeForLike(x.sessions, month, coverage.completeThrough, bucketOf, undefined, (k) => k === "daily"));
  const openByDate = new Map<string, number>();
  for (const p of outlook.pending) if (p.kind === "open_slot") openByDate.set(p.date, (openByDate.get(p.date) ?? 0) + p.hours);
  const wave = month === today.slice(0, 7) ? nextWaveReadiness(x.sessions, openByDate, month, today, bucketOf) : null;
  const verdict = channelVerdict({ outlook, coverage, feasibility, tree, wave, today });

  const monthSessions = x.sessions.filter((s) => s.date >= mStart && s.date <= mEnd && s.status !== "Cancelled");
  const monthActual = monthSessions.filter((s) => s.date <= today && isCountable(s)).reduce((a, s) => a + (s.actualGmv ?? 0), 0);
  const state: ChannelState = locked ? "live" : monthSessions.length === 0 && !x.plan ? "off" : "no_plan";

  const hasForecast = !newChannel && outlook.projectionMethod !== "none" && (outlook.actual > 0 || outlook.pending.length > 0);
  const half = hasForecast ? coneHalf(outlook.actual, outlook.projected, outlook.coneCoef) : 0;
  const forecast: CardForecast | null = hasForecast ? { p50: outlook.projected, lo: outlook.projected - half, hi: outlook.projected + half } : null;
  const l = hasForecast && target ? landingOf(outlook) : null;
  const landing = l && l.pHit != null && l.key !== "no_target" && l.key !== "no_forecast" ? { key: l.key, pHit: l.pHit } : null;

  const plan = hasForecast && target ? handlingPlan({ outlook, today, sessions: x.sessions, camp, slotHours: x.plan?.defaultSlotHours, checkpointCap: x.engineParams.fcCheckpointCap }) : null;
  const need = plan && plan.needRate != null && plan.remainingHours > 0 ? { perHour: plan.needRate, hours: plan.remainingHours, blended: plan.blendedRate } : null;

  const pace: CardPace | null = report
    ? { runRate: report.total.runRate, actual: report.total.actual, targetToDate: report.total.targetToDate, asOf: report.asOf, lastShift: report.tail.shifts > 0 ? report.tail.lastShift : null }
    : null;

  // Kênh mới: bỏ mọi câu dựa trên dự báo (luật 3) — chỉ giữ nguyên nhân về số chưa về / lịch.
  const causes = newChannel ? verdict.causes.filter((c) => c.key === "data" || c.key === "no_schedule" || c.key === "new_channel" || c.key === "thin_wave") : verdict.causes;
  // Kênh không chạy tháng này: chỉ một câu — không bàn lịch đợt camp hay target của kênh không có ca.
  const finalCauses: Cause[] = state === "off"
    ? [{ key: "no_schedule", tone: "info", text: `Không có ca tháng ${Number(month.slice(5))}, chưa có kế hoạch` }]
    : newChannel && !causes.some((c) => c.key === "new_channel")
      ? [...causes, { key: "new_channel", tone: "info", text: "Kênh mới (dưới 15 ca lịch sử) — chưa dự báo cuối tháng, chỉ tính tới nay" }]
      : causes;

  const action: CardAction | null =
    state === "off" || state === "no_plan"
      ? { kind: "month_plan", label: state === "off" ? "Mở Kế Hoạch Tháng" : x.plan ? "Chốt Kế Hoạch Tháng" : "Lập Kế Hoạch Tháng" }
      : coverage.missingSessions > 0
        ? { kind: "reconcile", label: `Cập nhật số liệu ${coverage.missingSessions} ca` }
        : { kind: "detail", label: "Xem chi tiết" };

  return {
    key: `${x.brandId}|${platform}`,
    brandId: x.brandId,
    brandName: x.brandName,
    brandLogo: x.brandLogo,
    platform,
    name: x.name,
    month,
    state,
    planStatus: x.plan ? x.plan.status : "none",
    target: target?.total ?? null,
    monthActual,
    pace,
    forecast,
    landing,
    newChannel,
    coverage,
    shownThrough,
    causes: finalCauses,
    need,
    stableSince: forecast ? stableSinceOf(x.ledger, month, forecast.p50, today) : null,
    commitment: x.commitment ?? null,
    trend: monthlyTrend(x.sessions, month, shownThrough),
    action,
    outlook,
    rr,
    report,
    plan,
    tree,
    feasibility,
    wave,
    camp,
    bucketOf
  };
}

// ---------------------------------------------------------------------------
// Việc của màn sếp — dựng từ các thẻ, không có luật số riêng. 23/10 (audit trùng màn): chỉ giữ việc mà CHỈ dự báo biết (báo sớm brand
// kênh sẽ hụt). Up số ca, chốt kế hoạch tháng sau, giờ cam kết chưa xếp, kênh chưa có kế hoạch đã có ở Bảng Vận Hành (Việc cần làm +
// Việc lập kế hoạch ca) và ô "Ca chưa có số" ngay trên — Dashboard chỉ dẫn sang đó, không liệt kê lại.
// ---------------------------------------------------------------------------

export interface AgencyTodo {
  tone: "bad" | "warn" | "info";
  text: string;
}

export function agencyTodos(cards: ChannelCard[]): AgencyTodo[] {
  const short = cards.filter((c) => c.landing && (c.landing.key === "short" || c.landing.key === "unlikely") && c.forecast && c.target);
  // Tên kênh đã nằm ngay trên ở thẻ run-rate (dòng đỏ/vàng) — không liệt kê lại (22/10).
  return short.length > 0 ? [{ tone: "bad", text: `Báo sớm brand: ${short.length} kênh dự báo hụt target` }] : [];
}
