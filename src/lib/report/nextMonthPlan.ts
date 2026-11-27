import { isBigChange } from "./changeThreshold";
import type { RefundMonthStatus } from "../refundStatus";
import { byLang, t } from "../displayLang";

// Trang "Kế hoạch tháng sau" của Report Tháng (GĐ4, 28/10/2026, demo scratchpad/report_t10_v3.html): hàm thuần cho
//  (a) Target Live theo loại ngày so với GMV/giờ đã đạt; (b) Booking Creator (đọc từ tab Affiliate) so với tháng này;
//  (c) Deadline + PIC chính của việc tháng sau và (d) Refund rate đã chốt do ops nhập — (c)(d) lưu ở section_notes, không migration.

// ---------- (a) Target Live theo loại ngày ----------

export type LiveRequirementTone = "reach" | "stretch" | "beyond" | "nodata";

export interface LiveRequirement {
  /** (GMV/giờ cần − GMV/giờ đã đạt) ÷ GMV/giờ đã đạt, đơn vị %. null khi thiếu một vế. */
  gapPct: number | null;
  /**
   * reach = cần ≤ đã đạt (không đòi hơn tháng này);
   * stretch = cần cao hơn nhưng dưới 10%;
   * beyond = cần cao hơn từ 10% trở lên (phải cải thiện thật);
   * nodata = thiếu Giờ live/Target hoặc chưa có phiên tháng này.
   */
  tone: LiveRequirementTone;
}

export function liveRequirement(requiredGmvPerHour: number | null, actualGmvPerHour: number | null): LiveRequirement {
  if (requiredGmvPerHour == null || actualGmvPerHour == null || actualGmvPerHour <= 0) return { gapPct: null, tone: "nodata" };
  const gapPct = ((requiredGmvPerHour - actualGmvPerHour) / actualGmvPerHour) * 100;
  const tone: LiveRequirementTone = gapPct <= 0 ? "reach" : isBigChange(gapPct) ? "beyond" : "stretch";
  return { gapPct, tone };
}

export const LIVE_TONE_LABEL: Record<LiveRequirementTone, string> = byLang(() => ({
  reach: t("thấp hơn mức đã đạt", "below the level achieved"),
  stretch: t("cao hơn dưới 10%", "less than 10% higher"),
  beyond: t("cao hơn từ 10%", "10% or more higher"),
  nodata: t("chưa đủ số", "not enough data")
}));

export interface PlanGapRow {
  name: string;
  /** GMV/giờ đã đạt ở tháng report; null = chưa có phiên. */
  achieved: number | null;
  sessionsCur: number;
  plan?: { hours: number; target: number; slots: number };
}

export interface PlanGap {
  name: string;
  hours: number;
  target: number;
  required: number;
  achieved: number;
  gapPct: number;
}

export interface PlanGaps {
  /** Cả tháng, chỉ khi cao hơn từ 10%. */
  total: PlanGap | null;
  /** Các loại ngày cao hơn từ 10%, chênh lớn nhất đứng đầu. */
  days: PlanGap[];
}

/** Phần của kế hoạch tháng sau đòi GMV/giờ cao hơn mức đã đạt từ 10% — cùng phép tính và cùng điều kiện "cả tháng"
 *  (mọi loại ngày đều có giờ và Target) với bảng Kế hoạch Target Live, để khối Insight không nói ngược bảng. */
export function planGaps(rows: PlanGapRow[], total: PlanGapRow): PlanGaps {
  const one = (name: string, achieved: number | null, hours: number, target: number): PlanGap | null => {
    if (!(hours > 0) || !(target > 0)) return null;
    const required = target / hours;
    const r = liveRequirement(required, achieved);
    return r.tone === "beyond" ? { name, hours, target, required, achieved: achieved!, gapPct: r.gapPct! } : null;
  };
  const days = rows
    .flatMap((r) => {
      const g = r.plan ? one(r.name, r.achieved, r.plan.hours, r.plan.target) : null;
      return g ? [g] : [];
    })
    .sort((a, b) => b.gapPct - a.gapPct);
  const sum = planSums(rows);
  return { total: sum.complete ? one(total.name, total.achieved, sum.hours, sum.target) : null, days };
}

/** Cộng kế hoạch trong app. `complete` = có giờ, có Target và không loại ngày nào có giờ mà thiếu Target — loại ngày không
 *  có phiên nào thì không chặn dòng "Cả tháng". */
export function planSums(rows: Pick<PlanGapRow, "plan">[]): { hours: number; target: number; complete: boolean } {
  const hours = rows.reduce((a, r) => a + (r.plan?.hours ?? 0), 0);
  const target = rows.reduce((a, r) => a + (r.plan?.target ?? 0), 0);
  return { hours, target, complete: hours > 0 && target > 0 && rows.every((r) => !r.plan || r.plan.hours <= 0 || r.plan.target > 0) };
}

// ---------- (b) Booking Creator so với tháng này ----------

export interface BookingTotals {
  sessions: number;
  hours: number;
  /** Target Creator của tháng = Σ Target các phiên Booking. */
  target: number;
  ads: number;
}

export function bookingTotals(rows: { hours: number | null; target: number | null; budgetAds: number | null }[]): BookingTotals {
  return rows.reduce<BookingTotals>((a, r) => ({ sessions: a.sessions + 1, hours: a.hours + (r.hours ?? 0), target: a.target + (r.target ?? 0), ads: a.ads + (r.budgetAds ?? 0) }), { sessions: 0, hours: 0, target: 0, ads: 0 });
}

export interface BookingVsCurrent {
  /** Kế hoạch tháng sau chưa có phiên nào trong tab Affiliate. */
  empty: boolean;
  rows: { key: "sessions" | "hours" | "gmv" | "gmvPerHour" | "roas"; label: string; planned: number | null; actual: number | null; changePct: number | null }[];
}

/**
 * So kế hoạch Booking với thực tế tháng này. `planned.gmv` là Target Creator; GMV/giờ cần = Target ÷ giờ; ROAS cần = Target ÷ Budget Ads.
 * `actual` lấy từ tổng phiên creator đã live (cùng nguồn trang Affiliate).
 */
export function bookingVsCurrent(planned: BookingTotals, actual: { sessions: number; hours: number; gmv: number; gmvPerHour: number | null; roas: number | null }): BookingVsCurrent {
  const pct = (p: number | null, a: number | null) => (p != null && a != null && a > 0 ? ((p - a) / a) * 100 : null);
  const pGph = planned.hours > 0 && planned.target > 0 ? planned.target / planned.hours : null;
  const pRoas = planned.ads > 0 && planned.target > 0 ? planned.target / planned.ads : null;
  const mk = (key: BookingVsCurrent["rows"][number]["key"], label: string, p: number | null, a: number | null) => ({ key, label, planned: p, actual: a, changePct: pct(p, a) });
  return {
    empty: planned.sessions === 0,
    rows: [
      mk("sessions", t("Số phiên", "Sessions"), planned.sessions, actual.sessions),
      mk("hours", t("Giờ live", "Live hours"), planned.hours > 0 ? planned.hours : null, actual.hours > 0 ? actual.hours : null),
      mk("gmv", "Target Creator / Direct GMV", planned.target > 0 ? planned.target : null, actual.gmv > 0 ? actual.gmv : null),
      mk("gmvPerHour", t("GMV/giờ", "GMV/hour"), pGph, actual.gmvPerHour),
      mk("roas", "ROAS", pRoas, actual.roas)
    ]
  };
}

// ---------- (c) Deadline + PIC chính của việc tháng sau ----------

export interface TodoMeta {
  /** "YYYY-MM-DD" hoặc "". */
  deadline: string;
  pic: string;
}
export type TodoMetaMap = Record<string, TodoMeta>;

export const todoMetaKey = (planMonth: string) => `todo_meta_${planMonth}`;

export function encodeTodoMeta(m: TodoMetaMap): string | null {
  const clean: TodoMetaMap = {};
  for (const [id, v] of Object.entries(m)) {
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(v.deadline) ? v.deadline : "";
    const pic = v.pic.trim();
    if (deadline || pic) clean[id] = { deadline, pic };
  }
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function decodeTodoMeta(text: string | undefined | null): TodoMetaMap {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: TodoMetaMap = {};
    for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const o = v as Record<string, unknown>;
      out[id] = { deadline: typeof o.deadline === "string" ? o.deadline : "", pic: typeof o.pic === "string" ? o.pic : "" };
    }
    return out;
  } catch {
    return {};
  }
}

// ---------- (d) Refund rate đã chốt do ops nhập ----------

export const REFUND_FINAL_KEY = "refund_final";

/** { "2026-09": 37.1 } — % hoàn đã chốt theo GMV, ops nhập sau khi sàn chốt. */
export type RefundFinalMap = Record<string, number>;

export function encodeRefundFinal(m: RefundFinalMap): string | null {
  const clean = Object.fromEntries(Object.entries(m).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && Number.isFinite(v) && v >= 0 && v <= 100));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function decodeRefundFinal(text: string | undefined | null): RefundFinalMap {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: RefundFinalMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^\d{4}-\d{2}$/.test(k) && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 100) out[k] = v;
    return out;
  } catch {
    return {};
  }
}

/** "37,5" / "37.5%" → 37.5; ngoài 0–100 hoặc không đọc được ⇒ null. */
export function parseRatePct(text: string): number | null {
  const t = text.replace("%", "").trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return v >= 0 && v <= 100 ? v : null;
}

/** Tỷ lệ chốt ops nhập thắng số tính từ file: tháng đó coi là đã chốt với đúng tỷ lệ đó (NMV chuyển từ ước tính sang số thật). */
export function applyFinalRate(s: RefundMonthStatus, finals: RefundFinalMap): RefundMonthStatus {
  const v = finals[s.month];
  return v == null ? s : { ...s, rate: v, status: "final", reasons: [], definitionUnverified: false };
}

export interface RefundTrackRow {
  month: string;
  /** Tỷ lệ tính từ file Shop Analytics (Σ Hoàn tiền ÷ Σ GMV); null khi chưa có file. */
  fileRate: number | null;
  template: RefundMonthStatus["template"];
  exportedAt: string | null;
  /** Tỷ lệ chốt ops nhập (null = chưa nhập). */
  finalRate: number | null;
  status: "final" | "provisional";
  /** Mẫu cũ: Refund rate chưa so sánh được với mẫu mới cho tới khi up lại file. */
  needsReupload: boolean;
}

export function refundTrackRows(statuses: RefundMonthStatus[], finals: RefundFinalMap): RefundTrackRow[] {
  return statuses.map((s) => {
    const finalRate = finals[s.month] ?? null;
    return {
      month: s.month,
      fileRate: s.rate,
      template: s.template,
      exportedAt: s.exportedAt,
      finalRate,
      status: finalRate != null ? "final" : s.status,
      needsReupload: s.template === "old"
    };
  });
}
