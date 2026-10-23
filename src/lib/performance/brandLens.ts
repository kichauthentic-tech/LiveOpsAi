import type { LiveSession } from "../../types";
import { addDays } from "../dateUtils";
import { resolveCampBucketType, type CampDayBucket } from "../campaignDays";
import { isCountable } from "./hostPerformance";
import { monthEndOf } from "./ceoBrief";
import { WAVE_NAME } from "./channelHealth";
import { shiftMonth } from "./periodCompare";
import type { AccountRunRate, RRDay } from "./runRateUpdate";

// Bốn nút xem của tab Brand (Tháng · Đợt campaign · Ngày · Ca — demo duyệt 22/10/2026). File thuần.
//
// 1. Bảng tuần / bảng loại ngày cộng lại ĐÚNG bằng dòng "Cả tháng tới nay" và target tháng. Ca kế hoạch cộng lại có thể thấp hơn
//    target tháng (CROCS T10: 5,11B vs 5,15B — phần target chưa xếp vào ca), nên trước đây tuần cộng lại không khớp đồng hồ. Phần
//    chưa xếp chia theo tỷ lệ target từng ngày (`scaledDays`).
// 2. Key Metrics + đội live + khung giờ đi theo nút đang chọn, cắt ở ca mới nhất có số (asOf của run-rate) — để GMV ở Key Metrics
//    khớp "Đã đạt" ngay trên. So với: tháng/tuần → cùng ngày tháng trước; đợt → cùng loại ngày tháng trước; ngày → trung bình các
//    ngày cùng loại tháng trước; ca → các ca cùng giờ bắt đầu tháng trước (dưới 3 ca có số thì lấy cùng buổi).

export type Lens = "month" | "wave" | "day" | "shift";

export interface ScaledDay extends RRDay {
  /** Target của ngày sau khi chia phần target tháng chưa xếp vào ca. */
  targetFull: number;
  /** Mẫu số run-rate của ngày (đã vào run-rate), chia tương tự để cộng đúng kỳ vọng tới nay. */
  expectedFull: number;
}

export function scaledDays(r: AccountRunRate): ScaledDay[] {
  const sumT = r.days.reduce((a, d) => a + d.target, 0);
  const sumE = r.days.filter((d) => d.counted).reduce((a, d) => a + d.expected, 0);
  const kT = sumT > 0 && r.total.target > 0 ? r.total.target / sumT : 1;
  const kE = sumE > 0 && r.total.targetToDate > 0 ? r.total.targetToDate / sumE : 1;
  return r.days.map((d) => ({ ...d, targetFull: d.target * kT, expectedFull: d.counted ? d.expected * kE : 0 }));
}

export interface LensRow {
  id: string;
  name: string;
  /** "05–11/10" hoặc danh sách ngày. */
  when: string;
  status: "done" | "live" | "next";
  actual: number;
  targetToDate: number;
  target: number;
  runRate: number | null;
  days: string[];
}

const dm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const span = (ds: string[]) => {
  const out: [string, string][] = [];
  for (const d of [...ds].sort()) {
    const l = out[out.length - 1];
    if (l && addDays(l[1], 1) === d) l[1] = d;
    else out.push([d, d]);
  }
  return out.map(([a, b]) => (a === b ? dm(a) : `${a.slice(8, 10)}–${dm(b)}`)).join(", ");
};

function rowOf(id: string, name: string, xs: ScaledDay[], asOf: string | null, when?: string): LensRow {
  const counted = xs.filter((d) => d.counted);
  const actual = counted.reduce((a, d) => a + d.actual, 0);
  const tt = counted.reduce((a, d) => a + d.expectedFull, 0);
  const last = xs[xs.length - 1]?.date ?? "", first = xs[0]?.date ?? "";
  const status = asOf && last <= asOf ? "done" : asOf && first <= asOf ? "live" : "next";
  return { id, name, when: when ?? span(xs.map((d) => d.date)), status, actual, targetToDate: tt, target: xs.reduce((a, d) => a + d.targetFull, 0), runRate: tt > 0 ? actual / tt : null, days: xs.map((d) => d.date) };
}

/** Tuần cố định trong tháng (01–04, 05–11, … theo thứ Hai) + dòng "Cả tháng tới nay". */
export function weekRows(r: AccountRunRate): { rows: LensRow[]; total: LensRow } {
  const days = scaledDays(r);
  const groups: ScaledDay[][] = [];
  for (const d of days) {
    const monday = (new Date(`${d.date}T00:00:00Z`).getUTCDay() + 6) % 7 === 0;
    if (!groups.length || monday) groups.push([]);
    groups[groups.length - 1].push(d);
  }
  const rows = groups.map((g, i) => rowOf(`${g[0].date}_${g[g.length - 1].date}`, `Tuần ${i + 1}`, g, r.asOf, `${g[0].date.slice(8, 10)}–${dm(g[g.length - 1].date)}`));
  return { rows, total: totalRow(r) };
}

const BUCKETS: CampDayBucket[] = ["dday", "midmonth", "payday", "daily"];

/** Theo loại ngày camp (khung camp của kênh — `r.days[].bucket`) + dòng "Cả tháng tới nay". */
export function waveRows(r: AccountRunRate): { rows: (LensRow & { bucket: CampDayBucket; daysPassed: number })[]; total: LensRow } {
  const days = scaledDays(r);
  const rows = BUCKETS.map((b) => {
    const xs = days.filter((d) => d.bucket === b);
    if (!xs.length) return null;
    const passed = xs.filter((d) => r.asOf && d.date <= r.asOf).length;
    const when = b === "daily" ? `${xs.length} ngày · đã qua ${passed}` : undefined;
    return { ...rowOf(b, b === "daily" ? "Daily" : WAVE_NAME[b], xs, r.asOf, when), bucket: b, daysPassed: passed };
  }).filter((x): x is LensRow & { bucket: CampDayBucket; daysPassed: number } => !!x);
  return { rows, total: totalRow(r) };
}

function totalRow(r: AccountRunRate): LensRow {
  const t = r.total;
  return {
    id: "",
    name: "Cả tháng tới nay",
    when: r.asOf ? `01–${dm(r.asOf)}` : "",
    status: "live",
    actual: t.actual,
    targetToDate: t.targetToDate,
    target: t.target,
    runRate: t.runRate,
    days: r.days.filter((d) => d.counted).map((d) => d.date)
  };
}

// ---------------------------------------------------------------------------
// Phạm vi ca của Key Metrics / đội live / khung giờ theo nút đang chọn
// ---------------------------------------------------------------------------

export interface LensPick {
  lens: Lens;
  /** Tuần đang chọn ở nút Tháng (id của LensRow), null = cả tháng. */
  week: string | null;
  wave: CampDayBucket;
  day: string | null;
  /** Ca đang chọn (id ca) ở nút Ca. */
  shiftId: string | null;
}

export interface LensScope {
  /** Nhãn "theo: …". */
  by: string;
  label: string;
  baseLabel: string;
  cur: LiveSession[];
  base: LiveSession[];
  /** Đơn vị quy chỉ số khối lượng khi hai vế khác số ngày/ca ("ngày", "ca"); null = không quy. */
  unit: "ngày" | "ca" | null;
  /** Đợt: dùng cho đội live / khung giờ. */
  wave?: CampDayBucket;
}

const buoi = (t: string) => { const h = Number(t.slice(0, 2)); return h < 12 ? "sáng" : h < 18 ? "chiều" : "tối"; };
const rangeLbl = (a: string, b: string) => (a === b ? dm(a) : `${a.slice(8, 10)}–${dm(b)}`);

/**
 * `sessions` = ca đã chạy của KÊNH (một brand × một sàn). `bucketOf` = khung camp của kênh tháng này (thẻ kênh); tháng trước dùng lịch
 * chuẩn (`resolveCampBucketType`). `asOf` = ca mới nhất có số của run-rate.
 */
export function lensScope(x: { sessions: LiveSession[]; month: string; asOf: string; pick: LensPick; bucketOf: (d: string) => CampDayBucket; weeks: LensRow[] }): LensScope {
  const { sessions, month, asOf, pick, bucketOf } = x;
  const inR = (a: string, b: string) => sessions.filter((s) => s.date >= a && s.date <= b);
  const m1 = `${month}-01`;
  const pa = shiftMonth(m1, -1), pb = monthEndOf(pa), pmon = `tháng ${Number(pa.slice(5, 7))}`;
  if (pick.lens === "month") {
    const w = pick.week ? x.weeks.find((r) => r.id === pick.week) : null;
    if (w) {
      const a = w.days[0], b0 = w.days[w.days.length - 1], b = b0 > asOf ? asOf : b0;
      return { by: `Tháng · tuần ${rangeLbl(a, b0)}`, label: `tuần ${rangeLbl(a, b)}${b < b0 ? ` (đang chạy, tới ${dm(b)})` : ""}`, baseLabel: `cùng ngày tháng trước ${rangeLbl(shiftMonth(a, -1), shiftMonth(b, -1))}`, cur: inR(a, b), base: inR(shiftMonth(a, -1), shiftMonth(b, -1)), unit: null };
    }
    return { by: "Tháng", label: rangeLbl(m1, asOf), baseLabel: `cùng ngày tháng trước ${rangeLbl(pa, shiftMonth(asOf, -1))}`, cur: inR(m1, asOf), base: inR(pa, shiftMonth(asOf, -1)), unit: null };
  }
  if (pick.lens === "wave") {
    const w = pick.wave, name = w === "daily" ? "ngày Daily" : WAVE_NAME[w];
    const cur = inR(m1, asOf).filter((s) => bucketOf(s.date) === w), base = inR(pa, pb).filter((s) => resolveCampBucketType(s.date) === w);
    const nd = (xs: LiveSession[]) => new Set(xs.map((s) => s.date)).size;
    const list = (xs: LiveSession[]) => span([...new Set(xs.map((s) => s.date))]);
    return {
      by: `Đợt campaign · ${w === "daily" ? "Daily" : WAVE_NAME[w]}`,
      label: cur.length ? (w === "daily" ? `${nd(cur)} ngày Daily đến ${dm(asOf)}` : `${WAVE_NAME[w]} ${list(cur)}`) : `${w === "daily" ? "Ngày Daily" : WAVE_NAME[w]} tháng này chưa tới`,
      baseLabel: base.length ? (w === "daily" ? `${nd(base)} ngày Daily ${pmon}` : `${WAVE_NAME[w]} ${list(base)}`) : `${pmon} không có ${name}`,
      cur, base, unit: "ngày", wave: w
    };
  }
  const d = pick.day ?? asOf, t = bucketOf(d);
  if (pick.lens === "day") {
    const base = inR(pa, pb).filter((s) => resolveCampBucketType(s.date) === t);
    const tName = t === "daily" ? "Daily" : WAVE_NAME[t];
    return { by: `Ngày · ${dm(d)}`, label: `ngày ${dm(d)} (${tName})`, baseLabel: `trung bình ${new Set(base.filter(isCountable).map((s) => s.date)).size} ngày ${tName} ${pmon}`, cur: inR(d, d), base, unit: "ngày" };
  }
  const day = inR(d, d);
  const sh = day.find((s) => s.id === pick.shiftId) ?? day.find(isCountable) ?? day[0];
  const st = sh?.startTime.slice(0, 5) ?? "";
  let base = inR(pa, pb).filter((s) => s.startTime.slice(0, 5) === st), baseLabel = `trung bình ${base.length} ca ${st} ${pmon}`;
  if (base.filter(isCountable).length < 3) {
    base = inR(pa, pb).filter((s) => buoi(s.startTime) === buoi(st));
    baseLabel = base.length ? `trung bình ${base.length} ca buổi ${buoi(st)} ${pmon} (ít ca ${st} quá để so)` : `${pmon} không có ca buổi ${buoi(st)}`;
  }
  return { by: `Ca · ${st} ${dm(d)}`, label: `ca ${st} ngày ${dm(d)}`, baseLabel, cur: sh ? [sh] : [], base, unit: "ca" };
}
