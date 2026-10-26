import { CHANNEL, DAY_TYPE } from "../metricGlossary";
import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";
import { fmtVndShort } from "../format";
import {
  DRIVER_LABEL,
  FACTOR_ACTION,
  pctChange,
  pctTxt,
  RATE_FACTORS,
  signed,
  type CampCompareRow,
  type ChannelMix,
  type LiveStats,
  type RateFactor,
  type ShopTotals,
  type SkuMove,
  type SkuMoves
} from "./monthlyReportInsights";
import {
  controlLabel,
  controlLine,
  controlVerdict,
  isBorderline,
  reliabilityText,
  VERDICT_TEXT,
  type ControlRow,
  type DayGroup,
  type DayGroupStats,
  type HostReliability,
  type MixRateSplit
} from "./deepAnalysis";

// Khung "Insight" đầu mỗi phần 3–7 của Report Tháng (2026-09-26, học từ deck report tháng của Crocs:
// mỗi slide có 1 câu kết luận + 3–4 số chứng minh + 1 việc cần làm). Hàm thuần — tự sinh từ đúng các số
// phần đó đang hiện, ops sửa/bổ sung bối cảnh (vd "scheme tặng Jibbitz kết thúc sớm") trước khi phát hành.
//
// Dạng văn bản 1 khung: dòng đầu = kết luận, dòng bắt đầu "→" = việc cần làm, còn lại = gạch đầu dòng.
// Bản ops sửa lưu đúng dạng này (brand_monthly_reports.section_notes, 0121) nên hiển thị chung 1 đường.
//
// Chống lặp (2026-09-29, đo CROCS T9: câu đối chứng xuất hiện 5 chỗ, câu quà tặng 4 chỗ): câu nào đã nằm ở Kết
// luận (autoSummary) thì không làm tiêu đề phần; việc cần làm (`action`) KHÔNG hiện trong khung tự sinh mà gom về
// "Việc agency làm tháng sau" qua sectionNextSteps — mỗi việc nói một lần.

export type InsightSection = "shop" | "why" | "people" | "products" | "context";

export interface SectionInsight {
  headline: string;
  points: string[];
  action: string | null;
}

export function insightToText(i: SectionInsight): string {
  return [i.headline, ...i.points, ...(i.action ? [`→ ${i.action}`] : [])].join("\n");
}

export function parseInsightText(text: string): SectionInsight | null {
  const lines = text.split("\n").map((l) => l.replace(/^[-•\s]+/, "").trim()).filter(Boolean);
  if (lines.length === 0) return null;
  const [headline, ...rest] = lines;
  const actions = rest.filter((l) => l.startsWith("→")).map((l) => l.replace(/^→\s*/, ""));
  return { headline, points: rest.filter((l) => !l.startsWith("→")), action: actions.length ? actions.join(" ") : null };
}

const money = (v: number) => fmtVndShort(v);
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? null : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ---------- 3. Toàn shop & kênh ----------

const CHANNELS: { key: "liveLinked" | "affiliate" | "video" | "card"; label: string }[] = [
  { key: "liveLinked", label: CHANNEL.sellerLive },
  { key: "affiliate", label: CHANNEL.affiliateLive },
  { key: "video", label: CHANNEL.video },
  { key: "card", label: CHANNEL.productCard }
];

export interface ShopInsightInput {
  /** Cũ → mới, phần tử cuối là tháng report. */
  months: string[];
  mixes: (ChannelMix | null)[];
  /** GMV agency live từng tháng (tháng report tính tới ngày có số). */
  agencyGmv: number[];
  shopCur: ShopTotals | null;
  shopPrev: ShopTotals | null;
  windowLabel: string;
  /** Nhãn kỳ của từng tháng (vd "1–22/08" khi mọi tháng cắt cùng số ngày). Mặc định "tháng MM". */
  labels?: string[];
  /** Nhóm đối chứng (deepAnalysis.controlGroup) — có thì kết luận của phần là "thị trường hay vận hành". */
  control?: ControlRow[];
}

/** `mixes`/`agencyGmv` phải cùng kỳ với nhau và giữa các tháng (Report Tháng cắt mọi tháng 1..N khi tháng report
 *  chưa hết): đo CROCS T9, so tỷ trọng với T8 TRỌN tháng ra Affiliate LIVE −4,2 điểm, cùng kỳ 1–22 là −6,0 điểm. */
export function shopInsight(i: ShopInsightInput): SectionInsight | null {
  const n = i.mixes.length;
  const cur = i.mixes[n - 1];
  const prev = n > 1 ? i.mixes[n - 2] : null;
  if (!cur || !i.shopCur) return null;
  const prevLabel = n > 1 ? i.labels?.[n - 2] ?? `tháng ${i.months[n - 2].slice(5)}` : "";

  const agencyShare = (idx: number) => (i.mixes[idx] && i.mixes[idx]!.shopGmv > 0 && i.agencyGmv[idx] > 0 ? (i.agencyGmv[idx] / i.mixes[idx]!.shopGmv) * 100 : null);
  const aCur = agencyShare(n - 1);
  const aPrev = n > 1 ? agencyShare(n - 2) : null;
  const shopChg = i.shopPrev ? pctChange(i.shopPrev.gmv, i.shopCur.gmv) : null;
  const totalLine =
    `Total GMV ${money(i.shopCur.gmv)}${shopChg != null ? ` (${signed(shopChg)}, ${i.windowLabel})` : ""}` +
    (aCur != null ? `; livestream YFB chiếm ${pctTxt(aCur)}${aPrev != null ? ` (${prevLabel}: ${pctTxt(aPrev)})` : ""}.` : ".");

  // controlLine đã là 1 câu của Kết luận ⇒ tiêu đề phần là nhóm ngày Kết luận CHƯA nói (CROCS T9: ngày camp —
  // thị trường −69%, agency −14%); không còn nhóm nào thì Total GMV. Bảng đối chứng ngay dưới vẫn có đủ 3 dòng.
  const control = i.control ?? [];
  const cLine = controlLine(control);
  const groupLines: string[] = [];
  for (const r of control) {
    const v = controlVerdict(r);
    if (!v || r.key === "all" || cLine?.includes(`(${controlLabel(r.key)})`)) continue;
    groupLines.push(`${controlLabel(r.key)}: livestream YFB ${signed(r.liveChg!, 0)}, các kênh còn lại ${signed(r.restChg!, 0)} ⇒ ${VERDICT_TEXT[v]}.`);
  }
  const [headline, ...points] = [...groupLines, totalLine];
  let affiliateDelta: number | null = null;
  if (prev) {
    // Seller LIVE (Linked account) là MỌI live trên tài khoản shop — nói cạnh "agency live chiếm X%" ở câu trên
    // thành hai tỷ trọng live trong một khung (CROCS T9: 67,5% vs 69,6%). Biểu đồ cơ cấu kênh vẫn có đủ 4 kênh.
    const moves = CHANNELS.filter((c) => c.key !== "liveLinked").map((c) => {
      const a = prev[c.key], b = cur[c.key];
      if (a == null || b == null || prev.shopGmv <= 0 || cur.shopGmv <= 0) return null;
      const from = (a / prev.shopGmv) * 100, to = (b / cur.shopGmv) * 100;
      return { ...c, from, to, delta: to - from };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    affiliateDelta = moves.find((m) => m.key === "affiliate")?.delta ?? null;
    const up = moves.filter((m) => m.delta >= 1).sort((a, b) => b.delta - a.delta)[0];
    const down = moves.filter((m) => m.delta <= -1).sort((a, b) => a.delta - b.delta)[0];
    for (const m of [up, down]) if (m) points.push(`${m.label}: ${pctTxt(m.from)} → ${pctTxt(m.to)} tổng shop (${pp(m.delta)}).`);
    if (!up && !down && moves.length > 0) points.push(`Cơ cấu kênh gần như giữ nguyên so với ${prevLabel} (không kênh nào lệch quá 1 điểm).`);
  }
  const refundDelta = prev?.refundRate != null && cur.refundRate != null ? cur.refundRate - prev.refundRate : null;
  if (cur.refundRate != null && (cur.refundRate >= 15 || (refundDelta != null && Math.abs(refundDelta) >= 2))) {
    points.push(`Refund rate ${pctTxt(cur.refundRate)}${prev?.refundRate != null ? ` (${prevLabel}: ${pctTxt(prev.refundRate)})` : ""}.`);
  }

  const opsRow = control.find((r) => r.key !== "all" && controlVerdict(r) === "ops");
  const action = opsRow
    ? `${controlLabel(opsRow.key)} giảm do vận hành livestream, không phải do thị trường — xem trang Phân tích nguyên nhân để biết yếu tố nào giảm và điều chỉnh lịch tháng sau.`
    : affiliateDelta != null && affiliateDelta <= -1
      ? "Tỷ trọng Affiliate LIVE giảm — rà lịch creator và gói hỗ trợ affiliate cho tháng sau."
      : refundDelta != null && refundDelta >= 2
        ? "Refund rate tăng — kiểm lý do hoàn của nhóm SKU chủ lực trước khi đẩy thêm traffic."
        : null;
  return { headline, points, action };
}

// ---------- 4. Vì sao ----------

export interface WhyExtras {
  /** Ngày thường vs ngày camp, cùng cửa sổ (deepAnalysis.dayGroupStats). */
  groups?: DayGroupStats[];
  /** Tách ΔGMV/giờ thành cơ cấu lịch vs hiệu suất (deepAnalysis.mixRateSplit). */
  mixRate?: MixRateSplit | null;
}

/** GMV/giờ = Views/giờ × LIVE CTR × CTOR × AOV (đúng tích) ⇒ tách traffic (Views/giờ) với chuyển đổi (3 thừa số
 *  còn lại); rồi nói ngày thường hay ngày camp tụt, có phải do lịch camp không, và bước yếu nhất thành việc cần
 *  làm. Không dùng UPT làm bước phễu: UPT đổi theo quà tặng kèm (xem deepAnalysis.ts). */
export function whyInsight(prev: LiveStats, cur: LiveStats, x: WhyExtras = {}): SectionInsight | null {
  const gh = pctChange(prev.gmvPerHour, cur.gmvPerHour);
  const ch = Object.fromEntries(RATE_FACTORS.map((k) => [k, pctChange(prev[k], cur[k])])) as Record<RateFactor, number | null>;
  if (gh == null || ch.viewsPerHour == null) return null;

  const conv = (["liveCtr", "ctor", "aov"] as const).reduce((a, k) => a + (ch[k] != null ? Math.log(1 + ch[k]! / 100) : 0), 0);
  const lv = Math.log(1 + ch.viewsPerHour / 100);
  const dir = gh < 0 ? "xuống" : "lên";
  const verdict =
    Math.sign(lv) === Math.sign(conv)
      ? `cả traffic lẫn chuyển đổi cùng ${gh < 0 ? "giảm" : "tăng"}`
      : Math.abs(lv) >= Math.abs(conv)
        ? `traffic kéo ${dir}, chuyển đổi bù một phần`
        : `chuyển đổi kéo ${dir}, traffic bù một phần`;
  const parts = RATE_FACTORS.filter((k) => ch[k] != null).map((k) => `${DRIVER_LABEL[k]} ${signed(ch[k]!, 0)}`);
  const factorLine = `GMV/giờ ${signed(gh, 0)}: ${parts.join(", ")} — ${verdict}.`;

  // Thừa số quy ra tiền đã là câu 2 của Kết luận ⇒ khi ngày thường và ngày camp lệch nhau rõ (≥ 10 điểm), tiêu đề
  // là nhóm ngày kéo kết quả (Kết luận chưa nói), dòng thừa số lùi xuống số chứng minh.
  const g = (k: DayGroup) => x.groups?.find((r) => r.key === k);
  const chgOf = (k: DayGroup) => {
    const r = g(k);
    return r ? pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour) : null;
  };
  const dChg = chgOf("daily");
  const cChg = chgOf("camp");
  let headline = factorLine;
  const points: string[] = [];
  if (dChg != null && cChg != null && Math.abs(dChg - cChg) >= 10) {
    const lead = gh < 0 ? (dChg < cChg ? "Daily" : "campaign") : dChg > cChg ? "Daily" : "campaign";
    headline = `${gh < 0 ? "Phần giảm dồn vào" : "Tăng chủ yếu nhờ"} ${lead}: GMV/giờ Daily ${signed(dChg, 0)}, campaign ${signed(cChg, 0)}.`;
    points.push(factorLine);
  } else {
    const groupTxt = (k: DayGroup, label: string) => {
      const r = g(k);
      const c = chgOf(k);
      return r && c != null ? `${label}: ${money(r.prev.gmvPerHour!)} → ${money(r.cur.gmvPerHour!)}/giờ (${signed(c, 0)})` : null;
    };
    const groups = [groupTxt("daily", "Daily"), groupTxt("camp", "campaign")].filter(Boolean);
    if (groups.length) points.push(groups.join("; ") + ".");
  }
  const mr = x.mixRate;
  if (mr && Math.abs(mr.delta) > 0) {
    // Làm tròn nghìn đồng — "−101.092,04 đ/giờ" chỉ làm rối câu.
    const m = (v: number) => `${v >= 0 ? "+" : "−"}${money(Math.round(Math.abs(v) / 1000) * 1000)}/giờ`;
    points.push(
      Math.abs(mr.mix) < Math.abs(mr.delta) * 0.25
        ? `Không phải do lịch campaign: thay đổi cơ cấu giờ live giữa các loại ngày chỉ giải thích ${m(mr.mix)}, hiệu suất trong từng loại ngày ${m(mr.rate)}.`
        : `Một phần do lịch: cơ cấu giờ live giữa các loại ngày ${m(mr.mix)}, hiệu suất trong từng loại ngày ${m(mr.rate)}.`
    );
  }
  // Quà tặng: đã ở Kết luận + 2 dòng bảng Xu hướng 4 tháng — không nhắc lần thứ ba ở đây.

  const worst = RATE_FACTORS.filter((k) => ch[k] != null && ch[k]! <= -5).sort((a, b) => ch[a]! - ch[b]!)[0];
  return { headline, points, action: worst ? FACTOR_ACTION[worst] : null };
}

// ---------- 5. Người ----------

export interface HostInsightRow {
  name: string;
  gmv: number;
  hours: number;
  /** GMV + giờ của host theo khung ngày (camp / ngày thường). */
  byBucket: Partial<Record<CampDayBucket, { gmv: number; hours: number }>>;
}

export interface HostVsPeer {
  name: string;
  gmvPerHour: number | null;
  /** % GMV thực so với GMV host đó sẽ đạt nếu bán bằng mặt bằng nhóm ở ĐÚNG các khung ngày họ live. */
  vsPeer: number | null;
  /** Cùng phép so đó tính bằng tiền (GMV thực − GMV theo mặt bằng) — gộp cả % lẫn số giờ. */
  gap: number | null;
}

/** GMV/giờ thô thiên vị host được xếp nhiều ca ngày camp (D-Day CROCS bán ~gấp 2 ngày thường). So mỗi
 *  host với mặt bằng nhóm của chính các khung ngày họ live — loại được phần "may được xếp ca camp". */
export function hostVsPeer(hosts: HostInsightRow[]): HostVsPeer[] {
  const avg: Partial<Record<CampDayBucket, number>> = {};
  for (const b of CAMP_DAY_BUCKET_ORDER) {
    let g = 0, h = 0;
    for (const x of hosts) {
      g += x.byBucket[b]?.gmv ?? 0;
      h += x.byBucket[b]?.hours ?? 0;
    }
    if (h > 0) avg[b] = g / h;
  }
  return hosts.map((x) => {
    const expected = CAMP_DAY_BUCKET_ORDER.reduce((a, b) => a + (x.byBucket[b]?.hours ?? 0) * (avg[b] ?? 0), 0);
    return { name: x.name, gmvPerHour: x.hours > 0 ? x.gmv / x.hours : null, vsPeer: expected > 0 ? (x.gmv / expected - 1) * 100 : null, gap: expected > 0 ? x.gmv - expected : null };
  });
}

const borderlineTail = (r: HostReliability) => (isBorderline(r) ? " — sát ngưỡng, cần thêm tháng để chắc" : "");

/** Kết luận về host chỉ dựa trên so mặt bằng GỘP 3–4 tháng có khoảng tin cậy (deepAnalysis.hostReliability):
 *  backtest CROCS T6–T9 cho thấy so mặt bằng từng tháng không dự báo được tháng sau (Spearman −0,04), nên
 *  một tháng lệch −24% qua 3 ca không đủ để nêu tên ai. GMV dẫn đầu vẫn nêu (là sự thật, không phải xếp hạng). */
export function peopleInsight(hosts: HostInsightRow[], relAll: HostReliability[] = []): SectionInsight | null {
  const live = hosts.filter((h) => h.hours > 0 && h.gmv > 0);
  if (live.length < 2) return null;
  // Khoảng tin cậy tính trên cả nhóm 4 tháng, nhưng chỉ nói về host CÓ live tháng này (audit 27/10: report T10 nêu một
  // host không có phiên nào trong tháng). Lọc theo tên vì hàng của tháng và nhóm tin cậy cùng dùng nhãn host.
  const liveNames = new Set(live.map((h) => h.name));
  const rel = relAll.filter((r) => liveNames.has(r.name));
  const total = live.reduce((a, h) => a + h.gmv, 0);
  const top = [...live].sort((a, b) => b.gmv - a.gmv)[0];
  const byName = new Map(rel.map((r) => [r.name, r]));
  const topRel = byName.get(top.name);
  const headline =
    `${top.name} dẫn đầu GMV (${money(top.gmv)}, ${pctTxt((top.gmv / total) * 100, 0)} tổng host)` +
    (topRel && topRel.verdict === "above"
      ? `; ${rel.filter((r) => r.verdict === "above").length > 1 ? "" : "là host duy nhất "}cao hơn trung bình có ý nghĩa thống kê (khoảng tin cậy 95%, ${topRel.sessions} phiên): ${reliabilityText(topRel)}${borderlineTail(topRel)}.`
      : ".");

  const points: string[] = [];
  const above = rel.filter((r) => r.verdict === "above" && r.name !== top.name);
  const below = rel.filter((r) => r.verdict === "below");
  for (const r of above) points.push(`${r.name}: cao hơn trung bình ${reliabilityText(r)} qua ${r.sessions} phiên${borderlineTail(r)}.`);
  for (const r of below) points.push(`${r.name}: thấp hơn trung bình ${reliabilityText(r)} qua ${r.sessions} phiên${borderlineTail(r)}.`);
  const unclear = rel.filter((r) => r.verdict === "unclear").length;
  if (unclear > 0) points.push(`${unclear} host còn lại chưa khác biệt rõ so với trung bình (khoảng tin cậy còn cắt qua mức trung bình).`);

  const medHours = median(live.map((h) => h.hours)) ?? 0;
  const underUsed = rel.find((r) => r.verdict === "above" && (live.find((h) => h.name === r.name)?.hours ?? Infinity) <= medHours);
  // Việc gửi brand chỉ nói phần tích cực (thêm phiên cho host tốt). Host thấp hơn trung bình là việc nội bộ: peopleOpsNote.
  const action = underUsed
    ? `Cân nhắc thêm phiên cho ${underUsed.name} — cao hơn trung bình ${reliabilityText(underUsed)} nhưng tháng này live ít giờ hơn trung vị nhóm.`
    : null;
  return { headline, points, action };
}

/** Ghi chú CHỈ OPS (không vào bản gửi brand): host có live tháng này mà thấp hơn trung bình các host — mức chắc chắn theo
 *  đúng khoảng tin cậy (sát ngưỡng thì nói là sát ngưỡng; trước 27/10 câu hành động ghi "ổn định" cho cả host sát ngưỡng). */
export function peopleOpsNote(hosts: HostInsightRow[], rel: HostReliability[] = []): string | null {
  const liveNames = new Set(hosts.filter((h) => h.hours > 0 && h.gmv > 0).map((h) => h.name));
  const below = rel.filter((r) => r.verdict === "below" && liveNames.has(r.name));
  if (below.length === 0) return null;
  const firm = below.filter((r) => !isBorderline(r));
  const weak = below.filter((r) => isBorderline(r));
  const parts: string[] = [];
  if (firm.length) parts.push(`Thấp hơn trung bình các host có ý nghĩa: ${firm.map((r) => `${r.name} ${reliabilityText(r)} qua ${r.sessions} phiên`).join("; ")} — xem lại khung giờ và nhóm SKU được xếp.`);
  if (weak.length) parts.push(`Sát ngưỡng, theo dõi thêm một tháng trước khi đổi lịch: ${weak.map((r) => `${r.name} ${reliabilityText(r)} qua ${r.sessions} phiên`).join("; ")}.`);
  return parts.join(" ");
}



// ---------- 6. Hàng ----------

/** "Classic - Bone - 10001-2Y2" → "Classic - Bone" (mã hàng ở cuối chỉ làm câu dài). */
export const shortSku = (name: string) => name.replace(/\s*-\s*[\w-]*\d[\w-]*$/, "").trim() || name;

export function productsInsight(
  skus: SkuMoves | null,
  promo: { name: string; gmv: number; orders: number } | null,
  /** Câu quà tặng của tháng (vd "Quà tặng: 1.090 món ở 42 SKU…") — thêm cuối gạch đầu dòng. */
  giftNote: string | null = null
): SectionInsight | null {
  if (!skus || skus.rows.length === 0) return null;
  const chg = (r: SkuMove) => (r.gmvChange != null ? `GMV${skus.perDay ? " mỗi ngày" : ""} ${signed(r.gmvChange, 0)}` : null);
  const lead = skus.rows[0];
  const leadRank = lead.prevRank == null ? "mới vào top, lên hạng 1" : lead.prevRank === 1 ? "giữ hạng 1" : `từ hạng ${lead.prevRank} lên hạng 1`;
  const top10 = skus.rows.reduce((a, r) => a + r.gmv, 0);
  const headline = `${shortSku(lead.name)} ${leadRank} (${[money(lead.gmv), chg(lead)].filter(Boolean).join(", ")}) — chiếm ${pctTxt((lead.gmv / top10) * 100, 0)} GMV nhóm top ${skus.rows.length}.`;

  const points: string[] = [];
  const outside = skus.prevLimit != null ? `ngoài top ${skus.prevLimit}` : "chưa có hạng";
  const risers = skus.rows
    .slice(1)
    .filter((r) => r.prevRank == null || r.prevRank - r.rank >= 2)
    .sort((a, b) => (b.prevRank ?? 99) - b.rank - ((a.prevRank ?? 99) - a.rank))
    .slice(0, 2);
  if (risers.length) points.push(`Lên hạng: ${risers.map((r) => `${shortSku(r.name)} (${r.prevRank ?? outside} → ${r.rank}${chg(r) ? `, ${chg(r)}` : ""})`).join("; ")}.`);
  // SKU dẫn đầu đã nằm ở câu kết luận — không nhắc lại ở dòng "Đi xuống", nhưng vẫn được chọn làm việc cần
  // làm nếu nó giảm mạnh nhất (CROCS T9: hero SKU GMV mỗi ngày −32%).
  const fallersAll = skus.rows
    .filter((r) => (r.prevRank != null && r.rank - r.prevRank >= 2) || (r.gmvChange != null && r.gmvChange <= -20))
    .sort((a, b) => (a.gmvChange ?? 0) - (b.gmvChange ?? 0));
  const fallers = fallersAll.filter((r) => r !== lead).slice(0, 2);
  if (fallers.length) points.push(`Đi xuống: ${fallers.map((r) => `${shortSku(r.name)} (${r.prevRank != null && r.prevRank !== r.rank ? `${r.prevRank} → ${r.rank}` : `hạng ${r.rank}`}${chg(r) ? `, ${chg(r)}` : ""})`).join("; ")}.`);

  // Được bấm nhiều mà ít chốt: CTR ≥ trung vị top 10, CTOR ≤ 85% trung vị — nghẽn ở giá/voucher, không ở traffic.
  const withFunnel = skus.rows.filter((r) => r.ctr != null && r.ctor != null);
  const mCtr = median(withFunnel.map((r) => r.ctr!));
  const mCtor = median(withFunnel.map((r) => r.ctor!));
  const leaky =
    withFunnel.length >= 5 && mCtr != null && mCtor != null
      ? withFunnel.filter((r) => r.ctr! >= mCtr && r.ctor! <= mCtor * 0.85).sort((a, b) => a.ctor! - b.ctor!)[0]
      : undefined;
  if (leaky) points.push(`${shortSku(leaky.name)} được bấm nhiều (Product CTR ${pctTxt(leaky.ctr!, 2)}) nhưng chốt thấp (CTOR ${pctTxt(leaky.ctor!, 2)}, trung vị top ${skus.rows.length}: ${pctTxt(mCtor!, 2)}).`);
  if (promo && promo.gmv > 0) points.push(`Khuyến mãi mang GMV cao nhất: ${promo.name} (${money(promo.gmv)}, ${promo.orders.toLocaleString("vi-VN")} orders).`);
  if (giftNote) points.push(giftNote);

  const f = fallersAll[0];
  const action = f
    ? `Kiểm tra ${shortSku(f.name)}: tồn kho, giá và thời lượng giới thiệu trên live${chg(f) ? ` (${chg(f)})` : ""}.`
    : leaky
      ? `Kiểm giá và voucher của ${shortSku(leaky.name)} — người xem bấm nhiều nhưng ít chốt.`
      : risers[0]
        ? `Tăng thời lượng giới thiệu ${shortSku(risers[0].name)} trên live khi còn đang lên.`
        : null;
  return { headline, points, action };
}

// ---------- 7. Bối cảnh ----------

const CAMP_SHORT: Record<CampDayBucket, string> = { dday: "D-Day", midmonth: "Mid-Month", payday: "Pay Day", daily: DAY_TYPE.daily };

export interface SlotInsightRow {
  label: string;
  cur: { n: number; gmvPerHour: number | null };
  prev: { n: number; gmvPerHour: number | null };
}

/** Ads toàn cửa hàng của tháng (file TikTok Ads, 0137) — tháng trước đã cắt cùng số ngày. */
export interface AdsInsightInput {
  cost: number;
  roi: number | null;
  prevCost: number | null;
  prevRoi: number | null;
  zeroOrderDays: number;
}

function adsLine(ads: AdsInsightInput): string {
  const costChg = pctChange(ads.prevCost, ads.cost);
  const roiTxt = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}x`;
  return (
    `Ads toàn cửa hàng: chi ${money(ads.cost)}${costChg != null ? ` (${signed(costChg, 0)} so với cùng kỳ)` : ""}` +
    (ads.roi != null ? `, ROI ${roiTxt(ads.roi)}${ads.prevRoi != null ? ` (tháng trước ${roiTxt(ads.prevRoi)})` : ""}` : "") +
    (ads.zeroOrderDays ? `; ${ads.zeroOrderDays} ngày tiêu tiền mà 0 đơn` : "") +
    "."
  );
}

export function contextInsight(camps: CampCompareRow[], slots: SlotInsightRow[], ads?: AdsInsightInput | null): SectionInsight | null {
  const hasAds = !!ads && ads.cost > 0;
  const ran = camps.filter((r) => r.cur.sessions > 0);
  // Tháng chưa có ca nào có số (vd brand mới nạp file) mà đã có file Ads ⇒ Insight chỉ nói Ads.
  if (ran.length === 0) return hasAds ? { headline: adsLine(ads!), points: [], action: null } : null;
  // Trang này là Host & khung giờ: câu đầu nói khung giờ. GMV từng loại ngày đã ở trang 1 (bảng điểm) và trang 3 (bảng nhiệt) —
  // trước 27/10 câu đầu ở đây là "Daily −8,4% GMV", con số Daily thứ ba trên cùng một report (trang 1 −16%, trang 3 −29%).
  const usable = slots.filter((s) => s.cur.n >= 3 && s.cur.gmvPerHour != null);
  const sorted = [...usable].sort((a, b) => b.cur.gmvPerHour! - a.cur.gmvPerHour!);
  const bestSlot = sorted[0], worstSlot = sorted[sorted.length - 1];
  const slotLine =
    bestSlot && worstSlot && bestSlot !== worstSlot
      ? `Khung giờ bắt đầu phiên: ${bestSlot.label.toLowerCase()} bán tốt nhất (${money(bestSlot.cur.gmvPerHour!)}/giờ), ${worstSlot.label.toLowerCase()} thấp nhất (${money(worstSlot.cur.gmvPerHour!)}/giờ, ${worstSlot.cur.n} phiên).`
      : null;
  const points: string[] = [];
  if (hasAds) points.push(adsLine(ads!));
  const headline = slotLine ?? points.shift();
  if (!headline) return null;

  const worstCamp = ran
    .map((r) => ({ r, h: pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour) }))
    .filter((x): x is { r: CampCompareRow; h: number } => x.h != null && x.h <= -10)
    .sort((a, b) => a.h - b.h)[0];
  const action = worstCamp
    ? `Xem lại cách chạy ${worstCamp.r.key === "daily" ? DAY_TYPE.daily : CAMP_SHORT[worstCamp.r.key]}: GMV/giờ ${signed(worstCamp.h, 0)} so với cùng ${worstCamp.r.key === "daily" ? "kỳ" : "khung"} tháng trước.`
    : bestSlot && worstSlot && bestSlot !== worstSlot && worstSlot.cur.gmvPerHour! <= bestSlot.cur.gmvPerHour! * 0.8
      ? `Cân nhắc dời bớt phiên ${worstSlot.label.toLowerCase()} sang ${bestSlot.label.toLowerCase()}.`
      : null;
  return { headline, points, action };
}

// ---------- Gom việc cần làm về phần 7 ----------

/** Việc cần làm của khung Insight phần 2–6 → "Việc agency làm tháng sau" (sau autoNextSteps). Bỏ những việc
 *  autoNextSteps đã nói: Vì sao (cùng quy tắc thừa số tụt ≥ 5% mạnh nhất ⇒ cùng FACTOR_ACTION), "hụt vì vận hành"
 *  của phần 2 (= dòng controlOpsGroup), "Xem lại cách chạy Daily" khi ngày thường đã là chỗ hụt do vận hành. */
export function sectionNextSteps(
  ins: Partial<Record<InsightSection, SectionInsight | null>>,
  controlOpsGroup: "daily" | "camp" | null | undefined
): string[] {
  const out: string[] = [];
  const add = (t: string | null | undefined) => {
    if (t && !out.includes(t)) out.push(t);
  };
  add(ins.products?.action);
  add(ins.people?.action);
  const ctx = ins.context?.action;
  if (!(ctx && controlOpsGroup === "daily" && ctx.startsWith(`Xem lại cách chạy ${DAY_TYPE.daily}:`))) add(ctx);
  if (!controlOpsGroup) add(ins.shop?.action);
  return out;
}
