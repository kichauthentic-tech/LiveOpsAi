import { LiveSession } from "../../types";
import { sessionDurationHours } from "../pnl";
import { hasStaffSegments, roleShares } from "../staffSegments";
import { hostMetricShares } from "../segmentCheckpoints";
import type { CampDayBucket } from "../campaignDays";
import { METRIC } from "../metricGlossary";
import { assertOnePlatform } from "../platforms/perf";
import { addKeyInput, emptyKeyCounts, keyInputFromSession, keyMetrics, type KeyCounts, type KeyMetrics } from "../report/keyMetrics";

// Giai đoạn 3 của tầng dữ liệu gốc mới: đọc ra hiệu suất thật để làm nền cho việc SẮP LỊCH.
// Chỉ tổng hợp, không tự xếp lịch — ops vẫn là người quyết, đúng tinh thần đã chốt (tránh lặp lại
// rủi ro "hiển thị số chưa đáng tin" của module Dashboard cũ đã xoá).

// Cộng số dùng đúng bộ đếm của Key Metrics (lib/report/keyMetrics.ts) — cùng công thức với Report Tháng/Tuần,
// Dashboard, Bản Tin CEO.
export type PerfTotals = KeyCounts;

export interface PerfRow extends KeyMetrics {
  key: string;
  label: string;
  subLabel?: string;
  sessionCount: number;
  gmvPerSession: number;
}

export interface DataQuality {
  total: number;
  reconciled: number; // đã đối soát chốt
  snapshot: number; // số thật lúc giao ca, TikTok còn cập nhật trễ
  manual: number; // host tự khai, chưa có gì bảo chứng
}

// Giờ live THỰC TẾ nếu có (đọc từ file), nếu chưa có thì tạm dùng giờ kế hoạch của ca. Dùng giờ
// kế hoạch cho GMV/giờ sẽ hơi lệch, nhưng bỏ ca đó ra khỏi thống kê còn sai hơn.
export function sessionHours(s: LiveSession): number {
  if (s.liveDurationMinutes && s.liveDurationMinutes > 0) return s.liveDurationMinutes / 60;
  return sessionDurationHours(s.startTime, s.endTime);
}

// "Ca có số" — MỘT định nghĩa cho mọi màn cộng hiệu suất (audit 2026-09-28 mục 6; `hasLiveNumbers` của Report là
// bí danh của hàm này). Trước đây có 3 bản: Report đếm ca Completed đã up file dù GMV/view = 0, Hiệu Suất Host /
// Sổ Ca / Bản Tin CEO đếm cả ca "Live Now" đang có số tạm nhưng bỏ ca đã up file mà bán 0, khối Hỗ Trợ Vận Hành
// có luật thứ ba ⇒ cùng một tháng ra số ca, giờ, GMV/giờ khác nhau.
//   - Chỉ ca ĐÃ XONG: ca đang live có số dở dang, cộng vào là pha GMV/giờ bằng một ca chưa hết giờ.
//   - Có số = đã đối soát, đã up file lúc giao ca, hoặc có GMV / view. Ca đã up file mà bán 0 là kết quả thật
//     (0), không phải "chưa có số".
// Không dùng cho tiền (isPnlSession — ca GMV 0 chưa up file vẫn trả lương) hay giờ đã giao cho brand (isDelivered).
export function isCountable(s: LiveSession): boolean {
  if (s.status !== "Completed") return false;
  return s.dataSource === "tiktok_reconciled" || s.dataSource === "live_snapshot" || (s.actualGmv ?? 0) > 0 || (s.totalViews ?? 0) > 0;
}

// Đổi HOST giữa ca (0138): GMV/đơn/view và giờ của ca chia cho từng host theo GIỜ HỌ ĐỨNG (không có hoa hồng GMV —
// đây chỉ là cách gán số cho thước GMV/giờ). Ca không đổi host đi nguyên ca như cũ. Hàm idempotent: bản chia đã bỏ
// staffSegments nên không bị chia lần hai.
const SCALED_COUNTERS = [
  "actualGmv", "totalOrders", "totalViews", "attributedItemsSold", "attributedSkuOrders", "impressions", "productImpressions",
  "productClicks", "newFollowers", "commentsCount", "sharesCount", "likesCount"
] as const satisfies readonly (keyof LiveSession)[];

export function hostPortions(s: LiveSession): LiveSession[] {
  if (!hasStaffSegments(s, "host")) return [s];
  const shares = roleShares(s, "host");
  if (shares.length === 0) return [s];
  const hours = sessionHours(s);
  // Có số lúc đổi host (0147) thì GMV/view/đơn chia theo số THẬT từng host đã bán; thiếu số chỉ số nào thì chỉ số đó chia theo giờ.
  const exact = hostMetricShares(s);
  const exactFor: Partial<Record<(typeof SCALED_COUNTERS)[number], keyof typeof exact>> = { actualGmv: "gmv", totalViews: "views", totalOrders: "orders" };
  return shares.map((p) => {
    const part: LiveSession = { ...s, hostId: p.talentId, hostName: p.name, staffSegments: undefined, staffCheckpoints: undefined, liveDurationMinutes: hours * p.share * 60 };
    for (const f of SCALED_COUNTERS) {
      const v = s[f];
      if (typeof v !== "number") continue;
      const metric = exactFor[f];
      const share = (metric && exact[metric]?.get(p.talentId)) ?? p.share;
      (part as unknown as Record<string, number>)[f] = v * share;
    }
    // ATC / CO / Xu (Shopee) nằm ở báo cáo ca — chưa có số lúc đổi host cho các trường này nên chia theo giờ đứng ca.
    if (s.report) {
      const r = s.report;
      const scale = (v: number | undefined) => (typeof v === "number" ? v * p.share : v);
      part.report = { ...r, atcCount: scale(r.atcCount), checkoutCount: scale(r.checkoutCount), coinSpent: scale(r.coinSpent) };
    }
    return part;
  });
}

export const expandHostPortions = (sessions: LiveSession[]): LiveSession[] =>
  sessions.some((s) => hasStaffSegments(s, "host")) ? sessions.flatMap(hostPortions) : sessions;

function addTo(acc: PerfTotals, s: LiveSession): PerfTotals {
  return addKeyInput(acc, keyInputFromSession(s, sessionHours(s)));
}

function finish(key: string, label: string, t: PerfTotals, subLabel?: string): PerfRow {
  return {
    ...keyMetrics(t),
    key,
    label,
    subLabel,
    sessionCount: t.sessions,
    gmvPerSession: t.sessions > 0 ? t.gmv / t.sessions : 0
  };
}

export interface PerfFilter {
  from?: string; // "YYYY-MM-DD"
  to?: string;
  brandId?: string;
  hostId?: string;
}

export function filterSessions(sessions: LiveSession[], f: PerfFilter): LiveSession[] {
  const kept = sessions.filter((s) => {
    if (!isCountable(s)) return false;
    if (f.from && s.date < f.from) return false;
    if (f.to && s.date > f.to) return false;
    if (f.brandId && s.brandId !== f.brandId) return false;
    return true;
  });
  if (!f.hostId) return kept;
  // Lọc theo host: ca đổi host giữa ca chỉ trả PHẦN của host đó (số + giờ chia theo giờ đứng ca).
  return kept.flatMap((s) => hostPortions(s).filter((p) => p.hostId === f.hostId));
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
    const cur = acc.get(k) ?? { t: emptyKeyCounts(), ...labelOf(s) };
    acc.set(k, { ...cur, t: addTo(cur.t, s) });
  }
  return [...acc.entries()]
    .map(([k, v]) => finish(k, v.label, v.t, v.subLabel))
    .sort((a, b) => (b.gmvPerHour ?? 0) - (a.gmvPerHour ?? 0));
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
  assertOnePlatform(sessions, "byHost");
  return groupBy(expandHostPortions(sessions), hostKey, (s) => ({ label: s.hostName || "Chưa gán host" }));
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

// Ô hiệu suất cho lưới host × thứ — thứ mà việc sắp lịch thật sự cần: "host này mạnh nhất vào thứ mấy".
export interface HostWeekdayCell {
  hostId: string;
  weekday: number;
  gmvPerHour: number;
  sessionCount: number;
}

export function hostWeekdayGrid(sessions: LiveSession[]): HostWeekdayCell[] {
  const acc = new Map<string, PerfTotals>();
  for (const s of expandHostPortions(sessions)) {
    // Cùng công thức khoá với byHost() để lưới khớp đúng dòng xếp hạng.
    const k = `${hostKey(s)}::${weekdayOf(s.date)}`;
    acc.set(k, addTo(acc.get(k) ?? emptyKeyCounts(), s));
  }
  return [...acc.entries()].map(([k, t]) => {
    const [hostId, wd] = k.split("::");
    return {
      hostId,
      weekday: Number(wd),
      gmvPerHour: t.hours > 0 ? t.gmv / t.hours : 0,
      sessionCount: t.sessions
    };
  });
}

// Host tách ngày thường + TỪNG camp (D-Day / Mid-Month / Pay Day riêng) để so với nhau (report tháng,
// theo deck Crocs). Luật chia đã chốt với user 2026-09-26: GMV của ca tính TRỌN cho host; trợ live
// không nhận GMV, chỉ được ghi giờ live — nên giờ trợ để riêng một cột, không cộng vào giờ host (cộng
// vào sẽ kéo tụt GMV/giờ của người đó).
export type DayTypePart = KeyCounts;

// Thứ tự cột của bảng: ngày thường trước làm mốc, rồi 3 camp.
export const HOST_DAY_TYPE_ORDER: CampDayBucket[] = ["daily", "dday", "midmonth", "payday"];

export interface HostDayTypeRow {
  key: string;
  name: string;
  byBucket: Record<CampDayBucket, DayTypePart>;
  assist: DayTypePart; // gmv luôn 0
}

const emptyPart = emptyKeyCounts;

function addPart(p: DayTypePart, s: LiveSession, hours: number) {
  addKeyInput(p, keyInputFromSession(s, hours));
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
    // Đổi host giữa ca: mỗi host một phần (số + giờ chia theo giờ đứng ca).
    const hostParts = hostPortions(s);
    const hostKeys = new Set<string>();
    for (const hp of hostParts) {
      const hk = hostKey(hp);
      hostKeys.add(hk);
      if (hk !== UNASSIGNED_HOST_KEY) addPart(rowOf(hk, hp.hostName).byBucket[bucketOf(hp.date)], hp, sessionHours(hp));
    }
    // Trợ live: mỗi người một phần giờ (đổi trợ giữa ca thì giờ chia theo giờ đứng ca).
    const coShares = hasStaffSegments(s, "co_host") ? roleShares(s, "co_host") : null;
    if (coShares) {
      for (const p of coShares) {
        if (hostKeys.has(p.talentId)) continue;
        const part = rowOf(p.talentId, p.name).assist;
        part.sessions += 1;
        part.hours += h * p.share;
      }
    } else {
      const ck = coHostKey(s);
      if (ck && !hostKeys.has(ck)) {
        const part = rowOf(ck, s.coHostName).assist;
        part.sessions += 1;
        part.hours += h;
      }
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
export type DayTypeMetrics = KeyMetrics;

export const dayTypeMetrics = (p: DayTypePart): DayTypeMetrics => keyMetrics(p);

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
