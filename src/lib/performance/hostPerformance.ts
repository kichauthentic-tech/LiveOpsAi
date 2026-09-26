import { LiveSession } from "../../types";
import { sessionDurationHours } from "../pnl";
import type { CampDayBucket } from "../campaignDays";
import { METRIC } from "../metricGlossary";

// Giai đoạn 3 của tầng dữ liệu gốc mới: đọc ra hiệu suất thật để làm nền cho việc SẮP LỊCH.
// Chỉ tổng hợp, không tự xếp lịch — ops vẫn là người quyết, đúng tinh thần đã chốt (tránh lặp lại
// rủi ro "hiển thị số chưa đáng tin" của module Dashboard cũ đã xoá).

export interface PerfTotals {
  sessionCount: number;
  hours: number;
  gmv: number;
  orders: number;
  views: number;
  productClicks: number;
  productImpressions: number;
}

export interface PerfRow extends PerfTotals {
  key: string;
  label: string;
  subLabel?: string;
  gmvPerHour: number;
  gmvPerSession: number;
  ctr: number;
}

export interface DataQuality {
  total: number;
  reconciled: number; // đã đối soát chốt
  snapshot: number; // số thật lúc giao ca, TikTok còn cập nhật trễ
  manual: number; // host tự khai, chưa có gì bảo chứng
}

const EMPTY: PerfTotals = {
  sessionCount: 0, hours: 0, gmv: 0, orders: 0, views: 0, productClicks: 0, productImpressions: 0
};

// Giờ live THỰC TẾ nếu có (đọc từ file), nếu chưa có thì tạm dùng giờ kế hoạch của ca. Dùng giờ
// kế hoạch cho GMV/giờ sẽ hơi lệch, nhưng bỏ ca đó ra khỏi thống kê còn sai hơn.
export function sessionHours(s: LiveSession): number {
  if (s.liveDurationMinutes && s.liveDurationMinutes > 0) return s.liveDurationMinutes / 60;
  return sessionDurationHours(s.startTime, s.endTime);
}

// Ca chưa diễn ra hoặc bị huỷ không phản ánh hiệu suất gì.
export function isCountable(s: LiveSession): boolean {
  if (s.status === "Cancelled" || s.status === "Upcoming") return false;
  return (s.actualGmv ?? 0) > 0 || (s.totalViews ?? 0) > 0;
}

function addTo(acc: PerfTotals, s: LiveSession): PerfTotals {
  return {
    sessionCount: acc.sessionCount + 1,
    hours: acc.hours + sessionHours(s),
    gmv: acc.gmv + (s.actualGmv ?? 0),
    orders: acc.orders + (s.totalOrders ?? 0),
    views: acc.views + (s.totalViews ?? 0),
    productClicks: acc.productClicks + (s.productClicks ?? 0),
    productImpressions: acc.productImpressions + (s.productImpressions ?? 0)
  };
}

function finish(key: string, label: string, t: PerfTotals, subLabel?: string): PerfRow {
  return {
    ...t,
    key,
    label,
    subLabel,
    gmvPerHour: t.hours > 0 ? t.gmv / t.hours : 0,
    gmvPerSession: t.sessionCount > 0 ? t.gmv / t.sessionCount : 0,
    ctr: t.productImpressions > 0 ? (t.productClicks / t.productImpressions) * 100 : 0
  };
}

export interface PerfFilter {
  from?: string; // "YYYY-MM-DD"
  to?: string;
  brandId?: string;
  hostId?: string;
}

export function filterSessions(sessions: LiveSession[], f: PerfFilter): LiveSession[] {
  return sessions.filter((s) => {
    if (!isCountable(s)) return false;
    if (f.from && s.date < f.from) return false;
    if (f.to && s.date > f.to) return false;
    if (f.brandId && s.brandId !== f.brandId) return false;
    if (f.hostId && s.hostId !== f.hostId) return false;
    return true;
  });
}

export function dataQuality(sessions: LiveSession[]): DataQuality {
  const q: DataQuality = { total: sessions.length, reconciled: 0, snapshot: 0, manual: 0 };
  for (const s of sessions) {
    if (s.dataSource === "tiktok_reconciled") q.reconciled++;
    else if (s.dataSource === "live_snapshot") q.snapshot++;
    else q.manual++;
  }
  return q;
}

function groupBy(
  sessions: LiveSession[],
  keyOf: (s: LiveSession) => string,
  labelOf: (s: LiveSession) => { label: string; subLabel?: string }
): PerfRow[] {
  const acc = new Map<string, { t: PerfTotals; label: string; subLabel?: string }>();
  for (const s of sessions) {
    const k = keyOf(s);
    const cur = acc.get(k) ?? { t: EMPTY, ...labelOf(s) };
    acc.set(k, { ...cur, t: addTo(cur.t, s) });
  }
  return [...acc.entries()]
    .map(([k, v]) => finish(k, v.label, v.t, v.subLabel))
    .sort((a, b) => b.gmvPerHour - a.gmvPerHour);
}

export const UNASSIGNED_HOST_KEY = "chua-gan-host";

// host_id có thể rỗng (talent bị xoá -> on delete set null, hoặc ca tạo tay không gán host) trong
// khi host_name denormalized vẫn còn. Gom theo id rồi rơi về TÊN, chứ không dồn mọi ca thiếu id
// vào chung một khoá — làm vậy sẽ trộn nhiều host thành một dòng và mượn nhầm tên của ca đầu tiên.
export function hostKey(s: LiveSession): string {
  return s.hostId || (s.hostName ? `ten:${s.hostName}` : UNASSIGNED_HOST_KEY);
}

// Ca chưa gán host (nạp bù từ file, host_id lẫn host_name đều rỗng) KHÔNG phải một host — để nó
// nằm trong bảng xếp hạng là đem GMV của nhiều người vô danh đi so với người thật, và nó còn chiếm
// một hạng trong top. Tách ra để màn hình hiển thị thành một dòng cảnh báo "còn N ca chưa gán host"
// thay vì một dòng xếp hạng.
export function splitUnassignedHost(rows: PerfRow[]): { ranked: PerfRow[]; unassigned: PerfRow | null } {
  return {
    ranked: rows.filter((r) => r.key !== UNASSIGNED_HOST_KEY),
    unassigned: rows.find((r) => r.key === UNASSIGNED_HOST_KEY) ?? null
  };
}

export function byHost(sessions: LiveSession[]): PerfRow[] {
  return groupBy(sessions, hostKey, (s) => ({ label: s.hostName || "Chưa gán host" }));
}

export function byHostBrand(sessions: LiveSession[]): PerfRow[] {
  return groupBy(
    sessions,
    (s) => `${hostKey(s)}::${s.brandId}`,
    (s) => ({ label: s.hostName || "Chưa gán host", subLabel: s.brandName })
  );
}

export const WEEKDAY_LABELS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

// Thứ trong tuần theo giờ VN. s.date là chuỗi "YYYY-MM-DD" ngày VN sẵn rồi nên dựng Date ở UTC để
// khỏi lệch thứ theo múi giờ máy chạy trình duyệt.
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function byWeekday(sessions: LiveSession[]): PerfRow[] {
  const rows = groupBy(
    sessions,
    (s) => String(weekdayOf(s.date)),
    (s) => ({ label: WEEKDAY_LABELS[weekdayOf(s.date)] })
  );
  return rows.sort((a, b) => ((Number(a.key) + 6) % 7) - ((Number(b.key) + 6) % 7));
}

export function byDate(sessions: LiveSession[]): PerfRow[] {
  return groupBy(sessions, (s) => s.date, (s) => ({ label: s.date })).sort((a, b) => a.key.localeCompare(b.key));
}

// Ô hiệu suất cho lưới host × thứ — thứ mà việc sắp lịch thật sự cần: "host này mạnh nhất vào thứ mấy".
export interface HostWeekdayCell {
  hostId: string;
  weekday: number;
  gmvPerHour: number;
  sessionCount: number;
}

export function hostWeekdayGrid(sessions: LiveSession[]): HostWeekdayCell[] {
  const acc = new Map<string, PerfTotals>();
  for (const s of sessions) {
    // Cùng công thức khoá với byHost() để lưới khớp đúng dòng xếp hạng.
    const k = `${hostKey(s)}::${weekdayOf(s.date)}`;
    acc.set(k, addTo(acc.get(k) ?? EMPTY, s));
  }
  return [...acc.entries()].map(([k, t]) => {
    const [hostId, wd] = k.split("::");
    return {
      hostId,
      weekday: Number(wd),
      gmvPerHour: t.hours > 0 ? t.gmv / t.hours : 0,
      sessionCount: t.sessionCount
    };
  });
}

// Host tách ngày thường + TỪNG camp (D-Day / Mid-Month / Pay Day riêng) để so với nhau (report tháng,
// theo deck Crocs). Luật chia đã chốt với user 2026-09-26: GMV của ca tính TRỌN cho host; trợ live
// không nhận GMV, chỉ được ghi giờ live — nên giờ trợ để riêng một cột, không cộng vào giờ host (cộng
// vào sẽ kéo tụt GMV/giờ của người đó).
export interface DayTypePart {
  sessions: number;
  gmv: number;
  hours: number;
  views: number;
  productClicks: number;
  orders: number;
  itemsSold: number;
  watchSecViews: number; // Σ(Avg. view × Views) — chia Views ra Avg. view bình quân theo lượt xem
}

// Thứ tự cột của bảng: ngày thường trước làm mốc, rồi 3 camp.
export const HOST_DAY_TYPE_ORDER: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];

export interface HostDayTypeRow {
  key: string;
  name: string;
  byBucket: Record<CampDayBucket, DayTypePart>;
  assist: DayTypePart; // gmv luôn 0
}

const emptyPart = (): DayTypePart => ({ sessions: 0, gmv: 0, hours: 0, views: 0, productClicks: 0, orders: 0, itemsSold: 0, watchSecViews: 0 });

function addPart(p: DayTypePart, s: LiveSession, hours: number) {
  const views = s.totalViews ?? 0;
  p.sessions += 1;
  p.gmv += s.actualGmv ?? 0;
  p.hours += hours;
  p.views += views;
  p.productClicks += s.productClicks ?? 0;
  p.orders += s.totalOrders ?? 0;
  p.itemsSold += s.attributedItemsSold ?? 0;
  p.watchSecViews += (s.avgWatchTimeSeconds ?? 0) * views;
}
const emptyBuckets = (): Record<CampDayBucket, DayTypePart> => ({
  daily: emptyPart(),
  dday: emptyPart(),
  midmonth: emptyPart(),
  payday: emptyPart()
});

export function coHostKey(s: LiveSession): string | null {
  if (s.coHostId) return s.coHostId;
  const name = s.coHostName?.trim();
  return name ? `ten:${name}` : null;
}

export function hostGmvTotal(r: HostDayTypeRow): number {
  return HOST_DAY_TYPE_ORDER.reduce((sum, b) => sum + r.byBucket[b].gmv, 0);
}

export function byHostDayType(sessions: LiveSession[], bucketOf: (date: string) => CampDayBucket): HostDayTypeRow[] {
  const rows = new Map<string, HostDayTypeRow>();
  const rowOf = (key: string, name: string) => {
    const cur = rows.get(key) ?? { key, name, byBucket: emptyBuckets(), assist: emptyPart() };
    if (!cur.name && name) cur.name = name;
    rows.set(key, cur);
    return cur;
  };
  for (const s of sessions) {
    const h = sessionHours(s);
    const hk = hostKey(s);
    if (hk !== UNASSIGNED_HOST_KEY) {
      addPart(rowOf(hk, s.hostName).byBucket[bucketOf(s.date)], s, h);
    }
    const ck = coHostKey(s);
    if (ck && ck !== hk) {
      const part = rowOf(ck, s.coHostName).assist;
      part.sessions += 1;
      part.hours += h;
    }
  }
  return [...rows.values()].sort((a, b) => hostGmvTotal(b) - hostGmvTotal(a) || b.assist.hours - a.assist.hours);
}

// Dòng "Cả team" — mốc để so GMV/giờ từng host trong CÙNG một loại ngày (so chéo loại ngày thì camp
// luôn thắng, không nói được gì về người).
export function dayTypeTeamTotals(rows: HostDayTypeRow[]): Record<CampDayBucket, DayTypePart> {
  const out = emptyBuckets();
  for (const r of rows) {
    for (const b of HOST_DAY_TYPE_ORDER) {
      const p = r.byBucket[b];
      for (const k of Object.keys(p) as (keyof DayTypePart)[]) out[b][k] += p[k];
    }
  }
  return out;
}

/** Cộng 4 loại ngày thành cả tháng (tab "Cả tháng" của bảng host). */
export function sumDayTypeParts(parts: Record<CampDayBucket, DayTypePart>): DayTypePart {
  const out = emptyPart();
  for (const b of HOST_DAY_TYPE_ORDER) for (const k of Object.keys(out) as (keyof DayTypePart)[]) out[k] += parts[b][k];
  return out;
}

// Chỉ số của một ô host × loại ngày, cùng bộ với bảng host của deck Crocs. CTOR ở đây = Orders ÷
// Product clicks (user chốt 2026-09-26, khớp deck T8 1,30%) — chọn vậy để 4 thừa số nhân ra ĐÚNG
// GMV/giờ: Views/giờ × LIVE CTR × CTOR × AOV = GMV/giờ. Phần 4 của report vẫn dùng CTOR theo SKU orders.
export interface DayTypeMetrics {
  sessions: number;
  gmv: number;
  hours: number;
  gmvPerHour: number | null;
  viewsPerHour: number | null;
  liveCtr: number | null; // %
  ctor: number | null; // %
  aov: number | null;
  upt: number | null;
  avgViewSec: number | null;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function dayTypeMetrics(p: DayTypePart): DayTypeMetrics {
  const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
  return {
    sessions: p.sessions,
    gmv: p.gmv,
    hours: p.hours,
    gmvPerHour: ratio(p.gmv, p.hours),
    viewsPerHour: ratio(p.views, p.hours),
    liveCtr: pct(p.productClicks, p.views),
    ctor: pct(p.orders, p.productClicks),
    aov: ratio(p.gmv, p.orders),
    upt: ratio(p.itemsSold, p.orders),
    avgViewSec: ratio(p.watchSecViews, p.views)
  };
}

// Dưới 2 ca thì một ca đẹp/xấu quyết định cả ô — không tô ▲▼, không nêu trong câu giải thích.
export const MIN_SESSIONS_TO_COMPARE = 2;
// Lệch dưới ngưỡng này so với Cả team coi như ngang.
export const DAY_TYPE_DIFF_THRESHOLD = 5;

export const GMV_PER_HOUR_DRIVERS = ["viewsPerHour", "liveCtr", "ctor", "aov"] as const;
export type GmvPerHourDriver = (typeof GMV_PER_HOUR_DRIVERS)[number];
export const DRIVER_LABEL: Record<GmvPerHourDriver, string> = {
  viewsPerHour: METRIC.viewsPerHour,
  liveCtr: METRIC.liveCtr,
  ctor: METRIC.ctor,
  aov: METRIC.aov
};

/** % lệch so với Cả team; null khi thiếu số hoặc ô có quá ít ca để so. */
export function vsTeam(host: DayTypeMetrics, team: DayTypeMetrics, key: "gmvPerHour" | GmvPerHourDriver): number | null {
  const a = host[key], b = team[key];
  if (host.sessions < MIN_SESSIONS_TO_COMPARE || a == null || b == null || b === 0) return null;
  return (a / b - 1) * 100;
}

const signedPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.round(Math.abs(v))}%`;

/**
 * Câu "vì sao" cho host lệch team nhiều nhất trong một loại ngày — chọn theo TIỀN hụt/hơn
 * ((GMV/giờ host − GMV/giờ team) × giờ host), không theo %, để host 20 giờ được nêu trước host 3 giờ.
 * Thừa số nêu ra phải lệch ≥ ngưỡng; thừa số cùng chiều với GMV/giờ là "nhờ/do", ngược chiều là phần bù.
 */
export function dayTypeDriverLines(
  hosts: { name: string; m: DayTypeMetrics }[],
  team: DayTypeMetrics,
  limit = 2
): string[] {
  if (team.gmvPerHour == null) return [];
  const teamRate = team.gmvPerHour;
  return hosts
    .map((h) => ({ ...h, diff: vsTeam(h.m, team, "gmvPerHour"), money: h.m.gmvPerHour != null ? (h.m.gmvPerHour - teamRate) * h.m.hours : 0 }))
    .filter((h) => h.diff != null && Math.abs(h.diff) >= DAY_TYPE_DIFF_THRESHOLD)
    .sort((a, b) => Math.abs(b.money) - Math.abs(a.money))
    .slice(0, limit)
    .map((h) => {
      const up = h.diff! > 0;
      const parts = GMV_PER_HOUR_DRIVERS.map((k) => ({ label: DRIVER_LABEL[k], d: vsTeam(h.m, team, k) })).filter(
        (x): x is { label: string; d: number } => x.d != null && Math.abs(x.d) >= DAY_TYPE_DIFF_THRESHOLD
      );
      const same = parts.filter((x) => x.d > 0 === up).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      const against = parts.filter((x) => x.d > 0 !== up).sort((a, b) => Math.abs(b.d) - Math.abs(a.d));
      let line = `${h.name}: ${METRIC.gmvPerHour} ${signedPct(h.diff!)} so với cả team`;
      if (same.length) line += ` — ${up ? "nhờ" : "do"} ${same.map((x) => `${x.label} ${signedPct(x.d)}`).join(", ")}`;
      else line += " — không thừa số nào lệch ≥ 5%, lệch dồn đều cả 4";
      if (against.length) line += `; ${up ? "bị kéo lại bởi" : "bù lại được"} ${against.map((x) => `${x.label} ${signedPct(x.d)}`).join(", ")}`;
      return `${line}.`;
    });
}
