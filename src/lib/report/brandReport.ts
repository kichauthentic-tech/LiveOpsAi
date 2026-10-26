import type { AffiliateActualEntry } from "../../types";
import { CAMP_DAY_BUCKET_ORDER, resolveCampBucketType, type CampDayBucket, type CampOverrides } from "../campaignDays";
import type { CreatorLivePerfRow } from "../dataraw/creatorLivePerfSlice";
import { vnDateOf } from "../dataraw/vnDate";
import { entryStatus, parseDayLabel, planBudget, planHours } from "../affiliate/plan";
import { KEY_METRICS, keyMetricValue, type KeyMetricDef } from "./keyMetrics";
import { liveStatsFromRows, pctChange, type CampCompareRow, type LiveStats } from "./monthlyReportInsights";

// Report Tháng gửi brand — bố cục 10 trang (user duyệt demo CROCS T9, 24/10/2026). Phần MỚI so với 7 phần cũ: ngưỡng dao động
// cho mọi % thay đổi theo loại ngày, bảng nhiệt loại ngày × yếu tố, Key Metrics 3 tháng × 5 bảng, bảng điểm target, affiliate
// theo phiên creator + lịch creator tháng sau. Mọi hàm thuần, không đọc DB (test: tests/brandReport.test.ts).

// ---------- ngưỡng dao động ----------

/** Độ lệch GMV/giờ của MỘT ca so với mức kỳ vọng (cùng tháng × loại ngày × buổi) — đo trên 229 ca CROCS T6–T9 (26/09). */
export const SESSION_CV = 0.26;

/**
 * Ngưỡng dao động 95% (đơn vị %) khi so một chỉ số của hai kỳ có n₁ và n₂ ca: 1,96 × CV × √(1/n₁ + 1/n₂). Thay đổi nhỏ hơn
 * ngưỡng thì không kết luận được (vd đợt camp 4 ca ⇒ ±36%). Dùng chung một CV cho mọi chỉ số là gần đúng — với GMV/giờ là
 * chuẩn nhất, với tỷ lệ phễu là cận trên thận trọng. Kỳ không có ca ⇒ null.
 */
export function noiseBand(n1: number, n2: number): number | null {
  if (n1 < 1 || n2 < 1) return null;
  return 196 * SESSION_CV * Math.sqrt(1 / n1 + 1 / n2);
}

/** "up" / "down" = cải thiện / suy giảm vượt ngưỡng; "shift" = đổi vượt ngưỡng ở chỉ số trung tính; "noise" = trong ngưỡng. */
export type ChangeTone = "up" | "down" | "shift" | "noise";

export function changeTone(change: number | null, band: number | null, goodWhenUp: boolean | null): ChangeTone {
  if (change == null || band == null || Math.abs(change) < band) return "noise";
  if (goodWhenUp == null) return "shift";
  return change > 0 === goodWhenUp ? "up" : "down";
}

// ---------- bảng nhiệt loại ngày × yếu tố ----------

export const DAY_TYPE_FACTORS = ["hours", "viewsPerHour", "liveCtr", "ctor", "aov", "gmvPerHour"] as const;
export type DayTypeFactor = (typeof DAY_TYPE_FACTORS)[number];

export interface DayTypeFactorRow {
  key: CampDayBucket;
  sessionsPrev: number;
  sessionsCur: number;
  band: number | null;
  change: Record<DayTypeFactor, number | null>;
  /** GMV/giờ đổi vượt ngưỡng dao động. */
  significant: boolean;
}

/** Mỗi loại ngày so với CHÍNH loại ngày đó tháng trước (đầu vào = campCompare, cùng khung camp từng tháng). Daily đứng đầu. */
export function dayTypeFactorRows(rows: CampCompareRow[]): DayTypeFactorRow[] {
  const order: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];
  return order
    .map((k) => rows.find((r) => r.key === k))
    .filter((r): r is CampCompareRow => !!r && (r.cur.sessions > 0 || r.prev.sessions > 0))
    .map((r) => {
      const band = noiseBand(r.prev.sessions, r.cur.sessions);
      const change = Object.fromEntries(DAY_TYPE_FACTORS.map((f) => [f, pctChange(keyMetricValue(r.prev, f), keyMetricValue(r.cur, f))])) as Record<DayTypeFactor, number | null>;
      return {
        key: r.key,
        sessionsPrev: r.prev.sessions,
        sessionsCur: r.cur.sessions,
        band,
        change,
        significant: changeTone(change.gmvPerHour, band, true) !== "noise"
      };
    });
}

// ---------- Key Metrics nhiều tháng ----------

/** 5 bảng của trang Key Metrics: cả tháng, Daily, rồi từng đợt campaign. */
export type KeyMetricsTab = "all" | CampDayBucket;
export const KEY_METRICS_TABS: KeyMetricsTab[] = ["all", "daily", "dday", "midmonth", "payday"];

/** Cộng chỉ số live theo loại ngày (khung camp của CHÍNH tháng đó) + cả tháng, trong [start, end]. */
export function bucketStats(rows: CreatorLivePerfRow[], start: string, end: string, overrides?: CampOverrides): Record<KeyMetricsTab, LiveStats> {
  const split: Record<CampDayBucket, CreatorLivePerfRow[]> = { dday: [], midmonth: [], payday: [], daily: [] };
  for (const r of rows) split[resolveCampBucketType(vnDateOf(r.startTime), overrides)].push(r);
  return {
    all: liveStatsFromRows(rows, start, end),
    ...(Object.fromEntries(CAMP_DAY_BUCKET_ORDER.map((b) => [b, liveStatsFromRows(split[b], start, end)])) as Record<CampDayBucket, LiveStats>)
  };
}

/** Khoảng ngày của từng đợt camp trong tháng, vd "7–9/9" (theo khung hiệu lực). Đợt không có ngày nào ⇒ không có khoá. */
export function campSpanLabels(month: string, overrides?: CampOverrides): Partial<Record<CampDayBucket, string>> {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const days: Record<CampDayBucket, number[]> = { daily: [], dday: [], midmonth: [], payday: [] };
  for (let d = 1; d <= last; d++) days[resolveCampBucketType(`${month}-${String(d).padStart(2, "0")}`, overrides)].push(d);
  const out: Partial<Record<CampDayBucket, string>> = {};
  for (const b of ["dday", "midmonth", "payday"] as const) {
    const ds = days[b];
    if (ds.length) out[b] = ds.length === 1 ? `${ds[0]}/${m}` : `${ds[0]}–${ds[ds.length - 1]}/${m}`;
  }
  return out;
}

export interface KeyMetricsMonth {
  month: string;
  stats: Record<KeyMetricsTab, LiveStats>;
  /** Target GMV theo bảng (Kế Hoạch Tháng đã chốt); null = tháng đó không có kế hoạch chốt. */
  targets: Record<KeyMetricsTab, number | null> | null;
  /** GMV dùng cho % Target (gồm mọi ca — cùng số trang 1). */
  gmvForTarget: Record<KeyMetricsTab, number>;
}

export interface KeyMetricsCell {
  def: KeyMetricDef;
  values: (number | null)[];
  /** % đổi tháng i so với tháng i−1 (phần tử 0 luôn null). */
  changes: (number | null)[];
  tones: ChangeTone[];
}

/** Một bảng Key Metrics: các tháng theo thứ tự cũ → mới. Giờ live không đánh giá tốt/xấu (do lịch quyết định). */
export function keyMetricsTable(months: KeyMetricsMonth[], tab: KeyMetricsTab): { bands: (number | null)[]; rows: KeyMetricsCell[]; downCount: number } {
  const bands = months.map((m, i) => (i === 0 ? null : noiseBand(months[i - 1].stats[tab].sessions, m.stats[tab].sessions)));
  const rows = KEY_METRICS.map((def) => {
    const values = months.map((m) => keyMetricValue(m.stats[tab], def.key));
    const changes = values.map((v, i) => (i === 0 ? null : pctChange(values[i - 1], v)));
    const tones = changes.map((c, i) => (def.key === "hours" ? "noise" : changeTone(c, bands[i], def.goodWhenUp)));
    return { def, values, changes, tones };
  });
  const last = months.length - 1;
  return { bands, rows, downCount: rows.filter((r) => r.tones[last] === "down").length };
}

// ---------- bảng điểm trang 1 ----------

export interface ScoreRow {
  key: KeyMetricsTab | "shop";
  target: number | null;
  actual: number;
  /** % Target; null khi chưa có target. */
  pct: number | null;
}

export function scoreRows(liveTarget: number | null, liveActual: number, camp: { key: CampDayBucket; target: number | null; actual: number }[], shop: { target: number; actual: number } | null): ScoreRow[] {
  const pct = (t: number | null, a: number) => (t && t > 0 ? (a / t) * 100 : null);
  const order: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];
  return [
    { key: "all", target: liveTarget, actual: liveActual, pct: pct(liveTarget, liveActual) },
    ...order.flatMap((k) => {
      const c = camp.find((x) => x.key === k);
      return c ? [{ key: k, target: c.target, actual: c.actual, pct: pct(c.target, c.actual) }] : [];
    }),
    ...(shop ? [{ key: "shop" as const, target: shop.target, actual: shop.actual, pct: pct(shop.target, shop.actual) }] : [])
  ];
}

// ---------- affiliate ----------

export interface CreatorSessionRow {
  creator: string;
  date: string | null;
  campName?: string;
  target: number | null;
  gmv: number;
  hours: number | null;
  ads: number | null;
  pctTarget: number | null;
  gmvPerHour: number | null;
  roas: number | null;
}

/** Phiên creator đã live trong tháng (tab Affiliate — số thực khớp từ file Live Analysis hoặc ops nhập). Sắp theo ngày. */
export function creatorSessionRows(entries: AffiliateActualEntry[]): CreatorSessionRow[] {
  return entries
    .filter((e) => entryStatus(e) === "done" && (e.directGmv ?? 0) > 0)
    .map((e) => {
      const gmv = e.directGmv ?? 0;
      const hours = e.durationHours && e.durationHours > 0 ? e.durationHours : null;
      const ads = e.adsCost && e.adsCost > 0 ? e.adsCost : null;
      const target = e.targetGmv && e.targetGmv > 0 ? e.targetGmv : null;
      return {
        creator: e.creatorName,
        date: parseDayLabel(e.liveDateLabel),
        campName: e.campName,
        target,
        gmv,
        hours,
        ads,
        pctTarget: target ? (gmv / target) * 100 : null,
        gmvPerHour: hours ? gmv / hours : null,
        roas: ads ? gmv / ads : null
      };
    })
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}

export interface CreatorTotals {
  sessions: number;
  creators: number;
  gmv: number;
  /** Σ target của các phiên CÓ target; `gmvWithTarget`/`targetSessions` = GMV và số phiên của đúng các phiên đó — % target chỉ
   *  tính trên tập này (audit 27/10: CROCS T9 lấy GMV cả 4 phiên ÷ target của 1 phiên ⇒ 117,7% thay vì 75%). */
  target: number;
  gmvWithTarget: number;
  targetSessions: number;
  /** Σ giờ / GMV của các phiên có giờ — GMV/giờ chỉ tính trên tập này. */
  hours: number;
  hoursGmv: number;
  /** Σ Ads / GMV / số phiên của các phiên có Ads — ROAS chỉ tính trên tập này. */
  ads: number;
  adsGmv: number;
  adsSessions: number;
  /** Tên creator lớn nhất + tỷ trọng GMV (%). */
  top: { creator: string; share: number } | null;
}

export function creatorTotals(rows: CreatorSessionRow[]): CreatorTotals {
  const by = new Map<string, number>();
  const t: CreatorTotals = { sessions: rows.length, creators: 0, gmv: 0, target: 0, gmvWithTarget: 0, targetSessions: 0, hours: 0, hoursGmv: 0, ads: 0, adsGmv: 0, adsSessions: 0, top: null };
  for (const r of rows) {
    t.gmv += r.gmv;
    if (r.target) {
      t.target += r.target;
      t.gmvWithTarget += r.gmv;
      t.targetSessions++;
    }
    if (r.hours) {
      t.hours += r.hours;
      t.hoursGmv += r.gmv;
    }
    if (r.ads) {
      t.ads += r.ads;
      t.adsGmv += r.gmv;
      t.adsSessions++;
    }
    by.set(r.creator.trim().toLowerCase(), (by.get(r.creator.trim().toLowerCase()) ?? 0) + r.gmv);
  }
  t.creators = by.size;
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && t.gmv > 0) t.top = { creator: rows.find((r) => r.creator.trim().toLowerCase() === best[0])!.creator, share: (best[1] / t.gmv) * 100 };
  return t;
}

/** % target, GMV/giờ, ROAS của bảng creator — mỗi tỷ lệ chỉ trên các phiên có đủ tử lẫn mẫu số. */
export function creatorRates(t: CreatorTotals): { pctTarget: number | null; gmvPerHour: number | null; roas: number | null } {
  return {
    pctTarget: t.target > 0 ? (t.gmvWithTarget / t.target) * 100 : null,
    gmvPerHour: t.hours > 0 ? t.hoursGmv / t.hours : null,
    roas: t.ads > 0 ? t.adsGmv / t.ads : null
  };
}

export interface CreatorPlanRow {
  date: string | null;
  creator: string;
  campName?: string;
  timeline?: string;
  hours: number | null;
  target: number | null;
  requiredGmvPerHour: number | null;
  budgetAds: number | null;
  /** GMV/giờ tốt nhất của creator này trong tháng report (null = chưa có phiên). */
  bestGmvPerHour: number | null;
  /** GMV/giờ mục tiêu ÷ GMV/giờ tốt nhất đã đạt. */
  ratio: number | null;
  note?: string;
}

/** Lịch creator tháng sau (dòng kế hoạch, bỏ phiên huỷ) + so GMV/giờ mục tiêu với GMV/giờ tốt nhất creator đó đã đạt tháng này. */
export function creatorPlanRows(next: AffiliateActualEntry[], doneThisMonth: CreatorSessionRow[]): CreatorPlanRow[] {
  const best = new Map<string, number>();
  for (const r of doneThisMonth) {
    if (r.gmvPerHour == null) continue;
    const k = r.creator.trim().toLowerCase();
    best.set(k, Math.max(best.get(k) ?? 0, r.gmvPerHour));
  }
  return next
    .filter((e) => entryStatus(e) !== "cancelled")
    .map((e) => {
      const hours = planHours(e) ?? null;
      const target = e.targetGmv && e.targetGmv > 0 ? e.targetGmv : null;
      const required = target && hours ? target / hours : null;
      const b = best.get(e.creatorName.trim().toLowerCase()) ?? null;
      return {
        date: parseDayLabel(e.liveDateLabel),
        creator: e.creatorName,
        campName: e.campName,
        timeline: e.planTimelineLabel,
        hours,
        target,
        requiredGmvPerHour: required,
        budgetAds: planBudget(e) ?? null,
        bestGmvPerHour: b,
        ratio: required != null && b ? required / b : null,
        note: e.note
      };
    })
    .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
}
