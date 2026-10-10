import type { LiveSession } from "../../types";
import { eachDay, isoWeekStart } from "../dateUtils";
import type { CampDayBucket } from "../campaignDays";
import { fmtVndShort } from "../format";
import { assertOnePlatform } from "../platforms/perf";
import { monthEndOf, RUN_RATE_BAD, RUN_RATE_WARN } from "./ceoBrief";
import { runRateTone, WAVE_NAME, type RunRateTone } from "./channelHealth";
import { isCountable } from "./hostPerformance";
import { profileOf } from "../platforms/profiles";
import { REPORT_PLATFORMS } from "../reportPlatform";
import type { PlanRunRate, PlanSlotState } from "./planRunRate";

// "Cập nhật run-rate" cho sếp + brand (module Run-rate, 11/10/2026). KHÔNG có luật số mới: mọi con số đi qua `planRunRate`
// (target = Σ target ca của Kế Hoạch Tháng đã chốt, ca huỷ giữ target, ca ngoài plan target 0). File này chỉ
//   1) cắt kết quả ở một ngày "số tới" tuỳ chọn (mặc định ngày đủ số — channelHealth.dataCoverage) rồi chia theo
//      tháng / tuần / đợt campaign / ngày / ca,
//   2) soạn bản tin chữ để gửi (Zalo…) cho sếp (mọi tài khoản) hoặc cho một brand.
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
  /** Ngày sau "số tới" nhưng đã có một phần số — tạm tính, chưa vào run-rate. */
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
  /** Thực đạt ÷ target của riêng ngày — chỉ khi ngày có target và đã vào run-rate. */
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
  waves: RRWave[];
  weeks: RRWeek[];
  days: RRDay[];
  shifts: RRShift[];
  offPlan: { session: LiveSession; bucket: CampDayBucket }[];
  offPlanActual: number;
  cancelledCount: number;
  noDataCount: number;
  cumulative: RRCumulativePoint[];
}

const clampDate = (d: string, lo: string, hi: string) => (d < lo ? lo : d > hi ? hi : d);

/** Ngày "số tới" hiệu lực: `requested` (hoặc `fallback`) kẹp trong [đầu tháng, ngày cuối có số]. */
export function resolveAsOf(month: string, through: string | null, requested: string | null | undefined, fallback: string | null | undefined): string | null {
  if (!through) return null;
  const want = requested ?? fallback ?? through;
  return clampDate(want, `${month}-01`, through < `${month}-01` ? `${month}-01` : through);
}

const statusOf = (days: string[], asOf: string | null): WaveStatus => (asOf && days[days.length - 1] <= asOf ? "done" : !asOf || days[0] > asOf ? "next" : "live");

export function buildAccountRunRate(rr: PlanRunRate, asOf: string | null): AccountRunRate {
  const month = rr.month;
  const mStart = `${month}-01`, mEnd = monthEndOf(mStart);
  const monthDays = eachDay(mStart, mEnd);
  const upTo = (d: string) => asOf != null && d <= asOf;
  const bucketOf = new Map<string, CampDayBucket>();
  for (const b of rr.buckets) for (const d of b.days) bucketOf.set(d, b.bucket);

  const slotsByDate = new Map<string, typeof rr.slots>();
  for (const t of rr.slots) slotsByDate.set(t.planSlot.date, [...(slotsByDate.get(t.planSlot.date) ?? []), t]);

  const days: RRDay[] = monthDays.map((date) => {
    const planned = (slotsByDate.get(date) ?? []).filter((t) => t.state !== "cancelled");
    const target = rr.targetByDate.get(date) ?? 0;
    const actual = rr.actualByDate.get(date) ?? 0;
    const withData = planned.filter((t) => t.state === "done").length;
    const counted = upTo(date);
    let state: DayState;
    if (counted) state = planned.some((t) => t.state === "no_data") ? "missing" : planned.length === 0 && actual <= 0 ? "empty" : "counted";
    else if (rr.through && date <= rr.through && actual > 0) state = "partial";
    else state = planned.length === 0 && actual <= 0 ? "empty" : "future";
    return { date, bucket: bucketOf.get(date) ?? "daily", target, actual, shifts: planned.length, withData, state, counted, pctTarget: counted && target > 0 ? actual / target : null };
  });

  const dayOf = new Map(days.map((d) => [d.date, d]));
  const line = (list: string[]): RRLine => {
    let target = 0, targetToDate = 0, actual = 0;
    for (const d of list) {
      const x = dayOf.get(d)!;
      target += x.target;
      if (x.counted) {
        targetToDate += x.target;
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
        status: statusOf(b.days, asOf),
        shifts: inB.length,
        shiftsDone: inB.filter((t) => t.state === "done").length,
        pctTarget: l.target > 0 ? l.actual / l.target : null
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
    status: statusOf(list, asOf)
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

  let cumT = 0, cumA = 0, cumAtAsOf = 0, cumTAtAsOf = 0;
  const cumulative: RRCumulativePoint[] = days.map((d) => {
    cumT += d.target;
    if (d.counted) {
      cumA += d.actual;
      cumAtAsOf = cumA;
      cumTAtAsOf = cumT;
    }
    return { date: d.date, target: cumT, actual: d.counted ? cumA : null, projected: null };
  });
  if (asOf && all.runRate != null) {
    for (const p of cumulative) if (p.date >= asOf) p.projected = cumAtAsOf + (p.target - cumTAtAsOf) * all.runRate;
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
    waves,
    weeks,
    days,
    shifts,
    offPlan: rr.offPlan,
    offPlanActual: rr.offPlanActual,
    cancelledCount: rr.cancelledCount,
    noDataCount: rr.noDataCount,
    cumulative
  };
}

/** Tài khoản chưa có kế hoạch chốt: chỉ có số đã đạt trong tháng (không có target ⇒ không có run-rate). */
export function monthActualOf(channelSessions: LiveSession[], month: string, upTo: string): number {
  assertOnePlatform(channelSessions, "monthActualOf");
  return channelSessions.filter((s) => s.date.startsWith(month) && s.date <= upTo && isCountable(s)).reduce((a, s) => a + (s.actualGmv ?? 0), 0);
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
// Bản tin chữ
// ---------------------------------------------------------------------------

export interface UpdateSections {
  month: boolean;
  wave: boolean;
  week: boolean;
  day: boolean;
  shift: boolean;
}

export const DEFAULT_SECTIONS: UpdateSections = { month: true, wave: true, week: false, day: true, shift: false };

export interface UpdateAccount {
  /** Tên hiển thị: "CROCS" hoặc "VERA · Shopee" khi brand chạy hai sàn. */
  name: string;
  platform: "TikTok" | "Shopee";
  /** null = chưa có kế hoạch chốt. */
  report: AccountRunRate | null;
  /** Lý do không có report. */
  missing?: "no_plan" | "no_data";
  /** Số đã đạt trong tháng khi chưa có target. */
  actualOnly?: number;
}

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const pct0 = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${Math.round(v * 100)}%`);
const rangeLabel = (a: string, b: string) => (a === b ? ddmm(a) : `${ddmm(a)}–${ddmm(b)}`);
const STATUS_LABEL: Record<WaveStatus, string> = { done: "đã xong", live: "đang chạy", next: "sắp tới" };

function accountLines(a: UpdateAccount, sections: UpdateSections, dayFocus: string | null): string[] {
  const r = a.report;
  if (!r) {
    return a.missing === "no_plan"
      ? [`• ${a.name}: chưa chốt Kế Hoạch Tháng nên chưa có target để tính run-rate${a.actualOnly ? ` (đã đạt ${fmtVndShort(a.actualOnly)})` : ""}.`]
      : [`• ${a.name}: tháng này chưa có số.`];
  }
  const t = r.total;
  const v = runRateVerdict(t.runRate);
  const out: string[] = [];
  out.push(`▸ ${a.name} — run-rate ${pct0(t.runRate)} · ${v.label}${r.asOf ? ` (số tới ${ddmm(r.asOf)})` : ""}`);
  if (sections.month) {
    out.push(`  Tháng: đạt ${fmtVndShort(t.actual)} / kỳ vọng tới nay ${fmtVndShort(t.targetToDate)} · target tháng ${fmtVndShort(t.target)} (${pct0(t.pctTarget)})`);
    if (t.keepPace != null) out.push(`  Giữ nhịp này → cuối tháng khoảng ${fmtVndShort(t.keepPace)} (${pct0(t.keepPacePct)} target)`);
    if (t.needPerRemainingDay != null && t.remainingDays > 0) out.push(`  Muốn kịp target: ${fmtVndShort(t.needPerRemainingDay)}/ngày × ${t.remainingDays} ngày còn lại`);
  }
  if (sections.wave) {
    for (const w of r.waves.filter((x) => x.status !== "next" || x.bucket !== "daily")) {
      // Đợt camp là một khoảng ngày liền nhau; "ngày thường" rải khắp tháng nên không ghi khoảng.
      const head = `  ${w.label}${w.bucket === "daily" ? "" : ` ${rangeLabel(w.from, w.to)}`} (${STATUS_LABEL[w.status]})`;
      if (w.status === "next") out.push(`${head}: target ${fmtVndShort(w.target)}`);
      else if (w.targetToDate <= 0) out.push(`${head}: chưa có ca nào tới ngày số tới (target đợt ${fmtVndShort(w.target)})`);
      else out.push(`${head}: ${fmtVndShort(w.actual)} / ${fmtVndShort(w.targetToDate)} → ${pct0(w.runRate)}`);
    }
  }
  if (sections.week) {
    for (const w of r.weeks.filter((x) => x.status !== "next")) out.push(`  ${w.label}: ${fmtVndShort(w.actual)} / ${fmtVndShort(w.targetToDate)} → ${pct0(w.runRate)}`);
  }
  if (sections.day) {
    const d = r.days.find((x) => x.date === (dayFocus ?? r.asOf));
    if (d && d.counted) out.push(d.target > 0 || d.actual > 0 ? `  Ngày ${ddmm(d.date)}: ${fmtVndShort(d.actual)} / target ${fmtVndShort(d.target)}${d.pctTarget != null ? ` → ${pct0(d.pctTarget)}` : ""}` : `  Ngày ${ddmm(d.date)}: không có ca.`);
  }
  if (sections.shift) {
    const day = dayFocus ?? r.asOf;
    for (const s of r.shifts.filter((x) => x.date === day && x.state !== "cancelled")) {
      const who = [s.hostName, s.assistantName].filter(Boolean).join(" + ");
      const res = s.state === "done" ? `${fmtVndShort(s.actual)} / ${fmtVndShort(s.target)}${s.pctTarget != null ? ` → ${pct0(s.pctTarget)}` : ""}` : s.state === "no_data" ? `chưa có số (target ${fmtVndShort(s.target)})` : `target ${fmtVndShort(s.target)}`;
      out.push(`  Ca ${s.startTime}–${s.endTime}${who ? ` · ${who}` : ""}: ${res}`);
    }
  }
  return out;
}

/**
 * Bản tin gửi đi. `boss` = mọi tài khoản, mỗi sàn một nhóm (không có dòng tổng gộp hai sàn). `brand` = các tài khoản của MỘT brand.
 * Chữ thuần, không markdown — dán thẳng vào Zalo/Teams/email.
 */
export function buildUpdateMessage(opts: {
  audience: "boss" | "brand";
  month: string;
  today: string;
  accounts: UpdateAccount[];
  sections: UpdateSections;
  /** Ngày muốn nêu ở mục Ngày / Ca; null = ngày "số tới" của từng tài khoản. */
  dayFocus: string | null;
  note: string;
  brandName?: string;
}): string {
  const { audience, month, today, accounts, sections, dayFocus, note } = opts;
  const title = `${audience === "brand" && opts.brandName ? `${opts.brandName} · ` : ""}Run-rate LIVE · Tháng ${Number(month.slice(5))}/${month.slice(0, 4)}`;
  const lines: string[] = [title, `Cập nhật ${ddmm(today)}`, ""];
  const present = REPORT_PLATFORMS.filter((p) => accounts.some((a) => a.platform === p));
  if (audience === "boss" && present.length > 1) {
    for (const p of present) {
      lines.push(profileOf({ platform: p }).label.toUpperCase());
      for (const a of accounts.filter((x) => x.platform === p)) lines.push(...accountLines(a, sections, dayFocus), "");
    }
  } else {
    for (const a of accounts) lines.push(...accountLines(a, sections, dayFocus), "");
  }
  const withTarget = accounts.some((a) => a.report);
  if (withTarget) lines.push("Run-rate = thực đạt ÷ target các ca kế hoạch tới ngày có số (ca huỷ vẫn giữ target, ca ngoài kế hoạch target 0).");
  if (note.trim()) lines.push("", note.trim());
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// ---------------------------------------------------------------------------
// Xuất Excel — đúng những gì đã hiện trên màn hình, mỗi dòng thuộc MỘT tài khoản (không dòng tổng gộp)
// ---------------------------------------------------------------------------

export const SHIFT_STATE_LABEL: Record<PlanSlotState, string> = { done: "Đã có số", no_data: "Chưa có số", pending: "Chưa tới", cancelled: "Đã huỷ (giữ target)" };
const WEEKDAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const weekdayOf = (d: string) => WEEKDAY_NAMES[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];
const pctNum = (v: number | null) => (v == null ? "" : Math.round(v * 1000) / 10);
const round = (v: number | null) => (v == null ? "" : Math.round(v));

type Row = Record<string, string | number>;

export function runRateExportSheets(accounts: UpdateAccount[]): { name: string; rows: Row[] }[] {
  const withReport = accounts.filter((a): a is UpdateAccount & { report: AccountRunRate } => !!a.report);
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
      "Giữ nhịp → cuối tháng": round(r?.total.keepPace ?? null),
      "Cần mỗi ngày còn lại": round(r?.total.needPerRemainingDay ?? null),
      "Ghi chú": r ? runRateVerdict(r.total.runRate).label : a.missing === "no_plan" ? "Chưa chốt Kế Hoạch Tháng" : "Tháng này chưa có số"
    };
  });
  const waves: Row[] = withReport.flatMap((a) =>
    a.report.waves.map((w) => ({
      "Tài khoản": a.name, "Đợt": w.label, "Từ": w.from, "Đến": w.to, "Trạng thái": STATUS_LABEL[w.status],
      "Target đợt": round(w.target), "Kỳ vọng tới ngày": round(w.targetToDate), "Thực đạt": round(w.actual), "Run-rate (%)": pctNum(w.runRate), "Số ca": w.shifts, "Ca có số": w.shiftsDone
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
