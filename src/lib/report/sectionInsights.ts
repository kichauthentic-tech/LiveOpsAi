import { CHANNEL, DAY_TYPE, METRIC } from "../metricGlossary";
import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";
import { formatCurrencyAdaptive } from "../formatCurrency";
import { pctChange, pctTxt, signed, type CampCompareRow, type ChannelMix, type LiveStats, type ShopTotals, type SkuMove, type SkuMoves } from "./monthlyReportInsights";

// Khung "Insight" đầu mỗi phần 3–7 của Report Tháng (2026-09-26, học từ deck report tháng của Crocs:
// mỗi slide có 1 câu kết luận + 3–4 số chứng minh + 1 việc cần làm). Hàm thuần — tự sinh từ đúng các số
// phần đó đang hiện, ops sửa/bổ sung bối cảnh (vd "scheme tặng Jibbitz kết thúc sớm") trước khi phát hành.
//
// Dạng văn bản 1 khung: dòng đầu = kết luận, dòng bắt đầu "→" = việc cần làm, còn lại = gạch đầu dòng.
// Bản ops sửa lưu đúng dạng này (brand_monthly_reports.section_notes, 0121) nên hiển thị chung 1 đường.

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

const money = (v: number) => formatCurrencyAdaptive(v);
const pp = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} điểm`;
const dec2 = (v: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
}

/** Tỷ trọng kênh so được giữa tháng chưa hết và tháng đủ (đều là tỷ lệ); số tuyệt đối thì chỉ so cùng kỳ. */
export function shopInsight(i: ShopInsightInput): SectionInsight | null {
  const n = i.mixes.length;
  const cur = i.mixes[n - 1];
  const prev = n > 1 ? i.mixes[n - 2] : null;
  if (!cur || !i.shopCur) return null;
  const prevLabel = n > 1 ? `tháng ${i.months[n - 2].slice(5)}` : "";

  const agencyShare = (idx: number) => (i.mixes[idx] && i.mixes[idx]!.shopGmv > 0 && i.agencyGmv[idx] > 0 ? (i.agencyGmv[idx] / i.mixes[idx]!.shopGmv) * 100 : null);
  const aCur = agencyShare(n - 1);
  const aPrev = n > 1 ? agencyShare(n - 2) : null;
  const shopChg = i.shopPrev ? pctChange(i.shopPrev.gmv, i.shopCur.gmv) : null;
  const headline =
    `Total GMV ${money(i.shopCur.gmv)}${shopChg != null ? ` (${signed(shopChg)}, ${i.windowLabel})` : ""}` +
    (aCur != null ? `; agency live chiếm ${pctTxt(aCur)}${aPrev != null ? ` (${prevLabel}: ${pctTxt(aPrev)})` : ""}.` : ".");

  const points: string[] = [];
  let affiliateDelta: number | null = null;
  if (prev) {
    const moves = CHANNELS.map((c) => {
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

  const action =
    affiliateDelta != null && affiliateDelta <= -1
      ? "Tỷ trọng Affiliate LIVE giảm — rà lịch creator và gói hỗ trợ affiliate cho tháng sau."
      : refundDelta != null && refundDelta >= 2
        ? "Refund rate tăng — kiểm lý do hoàn của nhóm SKU chủ lực trước khi đẩy thêm traffic."
        : null;
  return { headline, points, action };
}

// ---------- 4. Vì sao ----------

type Stage = "viewsPerHour" | "liveCtr" | "ctor" | "upt";
const STAGE_ACTION: Record<Stage, string> = {
  viewsPerHour: "Điểm nghẽn ở traffic — rà khung giờ live, ảnh bìa/tiêu đề phiên và ngân sách đẩy live.",
  liveCtr: "Điểm nghẽn ở bước bấm sản phẩm — ghim sản phẩm và nhắc bấm giỏ thường xuyên hơn trong live.",
  ctor: "Điểm nghẽn ở bước chốt đơn — rà giá, voucher và cách chốt của nhóm SKU chủ lực.",
  upt: "Điểm nghẽn ở giỏ hàng — thử combo hoặc ưu đãi theo ngưỡng giá trị đơn để kéo UPT lên."
};

/** GMV/giờ = lượt xem/giờ × GMV/lượt xem (đúng tích) ⇒ tách được phần traffic và phần chuyển đổi; rồi
 *  đi dọc phễu (bấm → chốt → giỏ) để chỉ ra bước yếu nhất. */
export function whyInsight(prev: LiveStats, cur: LiveStats): SectionInsight | null {
  const gh = pctChange(prev.gmvPerHour, cur.gmvPerHour);
  const vph = pctChange(prev.viewsPerHour, cur.viewsPerHour);
  const gpv = pctChange(prev.gmvPerView, cur.gmvPerView);
  if (gh == null || vph == null || gpv == null) return null;

  const lv = Math.log(1 + vph / 100), lg = Math.log(1 + gpv / 100);
  const dir = gh < 0 ? "xuống" : "lên";
  const verdict =
    Math.sign(lv) === Math.sign(lg)
      ? `cả traffic lẫn chuyển đổi cùng ${gh < 0 ? "giảm" : "tăng"}`
      : Math.abs(lv) >= Math.abs(lg)
        ? `traffic kéo ${dir}, chuyển đổi bù một phần`
        : `chuyển đổi kéo ${dir}, traffic bù một phần`;
  const headline = `GMV/giờ ${signed(gh, 0)}: Views/giờ ${signed(vph, 0)}, GMV/View ${signed(gpv, 0)} — ${verdict}.`;

  const points: string[] = [];
  const stage = (label: string, a: number | null, b: number | null, fmt: (v: number) => string) => {
    const c = pctChange(a, b);
    if (a != null && b != null && c != null) points.push(`${label}: ${fmt(a)} → ${fmt(b)} (${signed(c, 0)}).`);
  };
  stage(METRIC.liveCtr, prev.liveCtr, cur.liveCtr, (v) => pctTxt(v));
  stage(METRIC.ctor, prev.ctor, cur.ctor, (v) => pctTxt(v, 2));
  stage(METRIC.upt, prev.upt, cur.upt, dec2);
  stage(METRIC.aov, prev.aov, cur.aov, (v) => `${Math.round(v / 1000).toLocaleString("vi-VN")}k đ`);

  const changes: [Stage, number | null][] = [
    ["viewsPerHour", vph],
    ["liveCtr", pctChange(prev.liveCtr, cur.liveCtr)],
    ["ctor", pctChange(prev.ctor, cur.ctor)],
    ["upt", pctChange(prev.upt, cur.upt)]
  ];
  const worst = changes.filter((x): x is [Stage, number] => x[1] != null && x[1] <= -5).sort((a, b) => a[1] - b[1])[0];
  return { headline, points, action: worst ? STAGE_ACTION[worst[0]] : null };
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

export function peopleInsight(hosts: HostInsightRow[], minHours = 6): SectionInsight | null {
  const live = hosts.filter((h) => h.hours > 0 && h.gmv > 0);
  if (live.length < 2) return null;
  const peer = new Map(hostVsPeer(live).map((p) => [p.name, p]));
  const total = live.reduce((a, h) => a + h.gmv, 0);
  const byGmv = [...live].sort((a, b) => b.gmv - a.gmv);
  const top = byGmv[0];
  const tp = peer.get(top.name)!;
  const headline =
    `${top.name} dẫn đầu GMV (${money(top.gmv)}, ${pctTxt((top.gmv / total) * 100, 0)} tổng host)` +
    (tp.gmvPerHour != null ? ` với ${money(tp.gmvPerHour)}/giờ` : "") +
    (tp.vsPeer != null ? `, ${signed(tp.vsPeer, 0)} so với mặt bằng cùng loại ngày.` : ".");

  const points: string[] = [];
  const mentioned = new Set([top.name]);
  const line = (h: HostInsightRow, tail: string) => {
    const p = peer.get(h.name)!;
    mentioned.add(h.name);
    return `${h.name}: ${p.gmvPerHour != null ? `${money(p.gmvPerHour)}/giờ` : "—"} qua ${h.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h, ${signed(p.vsPeer ?? 0, 0)} so với mặt bằng cùng loại ngày${tail}.`;
  };
  // Chọn host nêu tên theo GMV hơn/hụt so với mặt bằng TÍNH BẰNG TIỀN: cùng −21% thì host live 20h đáng
  // nói hơn host live 7h (CROCS T8: Lê Minh Nhật hụt ~109tr vs Trương Thị Khánh Linh ~39tr).
  const eligible = live.filter((h) => h.hours >= minHours && peer.get(h.name)!.gap != null).sort((a, b) => peer.get(b.name)!.gap! - peer.get(a.name)!.gap!);
  const best = eligible[0];
  if (best && !mentioned.has(best.name) && peer.get(best.name)!.vsPeer! > 0) points.push(line(best, " — hơn mặt bằng nhiều nhất"));
  const worst = eligible.filter((h) => h !== best && peer.get(h.name)!.vsPeer! <= -15).pop();
  const worstGap = worst ? peer.get(worst.name)!.vsPeer! : 0;
  if (worst) points.push(line(worst, ` — hụt ${money(Math.abs(peer.get(worst.name)!.gap!))} so với mặt bằng`));

  // Ít giờ mà bán tốt: dưới trung vị giờ live, hơn mặt bằng ≥ 10%, đủ 3h để khỏi là 1 ca may.
  const medHours = median(live.map((h) => h.hours)) ?? 0;
  const under = live
    .filter((h) => !mentioned.has(h.name) && h.hours >= 3 && h.hours <= medHours && (peer.get(h.name)!.vsPeer ?? -Infinity) >= 10)
    .sort((a, b) => peer.get(b.name)!.vsPeer! - peer.get(a.name)!.vsPeer!)[0];
  if (under) points.push(line(under, " — ít giờ nhưng bán tốt"));

  const action = under
    ? `Cân nhắc thêm ca cho ${under.name} (${signed(peer.get(under.name)!.vsPeer!, 0)} so với mặt bằng, mới live ${under.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h).`
    : worst && worstGap <= -15
      ? `Xem lại khung ca và nhóm SKU của ${worst.name} — GMV/giờ thấp hơn mặt bằng cùng loại ngày ${pctTxt(Math.abs(worstGap), 0)}.`
      : null;
  return { headline, points, action };
}

// ---------- 6. Hàng ----------

/** "Classic - Bone - 10001-2Y2" → "Classic - Bone" (mã hàng ở cuối chỉ làm câu dài). */
export const shortSku = (name: string) => name.replace(/\s*-\s*[\w-]*\d[\w-]*$/, "").trim() || name;

export function productsInsight(skus: SkuMoves | null, promo: { name: string; gmv: number; orders: number } | null): SectionInsight | null {
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

  const f = fallersAll[0];
  const action = f
    ? `Rà ${shortSku(f.name)}: tồn kho, giá và thời lượng giới thiệu trên live${chg(f) ? ` (${chg(f)})` : ""}.`
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

export function contextInsight(camps: CampCompareRow[], slots: SlotInsightRow[]): SectionInsight | null {
  const ran = camps.filter((r) => r.cur.sessions > 0);
  if (ran.length === 0) return null;
  const daily = ran.find((r) => r.key === "daily");
  const campRan = ran.filter((r) => r.key !== "daily");
  const withPrev = campRan.filter((r) => r.prev.sessions > 0);
  const up = withPrev.filter((r) => r.cur.gmv > r.prev.gmv).length;
  const dChg = daily ? pctChange(daily.prev.gmv, daily.cur.gmv) : null;
  const headline =
    [
      dChg != null ? `Daily ${signed(dChg)} GMV so với cùng kỳ tháng trước` : null,
      withPrev.length ? `${up}/${withPrev.length} khung Campaign đã chạy tăng GMV so với cùng khung tháng trước` : null
    ]
      .filter(Boolean)
      .join("; ") + ".";
  if (headline === ".") return null;

  const points = campRan.map((r) => {
    const g = pctChange(r.prev.gmv, r.cur.gmv), h = pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour);
    return (
      `${CAMP_SHORT[r.key]}: ${money(r.cur.gmv)}${r.target ? ` (${pctTxt((r.cur.gmv / r.target) * 100, 0)} target)` : ""}` +
      (g != null ? `, ${signed(g, 0)} so với cùng khung` : "") +
      (r.cur.gmvPerHour != null ? `; ${money(r.cur.gmvPerHour)}/giờ${h != null ? ` (${signed(h, 0)})` : ""}` : "") +
      "."
    );
  });

  const usable = slots.filter((s) => s.cur.n >= 3 && s.cur.gmvPerHour != null);
  const sorted = [...usable].sort((a, b) => b.cur.gmvPerHour! - a.cur.gmvPerHour!);
  const bestSlot = sorted[0], worstSlot = sorted[sorted.length - 1];
  if (bestSlot && worstSlot && bestSlot !== worstSlot) {
    points.push(`Khung giờ bắt đầu ca: ${bestSlot.label.toLowerCase()} bán tốt nhất (${money(bestSlot.cur.gmvPerHour!)}/giờ), ${worstSlot.label.toLowerCase()} thấp nhất (${money(worstSlot.cur.gmvPerHour!)}/giờ, ${worstSlot.cur.n} ca).`);
  }

  const worstCamp = ran
    .map((r) => ({ r, h: pctChange(r.prev.gmvPerHour, r.cur.gmvPerHour) }))
    .filter((x): x is { r: CampCompareRow; h: number } => x.h != null && x.h <= -10)
    .sort((a, b) => a.h - b.h)[0];
  const action = worstCamp
    ? `Xem lại cách chạy ${worstCamp.r.key === "daily" ? DAY_TYPE.daily : CAMP_SHORT[worstCamp.r.key]}: GMV/giờ ${signed(worstCamp.h, 0)} so với cùng ${worstCamp.r.key === "daily" ? "kỳ" : "khung"} tháng trước.`
    : bestSlot && worstSlot && bestSlot !== worstSlot && worstSlot.cur.gmvPerHour! <= bestSlot.cur.gmvPerHour! * 0.8
      ? `Cân nhắc dời bớt ca ${worstSlot.label.toLowerCase()} sang ${bestSlot.label.toLowerCase()}.`
      : null;
  return { headline, points, action };
}
