// Ngày ops chốt Refund rate của từng tháng (cột "Ngày chốt" của bảng theo dõi Refund rate, demo Report Tháng 28/10).
// Lưu ở section_notes như tỷ lệ chốt (nextMonthPlan.ts: REFUND_FINAL_KEY) để cả team thấy chung.

export const REFUND_FINAL_DATE_KEY = "refund_final_date";

/** { "2026-09": "2026-10-27" } */
export type RefundFinalDateMap = Record<string, string>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function encodeRefundFinalDate(m: RefundFinalDateMap): string | null {
  const clean = Object.fromEntries(Object.entries(m).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && ISO.test(v)));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function decodeRefundFinalDate(text: string | undefined | null): RefundFinalDateMap {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: RefundFinalDateMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) if (/^\d{4}-\d{2}$/.test(k) && typeof v === "string" && ISO.test(v)) out[k] = v;
    return out;
  } catch {
    return {};
  }
}
