import { fmtVndShort } from "../format";
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
  if (i.liveTarget == null || i.liveTarget <= 0) return `${g} ${fmtVndShort(i.liveActual)}; tháng này chưa có Target${i.gmvLabel ? "" : " LIVE"} nên chưa đánh giá được kết quả.`;
  const p = (i.liveActual / i.liveTarget) * 100;
  const head = `${g} đạt ${pct(p)} Target (${fmtVndShort(i.liveActual)} so với ${fmtVndShort(i.liveTarget)})`;
  const withT = i.days.filter((d) => d.target != null && d.target > 0).map((d) => ({ label: d.label, p: (d.actual / d.target!) * 100 }));
  if (withT.length === 0) return `${head}.`;
  const worst = [...withT].sort((a, b) => a.p - b.p)[0];
  return worst.p < 100 ? `${head}; ${worst.label} thấp nhất ở ${pct(worst.p)} Target.` : `${head}; mọi loại ngày đều đạt Target.`;
}

export interface KeyMetricsHeadlineInput {
  rows: { label: string; change: number | null; tone: "up" | "down" | "shift" | "noise"; /** Chỉ số kết quả (GMV, Orders…) — không làm "nguyên nhân đầu tiên". */ result?: boolean }[];
  prevLabel: string;
}

export function keyMetricsHeadline(i: KeyMetricsHeadlineInput): string {
  const rows = i.rows.filter((r) => r.change != null);
  if (rows.length === 0) return "Chưa có tháng trước để so sánh chỉ số.";
  const down = rows.filter((r) => r.tone === "down");
  const up = rows.filter((r) => r.tone === "up");
  if (down.length === 0 && up.length === 0) return `Cả tháng so với ${i.prevLabel}: không chỉ số nào đổi vượt ngưỡng dao động, chưa có thay đổi nổi bật.`;
  const first = down.find((r) => !r.result) ?? down[0];
  const parts: string[] = [];
  if (down.length) parts.push(`${down.length} chỉ số suy giảm vượt ngưỡng (đầu tiên trong phễu: ${first.label} ${Math.round(first.change!)}%)`);
  if (up.length) parts.push(`${up.length} chỉ số cải thiện vượt ngưỡng`);
  return `Cả tháng so với ${i.prevLabel}: ${parts.join(", ")}.`;
}

/** Trang khác: câu đầu của khối Quan sát (đã là câu có số); trang chưa đủ số thì nói thẳng. */
export function observeHeadline(b: InsightBlocks, fallback: string): string {
  const first = b.observe.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ỵ0-9])/)[0]?.trim();
  if (!first || /^Chưa đủ số liệu/.test(first)) return fallback;
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
