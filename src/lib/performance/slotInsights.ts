import { BrandMonthPlanSlot, LiveSession } from "../../types";
import { addDays, isoWeekStart } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { CampDayBucket } from "../campaignDays";
import { isCountable, sessionHours } from "./hostPerformance";

// Phân tích cho Dashboard brand (2026-09-28). Toàn hàm thuần, test ở tests/slotInsights.test.ts.
//
// Chỉ những quy tắc QUA BACKTEST walk-forward trên số thật CROCS T6–T9 mới được dùng làm đề xuất:
//   - Khung giờ ngày thường (theo giờ bắt đầu): dùng chỉ số của các tháng trước đoán tháng sau giảm sai
//     số 30%. 11–13h = 0,79 [0,74–0,85] thấp hơn ở 4/4 tháng; 19–20h = 1,09 [1,01–1,20].
//   - Vị trí ngày trong đợt Mid-Month / Pay Day: ngày 1 = 1,38× trung bình đợt (7/7 đợt), ngày 3 = 0,82× (7/7).
//   - Thứ trong tuần TRƯỢT (sai số +8%) và hạng host theo tháng TRƯỢT (Spearman −0,04) — KHÔNG đưa ra
//     lời khuyên kiểu "live nhiều hơn vào thứ X" hay "host A giỏi hơn host B" từ một tháng.
// Mọi con số được tính lại từ dữ liệu mỗi lần; quy tắc nào không còn qua ngưỡng thì tự ẩn (`reliable`).

export type SlotBlock = "A" | "B" | "C" | "D" | "E";
export const SLOT_BLOCKS: SlotBlock[] = ["A", "B", "C", "D", "E"];
export const SLOT_BLOCK_LABEL: Record<SlotBlock, string> = {
  A: "Bắt đầu 8–10h",
  B: "Bắt đầu 11–13h",
  C: "Bắt đầu 14–18h",
  D: "Bắt đầu 19–20h",
  E: "Bắt đầu 21h+"
};

export function slotBlock(startTime: string): SlotBlock {
  const h = Number((startTime || "00:00").slice(0, 2));
  return h <= 10 ? "A" : h <= 13 ? "B" : h <= 18 ? "C" : h <= 20 ? "D" : "E";
}

type BucketOf = (date: string) => CampDayBucket;
const valid = (s: LiveSession) => isCountable(s) && (s.actualGmv ?? 0) > 0 && sessionHours(s) > 0.5;

// ---------------------------------------------------------------------------
// Khung giờ
// ---------------------------------------------------------------------------

export interface SlotIndexRow {
  block: SlotBlock;
  /** GMV/giờ của khung ÷ GMV/giờ trung bình ngày thường của CÙNG tháng, gộp theo giờ. */
  idx: number;
  lo: number;
  hi: number;
  sessions: number;
  hours: number;
}

function monthBase(xs: LiveSession[]): Map<string, number> {
  const acc = new Map<string, { g: number; h: number }>();
  for (const s of xs) {
    const m = s.date.slice(0, 7);
    const a = acc.get(m) ?? { g: 0, h: 0 };
    a.g += s.actualGmv;
    a.h += sessionHours(s);
    acc.set(m, a);
  }
  return new Map([...acc].map(([m, a]) => [m, a.h > 0 ? a.g / a.h : 0]));
}

/** Bootstrap theo ca với hạt giống cố định — mở lại màn vẫn ra đúng khoảng tin cậy cũ. */
export function slotIndex(sessions: LiveSession[], bucketOf: BucketOf, resamples = 1000): Partial<Record<SlotBlock, SlotIndexRow>> {
  const d = sessions.filter((s) => valid(s) && bucketOf(s.date) === "daily");
  if (d.length === 0) return {};
  const base = monthBase(d);
  const norm = d.map((s) => ({ b: slotBlock(s.startTime), g: s.actualGmv / (base.get(s.date.slice(0, 7)) || 1), h: sessionHours(s) }));
  const idxOf = (xs: typeof norm, k: SlotBlock) => {
    let g = 0, h = 0;
    for (const x of xs) if (x.b === k) { g += x.g; h += x.h; }
    return h > 0 ? g / h : null;
  };
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const out: Partial<Record<SlotBlock, SlotIndexRow>> = {};
  for (const k of SLOT_BLOCKS) {
    const idx = idxOf(norm, k);
    if (idx == null) continue;
    const bs: number[] = [];
    for (let i = 0; i < resamples; i++) {
      const smp = norm.map(() => norm[Math.floor(rnd() * norm.length)]);
      const v = idxOf(smp, k);
      if (v != null) bs.push(v);
    }
    bs.sort((a, b) => a - b);
    const inK = norm.filter((x) => x.b === k);
    out[k] = { block: k, idx, lo: bs[Math.floor(bs.length * 0.05)] ?? idx, hi: bs[Math.floor(bs.length * 0.95)] ?? idx, sessions: inK.length, hours: inK.reduce((a, x) => a + x.h, 0) };
  }
  return out;
}

export interface WalkForward {
  /** 1 − sai số khi dùng chỉ số lịch sử ÷ sai số khi coi mọi nhóm như nhau. Dương = quy tắc có ích. */
  gain: number | null;
  months: number;
}

/** Dùng chỉ số của các tháng TRƯỚC để đoán GMV/giờ từng nhóm của tháng sau (mức nền tháng đã biết). */
export function walkForward(sessions: LiveSession[], bucketOf: BucketOf, keyOf: (s: LiveSession) => string): WalkForward {
  const d = sessions.filter((s) => valid(s) && bucketOf(s.date) === "daily");
  const months = [...new Set(d.map((s) => s.date.slice(0, 7)))].sort();
  const base = monthBase(d);
  let e0 = 0, e1 = 0;
  for (let i = 1; i < months.length; i++) {
    const m = months[i];
    const acc = new Map<string, { g: number; h: number }>();
    for (const s of d) {
      if (months.indexOf(s.date.slice(0, 7)) >= i) continue;
      const a = acc.get(keyOf(s)) ?? { g: 0, h: 0 };
      a.g += s.actualGmv / (base.get(s.date.slice(0, 7)) || 1);
      a.h += sessionHours(s);
      acc.set(keyOf(s), a);
    }
    const cur = new Map<string, { g: number; h: number }>();
    for (const s of d) {
      if (s.date.slice(0, 7) !== m) continue;
      const a = cur.get(keyOf(s)) ?? { g: 0, h: 0 };
      a.g += s.actualGmv;
      a.h += sessionHours(s);
      cur.set(keyOf(s), a);
    }
    const bm = base.get(m) || 0;
    for (const [k, c] of cur) {
      const act = c.g / c.h;
      const hist = acc.get(k);
      const idx = hist && hist.h >= 6 ? hist.g / hist.h : 1;
      e0 += Math.abs(act - bm) * c.h;
      e1 += Math.abs(act - bm * idx) * c.h;
    }
  }
  return { gain: e0 > 0 ? 1 - e1 / e0 : null, months: months.length };
}

/** Khung giờ đủ tin để đề xuất: ≥ 2 tháng, walk-forward có ích, và có ít nhất một khung mà CI không chạm 1. */
export function slotRuleReliable(idx: Partial<Record<SlotBlock, SlotIndexRow>>, wf: WalkForward): boolean {
  return wf.months >= 2 && (wf.gain ?? 0) > 0 && SLOT_BLOCKS.some((k) => idx[k] && (idx[k]!.hi < 1 || idx[k]!.lo > 1));
}

// ---------------------------------------------------------------------------
// Vị trí ngày trong đợt Mid-Month / Pay Day
// ---------------------------------------------------------------------------

export interface CampPosition {
  pos: number; // 0, 1, 2
  idx: number;
  min: number;
  max: number;
  avgHours: number;
  above: number;
  windows: number;
}

export interface CampWindow {
  bucket: "midmonth" | "payday";
  month: string;
  days: { date: string; idx: number; hours: number; gmv: number }[];
}

export function campWindows(sessions: LiveSession[], bucketOf: BucketOf): CampWindow[] {
  const byDay = new Map<string, { b: "midmonth" | "payday"; g: number; h: number }>();
  for (const s of sessions) {
    if (!valid(s)) continue;
    const b = bucketOf(s.date);
    if (b !== "midmonth" && b !== "payday") continue;
    const x = byDay.get(s.date) ?? { b, g: 0, h: 0 };
    x.g += s.actualGmv;
    x.h += sessionHours(s);
    byDay.set(s.date, x);
  }
  const wins = new Map<string, [string, { b: "midmonth" | "payday"; g: number; h: number }][]>();
  for (const e of byDay) {
    const k = `${e[1].b}|${e[0].slice(0, 7)}`;
    wins.set(k, [...(wins.get(k) ?? []), e]);
  }
  const out: CampWindow[] = [];
  for (const [k, arr] of wins) {
    if (arr.length !== 3) continue; // đợt phải đủ 3 ngày có số mới so vị trí được
    arr.sort((a, b) => a[0].localeCompare(b[0]));
    const avg = arr.reduce((a, x) => a + x[1].g, 0) / arr.reduce((a, x) => a + x[1].h, 0);
    const [b, m] = k.split("|");
    out.push({ bucket: b as CampWindow["bucket"], month: m, days: arr.map(([date, v]) => ({ date, idx: v.g / v.h / avg, hours: v.h, gmv: v.g })) });
  }
  return out.sort((a, b) => a.month.localeCompare(b.month) || a.bucket.localeCompare(b.bucket));
}

export function campPositions(wins: CampWindow[]): CampPosition[] | null {
  if (wins.length < 2) return null;
  return [0, 1, 2].map((pos) => {
    const xs = wins.map((w) => w.days[pos]);
    return {
      pos,
      idx: xs.reduce((a, x) => a + x.idx, 0) / xs.length,
      min: Math.min(...xs.map((x) => x.idx)),
      max: Math.max(...xs.map((x) => x.idx)),
      avgHours: xs.reduce((a, x) => a + x.hours, 0) / xs.length,
      above: xs.filter((x) => x.idx > 1).length,
      windows: xs.length
    };
  });
}

/** Đủ tin khi ngày 1 cao hơn trung bình ở MỌI đợt và ngày 3 thấp hơn ở mọi đợt, với ≥ 3 đợt. */
export function campRuleReliable(p: CampPosition[] | null): boolean {
  return !!p && p[0].windows >= 3 && p[0].above === p[0].windows && p[2].above === 0;
}

// ---------------------------------------------------------------------------
// Nhịp theo tuần
// ---------------------------------------------------------------------------

export interface WeekPoint {
  weekStart: string;
  gmv: number;
  hours: number;
  gmvPerHour: number | null;
  /** Tuần đã trọn 7 ngày tính tới ngày cuối có số. */
  full: boolean;
  /** Trung vị GMV/giờ của tối đa 8 tuần trọn trước đó (cần ≥ 4). */
  median8: number | null;
  alert: boolean;
}

/** Cảnh báo khi tuần trọn thấp hơn trung vị 8 tuần trước ≥ 15%, hoặc thấp nhất kể từ khi có ≥ 8 tuần số. */
export const WEEK_ALERT_DROP = 0.15;

export function weeklySeries(sessions: LiveSession[], through: string | null, count = 16): WeekPoint[] {
  if (!through) return [];
  const acc = new Map<string, { g: number; h: number }>();
  for (const s of sessions) {
    if (!isCountable(s) || s.date > through) continue;
    const k = isoWeekStart(s.date);
    const a = acc.get(k) ?? { g: 0, h: 0 };
    a.g += s.actualGmv ?? 0;
    a.h += sessionHours(s);
    acc.set(k, a);
  }
  const all = [...acc.keys()].sort();
  const pts: WeekPoint[] = all.map((k) => {
    const a = acc.get(k)!;
    return { weekStart: k, gmv: a.g, hours: a.h, gmvPerHour: a.h > 0 ? a.g / a.h : null, full: addDays(k, 6) <= through, median8: null, alert: false };
  });
  pts.forEach((p, i) => {
    const prior = pts.slice(Math.max(0, i - 8), i).filter((x) => x.full && x.gmvPerHour != null).map((x) => x.gmvPerHour!).sort((a, b) => a - b);
    p.median8 = prior.length >= 4 ? prior[Math.floor(prior.length / 2)] : null;
    // "Thấp nhất từ trước tới nay" chỉ có nghĩa khi đã có ≥ 8 tuần trọn phía trước.
    const before = pts.slice(0, i).filter((x) => x.full && x.gmvPerHour != null).map((x) => x.gmvPerHour!);
    const everMin = before.length >= 8 ? Math.min(...before) : -Infinity;
    p.alert = p.full && p.gmvPerHour != null && ((p.median8 != null && p.gmvPerHour < p.median8 * (1 - WEEK_ALERT_DROP)) || p.gmvPerHour < everMin);
  });
  return pts.slice(-count);
}

// ---------------------------------------------------------------------------
// Chia target ca trong Kế Hoạch Tháng theo chỉ số khung (user chốt 2026-09-28)
// ---------------------------------------------------------------------------

type SlotLike = Pick<BrandMonthPlanSlot, "date" | "startTime" | "endTime">;

export interface TargetWeightModel {
  /** GMV/giờ từng loại ngày (3 tháng gần nhất). */
  bucketRate: Record<CampDayBucket, number>;
  slot: Partial<Record<SlotBlock, SlotIndexRow>>;
  camp: CampPosition[] | null;
  useSlot: boolean;
  useCamp: boolean;
}

/** Dựng từ lịch sử của brand TRƯỚC tháng đang lập. null = chưa đủ số (ít hơn 2 tháng) — dùng dự báo engine như cũ. */
export function targetWeightModel(sessions: LiveSession[], month: string, bucketOf: BucketOf): TargetWeightModel | null {
  const hist = sessions.filter((s) => valid(s) && s.date < `${month}-01`);
  if (new Set(hist.map((s) => s.date.slice(0, 7))).size < 2) return null;
  const from = addDays(`${month}-01`, -92);
  const recent = hist.filter((s) => s.date >= from);
  const rate = (b: CampDayBucket) => {
    const xs = recent.filter((s) => bucketOf(s.date) === b);
    const h = xs.reduce((a, s) => a + sessionHours(s), 0);
    return h > 0 ? xs.reduce((a, s) => a + s.actualGmv, 0) / h : 0;
  };
  const daily = rate("daily");
  if (daily <= 0) return null;
  const bucketRate = { dday: rate("dday") || daily, midmonth: rate("midmonth") || daily, payday: rate("payday") || daily, daily };
  const slot = slotIndex(hist, bucketOf, 400);
  const camp = campPositions(campWindows(hist, bucketOf));
  return { bucketRate, slot, camp, useSlot: slotRuleReliable(slot, walkForward(hist, bucketOf, (s) => slotBlock(s.startTime))), useCamp: campRuleReliable(camp) };
}

/** Trọng số chia target từng ca: giờ × GMV/giờ loại ngày × chỉ số khung (ngày thường) hoặc vị trí ngày (MM/Pay Day). */
export function targetWeights(slots: SlotLike[], model: TargetWeightModel, bucketOf: BucketOf): number[] {
  const campDays = new Map<string, string[]>();
  for (const s of slots) {
    const b = bucketOf(s.date);
    if (b !== "midmonth" && b !== "payday") continue;
    const l = campDays.get(b) ?? [];
    if (!l.includes(s.date)) l.push(s.date);
    campDays.set(b, l.sort());
  }
  return slots.map((s) => {
    const b = bucketOf(s.date);
    let w = sessionDurationHours(s.startTime, s.endTime) * model.bucketRate[b];
    if (b === "daily" && model.useSlot) w *= model.slot[slotBlock(s.startTime)]?.idx ?? 1;
    if ((b === "midmonth" || b === "payday") && model.useCamp && model.camp) {
      const pos = (campDays.get(b) ?? []).indexOf(s.date);
      w *= model.camp[Math.min(Math.max(pos, 0), 2)].idx;
    }
    return w;
  });
}

// ---------------------------------------------------------------------------
// Soát kế hoạch tháng sau (chỉ cảnh báo, không ghi)
// ---------------------------------------------------------------------------

export interface PlanCheck {
  target: number;
  hours: number;
  slots: number;
  needPerHour: number | null;
  /** GMV/giờ 28 ngày gần nhất tới ngày cuối có số. */
  recentPerHour: number | null;
  /** GMV dự kiến nếu năng suất như 28 ngày gần nhất (theo loại ngày × chỉ số khung/vị trí ngày). */
  expectedAtRecent: number | null;
  /** Đợt MM/Pay Day có target ngày 1 thấp hơn ngày 3 — ngược lịch sử. */
  invertedCamps: { bucket: "midmonth" | "payday"; day1: number; day3: number }[];
  weakHours: number; // giờ ngày thường ở khung 11–13h
  strongHours: number; // giờ ngày thường ở khung 19–20h
}

export function planCheck(plan: Pick<BrandMonthPlanSlot, "date" | "startTime" | "endTime" | "targetGmv">[], sessions: LiveSession[], through: string | null, bucketOf: BucketOf, model: TargetWeightModel | null): PlanCheck | null {
  if (plan.length === 0) return null;
  const hours = plan.reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
  const target = plan.reduce((a, s) => a + (s.targetGmv || 0), 0);
  let recentPerHour: number | null = null;
  let expectedAtRecent: number | null = null;
  if (through) {
    const from = addDays(through, -27);
    const recent = sessions.filter((s) => valid(s) && s.date >= from && s.date <= through);
    const h = recent.reduce((a, s) => a + sessionHours(s), 0);
    recentPerHour = h > 0 ? recent.reduce((a, s) => a + s.actualGmv, 0) / h : null;
    if (model && recentPerHour) {
      const rate = (camp: boolean) => {
        const xs = recent.filter((s) => (bucketOf(s.date) === "daily") !== camp);
        const hh = xs.reduce((a, s) => a + sessionHours(s), 0);
        return hh > 0 ? xs.reduce((a, s) => a + s.actualGmv, 0) / hh : recentPerHour!;
      };
      const m = { ...model, bucketRate: { daily: rate(false), dday: rate(true), midmonth: rate(true), payday: rate(true) } };
      expectedAtRecent = targetWeights(plan, m, bucketOf).reduce((a, w) => a + w, 0);
    }
  }
  const invertedCamps: PlanCheck["invertedCamps"] = [];
  for (const b of ["midmonth", "payday"] as const) {
    const ds = [...new Set(plan.filter((s) => bucketOf(s.date) === b).map((s) => s.date))].sort();
    if (ds.length < 3) continue;
    const t = (d: string) => plan.filter((s) => s.date === d).reduce((a, s) => a + (s.targetGmv || 0), 0);
    if (t(ds[0]) < t(ds[2])) invertedCamps.push({ bucket: b, day1: t(ds[0]), day3: t(ds[2]) });
  }
  const dailyHours = (k: SlotBlock) => plan.filter((s) => bucketOf(s.date) === "daily" && slotBlock(s.startTime) === k).reduce((a, s) => a + sessionDurationHours(s.startTime, s.endTime), 0);
  return {
    target,
    hours,
    slots: plan.length,
    needPerHour: hours > 0 && target > 0 ? target / hours : null,
    recentPerHour,
    expectedAtRecent,
    invertedCamps,
    weakHours: dailyHours("B"),
    strongHours: dailyHours("D")
  };
}
