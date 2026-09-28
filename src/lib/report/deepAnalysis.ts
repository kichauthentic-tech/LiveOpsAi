import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";
import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import type { ShopDayLite, ShopDaysMonthSlice } from "../dataraw/monthlyProductSlice";
import type { ProductListAgg } from "../dataraw/productListAgg";
import { vnDateOf } from "../dataraw/vnDate";
import { fmtVndShort } from "../format";
import { hostKey, isCountable, sessionHours, UNASSIGNED_HOST_KEY } from "../performance/hostPerformance";
import type { LiveSession } from "../../types";
import { liveStatsFromRows, pctChange, signed, type CompareWindow, type LiveStats } from "./monthlyReportInsights";

// Report Tháng chuyên sâu (2026-09-26, user chọn sau đề xuất https://claude.ai/artifact/SmokGAGp1J9dPzmyj788Lt).
// Bốn phép phân tích, mỗi phép sinh ra từ một lỗi đo được trên số thật CROCS T6–T9:
//  1. Quà tặng: Jibbitz 0–3k/món (CTOR > 100%) làm UPT "giảm 4 tháng liên tiếp" 1,76 → 1,06 trong khi bỏ quà
//     ra UPT cả shop đứng ~1,1. Tách quà khỏi hàng bán thật trước khi đọc UPT/Avg. price.
//  2. Tách theo loại ngày + cơ cấu/hiệu suất: GMV/giờ T9 −30% cùng kỳ không phải do lịch camp (cơ cấu giờ giữa
//     các loại ngày giải thích −0,1tr/giờ, hiệu suất trong từng loại ngày −8,2tr/giờ).
//  3. Nhóm đối chứng: phần shop KHÔNG do agency vận hành cùng chịu một thị trường ⇒ tách "thị trường giảm" với
//     "vận hành giảm" (T9 ngày thường: live agency −23% theo ca, phần còn lại +1%).
//  4. Độ tin cậy host: so mặt bằng theo tháng không dự báo được tháng sau (Spearman −0,04, 20 cặp) ⇒ gộp
//     3–4 tháng, kèm khoảng tin cậy, chỉ kết luận khi khoảng đó nằm hẳn một phía.
// Mọi hàm thuần, không đọc DB.

const money = (v: number) => fmtVndShort(v);

// ---------- 1. Quà tặng ----------

/** Dưới 20k/món coi là quà tặng / bán ~0đ. Đo CROCS: quà Jibbitz 0–3k (T6), 1–14k (T8); Jibbitz bán thật
 *  150–209k (T9). Ngưỡng 20k bắt 4.125 / 2.900 / 1.090 / 0 món T6–T9, không dính SKU giá thật nào. */
export const GIFT_MAX_PRICE = 20_000;

export interface GiftSlice {
  hasAnyBatch: boolean;
  periodStart?: string;
  periodEnd?: string;
  /** Tổng số món bán (mọi SKU, mọi kênh — file Sản Phẩm). */
  items: number;
  giftItems: number;
  giftSkus: number;
  /** Tối đa 3 SKU quà nhiều món nhất: [tên, số món, giá mỗi món]. */
  top: [string, number, number][];
}

export function isGiftSku(gmv: number, itemsSold: number): boolean {
  return itemsSold > 0 && gmv / itemsSold < GIFT_MAX_PRICE;
}

export function giftSliceFromAgg(src: { agg: ProductListAgg; periodStart: string; periodEnd: string } | null): GiftSlice {
  if (!src) return { hasAnyBatch: false, items: 0, giftItems: 0, giftSkus: 0, top: [] };
  let items = 0, giftItems = 0, giftSkus = 0;
  const gifts: [string, number, number][] = [];
  for (const [name, gmv, , , , itemsSold] of src.agg.skus) {
    items += itemsSold || 0;
    if (!isGiftSku(gmv, itemsSold || 0)) continue;
    giftItems += itemsSold;
    giftSkus += 1;
    gifts.push([name, itemsSold, gmv / itemsSold]);
  }
  gifts.sort((a, b) => b[1] - a[1]);
  return { hasAnyBatch: true, periodStart: src.periodStart, periodEnd: src.periodEnd, items, giftItems, giftSkus, top: gifts.slice(0, 3) };
}

export interface GiftStats {
  giftItems: number;
  giftSkus: number;
  shopOrders: number;
  /** Quà mỗi đơn của cả shop. */
  giftPerOrder: number;
  /** UPT cả shop trên hàng bán thật = (món − quà) ÷ đơn. */
  uptExGift: number;
  uptShop: number;
}

/** Đơn cả shop lấy từ Shop Analytics cắt ĐÚNG kỳ file Sản Phẩm (file Sản Phẩm là tổng cả kỳ, không cắt ngày được). */
export function giftStats(gift: GiftSlice | null | undefined, shop: ShopDaysMonthSlice | null | undefined): GiftStats | null {
  if (!gift?.hasAnyBatch || !gift.periodStart || !gift.periodEnd || !shop?.hasAnyBatch) return null;
  const orders = shop.days.filter((d) => d.date >= gift.periodStart! && d.date <= gift.periodEnd!).reduce((a, d) => a + d.orders, 0);
  if (orders <= 0 || gift.items <= 0) return null;
  return {
    giftItems: gift.giftItems,
    giftSkus: gift.giftSkus,
    shopOrders: orders,
    giftPerOrder: gift.giftItems / orders,
    uptExGift: (gift.items - gift.giftItems) / orders,
    uptShop: gift.items / orders
  };
}

const dec2 = (v: number) => v.toLocaleString("vi-VN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Một câu khi lượng quà mỗi đơn đổi ≥ 0,1 món — lúc đó UPT live đổi theo quà, không phải theo cách bán. */
export function giftLine(prev: GiftStats | null, cur: GiftStats | null, prevLabel: string): string | null {
  if (!prev || !cur || Math.abs(cur.giftPerOrder - prev.giftPerOrder) < 0.1) return null;
  const down = cur.giftPerOrder < prev.giftPerOrder;
  const dir = down ? "giảm" : "tăng";
  return (
    `Quà tặng (hàng dưới ${fmtVndShort(GIFT_MAX_PRICE)}/món) ${dir} từ ${dec2(prev.giftPerOrder)} ${down ? "xuống" : "lên"} ${dec2(cur.giftPerOrder)} món mỗi đơn cả shop (${prevLabel} → nay)` +
    ` — UPT ${dir} chủ yếu vì vậy; tính trên hàng bán thật, UPT cả shop ${dec2(prev.uptExGift)} → ${dec2(cur.uptExGift)}.`
  );
}

// ---------- 2. Tách theo loại ngày + cơ cấu / hiệu suất ----------

export type DayGroup = "daily" | "camp";

export interface DayGroupStats {
  key: DayGroup;
  prev: LiveStats;
  cur: LiveStats;
}

/** Ngày thường vs gộp 3 khung camp, cùng cửa sổ so sánh. Mỗi tháng phân loại theo khoảng camp của chính nó. */
export function dayGroupStats(
  prevRows: CreatorLivePerfRow[],
  curRows: CreatorLivePerfRow[],
  win: CompareWindow,
  bucketPrev: (date: string) => CampDayBucket,
  bucketCur: (date: string) => CampDayBucket
): DayGroupStats[] {
  const pick = (rows: CreatorLivePerfRow[], bucketOf: (d: string) => CampDayBucket, g: DayGroup) =>
    rows.filter((r) => (bucketOf(vnDateOf(r.startTime)) === "daily") === (g === "daily"));
  return (["daily", "camp"] as DayGroup[]).map((key) => ({
    key,
    prev: liveStatsFromRows(pick(prevRows, bucketPrev, key), win.prevStart, win.prevEnd),
    cur: liveStatsFromRows(pick(curRows, bucketCur, key), win.curStart, win.curEnd)
  }));
}

export interface MixRateSplit {
  /** Đổi GMV/giờ (đ/giờ). mix + rate = delta. */
  delta: number;
  /** Phần do cơ cấu giờ live giữa các loại ngày đổi (vd bớt giờ D-Day). */
  mix: number;
  /** Phần do hiệu suất trong từng loại ngày đổi. */
  rate: number;
}

/** Tách ΔGMV/giờ = Σ(tỷ trọng giờ mới − cũ) × GMV/giờ cũ  +  Σ tỷ trọng mới × (GMV/giờ mới − cũ) — phép mix/rate của
 *  FP&A. Loại ngày tháng trước không có ca thì GMV/giờ cũ lấy mức chung tháng trước (không làm lệch tổng). */
export function mixRateSplit(
  prevRows: CreatorLivePerfRow[],
  curRows: CreatorLivePerfRow[],
  win: CompareWindow,
  bucketPrev: (date: string) => CampDayBucket,
  bucketCur: (date: string) => CampDayBucket
): MixRateSplit | null {
  const byBucket = (rows: CreatorLivePerfRow[], bucketOf: (d: string) => CampDayBucket, s: string, e: string) => {
    const out = Object.fromEntries(CAMP_DAY_BUCKET_ORDER.map((b) => [b, { gmv: 0, hours: 0 }])) as Record<CampDayBucket, { gmv: number; hours: number }>;
    for (const r of rows) {
      const d = vnDateOf(r.startTime);
      if (d < s || d > e) continue;
      const x = out[bucketOf(d)];
      x.gmv += r.gmv;
      x.hours += r.hours;
    }
    return out;
  };
  const a = byBucket(prevRows, bucketPrev, win.prevStart, win.prevEnd);
  const b = byBucket(curRows, bucketCur, win.curStart, win.curEnd);
  const tot = (x: typeof a) => CAMP_DAY_BUCKET_ORDER.reduce((acc, k) => ({ gmv: acc.gmv + x[k].gmv, hours: acc.hours + x[k].hours }), { gmv: 0, hours: 0 });
  const ta = tot(a), tb = tot(b);
  if (ta.hours <= 0 || tb.hours <= 0) return null;
  const r0All = ta.gmv / ta.hours;
  let mix = 0, rate = 0;
  for (const k of CAMP_DAY_BUCKET_ORDER) {
    const s0 = a[k].hours / ta.hours, s1 = b[k].hours / tb.hours;
    const r0 = a[k].hours > 0 ? a[k].gmv / a[k].hours : r0All;
    const r1 = b[k].hours > 0 ? b[k].gmv / b[k].hours : r0;
    mix += (s1 - s0) * r0;
    rate += s1 * (r1 - r0);
  }
  return { delta: tb.gmv / tb.hours - r0All, mix, rate };
}

// ---------- 3. Nhóm đối chứng ----------

export interface ControlRow {
  key: DayGroup | "all";
  days: number;
  /** Live agency: GMV các ca trong app theo ngày (khi truyền `agencyLive`), không thì "Linked account
   *  LIVE-attributed GMV" của Shop Analytics. */
  liveCur: number;
  livePrev: number;
  /** "Linked account LIVE-attributed GMV" — MỌI live trên tài khoản shop (gồm cả phiên không phải ca agency). */
  shopLiveCur: number;
  shopLivePrev: number;
  /** Mọi GMV không phải live tài khoản shop: affiliate, video, thẻ sản phẩm. */
  restCur: number;
  restPrev: number;
  visitorsCur: number;
  visitorsPrev: number;
  cvrCur: number | null;
  cvrPrev: number | null;
  liveChg: number | null;
  restChg: number | null;
  visitorsChg: number | null;
}

export type ControlVerdict = "ops" | "agency_better" | "market";

/** Cách nhau ≥ 10 điểm % mới coi là khác thị trường. */
export const CONTROL_GAP = 10;

/** GMV live theo ngày (giờ VN của lúc bắt đầu ca) — đầu vào `agencyLive` của controlGroup. */
export function liveGmvByDate(rows: CreatorLivePerfRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) {
    const d = vnDateOf(r.startTime);
    m.set(d, (m.get(d) ?? 0) + r.gmv);
  }
  return m;
}

/** Cột live lấy từ CA (`agencyLive`, 2026-09-29): "Linked account" của Shop Analytics đếm mọi live trên tài khoản
 *  shop — CROCS 1–22/09 cao hơn ca agency 108M (02/09 không có ca nào vẫn ghi 24M) ⇒ report từng ghi "live agency
 *  −19%" ở phần 2 cạnh "−22,7%" ở phần 6. Phần còn lại VẪN là Total GMV − Linked account (cùng nguồn Shop
 *  Analytics), nên phần live ngoài ca không rơi vào vế nào. Đo CROCS T9: lệch do nguồn 3–4 điểm < ngưỡng 10, cả
 *  3 dòng giữ nguyên kết luận. Chỉ cộng ca ở những ngày Shop Analytics có số (hai vế cùng tập ngày). */
export function controlGroup(
  prevDays: ShopDayLite[] | null | undefined,
  curDays: ShopDayLite[] | null | undefined,
  win: CompareWindow,
  bucketPrev: (date: string) => CampDayBucket,
  bucketCur: (date: string) => CampDayBucket,
  agencyLive?: { prev: Map<string, number>; cur: Map<string, number> }
): ControlRow[] {
  if (!prevDays?.length || !curDays?.length) return [];
  const sum = (days: ShopDayLite[], s: string, e: string, keep: (d: string) => boolean, agency: Map<string, number> | undefined) => {
    const x = { days: 0, gmv: 0, live: 0, shopLive: 0, visitors: 0, orders: 0 };
    for (const d of days) {
      if (d.date < s || d.date > e || !keep(d.date)) continue;
      x.days++;
      x.gmv += d.gmv;
      x.shopLive += d.liveLinked;
      x.live += agency ? agency.get(d.date) ?? 0 : d.liveLinked;
      x.visitors += d.visitors;
      x.orders += d.orders;
    }
    return x;
  };
  const groups: { key: ControlRow["key"]; test: (bucketOf: (d: string) => CampDayBucket) => (d: string) => boolean }[] = [
    { key: "daily", test: (f) => (d) => f(d) === "daily" },
    { key: "camp", test: (f) => (d) => f(d) !== "daily" },
    { key: "all", test: () => () => true }
  ];
  return groups
    .map(({ key, test }) => {
      const a = sum(prevDays, win.prevStart, win.prevEnd, test(bucketPrev), agencyLive?.prev);
      const b = sum(curDays, win.curStart, win.curEnd, test(bucketCur), agencyLive?.cur);
      return {
        key,
        days: b.days,
        liveCur: b.live,
        livePrev: a.live,
        shopLiveCur: b.shopLive,
        shopLivePrev: a.shopLive,
        restCur: b.gmv - b.shopLive,
        restPrev: a.gmv - a.shopLive,
        visitorsCur: b.visitors,
        visitorsPrev: a.visitors,
        cvrCur: b.visitors > 0 ? (b.orders / b.visitors) * 100 : null,
        cvrPrev: a.visitors > 0 ? (a.orders / a.visitors) * 100 : null,
        liveChg: pctChange(a.live, b.live),
        restChg: pctChange(a.gmv - a.shopLive, b.gmv - b.shopLive),
        visitorsChg: pctChange(a.visitors, b.visitors)
      };
    })
    .filter((r) => r.days > 0);
}

export function controlVerdict(r: ControlRow | undefined): ControlVerdict | null {
  if (!r || r.liveChg == null || r.restChg == null) return null;
  const gap = r.liveChg - r.restChg;
  return gap <= -CONTROL_GAP ? "ops" : gap >= CONTROL_GAP ? "agency_better" : "market";
}

const GROUP_LABEL: Record<ControlRow["key"], string> = { daily: "Ngày thường", camp: "Ngày camp", all: "Cả kỳ" };

export function controlLabel(key: ControlRow["key"]): string {
  return GROUP_LABEL[key];
}

export const VERDICT_TEXT: Record<ControlVerdict, string> = {
  ops: "khoảng hụt nằm ở vận hành live",
  agency_better: "thị trường giảm mạnh hơn, agency giữ tốt hơn",
  market: "live đi cùng thị trường"
};

/** Một câu cho phần Kết luận: ưu tiên nhóm ngày có kết luận "vận hành" (việc agency tự sửa được), rồi tới cả kỳ. */
export function controlLine(rows: ControlRow[]): string | null {
  const ordered = [...rows.filter((r) => r.key !== "all" && controlVerdict(r) === "ops"), ...rows.filter((r) => r.key === "all")];
  const r = ordered[0];
  const v = controlVerdict(r);
  if (!r || !v) return null;
  const vis = r.visitorsChg != null ? `, lượt vào shop ${signed(r.visitorsChg, 0)}` : "";
  return `So với phần còn lại của shop (${GROUP_LABEL[r.key].toLowerCase()}): live agency ${signed(r.liveChg!, 0)}, phần còn lại ${signed(r.restChg!, 0)}${vis} ⇒ ${VERDICT_TEXT[v]}.`;
}

// ---------- 4. Độ tin cậy so sánh host ----------

export interface HostReliability {
  key: string;
  name: string;
  sessions: number;
  /** GMV thực ÷ GMV nếu bán bằng mặt bằng nhóm ở đúng tháng × loại ngày × buổi của từng ca (1 = đúng mặt bằng). */
  ratio: number;
  /** Khoảng tin cậy 95% (null khi < MIN_RELIABILITY_SESSIONS ca). */
  lo: number | null;
  hi: number | null;
  verdict: "above" | "below" | "unclear";
}

export const MIN_RELIABILITY_SESSIONS = 3;

// Giá trị tới hạn t hai phía 95% theo bậc tự do (n − 1). Mẫu nhỏ mà dùng 1,96 thì khoảng hẹp giả: 3 ca cần
// hệ số 4,30 chứ không phải 1,96 (khoảng rộng gấp đôi) — lần đầu làm với 1,96 đã "kết luận" một host dưới mặt
// bằng chỉ từ 3 ca.
const T95: [number, number][] = [[1, 12.71], [2, 4.3], [3, 3.18], [4, 2.78], [5, 2.57], [6, 2.45], [7, 2.36], [8, 2.31], [9, 2.26], [10, 2.23], [12, 2.18], [15, 2.13], [20, 2.09], [30, 2.04], [60, 2.0], [120, 1.98]];
/** Bậc tự do nằm giữa 2 mốc thì lấy mốc thấp hơn (t lớn hơn — khoảng rộng hơn, thận trọng). */
export function t95(df: number): number {
  if (df > 120) return 1.96;
  let v = T95[0][1];
  for (const [d, t] of T95) if (df >= d) v = t;
  return v;
}

/** Buổi: ca bắt đầu từ 17h là "tối" — GMV/giờ tối và ngày khác nhau có hệ thống (CROCS T8: 28,2 vs 26,2tr/giờ). */
const partOf = (s: LiveSession) => (Number((s.startTime || "00:00").slice(0, 2)) >= 17 ? "eve" : "day");

/**
 * Tỷ số R = ΣGMV ÷ ΣGMV kỳ vọng của host; kỳ vọng mỗi ca = giờ × GMV/giờ của cả nhóm ở cùng tháng × loại ngày ×
 * buổi (gồm cả ca chưa gán host). Khoảng tin cậy theo phương sai của ước lượng tỷ số (delta method) — tất định,
 * không lấy mẫu ngẫu nhiên nên report mở lại vẫn ra đúng số. Chỉ kết luận trên/dưới khi khoảng nằm hẳn một phía 1.
 */
export function hostReliability(sessions: LiveSession[], bucketOf: (date: string) => CampDayBucket): HostReliability[] {
  // isCountable: bỏ ca đang live có số dở dang (audit 2026-09-28 mục 6).
  const valid = sessions.filter((s) => isCountable(s) && (s.actualGmv ?? 0) > 0 && sessionHours(s) > 0);
  const cell = (s: LiveSession) => `${s.date.slice(0, 7)}|${bucketOf(s.date)}|${partOf(s)}`;
  const rate = new Map<string, { g: number; h: number }>();
  for (const s of valid) {
    const k = cell(s);
    const x = rate.get(k) ?? { g: 0, h: 0 };
    x.g += s.actualGmv;
    x.h += sessionHours(s);
    rate.set(k, x);
  }
  const byHost = new Map<string, { name: string; g: number[]; e: number[] }>();
  for (const s of valid) {
    const key = hostKey(s);
    if (key === UNASSIGNED_HOST_KEY) continue;
    const r = rate.get(cell(s))!;
    const x = byHost.get(key) ?? { name: s.hostName || key, g: [], e: [] };
    x.g.push(s.actualGmv);
    x.e.push((sessionHours(s) * r.g) / r.h);
    byHost.set(key, x);
  }
  return [...byHost.entries()]
    .map(([key, x]) => {
      const n = x.g.length;
      const G = x.g.reduce((a, b) => a + b, 0), E = x.e.reduce((a, b) => a + b, 0);
      const R = G / E;
      let lo: number | null = null, hi: number | null = null;
      if (n >= MIN_RELIABILITY_SESSIONS) {
        const eBar = E / n;
        const v = x.g.reduce((acc, g, i) => acc + (g - R * x.e[i]) ** 2, 0) / (n * (n - 1) * eBar * eBar);
        const se = Math.sqrt(v);
        lo = R - t95(n - 1) * se;
        hi = R + t95(n - 1) * se;
      }
      const verdict: HostReliability["verdict"] = lo != null && lo > 1 ? "above" : hi != null && hi < 1 ? "below" : "unclear";
      return { key, name: x.name, sessions: n, ratio: R, lo, hi, verdict };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** "+11% (+2% … +23%)" — tỷ số → % so mặt bằng, kèm khoảng khi có. Dưới 1% thì 1 chữ số thập phân (không ghi "+0%"). */
/** Khoảng tin cậy chạm sát mặt bằng (cận gần 1 hơn 2 điểm %) — có kết luận nhưng yếu, phải nói rõ. */
export function isBorderline(r: Pick<HostReliability, "lo" | "hi" | "verdict">): boolean {
  return (r.verdict === "above" && r.lo != null && r.lo < 1.02) || (r.verdict === "below" && r.hi != null && r.hi > 0.98);
}
export function reliabilityText(r: Pick<HostReliability, "ratio" | "lo" | "hi">): string {
  const p = (x: number) => {
    const v = Math.abs((x - 1) * 100);
    return `${x >= 1 ? "+" : "−"}${v < 1 ? v.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : Math.round(v)}%`;
  };
  return r.lo != null && r.hi != null ? `${p(r.ratio)} (${p(r.lo)} … ${p(r.hi)})` : p(r.ratio);
}

// ---------- câu "cơ hội" quy ra tiền ----------

/** Khoảng GMV ngày thường sẽ có thêm nếu giữ GMV/giờ kỳ trước với số giờ kỳ này. */
export function dailyGap(g: DayGroupStats | undefined): number | null {
  if (!g || g.prev.gmvPerHour == null || g.cur.gmvPerHour == null || g.cur.hours <= 0) return null;
  const gap = (g.prev.gmvPerHour - g.cur.gmvPerHour) * g.cur.hours;
  return gap > 0 ? gap : null;
}

export function dailyGapLine(g: DayGroupStats | undefined): string | null {
  const gap = dailyGap(g);
  if (gap == null || !g) return null;
  return `Nếu ngày thường giữ GMV/giờ kỳ trước (${money(g.prev.gmvPerHour!)}/giờ, nay ${money(g.cur.gmvPerHour!)}/giờ) với ${g.cur.hours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })} giờ live đã chạy, LIVE GMV có thêm ~${money(gap)}.`;
}
