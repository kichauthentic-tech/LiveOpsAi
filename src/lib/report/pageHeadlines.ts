import { fmtVndShort } from "../format";
import { t } from "../displayLang";
import type { InsightBlocks } from "./pageInsights";

// Tiêu đề kết luận (action title) đặt trên hàng chỉ số của mỗi trang Report Tháng. Câu mẫu có chỗ trống, điền từ cùng số
// với khối Insight cuối trang (pageInsights.ts) — một câu, có số, và nói rõ khi tháng không có gì nổi bật.

const pct = (v: number) => `${Math.round(v)}%`;

export interface SummaryHeadlineInput {
  liveActual: number;
  /** Target LIVE GMV tới nay (tháng còn dở) hoặc cả tháng; null = chưa có Target. */
  liveTarget: number | null;
  days: { label: string; target: number | null; actual: number }[];
  /** Tên chỉ số trong câu — report Shopee dùng "GMV" (Sales(Placed Order)), không mượn tên TikTok. */
  gmvLabel?: string;
}

export function summaryHeadline(i: SummaryHeadlineInput): string {
  const g = i.gmvLabel ?? "LIVE GMV";
  if (i.liveTarget == null || i.liveTarget <= 0)
    return t(`${g} ${fmtVndShort(i.liveActual)}; tháng này chưa có Target${i.gmvLabel ? "" : " LIVE"} nên chưa đánh giá được kết quả.`, `${g} ${fmtVndShort(i.liveActual)}; no${i.gmvLabel ? "" : " LIVE"} Target this month, so results cannot be assessed yet.`);
  const p = (i.liveActual / i.liveTarget) * 100;
  const head = t(`${g} đạt ${pct(p)} Target (${fmtVndShort(i.liveActual)} so với ${fmtVndShort(i.liveTarget)})`, `${g} reached ${pct(p)} of Target (${fmtVndShort(i.liveActual)} vs ${fmtVndShort(i.liveTarget)})`);
  const withT = i.days.filter((d) => d.target != null && d.target > 0).map((d) => ({ label: d.label, p: (d.actual / d.target!) * 100, gap: d.actual - d.target! }));
  if (withT.length === 0) return `${head}.`;
  // Loại ngày thiếu nhiều tiền nhất (cùng tiêu chí Insight trang 1, audit 30/10) — không phải loại ngày % thấp nhất.
  const worst = [...withT].filter((d) => d.gap < 0).sort((a, b) => a.gap - b.gap)[0];
  return worst
    ? t(`${head}; ${worst.label} thiếu nhiều nhất (−${fmtVndShort(-worst.gap)}, đạt ${pct(worst.p)} Target).`, `${head}; ${worst.label} has the largest gap (−${fmtVndShort(-worst.gap)}, ${pct(worst.p)} of Target).`)
    : t(`${head}; mọi loại ngày đều đạt Target.`, `${head}; every day type met Target.`);
}

export interface KeyMetricsHeadlineInput {
  rows: { label: string; change: number | null; tone: "up" | "down" | "shift" | "noise"; /** Chỉ số kết quả (GMV, Orders…) — không làm "nguyên nhân đầu tiên". */ result?: boolean }[];
  prevLabel: string;
}

export function keyMetricsHeadline(i: KeyMetricsHeadlineInput): string {
  const rows = i.rows.filter((r) => r.change != null);
  if (rows.length === 0) return t("Chưa có tháng trước để so sánh chỉ số.", "No previous month to compare metrics with.");
  const down = rows.filter((r) => r.tone === "down");
  const up = rows.filter((r) => r.tone === "up");
  if (down.length === 0 && up.length === 0)
    return t(`Cả tháng so với ${i.prevLabel}: không chỉ số nào đổi vượt ngưỡng dao động, chưa có thay đổi nổi bật.`, `Full month vs ${i.prevLabel}: no metric moved beyond its normal range; no notable change.`);
  const first = down.find((r) => !r.result) ?? down[0];
  const parts: string[] = [];
  if (down.length) parts.push(t(`${down.length} chỉ số suy giảm vượt ngưỡng (đầu tiên trong phễu: ${first.label} ${Math.round(first.change!)}%)`, `${down.length} metric(s) declined beyond range (first in the funnel: ${first.label} ${Math.round(first.change!)}%)`));
  if (up.length) parts.push(t(`${up.length} chỉ số cải thiện vượt ngưỡng`, `${up.length} metric(s) improved beyond range`));
  return t(`Cả tháng so với ${i.prevLabel}: ${parts.join(", ")}.`, `Full month vs ${i.prevLabel}: ${parts.join(", ")}.`);
}

/** Trang khác: câu đầu của khối Quan sát (đã là câu có số); trang chưa đủ số thì nói thẳng. */
export function observeHeadline(b: InsightBlocks, fallback: string): string {
  const first = b.observe.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ỵ0-9])/)[0]?.trim();
  if (!first || /^(Chưa đủ số liệu|Not enough data)/.test(first)) return fallback;
  return first;
}

/** Quan sát bỏ câu đã làm tiêu đề trang (audit trùng lặp 30/10: 8/10 trang in câu tiêu đề lần thứ hai ở đầu Insight).
 *  Chỉ bỏ khi câu đầu trùng đúng tiêu đề; còn lại giữ nguyên. Quan sát rỗng thì khối bị ẩn ở giao diện. */
export function dropHeadline(b: InsightBlocks, headline: string): InsightBlocks {
  const norm = (t: string) => t.trim().replace(/[.!?]+$/, "");
  const parts = b.observe.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ỵ0-9])/);
  if (!parts[0] || norm(parts[0]) !== norm(headline)) return b;
  return { ...b, observe: parts.slice(1).join(" ").trim() };
}
