import { CAMP_DAY_BUCKET_ORDER, type CampDayBucket } from "../campaignDays";
import { fmtFixed, fmtVndFull } from "../format";
import { DAY_TYPE, METRIC } from "../metricGlossary";
import { KEY_METRICS, fmtKeyMetric, keyMetricValue, type KeyMetricDef, type KeyMetricKey } from "./keyMetrics";
import type { LiveStats } from "./monthlyReportInsights";

// Action plan của Report Tháng (27/10, học deck CROCS T9 slide 31): mỗi việc 3 cột Hành động · Căn cứ · Chỉ tiêu theo dõi.
// Plan lưu ở report của tháng VIẾT ra nó (brand_monthly_reports.action_plan, 0182) — việc làm trong tháng sau.
// Report của tháng sau tự chấm bằng bộ số của chính nó: chỉ tiêu có cấu trúc (một Key Metric hoặc % Target, cả tháng
// hoặc một loại ngày, ≥/≤ một ngưỡng) thì app chấm; việc không đo được bằng số (quyết định creator, lập lịch video…)
// thì ops tự chấm Đạt/Chưa đạt ở report tháng sau. Tháng sau chưa hết ⇒ chỉ "đang theo dõi", không kết luận.

export type ActionScope = "all" | CampDayBucket;
export const ACTION_SCOPES: ActionScope[] = ["all", ...CAMP_DAY_BUCKET_ORDER];
export const ACTION_SCOPE_LABEL: Record<ActionScope, string> = {
  all: "Cả tháng",
  daily: DAY_TYPE.daily,
  dday: "D-Day",
  midmonth: "Mid-Month",
  payday: "Pay Day"
};

export type ActionMetricKey = KeyMetricKey | "pctTarget";
export interface ActionMetricDef {
  key: ActionMetricKey;
  label: string;
  kind: KeyMetricDef["kind"];
}
/** 19 Key Metrics (cùng thứ tự, cùng tên) + % Target. */
export const ACTION_METRICS: ActionMetricDef[] = [
  { key: "pctTarget", label: METRIC.pctTarget, kind: "pct1" },
  ...KEY_METRICS.map((d) => ({ key: d.key, label: d.label, kind: d.kind }))
];
const metricDef = (k: ActionMetricKey) => ACTION_METRICS.find((m) => m.key === k) ?? null;

export interface ActionTarget {
  metric: ActionMetricKey;
  scope: ActionScope;
  op: "gte" | "lte";
  value: number;
}
export interface ActionManualResult {
  status: "met" | "missed";
  at: string;
}
export interface ActionItem {
  id: string;
  action: string;
  basis: string;
  /** null = chỉ tiêu bằng chữ (`trackText`), ops tự chấm. */
  target: ActionTarget | null;
  trackText: string;
  /** Ops tự chấm (chỉ cho việc không có `target`) — ghi lúc xem report tháng sau. */
  manual: ActionManualResult | null;
}
export interface ActionPlan {
  items: ActionItem[];
  savedAt: string;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Đọc jsonb an toàn — dòng hỏng bị bỏ, không làm vỡ report. */
export function readActionPlan(raw: unknown): ActionPlan | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { items?: unknown; savedAt?: unknown };
  if (!Array.isArray(r.items)) return null;
  const items: ActionItem[] = [];
  for (const x of r.items) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const action = str(o.action).trim();
    if (!action) continue;
    let target: ActionTarget | null = null;
    const t = o.target as Record<string, unknown> | null | undefined;
    if (t && typeof t === "object") {
      const metric = t.metric as ActionMetricKey;
      const scope = t.scope as ActionScope;
      const op = t.op === "lte" ? "lte" : t.op === "gte" ? "gte" : null;
      const value = typeof t.value === "number" && Number.isFinite(t.value) ? t.value : null;
      if (metricDef(metric) && ACTION_SCOPES.includes(scope) && op && value != null) target = { metric, scope, op, value };
    }
    const m = o.manual as Record<string, unknown> | null | undefined;
    const manual: ActionManualResult | null = m && (m.status === "met" || m.status === "missed") ? { status: m.status, at: str(m.at) } : null;
    items.push({ id: str(o.id) || `a${items.length + 1}`, action, basis: str(o.basis).trim(), target, trackText: str(o.trackText).trim(), manual: target ? null : manual });
  }
  return items.length ? { items, savedAt: str(r.savedAt) } : null;
}

/** Ngưỡng ops gõ: "19,9M", "19.900.000", "1,25B", "1,2tr", "3,5%", "1,05" — dấu chấm là nghìn, phẩy là thập phân
 *  (như số trên màn hình). Hậu tố K/M/B (cả tr/tỷ) chỉ cho chỉ số tiền/số đếm. */
export function parseThreshold(text: string, kind: KeyMetricDef["kind"]): number | null {
  const t = text.trim().toLowerCase().replace(/\s+/g, "").replace(/%$/, "");
  const m = /^(-?[\d.,]+)(k|m|b|tr|triệu|tỷ|ty)?$/.exec(t);
  if (!m) return null;
  let digits = m[1];
  // "19.900.000" (chấm nghìn) vs "1.5" (người gõ chấm thập phân): chỉ coi chấm là nghìn khi đúng nhóm 3 chữ số.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(digits)) digits = digits.replace(/\./g, "");
  digits = digits.replace(",", ".");
  if ((digits.match(/\./g) ?? []).length > 1) return null;
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  const suffix = m[2];
  if (!suffix) return n;
  if (kind !== "money" && kind !== "int") return null;
  const mult = suffix === "k" ? 1e3 : suffix === "m" || suffix === "tr" || suffix === "triệu" ? 1e6 : 1e9;
  return n * mult;
}

// Tiền in đủ số (fmtVndFull): thực đạt 18.965.517 cạnh ngưỡng 19.900.000 — bản gọn "19M" đọc như đã chạm "19,9M".
const fmtMetric = (k: ActionMetricKey, v: number | null) => {
  const d = metricDef(k);
  if (!d || v == null) return "—";
  if (k === "pctTarget") return `${fmtFixed(v, 1)}%`;
  return d.kind === "money" ? fmtVndFull(v) : fmtKeyMetric(d.kind, v);
};

/** "GMV/giờ · Daily ≥ 19,9M" — câu chỉ tiêu hiện ở cột 3 (có cấu trúc) hoặc chữ ops gõ. */
export function trackLabel(item: Pick<ActionItem, "target" | "trackText">): string {
  const t = item.target;
  if (!t) return item.trackText || "—";
  const d = metricDef(t.metric);
  return `${d?.label ?? t.metric} · ${ACTION_SCOPE_LABEL[t.scope]} ${t.op === "gte" ? "≥" : "≤"} ${fmtMetric(t.metric, t.value)}`;
}

export interface ActionGradeContext {
  /** Số live của tháng được chấm theo phạm vi (Cả tháng + từng loại ngày); null = không có phiên. */
  stats: Record<ActionScope, LiveStats | null>;
  /** Target GMV theo phạm vi (Kế Hoạch Tháng đã chốt); null = không có target. */
  targets: Record<ActionScope, number | null>;
  /** true khi tháng được chấm đã hết và số phiên đủ tới ngày cuối. */
  final: boolean;
}

export type ActionGradeStatus = "met" | "missed" | "tracking" | "nodata" | "awaiting";
export interface ActionGrade {
  status: ActionGradeStatus;
  actual: number | null;
  actualText: string;
  /** Tháng chưa hết: số tới nay đang ở phía đạt hay không (null khi không nói được — vd % Target giữa tháng). */
  onTrack: boolean | null;
  manual: boolean;
}

export function actualOf(t: ActionTarget, ctx: ActionGradeContext): number | null {
  const st = ctx.stats[t.scope];
  if (!st || st.sessions === 0) return null;
  if (t.metric === "pctTarget") {
    const tg = ctx.targets[t.scope];
    return tg != null && tg > 0 ? (st.gmv / tg) * 100 : null;
  }
  const v = keyMetricValue(st, t.metric);
  return v != null && Number.isFinite(v) ? v : null;
}

export function gradeAction(item: ActionItem, ctx: ActionGradeContext): ActionGrade {
  if (!item.target) {
    if (item.manual) return { status: item.manual.status, actual: null, actualText: "ops chấm", onTrack: null, manual: true };
    return { status: ctx.final ? "awaiting" : "tracking", actual: null, actualText: "—", onTrack: null, manual: true };
  }
  const t = item.target;
  const actual = actualOf(t, ctx);
  if (actual == null) return { status: ctx.final ? "nodata" : "tracking", actual: null, actualText: "—", onTrack: null, manual: false };
  const pass = t.op === "gte" ? actual >= t.value : actual <= t.value;
  const actualText = fmtMetric(t.metric, actual);
  if (ctx.final) return { status: pass ? "met" : "missed", actual, actualText, onTrack: null, manual: false };
  // % Target tới nay so với target CẢ tháng — giữa tháng luôn thấp, không nói "đang đạt/chưa".
  return { status: "tracking", actual, actualText, onTrack: t.metric === "pctTarget" ? null : pass, manual: false };
}

export const ACTION_STATUS_LABEL: Record<ActionGradeStatus, string> = {
  met: "Đạt",
  missed: "Chưa đạt",
  tracking: "Đang theo dõi",
  nodata: "Không có số liệu",
  awaiting: "Chờ chấm"
};

export function gradeSummary(grades: ActionGrade[]): { met: number; missed: number; open: number } {
  let met = 0;
  let missed = 0;
  for (const g of grades) {
    if (g.status === "met") met++;
    else if (g.status === "missed") missed++;
  }
  return { met, missed, open: grades.length - met - missed };
}

/** Câu mở khối kết quả: "Tháng 10: 4/6 việc đạt · 1 chưa đạt · 1 chờ chấm." */
export function gradeHeadline(monthLabel: string, grades: ActionGrade[], final: boolean): string {
  const s = gradeSummary(grades);
  if (!final) return `${monthLabel} chưa hết — số tới nay chỉ để theo dõi, app chấm khi đủ số cả tháng.`;
  const parts = [`${s.met}/${grades.length} việc đạt`];
  if (s.missed) parts.push(`${s.missed} chưa đạt`);
  if (s.open) parts.push(`${s.open} chưa chấm được`);
  return `${monthLabel}: ${parts.join(" · ")}.`;
}

export const newActionItem = (action = ""): ActionItem => ({
  id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  action,
  basis: "",
  target: null,
  trackText: "",
  manual: null
});

/** Gợi ý ngưỡng = giá trị thực đạt tháng này (ops sửa) — để ô ngưỡng không trống khi chọn chỉ số. */
export function suggestThreshold(metric: ActionMetricKey, scope: ActionScope, ctx: ActionGradeContext): number | null {
  if (metric === "pctTarget") return 100;
  return actualOf({ metric, scope, op: "gte", value: 0 }, ctx);
}

/** Số hiện trong ô nhập ngưỡng (đọc lại được bằng parseThreshold). */
export function thresholdInputText(metric: ActionMetricKey, v: number): string {
  const d = metricDef(metric);
  if (!d) return String(v);
  if (d.kind === "money" || d.kind === "int") return fmtVndFull(v);
  if (d.kind === "dec2") return fmtFixed(v, 2);
  if (d.kind === "pct1" || d.kind === "pct2") return fmtFixed(v, d.kind === "pct1" ? 1 : 2);
  return fmtFixed(v, 1);
}
