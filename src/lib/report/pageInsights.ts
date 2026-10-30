import { fmtVndShort } from "../format";
import { METRIC } from "../metricGlossary";
import { pctTxt, signed } from "./monthlyReportInsights";

// "Insight tổng hợp" cuối mỗi trang Report Tháng (2026-10-28, demo scratchpad/report_t10_v3.html): 4 khối cố định
// Quan sát / Nguyên nhân / Tác động / Đề xuất, mỗi khối MỘT đoạn sinh từ câu mẫu có chỗ trống + quy tắc chọn.
// Hàm thuần; đầu vào là số trang đó đang hiện (component chỉ nối dây). Ops sửa tay từng khối → lưu ở
// brand_monthly_reports.section_notes (khoá `pg_<trang>`, nội dung JSON {khối: chữ}); khối chưa sửa vẫn theo bản tự sinh.

export type InsightPage = "summary" | "keymetrics" | "nmv" | "shop" | "why" | "products" | "people" | "ads" | "affiliate" | "next";

export const BLOCK_KEYS = ["observe", "cause", "impact", "advise"] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];
export type InsightBlocks = Record<BlockKey, string>;
export const BLOCK_LABEL: Record<BlockKey | "own", string> = { observe: "Quan sát", cause: "Nguyên nhân", impact: "Tác động", advise: "Đề xuất", own: "Nhận định riêng" };
export type InsightEdits = Partial<Record<BlockKey | "own", string>>;

export const pageNoteKey = (page: InsightPage) => `pg_${page}`;

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
const NONE = "Chưa đủ số liệu của trang này để nêu nhận định.";
const EMPTY: InsightBlocks = { observe: NONE, cause: "—", impact: "—", advise: "—" };
const join = (...xs: (string | null | undefined | false)[]) => xs.filter(Boolean).join(" ");

// ---------- 1. Tổng quan & KPI ----------

export interface SummaryInsightInput {
  liveActual: number;
  /** Target LIVE GMV tới nay (tháng còn dở) hoặc cả tháng; null = chưa có Target. */
  liveTarget: number | null;
  /** `gphPct` / `hoursPct` = GMV/giờ thực ÷ kế hoạch và Giờ live thực ÷ kế hoạch (%) — số của chính trang 1. */
  days: { label: string; target: number | null; actual: number; gphPct?: number | null; hoursPct?: number | null }[];
  /** Chỉ dùng khi thiếu số kế hoạch theo loại ngày (Shopee): yếu tố GMV/giờ giảm mạnh nhất của loại ngày vượt ngưỡng.
   *  Có kế hoạch thì trang 1 KHÔNG phân tích yếu tố — việc đó thuộc trang Phân tích nguyên nhân (audit trùng lặp 30/10). */
  worstFactor: { dayLabel: string; factorLabel: string; change: number; /** GMV/giờ của loại ngày (%) và ngưỡng dao động của nó. */ dayChange?: number; band?: number | null } | null;
  shopKpi: { target: number; projected: number | null } | null;
  /** Tên chỉ số doanh số trong câu — report Shopee truyền "GMV" (Sales(Placed Order)). Mặc định LIVE GMV. */
  gmvLabel?: string;
  /** Khối Tác động thay cho câu KPI toàn shop (report Shopee không có KPI toàn shop: nói phần đơn huỷ). */
  impact?: string;
}

export function summaryBlocks(i: SummaryInsightInput): InsightBlocks {
  const T = i.gmvLabel ? "Target" : "Target LIVE";
  if (i.liveTarget == null || i.liveTarget <= 0) {
    return { ...EMPTY, observe: "", impact: i.impact ?? EMPTY.impact, advise: `Lập ${T} theo loại ngày trong Kế Hoạch Tháng để report đánh giá được tiến độ.` };
  }
  const gap = i.liveActual - i.liveTarget;
  const withT = i.days.filter((d) => d.target != null && d.target > 0).map((d) => ({ ...d, gap: d.actual - d.target! }));
  // Cùng tiêu chí với tiêu đề trang (pageHeadlines.summaryHeadline): loại ngày đạt % Target thấp nhất.
  const worst = [...withT].sort((a, b) => a.actual / a.target! - b.actual / b.target!)[0];
  const behind = worst && worst.gap < 0 ? worst : null;
  // Tiêu đề đã nói % Target và loại ngày thấp nhất ⇒ Quan sát chỉ nói số tiền chênh và loại ngày nào gánh phần thiếu.
  const shortfall = withT.filter((d) => d.gap < 0).reduce((a, d) => a + d.gap, 0);
  const observe = join(
    `${gap >= 0 ? "Cao hơn" : "Thiếu"} ${money(Math.abs(gap))} so với Target.`,
    behind && shortfall < 0 ? `${behind.label} chiếm ${pctTxt((behind.gap / shortfall) * 100, 0)} phần thiếu của các loại ngày (${moneySigned(behind.gap)}).` : withT.length && !behind ? "Mọi loại ngày đều đạt hoặc vượt Target." : ""
  );
  // Nguyên nhân ở cấp trang 1 = thiếu do GMV/giờ hay do Giờ live so với kế hoạch; yếu tố phễu nằm ở trang Phân tích nguyên nhân.
  const planDays = withT.filter((d) => d.gphPct != null);
  const wf = i.worstFactor;
  // "Vượt ngưỡng" là của GMV/giờ cả loại ngày; từng yếu tố có ngưỡng riêng — chỉ nói yếu tố vượt ngưỡng khi |đổi| ≥ ngưỡng.
  const wfBand = wf?.band != null ? `±${Math.round(wf.band)}%` : "";
  const wfSig = wf != null && wf.band != null && Math.abs(wf.change) >= wf.band;
  const dayPlan = (d: (typeof planDays)[number]) => `${d.label} ${pctTxt(d.gphPct!, 0)} GMV/giờ kế hoạch${d.hoursPct != null ? `, ${pctTxt(d.hoursPct, 0)} Giờ live kế hoạch` : ""}`;
  const cause = planDays.length
    ? behind && behind.gphPct != null
      ? `${dayPlan(behind)}: thiếu ${behind.gphPct < 95 ? "do GMV/giờ, không do Giờ live" : "do Giờ live, GMV/giờ vẫn đạt kế hoạch"}.${planDays.filter((d) => d !== behind).length ? ` Các loại ngày khác: ${planDays.filter((d) => d !== behind).map(dayPlan).join("; ")}.` : ""}`
      : `${planDays.map(dayPlan).join("; ")}.`
    : wf
      ? wf.dayChange != null
        ? `${wf.dayLabel}: GMV/giờ ${signed(wf.dayChange, 0)}${wfBand ? ` vượt ngưỡng dao động ${wfBand}` : ""}; yếu tố giảm nhiều nhất là ${wf.factorLabel} ${signed(wf.change, 0)}${wfSig ? ", cũng vượt ngưỡng" : ", chưa vượt ngưỡng riêng nên chưa quy được cho một yếu tố"}.`
        : `${wf.dayLabel}: ${wf.factorLabel} ${signed(wf.change, 0)} so với cùng loại ngày tháng trước.`
      : "Không loại ngày nào có GMV/giờ đổi vượt ngưỡng dao động so với tháng trước; chênh lệch so với Target chưa quy được cho một yếu tố cụ thể.";
  const k = i.shopKpi;
  const impact = i.impact != null ? i.impact : k && k.projected != null ? `${METRIC.totalGmv} dự báo ${money(k.projected)}, ${pctTxt((k.projected / k.target) * 100, 0)} KPI GMV ${money(k.target)}.` : k ? `KPI GMV ${money(k.target)}; chưa đủ số liệu để dự báo cuối tháng.` : "Tháng này chưa có KPI GMV trong Kế Hoạch Tháng.";
  const advise = behind
    ? `Đánh giá lại kịch bản, ưu đãi và Ads của ${behind.label} trước khi xây lịch tháng sau.`
    : "Giữ kế hoạch hiện tại; theo dõi GMV/giờ từng loại ngày so với kế hoạch.";
  return { observe, cause, impact, advise };
}

// ---------- 2. Key Metrics ----------

export interface KeyMetricsInsightInput {
  /** Cả tháng, tháng này so với tháng trước, theo thứ tự phễu của bảng. */
  rows: { label: string; change: number | null; tone: "up" | "down" | "shift" | "noise"; /** Chỉ số kết quả (GMV, Orders…) — là hệ quả, không làm nguyên nhân. */ result?: boolean }[];
  band: number | null;
  prevLabel: string;
  /** Chỉ số theo dõi chính đã chọn ở trang Phân tích nguyên nhân (yếu tố kéo GMV/giờ nhiều nhất) — hai trang đề xuất cùng một chỉ số. */
  mainMetric?: string | null;
}

export function keyMetricsBlocks(i: KeyMetricsInsightInput): InsightBlocks {
  const rows = i.rows.filter((r) => r.change != null);
  if (rows.length === 0) return EMPTY;
  const down = rows.filter((r) => r.tone === "down");
  const up = rows.filter((r) => r.tone === "up");
  const band = i.band != null ? `±${pctTxt(i.band, 0)}` : "";
  const list = (xs: typeof rows) => xs.map((r) => `${r.label} ${signed(r.change!, 0)}`).join(", ");
  if (down.length === 0 && up.length === 0) {
    return {
      observe: `Cả tháng so với ${i.prevLabel}: không chỉ số nào đổi vượt ngưỡng dao động${band ? ` ${band}` : ""}.`,
      cause: "Các thay đổi nằm trong biến động thông thường giữa các phiên, chưa kết luận được xu hướng.",
      impact: "Chưa có chỉ số nào cần xử lý riêng.",
      advise: "Giữ chỉ số theo dõi hiện tại và đánh giá lại ở report tháng sau."
    };
  }
  const first = down.find((r) => !r.result) ?? down[0];
  return {
    observe: join(`Cả tháng so với ${i.prevLabel}${band ? ` (ngưỡng ${band})` : ""}:`, down.length ? `suy giảm vượt ngưỡng: ${list(down)}.` : "không chỉ số nào suy giảm vượt ngưỡng.", up.length ? `Cải thiện vượt ngưỡng: ${list(up)}.` : ""),
    cause: first ? `${first.label} là chỉ số phễu suy giảm vượt ngưỡng đầu tiên (không tính chỉ số kết quả) (${signed(first.change!, 0)}); các chỉ số phía sau trong phễu thay đổi theo.` : "Các chỉ số cải thiện không kèm chỉ số nào suy giảm vượt ngưỡng.",
    impact: down.length ? `${down.length} chỉ số suy giảm có ý nghĩa; chưa suy ra tác động nếu chưa đối chiếu GMV/giờ ở trang Phân tích nguyên nhân.` : "Không có chỉ số suy giảm có ý nghĩa ở cấp cả tháng.",
    advise: i.mainMetric
      ? `Chỉ số theo dõi chính của tháng sau: ${i.mainMetric} (yếu tố kéo GMV/giờ nhiều nhất, trang Phân tích nguyên nhân)${first && first.label !== i.mainMetric ? `; ${first.label} theo dõi kèm, chỉ tiêu bằng mức ${i.prevLabel}` : ""}.`
      : first ? `Dùng ${first.label} làm chỉ số theo dõi chính của tháng sau, theo từng loại ngày, với chỉ tiêu bằng mức ${i.prevLabel}.` : "Giữ chỉ số theo dõi hiện tại."
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
}

export function nmvBlocks(i: NmvInsightInput): InsightBlocks {
  if (i.refundCur == null && i.nmvSource == null) return { ...EMPTY, advise: "Tải file Shop Analytics hoặc nhập tỷ lệ hoàn hủy ở Hợp đồng & giá để tính NMV." };
  const maturityMismatch = i.curProvisional != null && i.prevProvisional != null && i.curProvisional !== i.prevProvisional;
  const delta = i.refundCur != null && i.refundPrev != null && !maturityMismatch ? i.refundCur - i.refundPrev : null;
  return {
    observe:
      i.refundCur != null
        ? `Refund rate kỳ này ${pctTxt(i.refundCur)}${i.refundPrev != null ? ` (${i.prevLabel}: ${pctTxt(i.refundPrev)}${maturityMismatch ? `, chưa so sánh được vì ${i.curProvisional ? "tháng này chưa chốt, " + i.prevLabel + " đã chốt" : "tháng này đã chốt, " + i.prevLabel + " chưa chốt"}` : ""}${delta != null ? `, ${sgn(delta)}${Math.abs(delta).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm` : ""})` : ""}.`
        : "Chưa có Refund rate của kỳ này.",
    cause: "Refund rate là số ghi nhận tại thời điểm xuất file; kỳ mới còn trong thời gian hoàn trả nên chưa đạt độ chín như kỳ cũ. File hiện chưa tách hoàn và hủy.",
    impact: `NMV là số ước tính theo ${(i.nmvSource ?? "Refund rate thực của cả shop").replace(/^ước tính\s*[—-]\s*/, "")}${i.nmvSource && /mặc định/.test(i.nmvSource) && i.refundCur != null ? `, khác Refund rate thực ${pctTxt(i.refundCur)}; nhập % hoàn dự kiến ở Hợp đồng & giá để NMV bám số thật` : ""} và có thể đổi khi hết thời gian hoàn trả${maturityMismatch ? "; hai tháng khác mức chín nên không so chênh trực tiếp" : ""}.`,
    advise: "Ghi ngày xuất file của từng tháng, cập nhật Refund rate sau khi hết thời gian hoàn trả, và bổ sung file Order để tách hoàn và hủy."
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
}

export function shopBlocks(i: ShopInsightPageInput): InsightBlocks {
  if (i.totalChange == null && i.channels.length === 0) return EMPTY;
  const byAbs = [...i.channels].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const big = byAbs[0];
  const observe = join(
    i.totalChange != null ? `${METRIC.totalGmv} ${signed(i.totalChange)} (${i.windowLabel}).` : "",
    big ? `Kênh đổi nhiều nhất: ${big.label} ${moneySigned(big.delta)}.` : ""
  );
  const ops = i.control.find((c) => c.verdict === "ops");
  const basis = i.liveOnly ? "YFB chỉ vận hành livestream nên các kênh còn lại là nhóm đối chứng" : "nhóm đối chứng gần đúng, YFB cũng tác động Affiliate và Ads";
  const inhouseNote = i.inhouseLive && i.control.length ? " Phiên brand tự live không tính vào bên nào." : "";
  const cause = ops
    ? `${ops.label}: livestream YFB ${signed(ops.liveChg, 0)}, các kênh còn lại ${signed(ops.restChg, 0)} — livestream giảm mạnh hơn phần còn lại của shop (${basis}) nên cần rà soát vận hành livestream.${inhouseNote}`
    : i.control.length
      ? `${i.control.map((c) => `${c.label}: livestream YFB ${signed(c.liveChg, 0)}, các kênh còn lại ${signed(c.restChg, 0)}`).join("; ")} — livestream không giảm mạnh hơn các kênh còn lại.${inhouseNote}`
      : "Chưa có nhóm đối chứng (cần file Shop Analytics của hai tháng).";
  const neg = byAbs.filter((c) => c.delta < 0)[0];
  const impact = neg ? `${neg.label} là kênh giảm lớn nhất (${moneySigned(neg.delta)}).` : "Không kênh nào giảm so với kỳ trước.";
  // Kênh giảm lớn nhất (ngoài livestream) luôn có việc riêng, kể cả khi livestream cũng cần rà soát.
  // Shop chỉ nhận livestream: kênh khác do brand vận hành ⇒ chỉ báo số cho brand, không nhận việc thay brand.
  const negAdvice = !neg || neg.yfb
    ? ""
    : i.liveOnly
      ? `Thông tin cho brand: ${neg.label} giảm ${money(Math.abs(neg.delta))} — kênh do brand vận hành, YFB không có việc ở kênh này.`
      : `Trao đổi với brand kế hoạch ${neg.label} cho tháng sau và theo dõi tỷ trọng kênh.`;
  const advise = ops
    ? join(`Rà soát khung giờ, host và kịch bản livestream ở ${ops.label} trước khi kết luận.`, negAdvice)
    : negAdvice || "Duy trì lịch livestream hiện tại.";
  return { observe, cause, impact, advise };
}

// ---------- 5. Phân tích nguyên nhân ----------

export interface WhyInsightInput {
  gmvPerHourChange: number | null;
  /** 5 yếu tố của LIVE GMV: đóng góp tuyệt đối (đồng) và % đổi. */
  parts: { key?: string; label: string; value: number; change: number }[];
  /** Loại ngày có GMV/giờ đổi vượt ngưỡng dao động. */
  significantDays: { label: string; change: number }[];
  band: number | null;
  /** Ngưỡng dao động (%) của cả tháng cho từng yếu tố; null = chưa biết (coi mọi yếu tố là có ý nghĩa). */
  factorBand?: number | null;
  mix: { mix: number; rate: number } | null;
  /** Tên chỉ số doanh số trong câu (mặc định LIVE GMV; Shopee "GMV"). */
  gmvLabel?: string;
}

/** Yếu tố hiệu suất dẫn dắt GMV/giờ: ưu tiên yếu tố vượt ngưỡng dao động; không có thì lấy yếu tố lớn nhất nhưng đánh dấu yếu (chưa kết luận). */
function whyLead(i: WhyInsightInput) {
  const perf = i.parts.filter((p) => p.key !== "hours");
  const dirList = (i.gmvPerHourChange ?? 0) < 0 ? perf.filter((p) => p.value < 0).sort((a, b) => a.value - b.value) : perf.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const sigOf = (x: { change: number }) => i.factorBand == null || Math.abs(x.change) >= i.factorBand;
  const lead = dirList.find(sigOf) ?? dirList[0];
  return { lead, leadWeak: lead != null && !sigOf(lead) };
}

/** Chỉ số theo dõi chính mà trang Phân tích nguyên nhân đề xuất (yếu tố kéo giảm vượt ngưỡng) — trang Key Metrics nói cùng chỉ số. */
export function whyMainMetric(i: WhyInsightInput): string | null {
  if (i.gmvPerHourChange == null || i.parts.length === 0) return null;
  const { lead, leadWeak } = whyLead(i);
  return lead && lead.value < 0 && !leadWeak ? lead.label : null;
}

export function whyBlocks(i: WhyInsightInput): InsightBlocks {
  const G = i.gmvLabel ?? "LIVE GMV";
  if (i.gmvPerHourChange == null || i.parts.length === 0) return EMPTY;
  // GMV/giờ đã chia cho giờ ⇒ Giờ live không thể là nguyên nhân của nó; chỉ 4 yếu tố hiệu suất được nêu là nguyên nhân.
  const perf = i.parts.filter((p) => p.key !== "hours");
  const hoursPart = i.parts.find((p) => p.key === "hours");
  const sorted = [...perf].sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const neg = perf.filter((p) => p.value < 0).sort((a, b) => a.value - b.value);
  const pos = perf.filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
  const fmt = (xs: typeof i.parts) => xs.slice(0, 3).map((p) => `${p.label} (${moneySigned(p.value)})`).join(", ");
  const sig = i.significantDays;
  const observe = join(
    `GMV/giờ ${signed(i.gmvPerHourChange, 0)} so với cùng kỳ tháng trước.`,
    hoursPart ? `Giờ live ${signed(hoursPart.change, 0)} (${moneySigned(hoursPart.value)} ${G}) do lịch quyết định, không tính vào nguyên nhân của GMV/giờ.` : "",
    pos.length ? `Đóng góp tích cực: ${fmt(pos)}.` : "",
    neg.length ? `Đóng góp tiêu cực: ${fmt(neg)}.` : "",
    sig.length ? `${sig.map((d) => `${d.label} (${signed(d.change, 0)})`).join(", ")} đổi GMV/giờ vượt ngưỡng dao động${i.band != null ? ` ±${pctTxt(i.band, 0)}` : ""}.` : "Không loại ngày nào đổi GMV/giờ vượt ngưỡng dao động."
  );
  const { lead, leadWeak } = whyLead(i);
  const fb = i.factorBand != null ? `±${pctTxt(i.factorBand, 0)}` : "";
  const cause = lead
    ? leadWeak
      ? `${lead.label} đóng góp tuyệt đối lớn nhất vào mức ${i.gmvPerHourChange < 0 ? "giảm" : "tăng"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}) nhưng nằm trong ngưỡng dao động ${fb}; chưa yếu tố hiệu suất nào vượt ngưỡng nên chưa kết luận được nguyên nhân.`
      : `${lead.label} là yếu tố hiệu suất đóng góp tuyệt đối lớn nhất vào mức ${i.gmvPerHourChange < 0 ? "giảm" : "tăng"} (${signed(lead.change, 0)}, ${moneySigned(lead.value)} ${G}).`
    : sorted[0]
      ? `Yếu tố hiệu suất đóng góp lớn nhất: ${sorted[0].label} (${moneySigned(sorted[0].value)}).`
      : "Chưa tách được yếu tố hiệu suất.";
  const m = i.mix;
  const impact = m
    ? Math.abs(m.mix) < Math.abs(m.rate) * 0.3
      ? `Nguyên nhân nằm ở hiệu suất, không ở lịch live: cơ cấu giờ ${moneySigned(m.mix)}/giờ, hiệu suất trong từng loại ngày ${moneySigned(m.rate)}/giờ.`
      : `Một phần do lịch: cơ cấu giờ giữa các loại ngày ${moneySigned(m.mix)}/giờ, hiệu suất trong từng loại ngày ${moneySigned(m.rate)}/giờ.`
    : lead
      ? `Đưa ${lead.label} về mức kỳ trước sẽ bổ sung khoảng ${money(Math.abs(lead.value))} ${G}.`
      : "Chưa tách được cơ cấu lịch và hiệu suất.";
  const advise = lead && lead.value < 0
    ? leadWeak
      ? `Theo dõi ${lead.label} theo từng loại ngày${sig[0] ? `, bắt đầu từ ${sig[0].label}` : ""}, chưa coi là nguyên nhân cho tới khi vượt ngưỡng dao động.`
      : `Đặt ${lead.label} làm chỉ số theo dõi chính của tháng sau, theo từng loại ngày${sig[0] ? `, bắt đầu từ ${sig[0].label}` : ""}.`
    : "Giữ kịch bản hiện tại; theo dõi GMV/giờ theo từng loại ngày.";
  return { observe, cause, impact, advise };
}

// ---------- 6. Sản phẩm & khuyến mãi ----------

export interface ProductsInsightInput {
  topN: number;
  risers: { name: string; from: number | null; to: number; ctor: number | null }[];
  fallers: { name: string; from: number | null; to: number; ctor: number | null; ctr: number | null }[];
  lead: { name: string; share: number } | null;
  promo: { name: string; roi: number | null } | null;
  /** Tên tỷ lệ chuyển đổi theo SKU (mặc định CTOR; Shopee: Orders/Product Clicks). */
  rateLabel?: string;
  /** Khối Tác động khi không có bảng khuyến mãi theo chương trình (Shopee: xu/voucher đã nhận). */
  promoNote?: string;
}

export function productsBlocks(i: ProductsInsightInput): InsightBlocks {
  if (i.risers.length === 0 && i.fallers.length === 0 && !i.lead) return EMPTY;
  const mv = (x: { name: string; from: number | null; to: number }) => `${x.name} (${x.from ?? "ngoài top"} → ${x.to})`;
  const observe = join(
    `Top ${i.topN} SKU: ${i.risers.length} mã tăng hạng, ${i.fallers.length} mã giảm hạng.`,
    i.risers.length ? `Tăng hạng: ${i.risers.map(mv).join("; ")}.` : "",
    i.fallers.length ? `Giảm hạng: ${i.fallers.map(mv).join("; ")}.` : "",
    i.lead ? `${i.lead.name} dẫn đầu, ${pctTxt(i.lead.share, 0)} GMV nhóm top.` : ""
  );
  const rc = i.risers.filter((r) => r.ctor != null).map((r) => `${r.name} ${pctTxt(r.ctor!, 2)}`);
  const fc = i.fallers.filter((r) => r.ctor != null).map((r) => `${r.name} ${pctTxt(r.ctor!, 2)}`);
  const R = i.rateLabel ?? "CTOR";
  const cause = rc.length || fc.length
    ? join(rc.length ? `${R} nhóm tăng hạng: ${rc.join(", ")}.` : "", fc.length ? `${R} nhóm giảm hạng: ${fc.join(", ")}.` : "")
    : `Chưa có ${R} theo SKU để giải thích thay đổi hạng.`;
  const impact = i.promoNote != null ? i.promoNote : i.promo
    ? `Chương trình khuyến mãi mang LIVE GMV cao nhất: ${i.promo.name}${i.promo.roi != null ? `, ROI ${i.promo.roi.toLocaleString("vi-VN", { maximumFractionDigits: 2 })}` : ""}.`
    : "Chưa có số liệu chương trình khuyến mãi của tháng.";
  const advise = join(
    i.risers[0] ? `Tăng thời lượng giới thiệu ${i.risers[0].name} trên live.` : "",
    i.fallers[0] ? `Kiểm tra tồn kho, giá và kịch bản chuyển đổi của ${i.fallers.map((f) => f.name).join(", ")}.` : "",
    !i.risers[0] && !i.fallers[0] ? "Giữ cơ cấu SKU hiện tại; không SKU nào đổi hạng đáng kể." : ""
  );
  return { observe, cause, impact, advise };
}

// ---------- 7. Host & khung giờ ----------

export interface PeopleInsightInput {
  /** Host có live tháng này; verdict theo khoảng tin cậy 95% của so sánh gộp nhiều tháng. */
  hosts: { name: string; verdict: "above" | "below" | "unclear"; ci: string; sessions: number; borderline: boolean }[];
  months: number;
  /** `index` = GMV thực ÷ GMV kỳ vọng theo loại ngày (1 = trung bình); có thì xếp khung theo chỉ số này để khử hiệu ứng loại ngày. */
  slots: { label: string; gmvPerHour: number; n: number; index?: number }[];
  minSessions?: number;
}

export function peopleBlocks(i: PeopleInsightInput): InsightBlocks {
  if (i.hosts.length === 0) return EMPTY;
  const min = i.minSessions ?? 5;
  const ranked = i.hosts.filter((h) => h.sessions >= min);
  const above = ranked.filter((h) => h.verdict === "above");
  const below = ranked.filter((h) => h.verdict === "below");
  const unclear = i.hosts.length - above.length - below.length;
  const txt = (h: (typeof above)[number]) => `${h.name} ${h.ci} (${h.sessions} phiên)`;
  const slots = i.slots.filter((s) => s.n >= 3);
  const adjusted = slots.length > 0 && slots.every((s) => s.index != null);
  slots.sort((a, b) => (adjusted ? b.index! - a.index! : b.gmvPerHour - a.gmvPerHour));
  const bestS = slots[0], worstS = slots[slots.length - 1];
  const slotNote = (s: (typeof slots)[number]) => `${s.label} ${money(s.gmvPerHour)}/giờ${adjusted ? ` (${Math.round(s.index! * 100)}% mức trung bình cùng loại ngày)` : ""}`;
  const observe = join(
    above.length ? `Cao hơn trung bình ${i.months} tháng có ý nghĩa thống kê (khoảng tin cậy 95%): ${above.map(txt).join("; ")}.` : "Không host nào cao hơn trung bình nhóm có ý nghĩa thống kê (khoảng tin cậy 95%).",
    below.length ? `Thấp hơn: ${below.map(txt).join("; ")}.` : "",
    unclear > 0 ? `${unclear} host chưa khác biệt rõ so với trung bình.` : ""
  );
  const cause = bestS && worstS && bestS !== worstS
    ? `Khung giờ bắt đầu phiên${adjusted ? " (đã so với trung bình cùng loại ngày)" : ""}: ${slotNote(bestS)}; ${slotNote(worstS)} (${worstS.n} phiên).`
    : "Chưa đủ phiên theo khung giờ để so sánh (cần từ 3 phiên mỗi khung).";
  const small = i.hosts.filter((h) => h.sessions < min).length;
  const impact = join(
    above.some((h) => h.borderline) || below.some((h) => h.borderline) ? "Có host sát ngưỡng ý nghĩa thống kê, cần thêm dữ liệu tháng sau để kết luận." : "",
    small > 0 ? `${small} host dưới ${min} phiên chưa được xếp hạng.` : "",
    !above.length && !below.length && small === 0 ? "Chênh lệch giữa các host chưa đủ lớn để thay đổi cách xếp lịch." : ""
  ) || "Kết luận về host dựa trên so sánh gộp nhiều tháng, không dựa trên một tháng.";
  const advise = join(
    above[0] ? `Cân nhắc thêm phiên cho ${above[0].name}.` : "",
    bestS && worstS && bestS !== worstS && (adjusted ? worstS.index! <= bestS.index! * 0.8 : worstS.gmvPerHour <= bestS.gmvPerHour * 0.8) ? `Cân nhắc dời bớt phiên ${worstS.label} sang ${bestS.label}${adjusted ? "" : " (chưa khử hiệu ứng loại ngày)"}.` : "",
    !above[0] && !(bestS && worstS && bestS !== worstS) ? "Giữ lịch hiện tại và thu thêm phiên trước khi xếp hạng host." : ""
  ) || "Giữ cách xếp host và khung giờ hiện tại; đánh giá lại khi có thêm phiên ở tháng sau.";
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
  if (i.cost <= 0) return { ...EMPTY, advise: "Tải file TikTok Ads Campaign overview để có số Ads của tháng." };
  const pct = i.target ? (i.cost / i.target) * 100 : null;
  const over = i.buckets.filter((b) => b.target > 0).map((b) => ({ ...b, pct: (b.cost / b.target) * 100 })).sort((a, b) => b.pct - a.pct)[0];
  const observe = join(
    `Ads cost ${money(i.cost)}`,
    pct != null ? `(${pctTxt(pct)} Target cùng kỳ).` : "(chưa có Target Ads).",
    i.liveRoas != null ? `ROAS Live ${i.liveRoas.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x.` : ""
  );
  const cause = over && over.pct > 100
    ? `${over.label} chi ${pctTxt(over.pct)} Target${over.roas != null ? `, ROAS Live ${over.roas.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x` : ""}.`
    : over
      ? `Không loại ngày nào chi vượt Target; ${over.label} gần Target nhất (${pctTxt(over.pct)}).`
      : "Chưa có Target Ads theo loại ngày.";
  const lowest = i.buckets.filter((b) => b.roas != null).sort((a, b) => a.roas! - b.roas!)[0];
  const impact = join(
    lowest ? `ROAS Live thấp nhất ở ${lowest.label} (${lowest.roas!.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x).` : "",
    i.zeroOrderDays > 0 ? `${i.zeroOrderDays} ngày có chi phí Ads nhưng không phát sinh đơn.` : "Không ngày nào có chi phí Ads mà không phát sinh đơn."
  );
  const advise = lowest && over && over.pct > 100 && lowest.label === over.label
    ? `Đánh giá lại phân bổ Ads của ${lowest.label} trước khi tăng chi.`
    : lowest
      ? `Rà soát hiệu quả Ads của ${lowest.label} (ROAS Live thấp nhất) trước khi tăng chi.`
      : "Giữ phân bổ Ads hiện tại và theo dõi ROAS Live theo loại ngày.";
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
  if (i.sessions === 0) return { ...EMPTY, advise: "Nhập kế hoạch và số thực tế ở tab Affiliate để có số của trang này." };
  const observe = join(
    `${i.sessions} phiên của ${i.creators} creator, GMV phiên ${money(i.gmv)}`,
    i.pctTarget != null ? `(${pctTxt(i.pctTarget)} Target).` : "(chưa có Target phiên).",
    i.top ? `${i.top.creator} chiếm ${pctTxt(i.top.share, 0)} GMV phiên creator.` : ""
  );
  const cause = i.lowest ? `Phiên thấp nhất so với Target: ${i.lowest.creator} ${i.lowest.date}, đạt ${pctTxt(i.lowest.pct)} Target.` : "Chưa có phiên nào có Target để so sánh.";
  const impact = i.sessions / Math.max(1, i.creators) < 3
    ? `Mỗi creator chỉ có vài phiên nên chênh lệch giữa các phiên có thể do biến động ngẫu nhiên${i.gmvPerHour != null ? `; GMV/giờ chung ${money(i.gmvPerHour)}` : ""}.`
    : i.gmvPerHour != null ? `GMV/giờ chung ${money(i.gmvPerHour)}.` : "Chưa có số giờ live của các phiên.";
  const advise = i.gmvPerHour != null ? `Đặt Target Affiliate theo GMV/giờ đã đạt (${money(i.gmvPerHour)}) nhân Giờ live kế hoạch; chưa kết luận về creator có dưới 3 phiên.` : "Ghi giờ live của từng phiên để đặt Target theo GMV/giờ.";
  return { observe, cause, impact, advise };
}

// ---------- 10. Kế hoạch tháng sau ----------

export interface NextInsightInput {
  nextLabel: string;
  hasLivePlan: boolean;
  hasCreatorPlan: boolean;
  withCreator?: boolean;
}

export function nextBlocks(i: NextInsightInput): InsightBlocks {
  // withCreator = false: brand không có Affiliate trong phạm vi YFB (0190) ⇒ chỉ nói kế hoạch Live.
  const withCreator = i.withCreator ?? true;
  const missing = [!i.hasLivePlan && "Target Live", withCreator && !i.hasCreatorPlan && "lịch Booking Creator (Target Creator)"].filter(Boolean) as string[];
  const have = withCreator ? "Target Live và lịch Booking Creator" : "Target Live";
  const observe = missing.length ? `${i.nextLabel} chưa có ${missing.join(" và ")}.` : `${i.nextLabel} đã có ${have}.`;
  return {
    observe,
    cause: missing.length ? `Thiếu ${missing.join(" và ")}.` : `Đã đủ ${have}.`,
    impact: missing.length ? "Thiếu kế hoạch thì Target tháng sau dễ đặt theo mục tiêu tổng thay vì GMV/giờ đã đạt." : "Kế hoạch đã đủ để chấm tiến độ ngay từ đầu tháng.",
    advise: missing.length ? `Lập ${missing.join(" và ")} trước khi chốt report.` : withCreator ? "Theo dõi tiến độ theo Target Live và Booking từ đầu tháng." : "Theo dõi tiến độ theo Target Live từ đầu tháng."
  };
}
