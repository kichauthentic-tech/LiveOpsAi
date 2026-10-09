import { addDays } from "../dateUtils";
import type { CampDayBucket } from "../campaignDays";
import { RUN_RATE_BAD, RUN_RATE_WARN, type BucketOutlook, type MonthOutlook } from "./ceoBrief";

// Run-rate bốn tầng cho Dashboard (09/10/2026): tháng → đợt camp → ngày → ca. Mọi tầng dùng MỘT luật (planRunRate.ts,
// WORKSPACE §5.6): run-rate = thực đạt ÷ target các ca kế hoạch ĐÃ CHỐT có ngày ≤ ngày cuối có số. File này chỉ sắp xếp lại
// số đã có trong MonthOutlook (cùng nguồn target — test `planRunRate "khớp Bản Tin CEO"` canh), không tính run-rate theo cách khác.

export type LadderState = "done" | "live" | "next";
export type RunRateTone = "good" | "warn" | "bad" | "none";

export interface LadderRow {
  tier: "month" | "wave" | "day";
  key: string;
  label: string;
  sub: string;
  /** Target cả mốc (tháng / đợt / ngày). */
  target: number;
  /** Target tới ngày có số — mẫu số của run-rate. */
  targetToDate: number;
  actual: number;
  runRate: number | null;
  state: LadderState;
  /** Đợt chưa tới: GMV dự phóng của đợt (so với target để biết đợt đó có đủ lịch không). */
  forecast: number | null;
  /** Ngày đang chạy dở: chưa đủ ca có số nên không tô màu đánh giá. */
  partial?: boolean;
}

export const WAVE_LABEL: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: "Ngày thường" };

export const runRateTone = (v: number | null): RunRateTone => (v == null ? "none" : v >= RUN_RATE_WARN ? "good" : v >= RUN_RATE_BAD ? "warn" : "bad");

const waveGmv = (b: BucketOutlook) => b.actual.gmv;
const waveForecast = (b: BucketOutlook) => b.forecast;

/** Hàng đợt camp. Chỉ trả đợt có ngày trong tháng và có target. */
export function waveRows(o: MonthOutlook): LadderRow[] {
  return o.buckets
    .filter((b) => b.status !== "none" && b.target != null && b.target > 0)
    .map((b) => {
      const state: LadderState = b.status === "done" ? "done" : b.status === "live" ? "live" : "next";
      const passed = b.days.filter((d) => o.through && d <= o.through).length;
      const to = b.targetToDate ?? 0;
      return {
        tier: "wave" as const,
        key: b.bucket,
        label: WAVE_LABEL[b.bucket],
        sub: state === "next" ? "chưa tới" : `${passed}/${b.days.length} ngày có số`,
        target: b.target!,
        targetToDate: to,
        actual: waveGmv(b),
        runRate: to > 0 ? waveGmv(b) / to : null,
        state,
        forecast: state === "next" ? waveForecast(b) : null
      };
    });
}

/** Hôm qua và hôm nay (nếu có target). Hôm nay còn ca chưa có số ⇒ `partial`. */
export function dayRows(o: MonthOutlook, today: string): LadderRow[] {
  if (!o.target) return [];
  const out: LadderRow[] = [];
  for (const [d, label] of [[addDays(today, -1), "Hôm qua"], [today, "Hôm nay"]] as const) {
    const t = o.target.byDate.get(d) ?? 0;
    if (t <= 0) continue;
    const a = o.actualByDate.get(d) ?? 0;
    const pendingToday = o.pending.some((p) => p.date === d);
    out.push({
      tier: "day",
      key: d,
      label,
      sub: `${d.slice(8, 10)}/${d.slice(5, 7)}${pendingToday ? " · còn ca chưa có số" : ""}`,
      target: t,
      targetToDate: t,
      actual: a,
      // Ngày còn ca chưa có số mà chưa ca nào về thì chưa có run-rate — in 0% là nói sai.
      runRate: pendingToday && a === 0 ? null : a / t,
      state: d < today && !pendingToday ? "done" : "live",
      forecast: null,
      partial: pendingToday
    });
  }
  return out;
}

/** Hàng tháng + các đợt + ngày. `o` = outlook của các brand CÓ target (cộng bằng combineOutlooks). Không có target ⇒ rỗng (UI nói "chờ OP chốt Kế Hoạch Tháng"). */
export function runRateLadder(o: MonthOutlook, today: string): LadderRow[] {
  if (!o.target) return [];
  const month: LadderRow = {
    tier: "month",
    key: "month",
    label: `Cả tháng ${Number(o.month.slice(5))}`,
    sub: o.through ? `đến ${o.through.slice(8, 10)}/${o.through.slice(5, 7)}` : "chưa có số",
    target: o.target.total,
    targetToDate: o.expectedToDate ?? 0,
    actual: o.actual,
    runRate: o.runRate,
    state: "live",
    forecast: null
  };
  return [month, ...waveRows(o), ...dayRows(o, today)];
}
