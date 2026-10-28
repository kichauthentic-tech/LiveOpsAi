import type { CampDayBucket } from "../campaignDays";
import type { ControlRow } from "./deepAnalysis";
import type { KeyMetricKey } from "./keyMetrics";
import { keyMetricsTable, type KeyMetricsMonth, type KeyMetricsTab, type ScoreRow } from "./brandReport";
import type { ChangeTone } from "./brandReport";
import type { PlanRunRateSlot } from "../performance/planRunRate";

// Số liệu thuần cho các biểu đồ/bảng GĐ2 của Report Tháng (cầu GMV, GMV/giờ kế hoạch, bảng dọc theo loại ngày, scatter SKU, cặp host).
// Không import React — test được bằng vitest.

export interface BridgePoint {
  label: string;
  base: number;
  value: number;
  kind: "total" | "up" | "down";
  display: number;
}

/** Dựng cầu từ điểm đầu → các bước chênh lệch → điểm cuối (đầu + Σ bước = cuối; bước lệch do làm tròn được dồn vào bước cuối). */
export function bridgePoints(startLabel: string, start: number, steps: { label: string; delta: number }[], endLabel: string, end: number): BridgePoint[] {
  const out: BridgePoint[] = [{ label: startLabel, base: 0, value: start, kind: "total", display: start }];
  let run = start;
  for (const s of steps) {
    const next = run + s.delta;
    out.push({ label: s.label, base: Math.min(run, next), value: Math.abs(s.delta), kind: s.delta >= 0 ? "up" : "down", display: s.delta });
    run = next;
  }
  out.push({ label: endLabel, base: 0, value: end, kind: "total", display: end });
  return out;
}

const DAY_ORDER: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];

/** Cầu: Target tới nay → (thực tế − Target tới nay) của từng loại ngày → LIVE GMV thực tế. Phần không thuộc loại ngày nào (ca ngoài lịch) thành bước "Ngoài lịch". */
export function targetBridge(rows: ScoreRow[], labelOf: (k: CampDayBucket) => string): { start: number; end: number; steps: { label: string; delta: number }[] } | null {
  const all = rows.find((r) => r.key === "all");
  if (!all) return null;
  const start = all.targetToDate ?? all.target;
  if (!start || start <= 0) return null;
  const steps: { label: string; delta: number }[] = [];
  let sum = 0;
  for (const k of DAY_ORDER) {
    const r = rows.find((x) => x.key === k);
    const base = r ? r.targetToDate ?? r.target : null;
    if (!r || base == null) continue;
    steps.push({ label: labelOf(k), delta: r.actual - base });
    sum += r.actual - base;
  }
  const rest = all.actual - start - sum;
  if (Math.abs(rest) >= 1_000_000) steps.push({ label: "Ngoài lịch", delta: rest });
  return { start, end: all.actual, steps };
}

export interface PlanHourRow {
  key: CampDayBucket;
  planGmvPerHour: number | null;
  actualGmvPerHour: number | null;
  planHours: number;
  /** Target GMV cả tháng của loại ngày (ca không huỷ) và tỷ trọng trên tổng. */
  planTarget: number;
  share: number;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const slotHours = (a: string, b: string) => {
  const d = toMin(b) - toMin(a);
  return (d <= 0 ? d + 1440 : d) / 60;
};

/** GMV/giờ kế hoạch = Target tới nay ÷ Giờ live kế hoạch (cùng các ca tới nay), theo loại ngày. Ca đã huỷ không tính. */
export function planHourRows(slots: PlanRunRateSlot[], _through: string | null, actual: Partial<Record<CampDayBucket, number | null>>): PlanHourRow[] {
  const live = slots.filter((s) => s.state !== "cancelled");
  const total = live.reduce((a, s) => a + s.target, 0);
  return DAY_ORDER.map((k) => {
    const mine = live.filter((s) => s.bucket === k);
    const target = mine.reduce((a, s) => a + s.target, 0);
    const hours = mine.reduce((a, s) => a + slotHours(s.planSlot.startTime, s.planSlot.endTime), 0);
    return { key: k, planGmvPerHour: hours > 0 && target > 0 ? target / hours : null, actualGmvPerHour: actual[k] ?? null, planHours: hours, planTarget: target, share: total > 0 ? target / total : 0 };
  });
}

export interface LogBridge {
  from: number;
  to: number;
  parts: { key: "visitors" | "cvr" | "aov"; change: number; value: number }[];
}

/** Total GMV = lượt truy cập × CVR × giá trị đơn. Giá trị đơn suy ra (GMV ÷ đơn) nên 3 phần cộng đúng mức thay đổi (chia theo log). */
export function trafficBridge(r: ControlRow): LogBridge | null {
  const g0 = r.shopLivePrev + r.restPrev;
  const g1 = r.shopLiveCur + r.restCur;
  if (!(g0 > 0 && g1 > 0) || !(r.visitorsPrev > 0 && r.visitorsCur > 0) || !r.cvrPrev || !r.cvrCur) return null;
  const o0 = (r.visitorsPrev * r.cvrPrev) / 100;
  const o1 = (r.visitorsCur * r.cvrCur) / 100;
  const a0 = g0 / o0;
  const a1 = g1 / o1;
  const lg = g1 === g0 ? g0 : (g1 - g0) / Math.log(g1 / g0);
  const part = (key: LogBridge["parts"][number]["key"], x0: number, x1: number) => ({ key, change: (x1 / x0 - 1) * 100, value: lg * Math.log(x1 / x0) });
  return { from: g0, to: g1, parts: [part("visitors", r.visitorsPrev, r.visitorsCur), part("cvr", r.cvrPrev, r.cvrCur), part("aov", a0, a1)] };
}

// ---------- bảng dọc "Số đo từng loại ngày" ----------

export const DAY_ABS_METRICS: KeyMetricKey[] = ["hours", "gmv", "gmvPerHour", "viewsPerHour", "err", "liveCtr", "ctor", "aov", "upt"];

export const DAY_ABS_COLOR: Record<KeyMetricsTab, string> = { all: "#f2c94c", daily: "#9a9aa5", dday: "#f2c94c", midmonth: "#7fb0e0", payday: "#e08a4b" };

export interface DayAbsCell {
  value: number | null;
  /** % thay đổi so với tháng liền trước trong bảng; null ở tháng đầu (mốc, không tô). */
  change: number | null;
  tone: ChangeTone;
  /** Vượt ngưỡng dao động (sáng viền). */
  significant: boolean;
}
export interface DayAbsRow {
  key: KeyMetricKey;
  neutral: boolean;
  cells: Record<KeyMetricsTab, DayAbsCell[]>;
}

export function dayAbsRows(months: KeyMetricsMonth[], tabs: KeyMetricsTab[]): DayAbsRow[] {
  const tables = Object.fromEntries(tabs.map((t) => [t, keyMetricsTable(months, t)])) as Record<KeyMetricsTab, ReturnType<typeof keyMetricsTable>>;
  return DAY_ABS_METRICS.map((key) => {
    const cells = {} as Record<KeyMetricsTab, DayAbsCell[]>;
    let neutral = false;
    for (const t of tabs) {
      const tbl = tables[t];
      const row = tbl.rows.find((x) => x.def.key === key);
      if (!row) continue;
      neutral = row.def.goodWhenUp == null;
      cells[t] = row.values.map((v, i) => {
        const band = tbl.bands[i];
        const change = row.changes[i];
        return { value: v, change, tone: row.tones[i], significant: i > 0 && change != null && band != null && Math.abs(change) > band };
      });
    }
    return { key, neutral, cells };
  });
}

/** Màu nền ô nhiệt: đậm dần theo mức thay đổi, `scale` = % thay đổi cho độ đậm tối đa. */
export function heatColor(change: number | null, neutral: boolean, scale = 30): string | undefined {
  if (change == null || !Number.isFinite(change)) return undefined;
  const pct = Math.round(Math.min(Math.abs(change) / scale, 1) * 55);
  if (pct === 0) return undefined;
  const base = neutral ? "#7fb0e0" : change >= 0 ? "#6fcf97" : "#eb6b6b";
  return `color-mix(in srgb, ${base} ${pct}%, transparent)`;
}

// ---------- scatter SKU / host ----------

export interface ScatterPoint {
  key: string;
  label: string;
  x: number;
  y: number;
  /** Kích thước điểm (GMV hoặc số phiên). */
  size: number;
  tone: "up" | "down" | "flat";
}

export function median(xs: number[]): number | null {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** Huy hiệu hạng so với tháng trước: ▲ tăng, ▼ giảm, = giữ, "mới" khi tháng trước ngoài bảng. */
export function rankBadge(prevRank: number | null, rank: number): { text: string; tone: "up" | "down" | "flat" | "new" } {
  if (prevRank == null) return { text: "mới", tone: "new" };
  const d = prevRank - rank;
  if (d > 0) return { text: `▲ ${d}`, tone: "up" };
  if (d < 0) return { text: `▼ ${-d}`, tone: "down" };
  return { text: "=", tone: "flat" };
}

/** Khoá lưu ảnh SKU trong ghi chú báo cáo: không dấu, chữ thường, tối đa 60 ký tự. */
export function skuImageKey(name: string): string {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `skuimg_${s || "sku"}`;
}
