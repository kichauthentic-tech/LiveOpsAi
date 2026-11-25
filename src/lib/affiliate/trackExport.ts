import type { AffiliateActualEntry } from "../../types";
import { entryStatus, parseDayLabel, parsePlanTimeline, planBudget, planHours } from "./plan";
import { sameCreator } from "./planMatch";

// Bảng THEO DÕI Affiliate gửi brand (Excel): gộp các phiên cùng creator trong cùng ngày thành MỘT cột rồi xếp đúng dạng màn
// hình (chỉ số theo dòng, phiên theo cột, gom theo tháng). Hàm thuần — không đụng dữ liệu đã lưu, chỉ là cách trình bày khi xuất.
//
// Vì sao gộp ở đây mà không chỉ ở lúc nạp file: restart sang tài khoản/nickname khác (vd "Mạnh Ka" rồi "Mạnh Ka - Giày", nghỉ 37
// phút) không qua được luật gộp theo nickname + nghỉ ≤30 phút của mergeRestartSessions, nhưng với brand đó vẫn là MỘT phiên của
// MỘT creator. Luật ở đây: cùng ngày + cùng creator (sameCreator: tên ngắn nằm trọn trong tên dài) + đoạn sau bắt đầu trong
// [−5, +60] phút quanh giờ kết thúc đoạn trước. Cách nhau xa hơn (sáng/tối) là hai phiên riêng.

/** Cột do gộp nhiều đoạn: có `mergedParts` (số đoạn). Màn dùng để khoá sửa — số là tổng, không sửa trực tiếp được. */
export const mergedPartsOf = (e: object): number => (e as { mergedParts?: number }).mergedParts ?? 0;

export const TRACK_MERGE_MAX_GAP_MIN = 60;
const MAX_OVERLAP_MIN = 5;

type Entry = AffiliateActualEntry;

const hasPlan = (e: Entry) => !!(e.planTimelineLabel || e.targetGmv != null || e.planBudgetAds != null);
const sumDef = (vals: (number | undefined)[]): number | undefined => {
  const d = vals.filter((v): v is number => v != null);
  return d.length ? d.reduce((a, b) => a + b, 0) : undefined;
};
const clock = (min: number) => {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};
const tokens = (s: string) => s.trim().split(/\s+/).length;

function span(e: Entry): { start: number; end: number } | null {
  const t = parsePlanTimeline(e.timelineLabel);
  if (!t) return null;
  const end = e.durationHours != null && e.durationHours > 0 ? t.startMin + e.durationHours * 60 : t.endMin;
  return { start: t.startMin, end: Math.max(end, t.endMin) };
}

/** Gộp nhiều đoạn (đã sắp theo giờ) thành một cột. Số cộng lại; giá TB theo số món; CTR/CTOR bình quân theo lượt hiển thị. */
function combine(parts: Entry[]): Entry & { mergedParts: number } {
  const first = parts[0];
  const items = sumDef(parts.map((p) => p.itemsSold));
  const imp = sumDef(parts.map((p) => p.liveImpressions));
  const wAvg = (get: (p: Entry) => number | undefined, w: (p: Entry) => number): number | undefined => {
    const ps = parts.filter((p) => get(p) != null);
    if (!ps.length) return undefined;
    const tw = ps.reduce((t, p) => t + w(p), 0);
    if (tw <= 0) return ps.reduce((t, p) => t + get(p)!, 0) / ps.length;
    return ps.reduce((t, p) => t + get(p)! * w(p), 0) / tw;
  };
  const spans = parts.map(span);
  const s0 = spans[0];
  const sEnd = spans.reduce<number | null>((m, s) => (s ? Math.max(m ?? 0, s.end) : m), null);
  const planned = parts.filter(hasPlan);
  const planHrs = sumDef(planned.map((p) => planHours(p)));
  const planBud = sumDef(planned.map((p) => planBudget(p)));
  const names = parts.map((p) => p.creatorName).filter(Boolean);
  return {
    ...first,
    mergedParts: parts.length,
    creatorName: names.sort((a, b) => tokens(a) - tokens(b))[0] ?? first.creatorName,
    campName: parts.find((p) => p.campName)?.campName,
    campaignType: parts.find((p) => p.campaignType)?.campaignType,
    status: parts.some((p) => entryStatus(p) === "done") ? "done" : first.status,
    timelineLabel: s0 && sEnd != null ? `${clock(s0.start)} - ${clock(sEnd)}` : first.timelineLabel,
    planTimelineLabel: planned[0]?.planTimelineLabel ?? first.planTimelineLabel,
    planDurationHours: planned.length > 1 ? planHrs : planned[0]?.planDurationHours,
    planBudgetAds: planned.length > 1 ? planBud : planned[0]?.planBudgetAds,
    targetGmv: sumDef(parts.map((p) => p.targetGmv)),
    directGmv: sumDef(parts.map((p) => p.directGmv)),
    durationHours: sumDef(parts.map((p) => p.durationHours)),
    adsCost: sumDef(parts.map((p) => p.adsCost)),
    orders: sumDef(parts.map((p) => p.orders)),
    itemsSold: items,
    avgPrice: wAvg((p) => p.avgPrice, (p) => p.itemsSold ?? 0),
    viewer: sumDef(parts.map((p) => p.viewer)),
    liveImpressions: imp,
    ctr: wAvg((p) => p.ctr, (p) => p.liveImpressions ?? 0),
    ctor: wAvg((p) => p.ctor, (p) => (p.ctr ?? 0) * (p.liveImpressions ?? 0))
  };
}

/** Gộp các đoạn cùng creator + cùng ngày liền nhau (xem đầu file). Không đụng dòng không cần gộp, giữ nguyên thứ tự cột. */
export function mergeSameCreatorSameDay<T extends Entry>(rows: T[], maxGapMin = TRACK_MERGE_MAX_GAP_MIN): T[] {
  const used = new Set<number>();
  const out: { at: number; row: T }[] = [];
  rows.forEach((r, i) => {
    if (used.has(i)) return;
    used.add(i);
    const day = parseDayLabel(r.liveDateLabel);
    const group = [i];
    if (day && span(r)) {
      // Gom mọi đoạn cùng ngày + cùng creator, sắp theo giờ, rồi nối chuỗi liền nhau bắt đầu từ đoạn r.
      const cand = rows
        .map((x, j) => ({ x, j }))
        .filter(({ x, j }) => j !== i && !used.has(j) && parseDayLabel(x.liveDateLabel) === day && span(x) && sameCreator(x.creatorName, r.creatorName) && entryStatus(x) !== "cancelled");
      let chain = [{ x: r as Entry, j: i }, ...cand].sort((a, b) => span(a.x)!.start - span(b.x)!.start);
      const at = chain.findIndex((c) => c.j === i);
      let lo = at;
      let hi = at;
      while (lo > 0 && span(chain[lo].x)!.start - span(chain[lo - 1].x)!.end <= maxGapMin && span(chain[lo].x)!.start - span(chain[lo - 1].x)!.end >= -MAX_OVERLAP_MIN) lo--;
      while (hi < chain.length - 1 && span(chain[hi + 1].x)!.start - span(chain[hi].x)!.end <= maxGapMin && span(chain[hi + 1].x)!.start - span(chain[hi].x)!.end >= -MAX_OVERLAP_MIN) hi++;
      chain = chain.slice(lo, hi + 1);
      group.length = 0;
      chain.forEach((c) => {
        used.add(c.j);
        group.push(c.j);
      });
    }
    const parts = group.map((j) => rows[j]).sort((a, b) => (span(a)?.start ?? 0) - (span(b)?.start ?? 0));
    out.push({ at: Math.min(...group), row: parts.length === 1 ? parts[0] : (combine(parts) as unknown as T) });
  });
  return out.sort((a, b) => a.at - b.at).map((o) => o.row);
}

export interface GridCell {
  v: string | number;
  /** Định dạng số Excel (vd '#,##0'). */
  z?: string;
}

const INT = "#,##0";
const num = (v: number | undefined | null, z: string): GridCell => (v == null || Number.isNaN(v) ? { v: "—" } : { v, z });
const pct = (v: number | undefined | null, z = '0.00"%"'): GridCell => num(v, z);

/** Các dòng chỉ số — đúng thứ tự và nhãn bảng Theo dõi trên màn. */
export const TRACK_GRID_ROWS: { label: string; cell: (e: Entry) => GridCell }[] = [
  { label: "Campaign Type", cell: (e) => ({ v: e.campaignType || "—" }) },
  { label: "Camp", cell: (e) => ({ v: e.campName || "—" }) },
  { label: "Kế hoạch", cell: (e) => ({ v: hasPlan(e) ? "Có kế hoạch" : "Ngoài kế hoạch" }) },
  { label: "Creator", cell: (e) => ({ v: e.creatorName || "—" }) },
  { label: "Day", cell: (e) => ({ v: e.liveDateLabel || "—" }) },
  { label: "Timeline", cell: (e) => ({ v: e.timelineLabel || "—" }) },
  { label: "Target GMV", cell: (e) => num(e.targetGmv, INT) },
  { label: "Giờ kế hoạch", cell: (e) => num(planHours(e), "0.0") },
  { label: "Direct GMV", cell: (e) => num(e.directGmv, INT) },
  { label: "Giờ live", cell: (e) => num(e.durationHours, "0.0") },
  { label: "GMV/giờ", cell: (e) => num(e.directGmv && e.durationHours ? Math.round(e.directGmv / e.durationHours) : undefined, INT) },
  { label: "% Target", cell: (e) => pct(e.directGmv && e.targetGmv ? (e.directGmv / e.targetGmv) * 100 : undefined) },
  { label: "LIVE impressions", cell: (e) => num(e.liveImpressions, INT) },
  { label: "LIVE CTR", cell: (e) => pct(e.ctr) },
  { label: "CTOR", cell: (e) => pct(e.ctor) },
  { label: "Ads cost", cell: (e) => num(e.adsCost, INT) },
  { label: "Budget Ads", cell: (e) => num(planBudget(e), INT) },
  { label: "Ads / Budget", cell: (e) => pct(e.adsCost != null && planBudget(e) ? (e.adsCost / planBudget(e)!) * 100 : undefined, '0"%"') },
  { label: "ROAS", cell: (e) => num(e.directGmv && e.adsCost ? Math.round((e.directGmv / e.adsCost) * 10) / 10 : undefined, "0.0") },
  { label: "Orders", cell: (e) => num(e.orders, INT) },
  { label: "Items sold", cell: (e) => num(e.itemsSold, INT) },
  { label: "Avg. price", cell: (e) => num(e.avgPrice != null ? Math.round(e.avgPrice) : undefined, INT) },
  { label: "Viewers", cell: (e) => num(e.viewer, INT) }
];

/**
 * Lưới gửi brand: dòng 1 = tháng (ô gộp cho các cột cùng tháng), các dòng sau = từng chỉ số. `months` đã sắp theo thời gian,
 * mỗi tháng là danh sách phiên đã sắp theo ngày; phiên huỷ không đưa ra. Trả lưới + các vùng gộp ô của dòng tháng.
 */
export function buildTrackGrid(months: { label: string; items: Entry[] }[]): { grid: GridCell[][]; merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] } {
  const groups = months
    .map((m) => ({ label: m.label, items: mergeSameCreatorSameDay(m.items.filter((e) => entryStatus(e) !== "cancelled")) }))
    .filter((m) => m.items.length > 0);
  const head: GridCell[] = [{ v: "Tháng" }];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  let col = 1;
  for (const g of groups) {
    head.push({ v: g.label });
    for (let i = 1; i < g.items.length; i++) head.push({ v: "" });
    if (g.items.length > 1) merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + g.items.length - 1 } });
    col += g.items.length;
  }
  const flat = groups.flatMap((g) => g.items);
  const body = TRACK_GRID_ROWS.map((r) => [{ v: r.label } as GridCell, ...flat.map((e) => r.cell(e))]);
  return { grid: [head, ...body], merges };
}
