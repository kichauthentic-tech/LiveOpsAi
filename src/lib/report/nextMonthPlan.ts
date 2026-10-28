import { noiseBand } from "./brandReport";
import type { RefundMonthStatus } from "../refundStatus";

// Trang "Kế hoạch tháng sau" của Report Tháng (GĐ4, 28/10/2026, demo scratchpad/report_t10_v3.html): hàm thuần cho
//  (a) Target Live theo loại ngày so với GMV/giờ đã đạt, kèm dải nhiễu; (b) Booking Creator (đọc từ tab Affiliate) so với tháng này;
//  (c) Deadline + PIC chính của việc tháng sau và (d) Refund rate đã chốt do ops nhập — (c)(d) lưu ở section_notes, không migration.

// ---------- (a) Target Live theo loại ngày ----------

export type LiveRequirementTone = "reach" | "stretch" | "beyond" | "nodata";

export interface LiveRequirement {
  /** (GMV/giờ cần − GMV/giờ đã đạt) ÷ GMV/giờ đã đạt, đơn vị %. null khi thiếu một vế. */
  gapPct: number | null;
  /** Dải nhiễu 95% (±%) của GMV/giờ loại ngày đó: so số phiên đã đạt với số phiên kế hoạch. null khi một vế chưa có phiên. */
  band: number | null;
  /**
   * reach = cần ≤ đã đạt (không đòi hơn tháng này);
   * stretch = cần cao hơn nhưng trong dải nhiễu (chênh lệch này một tháng ngẫu nhiên cũng có thể tự đạt);
   * beyond = cần cao hơn quá dải nhiễu (phải cải thiện thật);
   * nodata = thiếu Giờ live/Target hoặc chưa có phiên tháng này.
   */
  tone: LiveRequirementTone;
}

export function liveRequirement(requiredGmvPerHour: number | null, actualGmvPerHour: number | null, actualSessions: number, plannedSessions: number): LiveRequirement {
  if (requiredGmvPerHour == null || actualGmvPerHour == null || actualGmvPerHour <= 0) return { gapPct: null, band: null, tone: "nodata" };
  const gapPct = ((requiredGmvPerHour - actualGmvPerHour) / actualGmvPerHour) * 100;
  const band = noiseBand(actualSessions, plannedSessions);
  const tone: LiveRequirementTone = gapPct <= 0 ? "reach" : band != null && gapPct <= band ? "stretch" : "beyond";
  return { gapPct, band, tone };
}

export const LIVE_TONE_LABEL: Record<LiveRequirementTone, string> = {
  reach: "thấp hơn mức đã đạt",
  stretch: "cao hơn, trong dải nhiễu",
  beyond: "cao hơn, vượt dải nhiễu",
  nodata: "chưa đủ số"
};

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
      mk("sessions", "Số phiên", planned.sessions, actual.sessions),
      mk("hours", "Giờ live", planned.hours > 0 ? planned.hours : null, actual.hours > 0 ? actual.hours : null),
      mk("gmv", "Target Creator / Direct GMV", planned.target > 0 ? planned.target : null, actual.gmv > 0 ? actual.gmv : null),
      mk("gmvPerHour", "GMV/giờ", pGph, actual.gmvPerHour),
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

// ---------- Nhập tay ở trang "Kế hoạch tháng sau" (mục 1 Target Live, mục 2 Booking Creator) ----------
// Khi Kế Hoạch Tháng / tab Affiliate của tháng sau chưa có số, ops nhập thẳng ở trang này; lưu ở section_notes của report (cả team thấy
// chung, không còn nằm trong trình duyệt) và nối vào ô chỉ số đầu trang. Có số từ app thì số app thắng, ô nhập tay không hiện.

export interface TypedBooking { d?: string; c?: string; camp?: string; tl?: string; h?: string; t?: string; a?: string }
export interface ManualPlan {
  live: Record<string, { h?: string; t?: string }>;
  booking: TypedBooking[];
}
export const EMPTY_MANUAL_PLAN: ManualPlan = { live: {}, booking: [{}, {}, {}] };
export const manualPlanKey = (month: string) => `next-manual-plan:${month}`;

export function encodeManualPlan(m: ManualPlan): string | null {
  const live = Object.fromEntries(Object.entries(m.live).filter(([, v]) => (v.h ?? "").trim() || (v.t ?? "").trim()));
  const booking = m.booking.filter((b) => Object.values(b).some((x) => String(x ?? "").trim()));
  return Object.keys(live).length || booking.length ? JSON.stringify({ live, booking }) : null;
}

export function decodeManualPlan(text: string | undefined | null): ManualPlan {
  if (!text) return EMPTY_MANUAL_PLAN;
  try {
    const raw = JSON.parse(text) as { live?: unknown; booking?: unknown };
    const live = raw.live && typeof raw.live === "object" ? (raw.live as ManualPlan["live"]) : {};
    const booking = Array.isArray(raw.booking) && raw.booking.length ? (raw.booking as TypedBooking[]) : EMPTY_MANUAL_PLAN.booking;
    return { live, booking };
  } catch {
    return EMPTY_MANUAL_PLAN;
  }
}

/** "2.300" / "2300,5" → số; ô trống hoặc chữ → null. */
export function parseManualNum(v: unknown): number | null {
  const n = parseFloat(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** Tổng Target Live (VND) và số loại ngày đã nhập đủ Giờ + Target từ ô nhập tay. */
export function manualLiveTotals(live: ManualPlan["live"]): { target: number; hours: number; filled: number } {
  let target = 0;
  let hours = 0;
  let filled = 0;
  for (const v of Object.values(live)) {
    const h = parseManualNum(v.h);
    const t = parseManualNum(v.t);
    if (h && t) {
      hours += h;
      target += t * 1e6;
      filled++;
    }
  }
  return { target, hours, filled };
}

/** Các dòng Booking nhập tay có Target → dạng chung để cộng bằng bookingTotals. */
export function manualBookingRows(rows: TypedBooking[]): { hours: number | null; target: number | null; budgetAds: number | null }[] {
  return rows
    .map((r) => ({ hours: parseManualNum(r.h), target: r.t ? (parseManualNum(r.t) ?? 0) * 1e6 || null : null, budgetAds: r.a ? (parseManualNum(r.a) ?? 0) * 1e6 || null : null }))
    .filter((r) => r.target);
}
