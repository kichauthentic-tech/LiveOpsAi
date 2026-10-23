import type { LiveSession } from "../../types";
import { addDays } from "../dateUtils";
import { sessionWindowMs } from "../sessionStatus";
import { segmentsOfRole } from "../staffSegments";
import { brandPlatformKey, platformOf } from "../reportPlatform";
import { hostPortions, isCountable, sessionHours } from "./hostPerformance";
import { assertOnePlatform } from "../platforms/perf";

// So cùng kỳ cho Dashboard (demo duyệt 22/10/2026): MỘT bộ chọn kỳ trên thanh trên cùng, mọi con số tự so với kỳ so sánh.
// File thuần, không đụng Supabase. Luật đã chốt qua audit demo 22/10:
//   - Kỳ nào cũng cắt ở NGÀY ĐỦ SỐ của sàn (channelHealth.dataCoverage) — không ở hôm nay, không ở ngày cuối có số bất kỳ.
//   - "Tháng này" so cùng các ngày của tháng trước; "7 ngày" so khoảng ngay trước, cùng độ dài.
//   - 23/10 (audit trùng màn): Dashboard chỉ xem TRONG tháng — bỏ kỳ "Tháng trước" + "Tự chọn"; số một tháng đã hết chỉ ở Report Tháng.
//   - Một bên dưới WEAK_SESSIONS ca ⇒ mũi tên xám (chưa kết luận).
//   - Chỉ số của người / khung giờ / độ dài ca = Σ(GMV ca ÷ GMV/giờ của CHÍNH kênh đó) ÷ Σ giờ × 100. Chia cho trung bình sàn thì
//     cơ cấu brand giả ra chênh lệch (CROCS ~20M/giờ, VERA ~1,7M/giờ: ca dài toàn rơi vào CROCS ⇒ 25 vs 144).
//   - Lên sóng lệch quá LATE_MAX_MIN phút gần như luôn là giờ xếp ghi sai ⇒ không tính vào % trễ, đếm riêng.
//   - Host tính GMV chỉ ở ca người đó làm HOST; trợ live chỉ tính ca và giờ (không chịu trách nhiệm GMV).

export type PeriodKey = "month" | "7d";
export type CompareMode = "auto" | "mom" | "prev";

export const WEAK_SESSIONS = 5;
export const LATE_MIN = 5;
export const LATE_MAX_MIN = 180;
export interface ResolvedPeriod {
  key: PeriodKey;
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  /** Cách so đã áp dụng (auto đã giải). */
  mode: "mom" | "prev";
  /** Kỳ so sánh rơi trước ngày có dữ liệu đầu tiên ⇒ không so. */
  noBase: boolean;
  /** Tháng đang chạy — chỉ kỳ này có run-rate, dự báo, 4 nút xem. */
  isCurrentMonth: boolean;
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const spanDays = (a: string, b: string) => dayDiff(a, b) + 1;

/** Cùng ngày ở tháng lệch `k` (ngày 31 → ngày cuối của tháng ngắn hơn). */
export function shiftMonth(d: string, k: number): string {
  const y = Number(d.slice(0, 4)), m = Number(d.slice(5, 7)) - 1 + k;
  const first = new Date(Date.UTC(y, m, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(Number(d.slice(8, 10)), last))).toISOString().slice(0, 10);
}

/**
 * `completeEnd` = ngày đủ số của sàn (null = chưa có ngày nào đủ ⇒ dùng `today`). `first` = ngày đầu có dữ liệu của app
 * (kỳ so sánh trước mốc này thì không so).
 */
export function resolvePeriod(x: { key: PeriodKey; mode: CompareMode; completeEnd: string | null; today: string; first?: string }): ResolvedPeriod {
  const E = x.completeEnd ?? x.today;
  const b = E;
  const a = x.key === "month" ? `${E.slice(0, 7)}-01` : addDays(E, -6);
  const mode = x.mode === "auto" ? (x.key === "month" ? "mom" : "prev") : x.mode;
  let ca: string, cb: string;
  if (mode === "mom") { ca = shiftMonth(a, -1); cb = shiftMonth(b, -1); }
  else { cb = addDays(a, -1); ca = addDays(cb, -(spanDays(a, b) - 1)); }
  const noBase = !!x.first && cb < x.first;
  if (x.first && ca < x.first) ca = x.first;
  return { key: x.key, start: a, end: b, prevStart: ca, prevEnd: cb, mode, noBase, isCurrentMonth: x.key === "month" };
}

// ---------------------------------------------------------------------------
// Cộng số một khoảng
// ---------------------------------------------------------------------------

/** Ca đã chạy trong khoảng [a, b] (gồm cả ca chưa có số — giờ vẫn là giờ đã làm). */
export const ranIn = (sessions: LiveSession[], a: string, b: string) => sessions.filter((s) => s.status === "Completed" && s.date >= a && s.date <= b);

/** Phút lên sóng trễ so với giờ xếp (âm = sớm). null = chưa có giờ lên sóng thật. */
export function lateMinutes(s: LiveSession): number | null {
  if (!s.actualStartAt) return null;
  const ms = Date.parse(s.actualStartAt);
  if (!Number.isFinite(ms)) return null;
  return Math.round((ms - sessionWindowMs(s)[0]) / 60000);
}

export interface PeriodAgg {
  /** Ca đã chạy. */
  n: number;
  /** Ca đã chạy mà chưa có số. */
  noData: number;
  gmv: number;
  /** Giờ của mọi ca đã chạy. */
  hours: number;
  /** Giờ của ca có số — mẫu số của GMV/giờ. */
  hoursWithData: number;
  orders: number;
  views: number;
  /** Người có ca (host + trợ live). */
  people: number;
  gph: number | null;
  /** CVR = Orders ÷ Views (0..1). */
  cvr: number | null;
  aov: number | null;
  hoursPerShift: number | null;
  /** Ca có giờ lên sóng thật trong ngưỡng hợp lệ. */
  lateMeasured: number;
  late: number;
  /** Ca lệch quá LATE_MAX_MIN phút — giờ xếp ghi sai, không vào %. */
  lateOdd: number;
  lateRate: number | null;
  lateAvgMin: number | null;
}

export function aggregate(ran: LiveSession[]): PeriodAgg {
  assertOnePlatform(ran, "periodCompare.aggregate");
  const got = ran.filter(isCountable);
  const gmv = got.reduce((a, s) => a + (s.actualGmv || 0), 0);
  const hoursWithData = got.reduce((a, s) => a + sessionHours(s), 0);
  const hours = ran.reduce((a, s) => a + sessionHours(s), 0);
  const orders = got.reduce((a, s) => a + (s.totalOrders || 0), 0);
  const views = got.reduce((a, s) => a + (s.totalViews || 0), 0);
  const people = new Set<string>();
  for (const s of ran) for (const role of ["host", "co_host"] as const) for (const g of segmentsOfRole(s, role)) people.add(g.talentId);
  const lates = ran.map(lateMinutes).filter((m): m is number => m != null);
  const ok = lates.filter((m) => m <= LATE_MAX_MIN);
  const late = ok.filter((m) => m > LATE_MIN);
  return {
    n: ran.length,
    noData: ran.length - got.length,
    gmv,
    hours,
    hoursWithData,
    orders,
    views,
    people: people.size,
    gph: hoursWithData > 0 ? gmv / hoursWithData : null,
    cvr: views > 0 ? orders / views : null,
    aov: orders > 0 ? gmv / orders : null,
    hoursPerShift: ran.length > 0 ? hours / ran.length : null,
    lateMeasured: ok.length,
    late: late.length,
    lateOdd: lates.length - ok.length,
    lateRate: ok.length > 0 ? late.length / ok.length : null,
    lateAvgMin: late.length > 0 ? late.reduce((a, m) => a + m, 0) / late.length : null
  };
}

/** Một bên dưới WEAK_SESSIONS ca (hoặc không có kỳ so sánh) ⇒ chưa kết luận tăng/giảm. */
export const isWeak = (cur: { n: number } | null, prev: { n: number } | null) => !cur || !prev || cur.n < WEAK_SESSIONS || prev.n < WEAK_SESSIONS;

/** Đổi tương đối; null khi một bên thiếu. */
export const relChange = (cur: number | null | undefined, prev: number | null | undefined) =>
  cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || prev === 0 ? null : cur / prev - 1;

// ---------------------------------------------------------------------------
// Chỉ số so với chính kênh (100 = bằng GMV/giờ trung bình của kênh trong cùng khoảng)
// ---------------------------------------------------------------------------

export const channelKeyOf = (s: Pick<LiveSession, "brandId" | "platform">) => brandPlatformKey(s.brandId, platformOf(s));

/** GMV/giờ trung bình của từng kênh trong các ca đưa vào (chỉ ca có số). */
export function channelGph(sessions: LiveSession[]): Map<string, number> {
  const acc = new Map<string, [number, number]>();
  for (const s of sessions) {
    if (!isCountable(s)) continue;
    const k = channelKeyOf(s);
    const o = acc.get(k) ?? [0, 0];
    o[0] += s.actualGmv || 0;
    o[1] += sessionHours(s);
    acc.set(k, o);
  }
  const out = new Map<string, number>();
  for (const [k, [g, h]] of acc) if (h > 0) out.set(k, g / h);
  return out;
}

export interface IndexCell {
  /** Ca có số trong nhóm. */
  n: number;
  hours: number;
  gmv: number;
  /** 100 = bằng kênh. */
  index: number;
  gph: number | null;
}

/**
 * Gom ca có số theo nhóm `keyOf`, chỉ số của nhóm = Σ(GMV ca ÷ GMV/giờ kênh của ca) ÷ Σ giờ × 100. `base` tính trên CHÍNH các ca
 * của khoảng đó (truyền vào để nhiều cách gom dùng chung một mốc).
 */
export function indexBy<K>(sessions: LiveSession[], keyOf: (s: LiveSession) => K | null, base = channelGph(sessions)): Map<K, IndexCell> {
  const acc = new Map<K, { n: number; h: number; g: number; w: number }>();
  for (const s of sessions) {
    if (!isCountable(s)) continue;
    const b = base.get(channelKeyOf(s));
    const h = sessionHours(s);
    if (!b || !h) continue;
    const k = keyOf(s);
    if (k == null) continue;
    const o = acc.get(k) ?? { n: 0, h: 0, g: 0, w: 0 };
    o.n++; o.h += h; o.g += s.actualGmv || 0; o.w += (s.actualGmv || 0) / b;
    acc.set(k, o);
  }
  const out = new Map<K, IndexCell>();
  for (const [k, o] of acc) out.set(k, { n: o.n, hours: o.h, gmv: o.g, index: Math.round((o.w / o.h) * 100), gph: o.h ? o.g / o.h : null });
  return out;
}

// ---------------------------------------------------------------------------
// Đội live: host (GMV) và trợ live (giờ)
// ---------------------------------------------------------------------------

export interface HostRow extends IndexCell {
  id: string;
  name: string;
  /** Kênh (brandId) người này làm host trong khoảng. */
  brandIds: string[];
}

const personKey = (id: string | undefined, name: string | undefined) => id || (name ? `ten:${name}` : null);

/** Host — GMV chỉ ở ca người đó làm host; ca đổi host giữa chừng chia theo giờ đứng (hostPortions). */
export function hostRows(ran: LiveSession[]): HostRow[] {
  const parts = ran.filter(isCountable).flatMap(hostPortions);
  const base = channelGph(ran);
  const names = new Map<string, { name: string; brands: Set<string> }>();
  const cells = indexBy(parts, (s) => {
    const k = personKey(s.hostId, s.hostName);
    if (!k) return null;
    const o = names.get(k) ?? { name: s.hostName || "", brands: new Set<string>() };
    o.brands.add(s.brandId);
    if (!o.name && s.hostName) o.name = s.hostName;
    names.set(k, o);
    return k;
  }, base);
  return [...cells].map(([id, c]) => ({ ...c, id, name: names.get(id)?.name || "Chưa gán tên", brandIds: [...(names.get(id)?.brands ?? [])] })).sort((a, b) => b.hours - a.hours);
}

export interface CoRow {
  id: string;
  name: string;
  /** Ca có mặt (đã chạy, có số hay chưa). */
  n: number;
  hours: number;
  brandIds: string[];
}

/** Trợ live — chỉ ca và giờ (tính cả ca chưa có số: giờ vẫn là giờ làm). Ca đổi trợ giữa chừng tính đúng phút từng người. */
export function coRows(ran: LiveSession[]): CoRow[] {
  const acc = new Map<string, CoRow & { b: Set<string> }>();
  for (const s of ran) {
    const total = sessionHours(s);
    const segs = segmentsOfRole(s, "co_host");
    const mins = segs.reduce((a, g) => a + (g.toMin - g.fromMin), 0);
    for (const g of segs) {
      const o = acc.get(g.talentId) ?? { id: g.talentId, name: g.talentName, n: 0, hours: 0, brandIds: [], b: new Set<string>() };
      o.n++;
      o.hours += mins > 0 ? (total * (g.toMin - g.fromMin)) / mins : 0;
      o.b.add(s.brandId);
      if (!o.name && g.talentName) o.name = g.talentName;
      acc.set(g.talentId, o);
    }
  }
  return [...acc.values()].map(({ b, ...r }) => ({ ...r, brandIds: [...b] })).sort((a, b) => b.hours - a.hours);
}

/** Cặp host + trợ live chạy chung (ca không đổi người giữa chừng) — chỉ số so với chính kênh, như host. */
export function pairRows(ran: LiveSession[]): (IndexCell & { id: string; name: string; brandIds: string[] })[] {
  const base = channelGph(ran);
  const meta = new Map<string, { name: string; brands: Set<string> }>();
  const cells = indexBy(ran, (s) => {
    const h = segmentsOfRole(s, "host"), c = segmentsOfRole(s, "co_host");
    if (h.length !== 1 || c.length !== 1) return null;
    const k = `${h[0].talentId}|${c[0].talentId}`;
    const o = meta.get(k) ?? { name: `${h[0].talentName || "?"} + ${c[0].talentName || "?"}`, brands: new Set<string>() };
    o.brands.add(s.brandId);
    meta.set(k, o);
    return k;
  }, base);
  return [...cells].map(([id, c]) => ({ ...c, id, name: meta.get(id)!.name, brandIds: [...meta.get(id)!.brands] })).sort((a, b) => b.hours - a.hours);
}

// ---------------------------------------------------------------------------
// Cách xếp ca: khung giờ bắt đầu, độ dài ca, lưới thứ × giờ
// ---------------------------------------------------------------------------

export const SLOT_BLOCKS: [number, number][] = [[0, 10], [10, 12], [12, 14], [14, 16], [16, 18], [18, 20], [20, 22], [22, 24]];
export const slotLabel = ([a, b]: [number, number]) => (a === 0 ? "Trước 10h" : b === 24 ? "Từ 22h" : `${String(a).padStart(2, "0")}–${b}h`);
const startHour = (s: LiveSession) => Number(s.startTime.slice(0, 2));
export const slotOf = (s: LiveSession) => SLOT_BLOCKS.findIndex(([a, b]) => startHour(s) >= a && startHour(s) < b);

export const SHIFT_LEN_LABELS = ["Dưới 2,5 giờ", "2,5–3,5 giờ", "3,5–4,5 giờ", "Từ 4,5 giờ"];
/** Độ dài theo giờ XẾP (không theo giờ live thật — ca bị ngắt không đổi nhóm). */
export function shiftLenOf(s: LiveSession): number {
  const [a, b] = sessionWindowMs(s);
  const m = (b - a) / 60000;
  return m < 150 ? 0 : m < 210 ? 1 : m < 270 ? 2 : 3;
}

/** Thứ (0 = Thứ 2) × khung 2 giờ theo giờ bắt đầu. */
export const heatKeyOf = (s: LiveSession) => `${(new Date(`${s.date}T00:00:00Z`).getUTCDay() + 6) % 7}|${Math.floor(startHour(s) / 2)}`;
