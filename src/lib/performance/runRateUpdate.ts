import type { LiveSession } from "../../types";
import { eachDay, isoWeekStart } from "../dateUtils";
import type { CampDayBucket } from "../campaignDays";
import { monthEndOf, RUN_RATE_BAD, RUN_RATE_WARN } from "./ceoBrief";
import { runRateTone, WAVE_NAME, type RunRateTone } from "./channelHealth";
import { noDataSplit, runRateLive, type PlanRunRate, type PlanSlotState } from "./planRunRate";
import { dataSourceTier } from "../dataSource";

// "Cập nhật run-rate" cho sếp + brand (module Run-rate, 11/10/2026). KHÔNG có luật số mới: mọi con số đi qua `planRunRate`
// (target = Σ target ca của Kế Hoạch Tháng đã chốt, ca huỷ giữ target, ca ngoài plan target 0). File này chỉ
//   1) cắt kết quả ở một ngày "số tới" tuỳ chọn (mặc định ngày đủ số — channelHealth.dataCoverage) rồi chia theo
//      tháng / tuần / đợt campaign / ngày / ca,
//   2) xuất Excel (4 sheet) đúng những gì đang hiện.
// MỘT tài khoản = một kênh brand × sàn; không có hàm nào ở đây cộng hai tài khoản với nhau (luật đa sàn 07/10).

export interface RRLine {
  target: number;
  /** Σ target các ngày ≤ ngày "số tới" — mẫu số của run-rate. */
  targetToDate: number;
  actual: number;
  runRate: number | null;
}

export type DayState =
  /** Ngày ≤ số tới, mọi ca đã có số. */
  | "counted"
  /** Tạm tính: ngày sau "số tới" đã có một phần số (chưa vào run-rate), hoặc ngày sau ngày đủ số đã vào run-rate theo từng ca nhưng còn ca chờ số. */
  | "partial"
  /** Ngày ≤ số tới có ca kế hoạch chưa có số. */
  | "missing"
  /** Chưa tới ngày (hoặc chưa có số). */
  | "future"
  /** Ngày không có ca kế hoạch và không có số. */
  | "empty";

export interface RRDay {
  date: string;
  bucket: CampDayBucket;
  target: number;
  actual: number;
  /** Số ca kế hoạch của ngày (không tính ca huỷ). */
  shifts: number;
  /** Trong đó ca đã có số. */
  withData: number;
  state: DayState;
  /** Ngày nằm trong run-rate (≤ số tới). */
  counted: boolean;
  /** Mẫu số của ngày trong run-rate: ≤ ngày đủ số = target cả ngày; sau đó = target các ca đã có số (bằng `target` khi không truyền ngày đủ số). */
  expected: number;
  /** Thực đạt ÷ mẫu số của riêng ngày — chỉ khi ngày đã vào run-rate và có mẫu số. */
  pctTarget: number | null;
}

export type WaveStatus = "done" | "live" | "next";

export interface RRWave extends RRLine {
  bucket: CampDayBucket;
  label: string;
  days: string[];
  from: string;
  to: string;
  status: WaveStatus;
  shifts: number;
  shiftsDone: number;
  /** Thực đạt ÷ target CẢ đợt (khác run-rate: mẫu số là cả đợt, kể cả phần chưa tới). */
  pctTarget: number | null;
  /** Số ngày của đợt chưa vào run-rate (sau ngày số tới). */
  daysLeft: number;
  /** Target đợt − thực đạt (≥ 0): phần còn phải làm để về target cả đợt. */
  gap: number;
  /** Các ngày còn lại phải chạy bao nhiêu % target của chính chúng để về đủ target đợt; null khi không còn ngày/target. */
  needRate: number | null;
}

export interface RRWeek extends RRLine {
  index: number;
  label: string;
  days: string[];
  status: WaveStatus;
}

export interface RRShift {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  bucket: CampDayBucket;
  state: PlanSlotState;
  target: number;
  actual: number;
  pctTarget: number | null;
  hostName: string;
  assistantName: string;
  sessionId?: string;
}

export interface RRCumulativePoint {
  date: string;
  target: number;
  /** null sau ngày "số tới". */
  actual: number | null;
  /** Chỉ từ ngày "số tới" trở đi: nếu phần target còn lại cũng đạt đúng run-rate hiện tại. */
  projected: number | null;
}

export interface AccountRunRate {
  month: string;
  /** Ngày "số tới" đã áp (đã kẹp trong [đầu tháng, ngày cuối có số]); null = tháng chưa có số. */
  asOf: string | null;
  /** Ngày cuối có số bất kỳ (planRunRate.through). */
  through: string | null;
  total: RRLine & {
    pctTarget: number | null;
    /** Thực đạt − kỳ vọng tới ngày: dương = vượt tiến độ. */
    gap: number | null;
    keepPace: number | null;
    keepPacePct: number | null;
    elapsedDays: number;
    remainingDays: number;
    /** Trung bình mỗi ngày đã qua. */
    perDayNow: number | null;
    /** Muốn kịp target tháng thì mỗi ngày còn lại phải đạt. */
    needPerRemainingDay: number | null;
  };
  /** Ca có số nằm sau ngày đủ số và ≤ số tới (đã vào run-rate theo từng ca); `unreconciled` = trong đó chưa đối soát. 0 khi không truyền ngày đủ số. */
  tail: { shifts: number; unreconciled: number; lastShift: { date: string; startTime: string; endTime: string } | null };
  waves: RRWave[];
  weeks: RRWeek[];
  days: RRDay[];
  shifts: RRShift[];
  offPlan: { session: LiveSession; bucket: CampDayBucket }[];
  offPlanActual: number;
  cancelledCount: number;
  noDataCount: number;
  /** Trong `noDataCount`: ca sau ngày đủ số — chờ số, CHƯA vào mẫu số (chế độ theo ca). */
  noDataWaiting: number;
  cumulative: RRCumulativePoint[];
}

const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);

/** Ngày "số tới" hiệu lực: `requested` (hoặc `fallback`) kẹp trong [đầu tháng, ngày cuối có số]. */
export function resolveAsOf(month: string, through: string | null, requested: string | null | undefined, fallback: string | null | undefined): string | null {
  if (!through) return null;
  const want = requested ?? fallback ?? through;
  return clampDate(want, `${month}-01`, through < `${month}-01` ? `${month}-01` : through);
}

// `doneRef` = mốc để tính "đã xong": mặc định chính ngày số tới; chế độ theo ca dùng ngày đủ số (hôm nay mới có vài ca thì đợt vẫn đang chạy).
const statusOf = (days: string[], asOf: string | null, doneRef: string | null = asOf): WaveStatus =>
  doneRef && days[days.length - 1] <= doneRef ? "done" : !asOf || days[0] > asOf ? "next" : "live";

/**
 * `completeThrough` (ngày đủ số — channelHealth.dataCoverage): truyền vào thì ngày SAU mốc đó chỉ lấy target các ca đã có số
 * (planRunRate.runRateLive) — nhập tới ca nào cập nhật tới ca đó; bỏ qua thì mọi ngày ≤ `asOf` dùng target cả ngày (luật cũ).
 */
export function buildAccountRunRate(rr: PlanRunRate, asOf: string | null, completeThrough?: string | null): AccountRunRate {
  const month = rr.month;
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const monthDays = eachDay(mStart, mEnd);
  const upTo = (d: string) => asOf != null && d <= asOf;
  const bucketOf = new Map<string, CampDayBucket>();
  for (const b of rr.buckets) for (const d of b.days) bucketOf.set(d, b.bucket);

  const perShift = completeThrough !== undefined;
  const liveRR = perShift ? runRateLive(rr, completeThrough) : null;
  const afterCut = (d: string) => perShift && (completeThrough == null || d > completeThrough);
  const doneRef = perShift ? (completeThrough != null && asOf != null && completeThrough < asOf ? completeThrough : asOf != null && completeThrough == null ? null : asOf) : asOf;
  const slotsByDate = new Map<string, typeof rr.slots>();
  for (const t of rr.slots) slotsByDate.set(t.planSlot.date, [...(slotsByDate.get(t.planSlot.date) ?? []), t]);

  const days: RRDay[] = monthDays.map((date) => {
    const planned = (slotsByDate.get(date) ?? []).filter((t) => t.state !== "cancelled");
    const target = rr.targetByDate.get(date) ?? 0;
    const actual = rr.actualByDate.get(date) ?? 0;
    const withData = planned.filter((t) => t.state === "done").length;
    const counted = upTo(date);
    let state: DayState;
    const expected = counted ? (liveRR ? liveRR.expectedByDate.get(date) ?? 0 : target) : 0;
    if (counted) state = planned.some((t) => t.state === "no_data") ? (afterCut(date) ? "partial" : "missing") : planned.length === 0 && actual <= 0 ? "empty" : "counted";
    else if (rr.through && date <= rr.through && actual > 0) state = "partial";
    else state = planned.length === 0 && actual <= 0 ? "empty" : "future";
    return { date, bucket: bucketOf.get(date) ?? "daily", target, actual, shifts: planned.length, withData, state, counted, expected, pctTarget: counted && expected > 0 ? actual / expected : null };
  });

  const dayOf = new Map(days.map((d) => [d.date, d]));
  const line = (list: string[]): RRLine => {
    let target = 0, targetToDate = 0, actual = 0;
    for (const d of list) {
      const x = dayOf.get(d)!;
      target += x.target;
      if (x.counted) {
        targetToDate += x.expected;
        actual += x.actual;
      }
    }
    return { target, targetToDate, actual, runRate: targetToDate > 0 ? actual / targetToDate : null };
  };

  const all = line(monthDays);
  const elapsedDays = days.filter((d) => d.counted).length;
  const remainingDays = monthDays.length - elapsedDays;
  const keepPace = all.runRate != null ? all.actual + (all.target - all.targetToDate) * all.runRate : null;

  const waves: RRWave[] = rr.buckets
    .filter((b) => b.days.length > 0)
    .map((b): RRWave => {
      const l = line(b.days);
      const inB = rr.slots.filter((t) => t.bucket === b.bucket && t.state !== "cancelled");
      return {
        ...l,
        bucket: b.bucket,
        label: WAVE_NAME[b.bucket],
        days: b.days,
        from: b.days[0],
        to: b.days[b.days.length - 1],
        status: statusOf(b.days, asOf, doneRef),
        shifts: inB.length,
        shiftsDone: inB.filter((t) => t.state === "done").length,
        pctTarget: l.target > 0 ? l.actual / l.target : null,
        daysLeft: b.days.filter((d) => !dayOf.get(d)!.counted).length,
        gap: Math.max(0, l.target - l.actual),
        needRate: l.target - l.targetToDate > 0 ? Math.max(0, l.target - l.actual) / (l.target - l.targetToDate) : null
      };
    })
    .filter((w) => w.target > 0 || w.actual > 0);

  const weekMap = new Map<string, string[]>();
  for (const d of monthDays) {
    const k = isoWeekStart(d);
    weekMap.set(k, [...(weekMap.get(k) ?? []), d]);
  }
  const weeks: RRWeek[] = [...weekMap.values()].map((list, i) => ({
    ...line(list),
    index: i + 1,
    label: `Tuần ${i + 1} · ${list[0].slice(8)}–${list[list.length - 1].slice(8)}/${month.slice(5)}`,
    days: list,
    status: statusOf(list, asOf, doneRef)
  }));

  const shifts: RRShift[] = rr.slots
    .map((t) => ({
      id: t.planSlot.id,
      date: t.planSlot.date,
      startTime: t.planSlot.startTime.slice(0, 5),
      endTime: t.planSlot.endTime.slice(0, 5),
      bucket: t.bucket,
      state: t.state,
      target: t.target,
      actual: t.actual,
      pctTarget: t.pctTarget,
      hostName: t.session?.hostName ?? "",
      assistantName: t.session?.assistantName || t.session?.coHostName || "",
      sessionId: t.session?.id
    }))
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  // Mốc nét đứt = thực đạt + mẫu số ĐÃ tính (không phải target cả ngày) ⇒ phần target của ca chưa có số vẫn được chiếu theo run-rate.
  let cumT = 0, cumA = 0, cumE = 0, cumAtAsOf = 0, cumEAtAsOf = 0;
  const cumulative: RRCumulativePoint[] = days.map((d) => {
    cumT += d.target;
    if (d.counted) {
      cumA += d.actual;
      cumE += d.expected;
      cumAtAsOf = cumA;
      cumEAtAsOf = cumE;
    }
    return { date: d.date, target: cumT, actual: d.counted ? cumA : null, projected: null };
  });
  if (asOf && all.runRate != null) {
    for (const p of cumulative) if (p.date >= asOf) p.projected = cumAtAsOf + (p.target - cumEAtAsOf) * all.runRate;
  }

  return {
    month,
    asOf,
    through: rr.through,
    total: {
      ...all,
      pctTarget: all.target > 0 ? all.actual / all.target : null,
      gap: all.targetToDate > 0 ? all.actual - all.targetToDate : null,
      keepPace,
      keepPacePct: keepPace != null && all.target > 0 ? keepPace / all.target : null,
      elapsedDays,
      remainingDays,
      perDayNow: elapsedDays > 0 ? all.actual / elapsedDays : null,
      needPerRemainingDay: all.target > 0 && remainingDays > 0 ? Math.max(0, all.target - all.actual) / remainingDays : null
    },
    tail: tailOf(rr, asOf, completeThrough),
    waves,
    weeks,
    days,
    shifts,
    offPlan: rr.offPlan,
    offPlanActual: rr.offPlanActual,
    cancelledCount: rr.cancelledCount,
    noDataCount: rr.noDataCount,
    noDataWaiting: noDataSplit(rr, completeThrough).waiting,
    cumulative
  };
}

function tailOf(rr: PlanRunRate, asOf: string | null, completeThrough: string | null | undefined): AccountRunRate["tail"] {
  const none = { shifts: 0, unreconciled: 0, lastShift: null };
  if (completeThrough === undefined || !asOf) return none;
  let shifts = 0, unreconciled = 0;
  let lastShift: AccountRunRate["tail"]["lastShift"] = null;
  const take = (date: string, startTime: string, endTime: string, tier: ReturnType<typeof dataSourceTier>) => {
    if (date > asOf || (completeThrough != null && date <= completeThrough)) return;
    shifts++;
    if (tier !== "reconciled") unreconciled++;
    if (!lastShift || date + endTime.slice(0, 5) > lastShift.date + lastShift.endTime) lastShift = { date, startTime: startTime.slice(0, 5), endTime: endTime.slice(0, 5) };
  };
  for (const t of rr.slots) if (t.state === "done" && t.session) take(t.planSlot.date, t.planSlot.startTime, t.planSlot.endTime, dataSourceTier(t.session));
  for (const x of rr.offPlan) take(x.session.date, x.session.startTime, x.session.endTime, dataSourceTier(x.session));
  return { shifts, unreconciled, lastShift };
}

// ---------------------------------------------------------------------------
// Nhãn kết luận — cùng ngưỡng 85% / 95% với mọi màn (RUN_RATE_BAD / RUN_RATE_WARN)
// ---------------------------------------------------------------------------

export interface RunRateVerdict {
  tone: RunRateTone;
  label: string;
}

export function runRateVerdict(v: number | null): RunRateVerdict {
  const tone = runRateTone(v);
  if (v == null) return { tone, label: "Chưa có số" };
  if (v >= 1.05) return { tone, label: "Vượt tiến độ" };
  if (v >= RUN_RATE_WARN) return { tone, label: "Đúng tiến độ" };
  if (v >= RUN_RATE_BAD) return { tone, label: "Hơi chậm" };
  return { tone, label: "Chậm tiến độ" };
}

// ---------------------------------------------------------------------------
// Tài khoản đưa vào file Excel
// ---------------------------------------------------------------------------

export interface ExportAccount {
  /** Tên hiển thị: "CROCS" hoặc "VERA · Shopee" khi brand chạy hai sàn. */
  name: string;
  platform: "TikTok" | "Shopee";
  /** null = chưa có kế hoạch chốt. */
  report: AccountRunRate | null;
  /** Lý do không có report. */
  missing?: "no_plan" | "no_data";
  /** Số đã đạt trong tháng khi chưa có target. */
  actualOnly?: number;
  /** Dự báo cuối tháng của thẻ kênh — cùng số với màn hình (Dashboard 22/10: cuối tháng chỉ có MỘT số, không xuất "giữ nhịp"). */
  forecast?: number | null;
  /** Nhãn khả năng đạt kèm %, vd "Có thể đạt · 62%". */
  landing?: string | null;
}

const STATUS_LABEL: Record<WaveStatus, string> = { done: "đã xong", live: "đang chạy", next: "sắp tới" };

// ---------------------------------------------------------------------------
// Xuất Excel — đúng những gì đã hiện trên màn hình, mỗi dòng thuộc MỘT tài khoản (không dòng tổng gộp)
// ---------------------------------------------------------------------------

export const SHIFT_STATE_LABEL: Record<PlanSlotState, string> = { done: "Đã có số", no_data: "Chưa có số", pending: "Chưa tới", cancelled: "Đã huỷ (giữ target)" };
const WEEKDAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const weekdayOf = (d: string) => WEEKDAY_NAMES[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
const pctNum = (v: number | null) => (v == null ? "" : Math.round(v * 1000) / 10);
const round = (v: number | null) => (v == null ? "" : Math.round(v));

type Row = Record<string, string | number>;

export function runRateExportSheets(accounts: ExportAccount[]): { name: string; rows: Row[] }[] {
  const withReport = accounts.filter((a): a is ExportAccount & { report: AccountRunRate } => !!a.report);
  const overview: Row[] = accounts.map((a) => {
    const r = a.report;
    return {
      "Tài khoản": a.name,
      "Sàn": a.platform,
      "Số tới ngày": r?.asOf ?? "",
      "Target tháng": round(r?.total.target ?? null),
      "Kỳ vọng tới ngày": round(r?.total.targetToDate ?? null),
      "Thực đạt": round(r?.total.actual ?? a.actualOnly ?? null),
      "Run-rate (%)": pctNum(r?.total.runRate ?? null),
      "% target tháng": pctNum(r?.total.pctTarget ?? null),
      "Dự kiến cuối tháng": round(a.forecast ?? null),
      "Cần mỗi ngày còn lại": round(r?.total.needPerRemainingDay ?? null),
      "Ghi chú": r ? a.landing ?? "" : a.missing === "no_plan" ? "Chưa chốt Kế Hoạch Tháng" : "Tháng này chưa có số"
    };
  });
  const waves: Row[] = withReport.flatMap((a) =>
    a.report.waves.map((w) => ({
      "Tài khoản": a.name, "Đợt": w.label, "Từ": w.from, "Đến": w.to, "Trạng thái": STATUS_LABEL[w.status],
      "Target đợt": round(w.target), "Kỳ vọng tới ngày": round(w.targetToDate), "Thực đạt": round(w.actual), "Run-rate (%)": pctNum(w.runRate), "% target cả đợt": pctNum(w.pctTarget), "Còn thiếu": round(w.gap), "Ngày còn lại": w.daysLeft, "Cần đạt các ngày còn lại (% target)": pctNum(w.needRate), "Số ca": w.shifts, "Ca có số": w.shiftsDone
    }))
  );
  const days: Row[] = withReport.flatMap((a) =>
    a.report.days.filter((d) => d.shifts > 0 || d.target > 0 || d.actual > 0).map((d) => ({
      "Tài khoản": a.name, "Ngày": d.date, "Thứ": weekdayOf(d.date), "Đợt": WAVE_NAME[d.bucket], "Số ca": d.shifts, "Ca có số": d.withData,
      "Target": round(d.target), "Thực đạt": round(d.actual), "% target ngày": pctNum(d.pctTarget), "Tình trạng": d.counted ? "Đã vào run-rate" : d.state === "partial" ? "Tạm tính" : "Chưa tới"
    }))
  );
  const shifts: Row[] = withReport.flatMap((a) =>
    a.report.shifts.map((s) => ({
      "Tài khoản": a.name, "Ngày": s.date, "Giờ": `${s.startTime}–${s.endTime}`, "Đợt": WAVE_NAME[s.bucket], "Host": s.hostName, "Trợ live": s.assistantName,
      "Target": round(s.target), "Thực đạt": s.state === "done" ? round(s.actual) : "", "% target ca": pctNum(s.pctTarget), "Trạng thái": SHIFT_STATE_LABEL[s.state]
    }))
  );
  return [{ name: "Tổng quan", rows: overview }, { name: "Theo đợt", rows: waves }, { name: "Theo ngày", rows: days }, { name: "Theo ca", rows: shifts }];
}
