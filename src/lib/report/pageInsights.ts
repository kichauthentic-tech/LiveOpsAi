import { isBigChange } from "./changeThreshold";
import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { pctTxt, signed } from "./monthlyReportInsights";
import { byLang, numLocale, t } from "../displayLang";
import type { PlanGaps } from "./nextMonthPlan";

// "Insight tổng hợp" cuối mỗi trang Report Tháng (2026-10-28, demo scratchpad/report_t10_v3.html): 4 khối cố định
// Quan sát / Nguyên nhân / Tác động / Đề xuất, mỗi khối MỘT đoạn sinh từ câu mẫu có chỗ trống + quy tắc chọn.
// Hàm thuần; đầu vào là số trang đó đang hiện (component chỉ nối dây). Ops sửa tay từng khối → lưu ở
// brand_monthly_reports.section_notes (khoá `pg_<trang>`, nội dung JSON {khối: chữ}); khối chưa sửa vẫn theo bản tự sinh.

export type InsightPage = "summary" | "keymetrics" | "nmv" | "shop" | "why" | "products" | "people" | "ads" | "affiliate" | "next";

export const BLOCK_KEYS = ["observe", "cause", "impact", "advise"] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];
export type InsightBlocks = Record<BlockKey, string>;
export const BLOCK_LABEL: Record<BlockKey | "own", string> = byLang(() => ({ observe: t("Quan sát", "Observation"), cause: t("Nguyên nhân", "Cause"), impact: t("Tác động", "Impact"), advise: t("Đề xuất", "Recommendation"), own: t("Nhận định riêng", "Additional notes") }));
export type InsightEdits = Partial<Record<BlockKey | "own", string>>;

// Bản tiếng Anh sửa riêng (khoá `pg_<trang>_en`): câu ops sửa bằng tiếng Việt không hiện trong report tiếng Anh và ngược lại.
export const pageNoteKey = (page: InsightPage) => t(`pg_${page}`, `pg_${page}_en`);

export function encodeEdits(e: InsightEdits): string | null {
  const clean = Object.fromEntries(Object.entries(e).filter(([, v]) => typeof v === "string" && v.trim() !== "").map(([k, v]) => [k, (v as string).trim()]));
  return Object.keys(clean).length ? JSON.stringify(clean) : null;
}

export function decodeEdits(text: string | undefined | null): InsightEdits {
  if (!text) return {};
  try {
    const raw = JSON.parse(text) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: InsightEdits = {};
    for (const k of [...BLOCK_KEYS, "own"] as const) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Insight ops sửa tay CŨ hơn bản chụp số liệu: bảng đã đổi theo "Cập nhật số liệu" còn chữ sửa tay giữ số cũ.
 *  Audit 27/11 (CROCS T10): 7/7 trang có Insight sửa tay đều cũ, ≥47 con số lệch bảng cùng trang ⇒ chặn Phát hành / Tải bản
 *  gửi brand tới khi ops đọc lại (giữ bản sửa = lưu lại, đổi savedAt) hoặc khôi phục bản tự sinh. Ghi chú chỉ có ô rỗng thì không tính. */
export function isInsightStale(note: { text: string; savedAt: string } | undefined | null, computedAt: string | null | undefined): boolean {
  if (!note || !computedAt || Object.keys(decodeEdits(note.text)).length === 0) return false;
  const a = Date.parse(note.savedAt), b = Date.parse(computedAt);
  return Number.isFinite(a) && Number.isFinite(b) ? a < b : note.savedAt < computedAt;
}

/** Khối ops đã sửa ghi đè bản tự sinh; `own` chỉ có khi ops nhập. */
export function shownBlocks(auto: InsightBlocks, edits: InsightEdits): InsightBlocks & { own: string } {
  return {
    observe: edits.observe ?? auto.observe,
    cause: edits.cause ?? auto.cause,
    impact: edits.impact ?? auto.impact,
    advise: edits.advise ?? auto.advise,
    own: edits.own ?? ""
  };
}

const money = (v: number) => fmtVndShort(v);
const sgn = (v: number) => (v >= 0 ? "+" : "−");
const moneySigned = (v: number) => `${sgn(v)}${money(Math.abs(v))}`;
// Audit 27/11: ô không có phát hiện (câu "chưa kết luận", ghi chú cách tính, việc của ops) ⇒ "—" để giao diện ẩn ô đó; trang
// không còn ô nào thì bản gửi brand không vẽ khung Insight (DemoInsight). Tiêu đề trang đã nói "chưa đủ số liệu" khi thiếu số.
// Bản tự sinh CROCS T11: 9/27 ô từng là chữ điền cho đủ 4 ô.
const NONE = "—";
const empty = (): InsightBlocks => ({ observe: NONE, cause: NONE, impact: NONE, advise: NONE });
const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" ");

// ---------- 1. Tổng quan & KPI ----------

export interface SummaryInsightInput {
  liveActual: number;
  /** Target LIVE GMV tới nay (tháng còn dở) hoặc cả tháng; null = chưa có Target. */
  liveTarget: number | null;
  /** `gphPct` / `hoursPct` = GMV/giờ thực ÷ kế hoạch và Giờ live thực ÷ kế hoạch (%) — số của chính trang 1. */
  days: { label: string; target: number | null; actual: number; gphPct?: number | null; hoursPct?: number | null }[];
  /** Chỉ dùng khi thiếu số kế hoạch theo loại ngày (Shopee): yếu tố GMV/giờ giảm mạnh nhất của loại ngày đổi từ 10%.
   *  Có kế hoạch thì trang 1 KHÔNG phân tích yếu tố — việc đó thuộc trang Phân tích nguyên nhân (audit trùng lặp 30/10). */
  worstFactor: { dayLabel: string; factorLabel: string; change: number; /** GMV/giờ của loại ngày (%). */ dayChange?: number } | null;
  shopKpi: { target: number; projected: number | null } | null;
  /** Tên chỉ số doanh số trong câu — report Shopee truyền "GMV" (Sales(Placed Order)). Mặc định LIVE GMV. */
  gmvLabel?: string;
  /** Khối Tác động thay cho câu KPI toàn shop (report Shopee không có KPI toàn shop: nói phần đơn huỷ). */
  impact?: string;
  /** YFB chạy Ads cho brand × sàn này (phạm vi 0190) — tắt thì Đề xuất không nhắc Ads. Mặc định bật. */
  withAds?: boolean;
}

export function summaryBlocks(i: SummaryInsightInput): InsightBlocks {
  // Chưa có Target: tiêu đề trang đã nói "chưa đánh giá được"; việc lập Target là của ops (dòng "Chỉ ops thấy"), không ghi vào Insight gửi brand.
  if (i.liveTarget == null || i.liveTarget <= 0) return { observe: "", cause: "", impact: i.impact ?? "", advise: "" };
  const gap = i.liveActual - i.liveTarget;
  const withT = i.days.filter((d) => d.target != null && d.target > 0).map((d) => ({ ...d, gap: d.actual - d.target! }));
  // Cùng tiêu chí với tiêu đề trang (pageHeadlines.summaryHeadline): loại ngày thiếu nhiều tiền nhất so với Target
  // (audit 30/10: chọn theo % thấp nhất làm VERA ra "Pay Day chiếm 18% phần thiếu" trong khi Daily gánh 47%).
  const behind = [...withT].filter((d) => d.gap < 0).sort((a, b) => a.gap - b.gap)[0] ?? null;
  const shortfall = withT.filter((d) => d.gap < 0).reduce((a, d) => a + d.gap, 0);
  const observe = join(
    t(`${gap >= 0 ? "Cao hơn" : "Thiếu"} ${money(Math.abs(gap))} so với Target.`, `${money(Math.abs(gap))} ${gap >= 0 ? "above" : "below"} Target.`),
    behind && shortfall < 0
      ? t(`${behind.label} chiếm ${pctTxt((behind.gap / shortfall) * 100, 0)} phần thiếu của các loại ngày (${moneySigned(behind.gap)}).`, `${behind.label} accounts for ${pctTxt((behind.gap / shortfall) * 100, 0)} of the shortfall across day types (${moneySigned(behind.gap)}).`)
      : withT.length && !behind ? t("Mọi loại ngày đều đạt hoặc vượt Target.", "Every day type met or exceeded Target.") : ""
  );
  // Nguyên nhân ở cấp trang 1 = thiếu do GMV/giờ hay do Giờ live so với kế hoạch; yếu tố phễu nằm ở trang Phân tích nguyên nhân.
  const planDays = withT.filter((d) => d.gphPct != null);
  const wf = i.worstFactor;
  // GMV/giờ cả loại ngày đã đổi từ 10%; một yếu tố chỉ được nêu là nguyên nhân khi chính nó cũng đổi từ 10%.
  const wfSig = isBigChange(wf?.change);
  const dayPlan = (d: (typeof planDays)[number]) =>
    t(`${d.label} ${pctTxt(d.gphPct!, 0)} GMV/giờ kế hoạch${d.hoursPct != null ? `, ${pctTxt(d.hoursPct, 0)} Giờ live kế hoạch` : ""}`, `${d.label} ${pctTxt(d.gphPct!, 0)} of planned GMV/hour${d.hoursPct != null ? `, ${pctTxt(d.hoursPct, 0)} of planned live hours` : ""}`);
  // Hai vế cùng dưới 95% ⇒ nêu cả hai, vế có % thấp hơn là phần lớn hơn của phần thiếu (JOCKEY T10 Daily: 88% GMV/giờ, 64% Giờ live).
  const driver = (d: (typeof planDays)[number]): "gph" | "hours" | "both" | "none" => {
    const g = d.gphPct! < 95, h = d.hoursPct != null && d.hoursPct < 95;
    return g && h ? "both" : g ? "gph" : h ? "hours" : "none";
  };
  const why = (d: (typeof planDays)[number]) => {
    const k = driver(d);
    return k === "gph"
      ? t("thiếu do GMV/giờ, Giờ live đạt kế hoạch", "the gap comes from GMV/hour; live hours were on plan")
      : k === "hours"
        ? t("thiếu do Giờ live, GMV/giờ vẫn đạt kế hoạch", "the gap comes from live hours; GMV/hour was still on plan")
        : k === "both"
          ? t(`thiếu do cả GMV/giờ và Giờ live, phần lớn hơn là ${d.hoursPct! < d.gphPct! ? "Giờ live" : "GMV/giờ"}`, `the gap comes from both GMV/hour and live hours, mostly ${d.hoursPct! < d.gphPct! ? "live hours" : "GMV/hour"}`)
          : t("GMV/giờ và Giờ live đều gần kế hoạch, phần thiếu nhỏ", "GMV/hour and live hours were both close to plan; the gap is small");
  };
  const cause = planDays.length
    ? behind && behind.gphPct != null
      ? `${dayPlan(behind)}: ${why(behind)}.${planDays.filter((d) => d !== behind).length ? ` ${t("Các loại ngày khác", "Other day types")}: ${planDays.filter((d) => d !== behind).map(dayPlan).join("; ")}.` : ""}`
      : `${planDays.map(dayPlan).join("; ")}.`
    : wf
      ? wf.dayChange != null
        ? t(
            `${wf.dayLabel}: GMV/giờ ${signed(wf.dayChange, 0)}; yếu tố giảm nhiều nhất là ${wf.factorLabel} ${signed(wf.change, 0)}${wfSig ? "" : ", dưới 10% nên chưa quy được cho một yếu tố"}.`,
            `${wf.dayLabel}: GMV/hour ${signed(wf.dayChange, 0)}; the biggest decline is ${wf.factorLabel} ${signed(wf.change, 0)}${wfSig ? "" : ", under 10%, so it cannot be attributed to a single factor yet"}.`
          )
        : t(`${wf.dayLabel}: ${wf.factorLabel} ${signed(wf.change, 0)} so với cùng loại ngày tháng trước.`, `${wf.dayLabel}: ${wf.factorLabel} ${signed(wf.change, 0)} vs the same day type last month.`)
      : t("Không loại ngày nào có GMV/giờ đổi từ 10% so với tháng trước; chênh lệch so với Target chưa quy được cho một yếu tố cụ thể.", "No day type moved GMV/hour by 10% or more vs last month; the gap to Target cannot be attributed to a specific factor yet.");
  const k = i.shopKpi;
  // Không có KPI toàn shop ⇒ bỏ khối (câu "chưa có KPI GMV trong Kế Hoạch Tháng" là việc của ops, không phải tác động).
  const impact =
    i.impact != null
      ? i.impact
      : k && k.projected != null
        ? t(`${METRIC.totalGmv} dự báo ${money(k.projected)}, ${pctTxt((k.projected / k.target) * 100, 0)} KPI GMV ${money(k.target)}.`, `${METRIC.totalGmv} is projected at ${money(k.projected)}, ${pctTxt((k.projected / k.target) * 100, 0)} of the ${money(k.target)} GMV KPI.`)
        : k ? t(`KPI GMV ${money(k.target)}; chưa đủ số liệu để dự báo cuối tháng.`, `GMV KPI ${money(k.target)}; not enough data yet to project month-end.`) : "";
  const levers = t(`kịch bản, ưu đãi${i.withAds ?? true ? " và Ads" : ""}`, `scripts, offers${i.withAds ?? true ? " and Ads" : ""}`);
  const bk = behind && behind.gphPct != null ? driver(behind) : null;
  const advise = behind
    ? bk === "hours" || (bk === "both" && behind.hoursPct! < behind.gphPct!)
      ? t(`Giữ đủ Giờ live kế hoạch của ${behind.label} (mới đạt ${pctTxt(behind.hoursPct!, 0)}) và đánh giá lại ${levers} trước khi xây lịch tháng sau.`, `Deliver the full planned live hours for ${behind.label} (only ${pctTxt(behind.hoursPct!, 0)} so far) and review ${levers} before building next month's schedule.`)
      : t(`Đánh giá lại ${levers} của ${behind.label} trước khi xây lịch tháng sau.`, `Review ${levers} for ${behind.label} before building next month's schedule.`)
    : t("Giữ kế hoạch hiện tại; theo dõi GMV/giờ từng loại ngày so với kế hoạch.", "Keep the current plan; track GMV/hour by day type against plan.");
  return { observe, cause, impact, advise };
}

// ---------- 2. Key Metrics ----------

export interface KeyMetricsInsightInput {
  /** Cả tháng, tháng này so với tháng trước, theo thứ tự phễu của bảng. */
  rows: { label: string; change: number | null; tone: "up" | "down" | "shift" | "noise"; /** Chỉ số kết quả (GMV, Orders…) — là hệ quả, không làm nguyên nhân. */ result?: boolean }[];
  prevLabel: string;
  /** Chỉ số theo dõi chính đã chọn ở trang Phân tích nguyên nhân (yếu tố kéo GMV/giờ nhiều nhất) — hai trang đề xuất cùng một chỉ số. */
  mainMetric?: string | null;
}

export function keyMetricsBlocks(i: KeyMetricsInsightInput): InsightBlocks {
  const rows = i.rows.filter((r) => r.change != null);
  if (rows.length === 0) return empty();
  const down = rows.filter((r) => r.tone === "down");
  const up = rows.filter((r) => r.tone === "up");
  const list = (xs: typeof rows) => xs.map((r) => `${r.label} ${signed(r.change!, 0)}`).join(", ");
  if (down.length === 0 && up.length === 0) {
    // Tiêu đề trang đã nói "không chỉ số nào tốt lên hay xấu đi từ 10%" ⇒ không lặp thành 4 ô.
    return empty();
  }
  const first = down.find((r) => !r.result) ?? down[0];
  return {
    observe: join(
      t(`Cả tháng so với ${i.prevLabel}:`, `Full month vs ${i.prevLabel}:`),
      down.length ? t(`suy giảm từ 10%: ${list(down)}.`, `declines of 10% or more: ${list(down)}.`) : t("không chỉ số nào suy giảm từ 10%.", "no metric declined by 10% or more."),
      up.length ? t(`Cải thiện từ 10%: ${list(up)}.`, `Improvements of 10% or more: ${list(up)}.`) : ""
    ),
    cause: first
      ? t(`${first.label} là chỉ số phễu đầu tiên suy giảm từ 10% (không tính chỉ số kết quả) (${signed(first.change!, 0)}); các chỉ số phía sau trong phễu thay đổi theo.`, `${first.label} is the first funnel metric to decline by 10% or more (excluding result metrics) (${signed(first.change!, 0)}); metrics further down the funnel follow.`)
      : NONE,
    // Tác động của chỉ số giảm đọc ở trang Phân tích nguyên nhân (cầu 5 yếu tố) — ô này từng chỉ trỏ sang trang đó.
    impact: NONE,
    advise: i.mainMetric
      ? t(`Chỉ số theo dõi chính của tháng sau: ${i.mainMetric} (yếu tố kéo GMV/giờ nhiều nhất, trang Phân tích nguyên nhân)${first && first.label !== i.mainMetric ? `; ${first.label} theo dõi kèm, chỉ tiêu bằng mức ${i.prevLabel}` : ""}.`, `Main tracking metric for next month: ${i.mainMetric} (the factor moving GMV/hour the most, Root-cause page)${first && first.label !== i.mainMetric ? `; also track ${first.label} with a goal at the ${i.prevLabel} level` : ""}.`)
      : first
        ? t(`Dùng ${first.label} làm chỉ số theo dõi chính của tháng sau, theo từng loại ngày, với chỉ tiêu bằng mức ${i.prevLabel}.`, `Use ${first.label} as next month's main tracking metric, by day type, with a goal at the ${i.prevLabel} level.`)
        : NONE
  };
}

// ---------- 3. Hủy, hoàn & NMV ----------

export interface NmvInsightInput {
  refundCur: number | null;
  refundPrev: number | null;
  prevLabel: string;
  nmvSource: string | null;
  usesCrmRate: boolean;
  /** Tháng này / tháng trước chưa chốt (còn trong thời gian hoàn trả). Một chốt một chưa ⇒ không so chênh. */
  curProvisional?: boolean;
  prevProvisional?: boolean;
  /** File của tháng này xuất sớm hơn hẳn (tính từ cuối tháng của nó) so với file tháng trước, khi đơn còn được hoàn trả
   *  ⇒ tỷ lệ còn tăng được, không so chênh (refundImmature). */
  curImmature?: { exportedAt: string; settleFrom: string; prevExportedAt: string } | null;
  /** Hai tháng xuất bằng hai mẫu file Shop Analytics ⇒ cột Hoàn tiền không so được. */
  templateMismatch?: boolean;
  /** LIVE GMV và tỷ lệ đang dùng cho ô NMV — để nói NMV đổi bao nhiêu nếu áp tỷ lệ tháng trước. */
  nmvBase?: { liveGmv: number; rate: number } | null;
}

export function nmvBlocks(i: NmvInsightInput): InsightBlocks {
  if (i.refundCur == null && i.nmvSource == null) return empty();
  const maturityMismatch = i.curProvisional != null && i.prevProvisional != null && i.curProvisional !== i.prevProvisional;
  const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${iso.slice(5, 7)}`;
  const why = i.templateMismatch
    ? t("hai tháng xuất bằng mẫu file Shop Analytics khác nhau", "the two months use different Shop Analytics file templates")
    : i.curImmature
      ? t(`tính tới ngày xuất file, đơn tháng này có ít thời gian hoàn trả hơn đơn ${i.prevLabel} (tháng này xuất ${dm(i.curImmature.exportedAt)}, còn được hoàn trả tới ${dm(i.curImmature.settleFrom)}; ${i.prevLabel} xuất ${dm(i.curImmature.prevExportedAt)})`, `as of the export dates, this month's orders have had less time to be returned than ${i.prevLabel}'s (this month exported ${dm(i.curImmature.exportedAt)}, returns open until ${dm(i.curImmature.settleFrom)}; ${i.prevLabel} exported ${dm(i.curImmature.prevExportedAt)})`)
      : maturityMismatch
        ? i.curProvisional ? t(`tháng này chưa chốt, ${i.prevLabel} đã chốt`, `this month is not final yet while ${i.prevLabel} is final`) : t(`tháng này đã chốt, ${i.prevLabel} chưa chốt`, `this month is final while ${i.prevLabel} is not`)
        : "";
  const delta = i.refundCur != null && i.refundPrev != null && !why ? i.refundCur - i.refundPrev : null;
  const atPrevRate = i.curImmature && !i.templateMismatch && i.nmvBase && i.refundPrev != null && i.refundPrev > i.nmvBase.rate ? i.nmvBase.liveGmv * (1 - i.refundPrev / 100) : null;
  return {
    observe:
      i.refundCur != null
        ? t(
            `Refund rate kỳ này ${pctTxt(i.refundCur)}${i.refundPrev != null ? ` (${i.prevLabel}: ${pctTxt(i.refundPrev)}${why ? `, chưa so sánh được vì ${why}` : ""}${delta != null ? `, ${sgn(delta)}${Math.abs(delta).toLocaleString(numLocale(), { maximumFractionDigits: 1 })} điểm` : ""})` : ""}.`,
            `Refund rate this period ${pctTxt(i.refundCur)}${i.refundPrev != null ? ` (${i.prevLabel}: ${pctTxt(i.refundPrev)}${why ? `, not comparable because ${why}` : ""}${delta != null ? `, ${sgn(delta)}${Math.abs(delta).toLocaleString(numLocale(), { maximumFractionDigits: 1 })} pts` : ""})` : ""}.`
          )
        : t("Chưa có Refund rate của kỳ này.", "No refund rate for this period yet."),
    // Câu cách tính lặp y hệt mỗi tháng ⇒ để ở "Phương pháp" của trang, không chiếm ô Nguyên nhân.
    cause: NONE,
    impact: t(
      `NMV là số ước tính theo ${(i.nmvSource ?? "Refund rate thực của cả shop").replace(/^ước tính\s*[—-]\s*/, "").replace(/^theo\s+/, "")}${i.nmvSource && /mặc định/.test(i.nmvSource) && i.refundCur != null ? `, khác Refund rate thực ${pctTxt(i.refundCur)}` : ""} và có thể đổi khi hết thời gian hoàn trả${why ? "; không so chênh trực tiếp hai tháng" : ""}.${atPrevRate != null ? ` Nếu áp tỷ lệ ${pctTxt(i.refundPrev!)} của ${i.prevLabel}, NMV kỳ này khoảng ${money(atPrevRate)} thay vì ${money(i.nmvBase!.liveGmv * (1 - i.nmvBase!.rate / 100))}.` : ""}`,
      `NMV is an estimate based on ${(i.nmvSource ?? "the shop's actual refund rate").replace(/^estimated\s*[—-]\s*/i, "").replace(/^(based on|using)\s+/i, "")}${i.nmvSource && /default/i.test(i.nmvSource) && i.refundCur != null ? `, which differs from the actual refund rate of ${pctTxt(i.refundCur)}` : ""} and may change once the return window closes${why ? "; the two months are not compared directly" : ""}.${atPrevRate != null ? ` At the ${i.prevLabel} rate of ${pctTxt(i.refundPrev!)}, this period's NMV would be about ${money(atPrevRate)} instead of ${money(i.nmvBase!.liveGmv * (1 - i.nmvBase!.rate / 100))}.` : ""}`
    ),
    // Bỏ việc nội bộ của ops (ghi ngày xuất file); giữ phần brand cần biết.
    advise: t("Cần file Order (lý do hoàn/hủy theo SKU) để tách hoàn và hủy; Refund rate tháng này cập nhật lại sau khi hết thời gian hoàn trả.", "The Order file (return/cancel reasons by SKU) is needed to separate returns from cancellations; this month's refund rate is updated after the return window closes.")
  };
}

// ---------- 4. Toàn shop & livestream YFB ----------

export interface ShopInsightPageInput {
  totalChange: number | null;
  windowLabel: string;
  /** Mỗi kênh: đổi GMV tuyệt đối so với kỳ trước (đồng). `yfb` = kênh YFB vận hành (livestream YFB khi đã tách phiên brand tự live). */
  channels: { label: string; delta: number; yfb?: boolean }[];
  /** Nhóm đối chứng đã có kết luận: livestream YFB so với các kênh còn lại. */
  control: { label: string; liveChg: number; restChg: number; verdict: "ops" | "agency_better" | "market" }[];
  /** Brand tự live cùng tài khoản (0190): nhóm đối chứng vẫn đúng (livestream = phiên YFB, phần còn lại đã trừ cả Seller LIVE). */
  inhouseLive?: boolean;
  /** YFB chỉ nhận livestream (không Ads, không Affiliate) ⇒ các kênh còn lại là đối chứng sạch; việc của kênh khác là thông tin cho brand. */
  liveOnly?: boolean;
  /** Loại ngày có GMV/giờ giảm từ 10% (trang Nguyên nhân). Nhóm đối chứng so TỔNG GMV nên thêm giờ live có thể che mất. */
  weakDays?: { label: string; gphChange: number; hoursChange: number | null }[];
}

export function shopBlocks(i: ShopInsightPageInput): InsightBlocks {
  if (i.totalChange == null && i.channels.length === 0) return empty();
  const byAbs = [...i.channels].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const big = byAbs[0];
  const observe = join(
    i.totalChange != null ? `${METRIC.totalGmv} ${signed(i.totalChange)} (${i.windowLabel}).` : "",
    big ? t(`Kênh đổi nhiều nhất: ${big.label} ${moneySigned(big.delta)}.`, `Biggest channel change: ${big.label} ${moneySigned(big.delta)}.`) : ""
  );
  const ops = i.control.find((c) => c.verdict === "ops");
  const basis = i.liveOnly
    ? t("YFB chỉ vận hành livestream nên các kênh còn lại là nhóm đối chứng", "YFB runs livestream only, so the other channels form the control group")
    : t("nhóm đối chứng gần đúng, YFB cũng tác động Affiliate và Ads", "an approximate control group, as YFB also influences Affiliate and Ads");
  const inhouseNote = i.inhouseLive && i.control.length ? t(" Phiên brand tự live không tính vào bên nào.", " Brand in-house live sessions are counted on neither side.") : "";
  const cause = ops
    ? t(
        `${ops.label}: livestream YFB ${signed(ops.liveChg, 0)}, các kênh còn lại ${signed(ops.restChg, 0)} — livestream giảm mạnh hơn phần còn lại của shop (${basis}) nên cần rà soát vận hành livestream.${inhouseNote}`,
        `${ops.label}: YFB livestream ${signed(ops.liveChg, 0)}, other channels ${signed(ops.restChg, 0)} — livestream fell more than the rest of the shop (${basis}), so livestream operations need review.${inhouseNote}`
      )
    : i.control.length
      ? t(
          `${i.control.map((c) => `${c.label}: livestream YFB ${signed(c.liveChg, 0)}, các kênh còn lại ${signed(c.restChg, 0)}`).join("; ")} — livestream không giảm mạnh hơn các kênh còn lại.${inhouseNote}`,
          `${i.control.map((c) => `${c.label}: YFB livestream ${signed(c.liveChg, 0)}, other channels ${signed(c.restChg, 0)}`).join("; ")} — livestream did not fall more than the other channels.${inhouseNote}`
        )
      : t("Chưa có nhóm đối chứng (cần file Shop Analytics của hai tháng).", "No control group yet (needs Shop Analytics files for both months).");
  const weak = ops ? [] : i.weakDays ?? [];
  const weakNote = weak.length
    ? t(
        `Tuy vậy GMV/giờ giảm từ 10% ở ${weak.map((d) => `${d.label} (${signed(d.gphChange, 0)}${d.hoursChange != null && Math.abs(d.hoursChange) >= 5 ? `, Giờ live ${signed(d.hoursChange, 0)}` : ""})`).join("; ")}, nên tổng GMV chưa phản ánh hiệu suất mỗi giờ.`,
        `However GMV/hour fell by 10% or more on ${weak.map((d) => `${d.label} (${signed(d.gphChange, 0)}${d.hoursChange != null && Math.abs(d.hoursChange) >= 5 ? `, live hours ${signed(d.hoursChange, 0)}` : ""})`).join("; ")}, so total GMV does not show performance per hour.`
      )
    : "";
  const weakAdvice = weak.length
    ? t(`Rà soát GMV/giờ ở ${weak.map((d) => d.label).join(", ")} (trang Phân tích nguyên nhân) trước khi giữ nguyên số giờ live.`, `Review GMV/hour on ${weak.map((d) => d.label).join(", ")} (Root-cause page) before keeping the same live hours.`)
    : "";
  const neg = byAbs.filter((c) => c.delta < 0)[0];
  const impact = neg ? t(`${neg.label} là kênh giảm lớn nhất (${moneySigned(neg.delta)}).`, `${neg.label} is the channel with the largest decline (${moneySigned(neg.delta)}).`) : NONE;
  // Kênh giảm lớn nhất (ngoài livestream) luôn có việc riêng, kể cả khi livestream cũng cần rà soát.
  // Shop chỉ nhận livestream: kênh khác do brand vận hành ⇒ chỉ báo số cho brand, không nhận việc thay brand.
  const negAdvice = !neg || neg.yfb
    ? ""
    : i.liveOnly
      ? t(`Thông tin cho brand: ${neg.label} giảm ${money(Math.abs(neg.delta))} — kênh do brand vận hành, YFB không có việc ở kênh này.`, `For the brand's information: ${neg.label} fell by ${money(Math.abs(neg.delta))} — a brand-run channel with no YFB action.`)
      : t(`Trao đổi với brand kế hoạch ${neg.label} cho tháng sau và theo dõi tỷ trọng kênh.`, `Align with the brand on next month's ${neg.label} plan and track the channel mix.`);
  const advise = ops
    ? join(t(`Rà soát khung giờ, host và kịch bản livestream ở ${ops.label} trước khi kết luận.`, `Review time slots, hosts and livestream scripts for ${ops.label} before concluding.`), negAdvice)
    : join(weakAdvice, negAdvice) || t("Duy trì lịch livestream hiện tại.", "Keep the current livestream schedule.");
  return { observe, cause: join(cause, weakNote), impact, advise };
}

// ---------- 5. Phân tích nguyên nhân ----------

export interface WhyInsightInput {
  gmvPerHourChange: number | null;
  /** 5 yếu tố của LIVE GMV: đóng góp tuyệt đối (đồng) và % đổi. */
  parts: { key?: string; label: string; value: number; change: number }[];
  /** Loại ngày có GMV/giờ đổi từ 10% trở lên. */
  significantDays: { label: string; change: number }[];
  mix: { mix: number; rate: number } | null;
  /** Tên chỉ số doanh số trong câu (mặc định LIVE GMV; Shopee "GMV"). */
  gmvLabel?: string;
}

/** Yếu tố hiệu suất dẫn dắt GMV/giờ: ưu tiên yếu tố đổi từ 10%; không có thì lấy yếu tố lớn nhất nhưng đánh dấu yếu (chưa kết luận). */
function whyLead(i: WhyInsightInput) {
  const perf = i.parts.filter((p) => p.key !== "hours");
  const dirList = (i.gmvPerHourChange ?? 0) < 0 ? perf.filter((p) => p.value < 0).sort((a, b) => a.value - b.value) : perf.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const lead = dirList.find((x) => isBigChange(x.change)) ?? dirList[0];
  return { lead, leadWeak: lead != null && !isBigChange(lead.change) };
}

/** Chỉ số theo dõi chính mà trang Phân tích nguyên nhân đề xuất (yếu tố kéo giảm từ 10%) — trang Key Metrics nói cùng chỉ số. */
export function whyMainMetric(i: WhyInsightInput): string | null {
  if (i.gmvPerHourChange == null || i.parts.length === 0) return null;
  const { lead, leadWeak } = whyLead(i);
  return lead && lead.value < 0 && !leadWeak ? lead.label : null;
}

/** Tiêu đề trang Phân tích nguyên nhân: loại ngày giảm từ 10% đứng trước (kể cả khi cả tháng tăng); một yếu tố
 *  chỉ được gọi là "kéo giảm" khi chính nó giảm từ 10%. */
export function whyHeadline(i: { metric: string; gmvPerHourChange: number | null; parts: { key?: string; label: string; value: number; change: number }[]; days: { label: string; change: number }[] }): string | null {
  const g = i.gmvPerHourChange;
  if (g == null) return null;
  const head = `${i.metric} ${signed(g)}`;
  const list = (xs: typeof i.days) => xs.map((d) => `${d.label} (${signed(d.change, 0)})`).join(", ");
  const negDays = i.days.filter((d) => d.change < 0).sort((a, b) => a.change - b.change);
  if (negDays.length) return t(`${head}: giảm từ 10% ở ${list(negDays)}`, `${head}: decline of 10% or more in ${list(negDays)}`);
  const neg = i.parts.filter((p) => p.key !== "hours" && p.value < 0).sort((a, b) => a.value - b.value);
  const sigFactor = neg.find((p) => isBigChange(p.change));
  const factorTxt = (p: (typeof neg)[number]) => `${p.label} (${signed(p.change, 0)}, ${moneySigned(p.value)})`;
  if (sigFactor) return t(`${head}: yếu tố hiệu suất kéo giảm nhiều nhất là ${factorTxt(sigFactor)}`, `${head}: the performance factor pulling it down most is ${factorTxt(sigFactor)}`);
  if (g < 0 && neg[0]) return t(`${head}: ${factorTxt(neg[0])} đóng góp giảm nhiều nhất nhưng đổi dưới 10%`, `${head}: ${factorTxt(neg[0])} contributed most to the decline but moved by less than 10%`);
  const posDays = i.days.filter((d) => d.change > 0);
  if (posDays.length) return t(`${head}: tăng từ 10% ở ${list(posDays)}`, `${head}: increase of 10% or more in ${list(posDays)}`);
  return t(`${head}: không loại ngày hay yếu tố hiệu suất nào giảm từ 10%`, `${head}: no day type or performance factor declined by 10% or more`);
}

export function whyBlocks(i: WhyInsightInput): InsightBlocks {
  const G = i.gmvLabel ?? "LIVE GMV";
  if (i.gmvPerHourChange == null || i.parts.length === 0) return empty();
  // GMV/giờ đã chia cho giờ ⇒ Giờ live không thể là nguyên nhân của nó; chỉ 4 yếu tố hiệu suất được nêu là nguyên nhân.
  const perf = i.parts.filter((p) => p.key !== "hours");
  const hoursPart = i.parts.find((p) => p.key === "hours");
  const sorted = [...perf].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const neg = perf.filter((p) => p.value < 0).sort((a, b) => a.value - b.value);
  const pos = perf.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const fmt = (xs: typeof i.parts) => xs.slice(0, 3).map((p) => `${p.label} (${moneySigned(p.value)})`).join(", ");
  const sig = i.significantDays;
  const sigList = sig.map((d) => `${d.label} (${signed(d.change, 0)})`).join(", ");
  const negSig = sig.filter((d) => d.change < 0).sort((a, b) => a.change - b.change);
  const observe = join(
    t(`GMV/giờ ${signed(i.gmvPerHourChange, 0)} so với cùng kỳ tháng trước.`, `GMV/hour ${signed(i.gmvPerHourChange, 0)} vs the same period last month.`),
    hoursPart ? t(`Giờ live ${signed(hoursPart.change, 0)} (${moneySigned(hoursPart.value)} ${G}) do lịch quyết định, không tính vào nguyên nhân của GMV/giờ.`, `Live hours ${signed(hoursPart.change, 0)} (${moneySigned(hoursPart.value)} ${G}) are set by the schedule and are not counted as a cause of GMV/hour.`) : "",
    pos.length ? t(`Đóng góp tích cực: ${fmt(pos)}.`, `Positive contributions: ${fmt(pos)}.`) : "",
    neg.length ? t(`Đóng góp tiêu cực: ${fmt(neg)}.`, `Negative contributions: ${fmt(neg)}.`) : "",
    sig.length
      ? t(`Loại ngày có GMV/giờ đổi từ 10%: ${sigList}.`, `Day types with GMV/hour moving 10% or more: ${sigList}.`)
      : t("Không loại ngày nào đổi GMV/giờ từ 10%.", "No day type moved GMV/hour by 10% or more.")
  );
  const { lead, leadWeak } = whyLead(i);
  const cause = lead
    ? leadWeak
      ? t(`${lead.label} đóng góp tuyệt đối lớn nhất vào mức ${i.gmvPerHourChange < 0 ? "giảm" : "tăng"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}) nhưng đổi dưới 10%; chưa yếu tố hiệu suất nào cùng chiều đổi từ 10% nên chưa kết luận được nguyên nhân.`, `${lead.label} contributed the most to the ${i.gmvPerHourChange < 0 ? "decline" : "increase"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}) but moved by less than 10%; no performance factor in the same direction moved 10% or more, so no cause can be concluded yet.`)
      : t(`${lead.label} là yếu tố hiệu suất đóng góp tuyệt đối lớn nhất vào mức ${i.gmvPerHourChange < 0 ? "giảm" : "tăng"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}).`, `${lead.label} is the performance factor contributing the most to the ${i.gmvPerHourChange < 0 ? "decline" : "increase"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}).`)
    : sorted[0]
      ? t(`Yếu tố hiệu suất đóng góp lớn nhất: ${sorted[0].label} (${moneySigned(sorted[0].value)}).`, `Largest performance factor: ${sorted[0].label} (${moneySigned(sorted[0].value)}).`)
      : t("Chưa tách được yếu tố hiệu suất.", "Performance factors could not be separated yet.");
  const m = i.mix;
  const impact = m
    ? Math.abs(m.mix) < Math.abs(m.rate) * 0.3
      ? t(`Thay đổi nằm ở hiệu suất, không ở lịch live: cơ cấu giờ ${moneySigned(m.mix)}/giờ, hiệu suất trong từng loại ngày ${moneySigned(m.rate)}/giờ.`, `The change is in performance, not the live schedule: hour mix ${moneySigned(m.mix)}/hour, performance within day types ${moneySigned(m.rate)}/hour.`)
      : t(`Một phần do lịch: cơ cấu giờ giữa các loại ngày ${moneySigned(m.mix)}/giờ, hiệu suất trong từng loại ngày ${moneySigned(m.rate)}/giờ.`, `Partly due to the schedule: hour mix across day types ${moneySigned(m.mix)}/hour, performance within day types ${moneySigned(m.rate)}/hour.`)
    : lead
      ? t(`Đưa ${lead.label} về mức kỳ trước sẽ bổ sung khoảng ${money(Math.abs(lead.value))} ${G}.`, `Bringing ${lead.label} back to last period's level would add about ${money(Math.abs(lead.value))} ${G}.`)
      : t("Chưa tách được cơ cấu lịch và hiệu suất.", "Schedule mix and performance could not be separated yet.");
  const dayAdvice = negSig.length
    ? t(`Rà soát ${negSig.map((d) => `${d.label} (GMV/giờ ${signed(d.change, 0)})`).join(", ")} trước vì giảm từ 10%: xem khung giờ, host và kịch bản của loại ngày này.`, `Review ${negSig.map((d) => `${d.label} (GMV/hour ${signed(d.change, 0)})`).join(", ")} first, as it fell 10% or more: check its time slots, hosts and scripts.`)
    : "";
  const focus = negSig[0] ?? sig[0];
  const factorAdvice = lead && lead.value < 0
    ? leadWeak
      ? t(`Theo dõi ${lead.label} theo từng loại ngày${focus ? `, bắt đầu từ ${focus.label}` : ""}, chưa coi là nguyên nhân cho tới khi đổi từ 10%.`, `Track ${lead.label} by day type${focus ? `, starting with ${focus.label}` : ""}; do not treat it as the cause until it moves 10% or more.`)
      : t(`Đặt ${lead.label} làm chỉ số theo dõi chính của tháng sau, theo từng loại ngày${focus ? `, bắt đầu từ ${focus.label}` : ""}.`, `Make ${lead.label} next month's main tracking metric, by day type${focus ? `, starting with ${focus.label}` : ""}.`)
    : "";
  const advise = join(dayAdvice, factorAdvice) || t("Giữ kịch bản hiện tại; theo dõi GMV/giờ theo từng loại ngày.", "Keep the current scripts; track GMV/hour by day type.");
  return { observe, cause, impact, advise };
}

// ---------- 6. Sản phẩm & khuyến mãi ----------

export interface ProductsInsightInput {
  topN: number;
  /** MỌI mã đổi hạng trong bảng (skuRankMoves), mức đổi lớn xếp trước — câu đếm phải khớp mũi tên trong bảng. */
  risers: { name: string; from: number | null; to: number; ctor: number | null }[];
  fallers: { name: string; from: number | null; to: number; ctor: number | null; ctr: number | null }[];
  /** Chưa có bảng SKU tháng trước ⇒ không đếm mã tăng/giảm. */
  noPrev?: boolean;
  lead: { name: string; share: number } | null;
  /** Chương trình có Total GMV cao nhất; kèm tiền giảm giá và ROI các chương trình khác trong bảng để không khen mỗi GMV. */
  /** `rate`/`otherRates` = mức giảm (%) theo "Tỷ lệ giảm giá trung bình" của TikTok (promoRate); `groups` = CTKM gom theo loại. */
  promo: {
    name: string;
    rate: number | null;
    discount?: number | null;
    totalDiscount?: number | null;
    otherRates?: number[];
    groups?: { label: string; count: number; discount: number; share: number | null }[];
    /** Chương trình tốn nhiều tiền giảm nhất mà đo được độ phủ (promoReach): % đơn shop dùng + giỏ hàng so với đơn thường. */
    reach?: { name: string; rate: number | null; reach: number; aovVsShop: number } | null;
  } | null;
  /** Tên tỷ lệ chuyển đổi theo SKU (mặc định CTOR; Shopee: Orders/Product Clicks). */
  rateLabel?: string;
  /** Khối Tác động khi không có bảng khuyến mãi theo chương trình (Shopee: xu/voucher đã nhận). */
  promoNote?: string;
}

/** Đổi từ 2 hạng trở lên (hoặc mới vào top) mới đủ để đề xuất việc làm. */
const bigMove = (x: { from: number | null; to: number }) => x.from == null || Math.abs(x.to - x.from) >= 2;

export function productsBlocks(i: ProductsInsightInput): InsightBlocks {
  if (i.risers.length === 0 && i.fallers.length === 0 && !i.lead) return empty();
  const mv = (x: { name: string; from: number | null; to: number }) => `${x.name} (${x.from ?? t("ngoài top", "outside top")} → ${x.to})`;
  const up = i.risers.slice(0, 3), down = i.fallers.slice(0, 3);
  const listed = (xs: typeof up, total: number) => xs.map(mv).join("; ") + (total > xs.length ? t(` và ${total - xs.length} mã khác`, ` and ${total - xs.length} more`) : "");
  const observe = join(
    i.noPrev
      ? t(`Top ${i.topN} SKU: chưa có bảng tháng trước để so hạng.`, `Top ${i.topN} SKUs: no previous month table to compare ranks.`)
      : t(`Top ${i.topN} SKU: ${i.risers.length} mã tăng hạng, ${i.fallers.length} mã giảm hạng.`, `Top ${i.topN} SKUs: ${i.risers.length} moved up, ${i.fallers.length} moved down.`),
    up.length ? t(`Tăng hạng: ${listed(up, i.risers.length)}.`, `Moved up: ${listed(up, i.risers.length)}.`) : "",
    down.length ? t(`Giảm hạng: ${listed(down, i.fallers.length)}.`, `Moved down: ${listed(down, i.fallers.length)}.`) : "",
    i.lead ? t(`${i.lead.name} dẫn đầu, ${pctTxt(i.lead.share, 0)} GMV nhóm top.`, `${i.lead.name} leads with ${pctTxt(i.lead.share, 0)} of top-group GMV.`) : ""
  );
  // Liệt kê tới 5 mã mỗi nhóm và nói thẳng khi tỷ lệ chuyển đổi KHÔNG tách được hai nhóm — chỉ nêu 3 mã đầu từng giấu mất mã phản ví dụ.
  const withRate = <T extends { ctor: number | null }>(xs: T[]) => xs.filter((r): r is T & { ctor: number } => r.ctor != null);
  const rAll = withRate(i.risers), fAll = withRate(i.fallers);
  const rates = (xs: { name: string; ctor: number }[]) => xs.slice(0, 5).map((r) => `${r.name} ${pctTxt(r.ctor, 2)}`).join(", ") + (xs.length > 5 ? t(` và ${xs.length - 5} mã khác`, ` and ${xs.length - 5} more`) : "");
  const R = i.rateLabel ?? "CTOR";
  const lowUp = [...rAll].sort((a, b) => a.ctor - b.ctor)[0];
  const highDown = [...fAll].sort((a, b) => b.ctor - a.ctor)[0];
  const split = !lowUp || !highDown
    ? ""
    : lowUp.ctor > highDown.ctor
      ? t(`Mọi mã tăng hạng có ${R} cao hơn mọi mã giảm hạng.`, `Every riser has a higher ${R} than every faller.`)
      : t(`${R} không tách được hai nhóm: ${lowUp.name} tăng hạng với ${pctTxt(lowUp.ctor, 2)}, không cao hơn ${highDown.name} (${pctTxt(highDown.ctor, 2)}) vốn giảm hạng.`, `${R} does not separate the two groups: ${lowUp.name} moved up at ${pctTxt(lowUp.ctor, 2)}, no higher than ${highDown.name} (${pctTxt(highDown.ctor, 2)}), which moved down.`);
  const cause = rAll.length || fAll.length
    ? join(rAll.length ? t(`${R} nhóm tăng hạng: ${rates(rAll)}.`, `${R} of risers: ${rates(rAll)}.`) : "", fAll.length ? t(`${R} nhóm giảm hạng: ${rates(fAll)}.`, `${R} of fallers: ${rates(fAll)}.`) : "", split)
    : t(`Chưa có ${R} theo SKU để giải thích thay đổi hạng.`, `No ${R} by SKU yet to explain rank changes.`);
  // Audit 27/11: "ROI" (GMV ÷ tiền giảm) = 1 ÷ mức giảm nên KHÔNG đo hiệu quả ⇒ nói bằng mức giảm (Giảm giá ÷ GMV, cùng cột
  // bảng) và tỷ trọng ngân sách giảm giá; không xếp hạng "ROI thấp nhất".
  const p = i.promo;
  const pRate = p?.rate ?? null;
  const otherRates = (p?.otherRates ?? []).filter((x) => x > 0);
  const deepest = pRate != null && otherRates.length > 0 && pRate > Math.max(...otherRates);
  const discShare = p?.discount != null && p.discount > 0 && p.totalDiscount != null && p.totalDiscount > 0 ? (p.discount / p.totalDiscount) * 100 : null;
  // Gom theo loại (27/11): nói tiền giảm giá đi vào loại nào trước, rồi mới tới chương trình GMV cao nhất.
  const paid = (p?.groups ?? []).filter((g) => g.discount > 0 && g.share != null);
  const free = (p?.groups ?? []).filter((g) => g.discount <= 0);
  const groupLine = paid.length && p?.totalDiscount
    ? t(
        `Tiền giảm giá ${money(p.totalDiscount)}: ${paid.map((g) => `${g.label} ${pctTxt(g.share!, 0)} (${g.count} chương trình)`).join(", ")}${free.length ? `; ${free.map((g) => `${g.label} ${g.count} chương trình`).join(", ")} không có tiền giảm trong file` : ""}.`,
        `Discounts of ${money(p.totalDiscount)}: ${paid.map((g) => `${g.label} ${pctTxt(g.share!, 0)} (${g.count} programmes)`).join(", ")}${free.length ? `; ${free.map((g) => `${g.label} ${g.count} programmes`).join(", ")} with no discount in the file` : ""}.`
      )
    : "";
  const rc = p?.reach ?? null;
  const reachLine = rc
    ? t(
        `${rc.name}${rc.rate != null ? ` (mức giảm ${pctTxt(rc.rate, 0)})` : ""} được dùng ở ${pctTxt(rc.reach, 0)} đơn của shop trong kỳ chạy; giỏ hàng của các đơn này ${Math.abs(rc.aovVsShop) < 3 ? "ngang" : rc.aovVsShop < 0 ? `thấp hơn ${pctTxt(-rc.aovVsShop, 0)} so với` : `cao hơn ${pctTxt(rc.aovVsShop, 0)} so với`} đơn trung bình cùng kỳ.`,
        `${rc.name}${rc.rate != null ? ` (discount rate ${pctTxt(rc.rate, 0)})` : ""} was used in ${pctTxt(rc.reach, 0)} of shop orders during its run; these orders' basket was ${Math.abs(rc.aovVsShop) < 3 ? "in line with" : rc.aovVsShop < 0 ? `${pctTxt(-rc.aovVsShop, 0)} below` : `${pctTxt(rc.aovVsShop, 0)} above`} the average order in the same period.`
      )
    : "";
  // Phủ rộng mà giỏ không lớn hơn ⇒ chủ yếu là giảm cho đơn vốn có (không đo được đơn tăng thêm, nên chỉ đề xuất xem lại ngưỡng).
  const thresholdAdvice = rc && rc.reach >= 30 && rc.aovVsShop < 3
    ? t(`Cân nhắc nâng ngưỡng đơn tối thiểu của ${rc.name}: ${pctTxt(rc.reach, 0)} đơn dùng nhưng giỏ hàng không lớn hơn đơn thường.`, `Consider raising the minimum spend of ${rc.name}: ${pctTxt(rc.reach, 0)} of orders used it but their basket was not larger than usual.`)
    : "";
  const impact = i.promoNote != null ? i.promoNote : p
    ? join(
        groupLine,
        t(`Trong các chương trình khuyến mãi có kỳ chạy nằm trong tháng, Total GMV cao nhất thuộc về: ${p.name}.`, `Among promotions whose period falls in the month, the highest Total GMV belongs to: ${p.name}.`),
        discShare != null ? t(`Chương trình này dùng ${money(p.discount!)} tiền giảm giá${pRate != null ? ` (mức giảm ${pctTxt(pRate, 0)})` : ""}, ${pctTxt(discShare, 0)} của ${money(p.totalDiscount!)} cả tháng.`, `It used ${money(p.discount!)} in discounts${pRate != null ? ` (discount rate ${pctTxt(pRate, 0)})` : ""}, ${pctTxt(discShare, 0)} of the month's ${money(p.totalDiscount!)}.`) : "",
        deepest ? t(`Đây là mức giảm sâu nhất trong các chương trình có tiền giảm giá (còn lại ${pctTxt(Math.min(...otherRates), 0)}–${pctTxt(Math.max(...otherRates), 0)}).`, `This is the deepest discount among the discounting programmes (the rest ${pctTxt(Math.min(...otherRates), 0)}–${pctTxt(Math.max(...otherRates), 0)}).`) : "",
        reachLine
      )
    : t("Chưa có số liệu chương trình khuyến mãi của tháng.", "No promotion data for the month yet.");
  const rise = i.risers.find(bigMove);
  const drops = i.fallers.filter(bigMove).slice(0, 3);
  const advise = join(
    rise ? t(`Tăng thời lượng giới thiệu ${rise.name} trên live.`, `Give ${rise.name} more airtime on live.`) : "",
    drops.length ? t(`Kiểm tra tồn kho, giá và kịch bản chuyển đổi của ${drops.map((f) => f.name).join(", ")}.`, `Check stock, pricing and the conversion script for ${drops.map((f) => f.name).join(", ")}.`) : "",
    !rise && !drops.length ? t("Giữ cơ cấu SKU hiện tại; không SKU nào đổi hạng đáng kể.", "Keep the current SKU mix; no SKU changed rank significantly.") : "",
    i.promoNote == null && deepest && discShare != null && discShare >= 25 ? t(`Xem lại mức giảm của ${p!.name} trước khi lặp lại: giảm sâu nhất và chiếm ${pctTxt(discShare, 0)} tiền giảm giá cả tháng.`, `Review the discount level of ${p!.name} before repeating it: the deepest discount and ${pctTxt(discShare, 0)} of the month's discount spend.`) : "",
    i.promoNote == null ? thresholdAdvice : ""
  );
  return { observe, cause, impact, advise };
}

// ---------- 7. Host & khung giờ ----------

export interface PeopleInsightInput {
  /** Host có live tháng này; verdict theo khoảng tin cậy 95% của so sánh gộp nhiều tháng. */
  hosts: { name: string; verdict: "above" | "below" | "unclear"; ci: string; sessions: number; borderline: boolean }[];
  months: number;
  /** `index` = GMV thực ÷ GMV kỳ vọng theo loại ngày (1 = trung bình); có thì xếp khung theo chỉ số này để khử hiệu ứng loại ngày. */
  slots: { label: string; gmvPerHour: number; n: number; index?: number; /** GMV/giờ đổi so với tháng trước (%) — số của ô/bảng khung giờ trên trang. */ change?: number | null }[];
  /** GMV/giờ cả tháng đổi so với tháng trước (%) — chỉ khi biết số này mới được nói một khung đổi theo xu hướng chung. */
  monthChange?: number | null;
  minSessions?: number;
}

export function peopleBlocks(i: PeopleInsightInput): InsightBlocks {
  if (i.hosts.length === 0) return empty();
  const min = i.minSessions ?? 5;
  const ranked = i.hosts.filter((h) => h.sessions >= min);
  const above = ranked.filter((h) => h.verdict === "above");
  const below = ranked.filter((h) => h.verdict === "below");
  const unclear = i.hosts.length - above.length - below.length;
  const txt = (h: (typeof above)[number]) => `${h.name} ${h.ci} (${h.sessions} ${t("phiên", "sessions")})`;
  const slots = i.slots.filter((s) => s.n >= 3);
  const adjusted = slots.length > 0 && slots.every((s) => s.index != null);
  slots.sort((a, b) => (adjusted ? b.index! - a.index! : b.gmvPerHour - a.gmvPerHour));
  const bestS = slots[0], worstS = slots[slots.length - 1];
  const slotNote = (s: (typeof slots)[number]) =>
    t(`${s.label} ${money(s.gmvPerHour)}/giờ${adjusted ? ` (${Math.round(s.index! * 100)}% mức trung bình cùng loại ngày)` : ""}`, `${s.label} ${money(s.gmvPerHour)}/hour${adjusted ? ` (${Math.round(s.index! * 100)}% of the same-day-type average)` : ""}`);
  const observe = join(
    above.length
      ? t(`Cao hơn trung bình ${i.months} tháng có ý nghĩa thống kê (khoảng tin cậy 95%): ${above.map(txt).join("; ")}.`, `Significantly above the ${i.months}-month average (95% confidence interval): ${above.map(txt).join("; ")}.`)
      : t("Không host nào cao hơn trung bình nhóm có ý nghĩa thống kê (khoảng tin cậy 95%).", "No host is significantly above the group average (95% confidence interval)."),
    below.length ? t(`Thấp hơn: ${below.map(txt).join("; ")}.`, `Below: ${below.map(txt).join("; ")}.`) : "",
    unclear > 0 ? t(`${unclear} host chưa khác biệt rõ so với trung bình.`, `${unclear} host(s) not clearly different from the average.`) : ""
  );
  // Ô và bảng khung giờ so với tháng trước; Insight xếp theo chỉ số khử loại ngày. Khung đổi từ 10% mà Insight im lặng thì
  // brand đọc thành mâu thuẫn (audit 30/10: VERA Tối −32% vượt ±18%, Insight "giữ khung giờ") ⇒ nói rõ đó là biến động chung hay riêng khung.
  const sig = slots
    .filter((s) => isBigChange(s.change))
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!))[0];
  const month = i.monthChange ?? null;
  const monthWide = sig != null && month != null && Math.sign(month) === Math.sign(sig.change!) && !isBigChange(sig.change! - month);
  const sigNote = sig
    ? monthWide && adjusted && sig.index! >= 0.9
      ? t(`Khung ${sig.label} ${signed(sig.change!, 0)} so với tháng trước nhưng vẫn đạt ${Math.round(sig.index! * 100)}% mức trung bình cùng loại ngày tháng này: GMV/giờ ${sig.change! < 0 ? "giảm" : "tăng"} chung cả tháng (${signed(month!, 0)}), không riêng khung giờ này.`, `The ${sig.label} slot is ${signed(sig.change!, 0)} vs last month but still at ${Math.round(sig.index! * 100)}% of this month's same-day-type average: GMV/hour ${sig.change! < 0 ? "fell" : "rose"} across the whole month (${signed(month!, 0)}), not just in this slot.`)
      : t(`Khung ${sig.label} ${signed(sig.change!, 0)} so với tháng trước${month != null ? ` (cả tháng ${signed(month, 0)})` : ""}${adjusted ? `; khung này đạt ${Math.round(sig.index! * 100)}% mức trung bình cùng loại ngày` : ""}.`, `The ${sig.label} slot is ${signed(sig.change!, 0)} vs last month${month != null ? ` (whole month ${signed(month, 0)})` : ""}${adjusted ? `; it is at ${Math.round(sig.index! * 100)}% of the same-day-type average` : ""}.`)
    : "";
  const cause = join(
    bestS && worstS && bestS !== worstS
      ? t(`Khung giờ bắt đầu phiên${adjusted ? " (đã so với trung bình cùng loại ngày)" : ""}: cao nhất là ${slotNote(bestS)}, ${bestS.n} phiên; thấp nhất là ${slotNote(worstS)}, ${worstS.n} phiên.`, `Session start time slots${adjusted ? " (vs the same-day-type average)" : ""}: highest is ${slotNote(bestS)}, ${bestS.n} sessions; lowest is ${slotNote(worstS)}, ${worstS.n} sessions.`)
      : t("Chưa đủ phiên theo khung giờ để so sánh (cần từ 3 phiên mỗi khung).", "Not enough sessions per time slot to compare (needs at least 3 per slot)."),
    sigNote
  );
  const small = i.hosts.filter((h) => h.sessions < min).length;
  const impact = join(
    above.some((h) => h.borderline) || below.some((h) => h.borderline) ? t("Có host sát ngưỡng ý nghĩa thống kê, cần thêm dữ liệu tháng sau để kết luận.", "Some hosts are close to the significance threshold; next month's data is needed to conclude.") : "",
    small > 0 ? t(`${small} host dưới ${min} phiên chưa được xếp hạng.`, `${small} host(s) with fewer than ${min} sessions are not ranked.`) : "",
    !above.length && !below.length && small === 0 ? t("Chênh lệch giữa các host chưa đủ lớn để thay đổi cách xếp lịch.", "Differences between hosts are not large enough to change scheduling.") : ""
  ) || NONE; // câu cách so sánh (gộp nhiều tháng) đã ở chú thích bảng Host PFM
  const advise = join(
    above[0] ? t(`Cân nhắc thêm phiên cho ${above[0].name}.`, `Consider adding sessions for ${above[0].name}.`) : "",
    bestS && worstS && bestS !== worstS && (adjusted ? worstS.index! <= bestS.index! * 0.8 : worstS.gmvPerHour <= bestS.gmvPerHour * 0.8)
      ? t(`Cân nhắc dời bớt phiên ${worstS.label} sang ${bestS.label}${adjusted ? "" : " (chưa khử hiệu ứng loại ngày)"}.`, `Consider moving some ${worstS.label} sessions to ${bestS.label}${adjusted ? "" : " (day-type effect not removed)"}.`)
      : "",
    !above[0] && !(bestS && worstS && bestS !== worstS) ? t("Giữ lịch hiện tại và thu thêm phiên trước khi xếp hạng host.", "Keep the current schedule and gather more sessions before ranking hosts.") : ""
  ) || t("Giữ cách xếp host và khung giờ hiện tại; đánh giá lại khi có thêm phiên ở tháng sau.", "Keep the current host and time-slot allocation; review again with more sessions next month.");
  return { observe, cause, impact, advise };
}

// ---------- 8. Quảng cáo ----------

export interface AdsInsightPageInput {
  cost: number;
  /** Target Ads cùng kỳ (tới ngày có số); null = chưa lập kế hoạch Ads. */
  target: number | null;
  liveRoas: number | null;
  buckets: { label: string; cost: number; target: number; roas: number | null }[];
  zeroOrderDays: number;
}

export function adsBlocks(i: AdsInsightPageInput): InsightBlocks {
  if (i.cost <= 0) return empty();
  const pct = i.target ? (i.cost / i.target) * 100 : null;
  const over = i.buckets.filter((b) => b.target > 0).map((b) => ({ ...b, pct: (b.cost / b.target) * 100 })).sort((a, b) => b.pct - a.pct)[0];
  const observe = join(
    `Ads cost ${money(i.cost)}`,
    pct != null ? t(`(${pctTxt(pct)} Target cùng kỳ).`, `(${pctTxt(pct)} of Target to date).`) : t("(chưa có Target Ads).", "(no Ads Target yet)."),
    i.liveRoas != null ? `ROAS Live ${i.liveRoas.toLocaleString(numLocale(), { maximumFractionDigits: 1 })}x.` : ""
  );
  const cause = over && over.pct > 100
    ? t(`${over.label} chi ${pctTxt(over.pct)} Target`, `${over.label} spent ${pctTxt(over.pct)} of Target`) + `${over.roas != null ? `, ROAS Live ${over.roas.toLocaleString(numLocale(), { maximumFractionDigits: 1 })}x` : ""}.`
    : over
      ? t(`Không loại ngày nào chi vượt Target; ${over.label} gần Target nhất (${pctTxt(over.pct)}).`, `No day type overspent its Target; ${over.label} is closest (${pctTxt(over.pct)}).`)
      : t("Chưa có Target Ads theo loại ngày.", "No Ads Target by day type yet.");
  const lowest = i.buckets.filter((b) => b.roas != null).sort((a, b) => a.roas! - b.roas!)[0];
  const impact = join(
    lowest ? t(`ROAS Live thấp nhất ở ${lowest.label}`, `Lowest ROAS Live on ${lowest.label}`) + ` (${lowest.roas!.toLocaleString(numLocale(), { maximumFractionDigits: 1 })}x).` : "",
    i.zeroOrderDays > 0 ? t(`${i.zeroOrderDays} ngày có chi phí Ads nhưng không phát sinh đơn.`, `${i.zeroOrderDays} day(s) with Ads spend but no orders.`) : t("Không ngày nào có chi phí Ads mà không phát sinh đơn.", "No day had Ads spend without orders.")
  );
  const advise = lowest && over && over.pct > 100 && lowest.label === over.label
    ? t(`Đánh giá lại phân bổ Ads của ${lowest.label} trước khi tăng chi.`, `Review the Ads allocation for ${lowest.label} before increasing spend.`)
    : lowest
      ? t(`Rà soát hiệu quả Ads của ${lowest.label} (ROAS Live thấp nhất) trước khi tăng chi.`, `Review Ads efficiency on ${lowest.label} (lowest ROAS Live) before increasing spend.`)
      : t("Giữ phân bổ Ads hiện tại và theo dõi ROAS Live theo loại ngày.", "Keep the current Ads allocation and track ROAS Live by day type.");
  return { observe, cause, impact, advise };
}

// ---------- 9. Affiliate ----------

export interface AffiliateInsightInput {
  sessions: number;
  creators: number;
  gmv: number;
  pctTarget: number | null;
  top: { creator: string; share: number } | null;
  gmvPerHour: number | null;
  lowest: { creator: string; date: string; pct: number } | null;
}

export function affiliateBlocks(i: AffiliateInsightInput): InsightBlocks {
  if (i.sessions === 0) return empty();
  const observe = join(
    t(`${i.sessions} phiên của ${i.creators} creator, GMV phiên ${money(i.gmv)}`, `${i.sessions} sessions from ${i.creators} creator(s), session GMV ${money(i.gmv)}`),
    i.pctTarget != null ? t(`(${pctTxt(i.pctTarget)} Target).`, `(${pctTxt(i.pctTarget)} of Target).`) : t("(chưa có Target phiên).", "(no session Target yet)."),
    i.top ? t(`${i.top.creator} chiếm ${pctTxt(i.top.share, 0)} GMV phiên creator.`, `${i.top.creator} accounts for ${pctTxt(i.top.share, 0)} of creator session GMV.`) : ""
  );
  const cause = i.lowest
    ? t(`Phiên thấp nhất so với Target: ${i.lowest.creator} ${i.lowest.date}, đạt ${pctTxt(i.lowest.pct)} Target.`, `Lowest session vs Target: ${i.lowest.creator} ${i.lowest.date}, at ${pctTxt(i.lowest.pct)} of Target.`)
    : t("Chưa có phiên nào có Target để so sánh.", "No session has a Target to compare against yet.");
  const impact = i.sessions / Math.max(1, i.creators) < 3
    ? t(`Mỗi creator chỉ có vài phiên nên chênh lệch giữa các phiên có thể do biến động ngẫu nhiên${i.gmvPerHour != null ? `; GMV/giờ chung ${money(i.gmvPerHour)}` : ""}.`, `Each creator has only a few sessions, so differences between sessions may be random${i.gmvPerHour != null ? `; overall GMV/hour ${money(i.gmvPerHour)}` : ""}.`)
    : i.gmvPerHour != null ? t(`GMV/giờ chung ${money(i.gmvPerHour)}.`, `Overall GMV/hour ${money(i.gmvPerHour)}.`) : t("Chưa có số giờ live của các phiên.", "Session live hours are not available yet.");
  const advise = i.gmvPerHour != null
    ? t(`Đặt Target Affiliate theo GMV/giờ đã đạt (${money(i.gmvPerHour)}) nhân Giờ live kế hoạch; chưa kết luận về creator có dưới 3 phiên.`, `Set the Affiliate Target as achieved GMV/hour (${money(i.gmvPerHour)}) × planned live hours; no conclusion yet for creators with fewer than 3 sessions.`)
    : t("Ghi giờ live của từng phiên để đặt Target theo GMV/giờ.", "Record live hours per session to set Targets by GMV/hour.");
  return { observe, cause, impact, advise };
}

// ---------- 10. Kế hoạch tháng sau ----------

export interface NextInsightInput {
  nextLabel: string;
  hasLivePlan: boolean;
  hasCreatorPlan: boolean;
  withCreator?: boolean;
  /** Nhãn tháng của report (mốc GMV/giờ đã đạt). */
  curLabel?: string;
  /** Phần kế hoạch đòi GMV/giờ cao hơn mức đã đạt từ 10% (planGaps). */
  gaps?: PlanGaps | null;
  /** Kế Hoạch Tháng đã có phiên nhưng Target bằng 0 — khác hẳn "chưa lập kế hoạch". `achieved` = GMV/giờ tháng report. */
  unpriced?: { sessions: number; hours: number; achieved: number | null } | null;
}

export function nextBlocks(i: NextInsightInput): InsightBlocks {
  // withCreator = false: brand không có Affiliate trong phạm vi YFB (0190) ⇒ chỉ nói kế hoạch Live.
  const withCreator = i.withCreator ?? true;
  const missing = [!i.hasLivePlan && "Target Live", withCreator && !i.hasCreatorPlan && t("lịch Booking Creator (Target Creator)", "the Creator Booking schedule (Creator Target)")].filter(Boolean) as string[];
  const and = t(" và ", " and ");
  const have = withCreator ? t("Target Live và lịch Booking Creator", "Target Live and the Creator Booking schedule") : "Target Live";
  const gaps = i.hasLivePlan ? i.gaps : null;
  const lead = gaps?.total ?? gaps?.days[0] ?? null;
  if (gaps && lead) {
    const curVi = (i.curLabel ?? "tháng này").toLowerCase();
    const curEn = i.curLabel ?? "this month";
    const list = [
      ...(gaps.total ? [t(`cả tháng ${signed(gaps.total.gapPct, 0)}`, `full month ${signed(gaps.total.gapPct, 0)}`)] : []),
      ...gaps.days.slice(0, gaps.total ? 2 : 3).map((d) => `${d.name} ${signed(d.gapPct, 0)}`)
    ].join(", ");
    const hours = lead.hours.toLocaleString(numLocale(), { maximumFractionDigits: 1 });
    const reach = (lead.achieved / lead.required) * 100;
    const worst = gaps.days[0];
    return {
      observe: join(
        t(`${i.nextLabel} cần GMV/giờ cao hơn mức đạt ${curVi} từ 10%: ${list}.`, `${i.nextLabel} needs GMV/hour 10% or more above the ${curEn} level: ${list}.`),
        missing.length ? t(`Còn thiếu ${missing.join(and)}.`, `${missing.join(and)} still missing.`) : ""
      ),
      cause: t(
        `${lead.name}: Target ${money(lead.target)} trên ${hours} giờ live, tức ${money(lead.required)}/giờ; ${curVi} đạt ${money(lead.achieved)}/giờ.`,
        `${lead.name}: a ${money(lead.target)} Target over ${hours} live hours, or ${money(lead.required)}/hour; ${curEn} achieved ${money(lead.achieved)}/hour.`
      ),
      impact: t(
        `Nếu GMV/giờ giữ như ${curVi}, ${hours} giờ kế hoạch đạt khoảng ${money(lead.achieved * lead.hours)}, bằng ${pctTxt(reach, 0)} Target ${money(lead.target)}.`,
        `At the ${curEn} GMV/hour, the planned ${hours} hours would bring about ${money(lead.achieved * lead.hours)}, ${pctTxt(reach, 0)} of the ${money(lead.target)} Target.`
      ),
      advise: join(
        t(
          `Thống nhất cách bù phần chênh: thêm giờ live, đổi phân bổ giữa các loại ngày hoặc chỉnh Target${worst ? `; xem trước ${worst.name} (chênh lớn nhất)` : ""}.`,
          `Agree how to close the gap: add live hours, rebalance day types or adjust the Target${worst ? `; start with ${worst.name} (largest gap)` : ""}.`
        ),
        missing.length ? t(`YFB gửi thêm ${missing.join(and)}.`, `YFB will also send ${missing.join(and)}.`) : ""
      )
    };
  }
  const sched = !i.hasLivePlan ? i.unpriced : null;
  if (sched) {
    const hours = sched.hours.toLocaleString(numLocale(), { maximumFractionDigits: 1 });
    const curVi = (i.curLabel ?? "tháng này").toLowerCase();
    const curEn = i.curLabel ?? "this month";
    const creator = withCreator && !i.hasCreatorPlan ? t("lịch Booking Creator (Target Creator)", "the Creator Booking schedule (Creator Target)") : "";
    return {
      observe: join(
        t(`${i.nextLabel} đã có lịch ${sched.sessions} phiên (${hours} giờ live) nhưng chưa đặt Target Live.`, `${i.nextLabel} has ${sched.sessions} sessions scheduled (${hours} live hours) but no Live Target yet.`),
        creator ? t(`Còn thiếu ${creator}.`, `${creator} still missing.`) : ""
      ),
      cause: t(`Target của các phiên trong Kế Hoạch Tháng đang bằng 0.`, `The sessions in the month plan have a Target of 0.`),
      impact: NONE, // hệ quả hiển nhiên của ô Nguyên nhân
      advise: sched.achieved != null && sched.achieved > 0
        ? t(`YFB đặt Target Live theo phiên; mốc tham chiếu: GMV/giờ ${curVi} ${money(sched.achieved)} × ${hours} giờ ≈ ${money(sched.achieved * sched.hours)}.`, `YFB will set Live Targets per session; reference point: ${curEn} GMV/hour ${money(sched.achieved)} × ${hours} hours ≈ ${money(sched.achieved * sched.hours)}.`)
        : t("YFB đặt Target Live theo phiên trong Kế Hoạch Tháng.", "YFB will set Live Targets per session in the month plan.")
    };
  }
  const observe = missing.length ? t(`${i.nextLabel} chưa có ${missing.join(and)}.`, `${i.nextLabel} does not have ${missing.join(and)} yet.`) : t(`${i.nextLabel} đã có ${have}.`, `${i.nextLabel} has ${have}.`);
  return {
    observe,
    cause: missing.length ? t(`Kế hoạch ${i.nextLabel.toLowerCase()} đang lập, chưa chốt ${missing.join(and)}.`, `The ${i.nextLabel} plan is in progress; ${missing.join(and)} not finalised yet.`) : t(`Đã đủ ${have}.`, `${have} in place.`),
    impact: missing.length ? t("Thiếu kế hoạch thì Target tháng sau dễ đặt theo mục tiêu tổng thay vì GMV/giờ đã đạt.", "Without a plan, next month's Target tends to follow the overall goal rather than the GMV/hour actually achieved.") : t("Kế hoạch đã đủ để chấm tiến độ ngay từ đầu tháng.", "The plan is complete enough to track progress from day one."),
    advise: missing.length
      ? t(`YFB gửi ${missing.join(and)} của ${i.nextLabel.toLowerCase()} kèm GMV/giờ yêu cầu theo loại ngày khi chốt kế hoạch.`, `YFB will send ${missing.join(and)} for ${i.nextLabel} with the required GMV/hour by day type when the plan is finalised.`)
      : withCreator ? t("Theo dõi tiến độ theo Target Live và Booking từ đầu tháng.", "Track progress against Target Live and Bookings from the start of the month.") : t("Theo dõi tiến độ theo Target Live từ đầu tháng.", "Track progress against Target Live from the start of the month.")
  };
}
