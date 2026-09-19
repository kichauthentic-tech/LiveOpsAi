// Kế Hoạch Tháng — engine gợi ý phân bổ ca (giai đoạn B, thiết kế ở WORKSPACE_DESIGN "Engine gợi ý").
// THUẦN: vào là lịch sử ca đã đối soát + ràng buộc, ra là danh sách ca kèm dự báo + lý do. Không DB,
// không import.meta.env — chạy được trong unit test.
//
// Lớp 1 — tín hiệu: ma trận thứ-trong-tuần × khối giờ, mỗi ca rải giờ/GMV/người xem/đơn vào các khối
//   nó phủ (đều theo phút). Trọng số thời gian giảm mũ theo tháng; winsorize GMV/giờ theo p95; ô ít
//   quan sát kéo về trung bình brand (shrinkage). Lợi suất giảm dần theo thứ tự ca trong ngày học từ
//   lịch sử. Hệ số camp học từ lịch sử (D-Day/Mid/Pay so với ngày thường).
// Lớp 3 — tối ưu ràng buộc: tham lam theo điểm biên (marginal), ứng viên = mọi (ngày, giờ bắt đầu)
//   trong khung; ràng buộc cứng: Σ giờ = cam kết, khung giờ, tối đa ca/ngày, không chồng, ngày cấm;
//   mềm: tỷ trọng khung camp theo tab 05, rải đều tuần, thưởng khung neo lặp lại (đều đặn).
// Lớp 4 — giải thích: lý do từng ca, đường cong biên, khả thi target, độ tin cậy.
import { LiveSession } from "../../types";
import { CampDayBucket, CampOverrides, resolveCampBucketType } from "../campaignDays";
import { sessionDurationHours } from "../pnl";

export const BLOCK_HOURS = 2; // khối giờ 2h → 12 khối/ngày
const RECENCY_LAMBDA = 0.35; // e^-0.35 ≈ 0.70/tháng → nửa đời ~2 tháng
const SHRINK_K = 3; // số quan sát "ảo" kéo về trung bình brand
const MIN_HISTORY_SESSIONS = 20;

export interface HistoryCell {
  weekday: number; // 0=CN
  block: number; // 0..11
  hours: number; // giờ có trọng số
  gmv: number; // GMV có trọng số
  views: number;
  orders: number;
  n: number; // số ca chạm ô (không trọng số)
  gmvPerHour: number; // đã shrink
  rawGmvPerHour: number;
  viewsPerHour: number;
  conversion: number; // đơn / người xem
  tag: "strong" | "traffic_low_cvr" | "weak" | "thin"; // nhãn giải thích
}

export type CalendarEventKind = "holiday" | "mega_sale" | "event";
export interface CalendarEvent {
  date: string;
  kind: CalendarEventKind;
  label: string;
}
export interface DateRange {
  start: string;
  end: string;
  label?: string;
}

export interface HistorySummary {
  sessions: number;
  months: number;
  firstDate?: string;
  lastDate?: string;
  brandGmvPerHour: number;
  campMultipliers: Record<CampDayBucket, number>;
  campLearned: Record<CampDayBucket, boolean>;
  diminishing: number[]; // hệ số ca thứ 1, 2, 3… trong ngày
  // Giờ live/ngày (median) theo loại ngày, học từ lịch sử (≥ 3 ngày). Hệ số camp ở trên đo TRÊN
  // TOÀN BỘ số giờ này (CROCS: D-Day ~12h/ngày liên tục), nên trong khuôn giờ đó không áp lợi suất
  // giảm dần, và trần ca/ngày của ngày camp được nới cho đủ số giờ.
  campHoursPerDay: Record<CampDayBucket, number>;
  campHoursLearned: Record<CampDayBucket, boolean>;
  cells: HistoryCell[];
  enough: boolean;
  // Lớp 2 — học từ lịch sử nếu đủ ca (≥ 5), không thì 1.0 và chỉ ghi nhãn.
  eventMultipliers: Record<CalendarEventKind, number>;
  eventLearned: Record<CalendarEventKind, boolean>;
  schemeMultiplier: number; // ngày trùng scheme khuyến mãi so với ngày không
  schemeLearned: boolean;
}

export interface HistoryContext {
  events?: CalendarEvent[]; // lịch sự kiện dùng chung (calendar_events)
  schemes?: DateRange[]; // scheme khuyến mãi của brand (quá khứ lẫn tương lai)
}

export interface SuggestConstraints {
  month: string; // "YYYY-MM"
  today: string;
  committedHours: number;
  targetGmv: number; // 0 = chưa có
  // "hours" (mặc định): xếp đủ committedHours. "target": xếp tới khi dự báo chạm targetGmv (hoặc hết
  // chỗ trong khung) — trả về số giờ cần; committedHours chỉ dùng để so trong ghi chú.
  mode?: "hours" | "target";
  camp?: CampOverrides; // khoảng ngày camp riêng của kế hoạch (trống = lịch camp cố định)
  liveWindowStart: string;
  liveWindowEnd: string;
  defaultSlotHours: number;
  maxSlotsPerDay: number;
  blackoutDates?: string[];
  fixedSlots?: { date: string; startTime: string; endTime: string }[]; // ca ops đã đặt tay, giữ nguyên
  events?: CalendarEvent[];
  schemes?: DateRange[];
  // Giai đoạn D: hệ số hiệu chỉnh theo ô "weekday|block" học từ kế hoạch vs thực tế các tháng trước.
  calibration?: Map<string, number>;
  // "max": tối đa GMV kỳ vọng (mặc định). "balanced": rải đều tuần/ngày, thưởng đều đặn mạnh, tối
  // đa 2 ca/ngày. "lean": ít ca dài hơn (ca = mặc định + 1h), dồn ngày đã có ca.
  strategy?: SuggestStrategy;
}

export type SuggestStrategy = "max" | "balanced" | "lean";
export const STRATEGY_LABEL: Record<SuggestStrategy, string> = { max: "Tối đa GMV", balanced: "Cân bằng", lean: "Tiết kiệm" };

export interface SuggestedSlot {
  date: string;
  startTime: string;
  endTime: string;
  hours: number;
  expectedGmv: number;
  targetGmv: number;
  bucket: CampDayBucket;
  reason: string;
  highExpectation: boolean; // target > dự báo × 1.3
  fixed: boolean;
  dayLabel?: string; // ngày lễ / sự kiện / scheme trùng ngày (để lưới ghi nhãn)
}

export interface MarginalPoint {
  hours: number; // luỹ kế
  gmv: number; // luỹ kế
}

export interface SuggestResult {
  slots: SuggestedSlot[];
  totalHours: number;
  forecastGmv: number;
  marginal: MarginalPoint[];
  // Khả thi target: cần bao nhiêu giờ để dự báo chạm target (theo cùng thuật toán), null nếu không tới.
  hoursToHitTarget: number | null;
  targetGapGmv: number; // target − dự báo (dương = thiếu)
  confidence: "none" | "low" | "medium" | "high";
  notes: string[];
}

const pad2 = (n: number) => `${n}`.padStart(2, "0");
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const toHhmm = (min: number) => `${pad2(Math.floor(min / 60) % 24)}:${pad2(min % 60)}`;
const monthsBetween = (fromDate: string, toDate: string) => {
  const [y1, m1] = fromDate.split("-").map(Number);
  const [y2, m2] = toDate.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};
const weekdayOf = (date: string) => new Date(`${date}T00:00:00`).getDay();
const percentile = (xs: number[], p: number) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const i = Math.min(s.length - 1, Math.max(0, Math.floor(p * (s.length - 1))));
  return s[i];
};

// ============ Lớp 1: lịch sử → ma trận ============
export function buildHistory(sessions: LiveSession[], brandId: string, asOf: string, ctx: HistoryContext = {}): HistorySummary {
  const eventKindOf = (date: string): CalendarEventKind | null => {
    const hit = (ctx.events ?? []).find((e) => e.date === date);
    return hit ? hit.kind : null;
  };
  const inScheme = (date: string) => (ctx.schemes ?? []).some((r) => date >= r.start && date <= r.end);
  const usable = sessions.filter(
    (s) =>
      s.brandId === brandId &&
      s.status === "Completed" &&
      s.dataSource === "tiktok_reconciled" &&
      s.actualGmv > 0 &&
      sessionDurationHours(s.startTime, s.endTime) > 0
  );
  const empty: HistorySummary = {
    sessions: usable.length,
    months: 0,
    brandGmvPerHour: 0,
    campMultipliers: { daily: 1, dday: 1, midmonth: 1, payday: 1 },
    campLearned: { daily: false, dday: false, midmonth: false, payday: false },
    diminishing: [1, 0.85, 0.7, 0.6],
    campHoursPerDay: { daily: 0, dday: 0, midmonth: 0, payday: 0 },
    campHoursLearned: { daily: false, dday: false, midmonth: false, payday: false },
    cells: [],
    enough: false,
    eventMultipliers: { holiday: 1, mega_sale: 1, event: 1 },
    eventLearned: { holiday: false, mega_sale: false, event: false },
    schemeMultiplier: 1,
    schemeLearned: false
  };
  if (usable.length === 0) return empty;

  const dates = usable.map((s) => s.date).sort();
  const firstDate = dates[0];
  const lastDate = dates[dates.length - 1];
  const months = new Set(usable.map((s) => s.date.slice(0, 7))).size;

  // GMV/giờ từng ca, winsorize p95 để 1 ca viral không kéo cả ô.
  const perHour = usable.map((s) => s.actualGmv / sessionDurationHours(s.startTime, s.endTime));
  const cap = percentile(perHour, 0.95);
  const weightOf = (s: LiveSession) => Math.exp(-RECENCY_LAMBDA * Math.max(0, monthsBetween(s.date.slice(0, 7), asOf.slice(0, 7))));

  // Rải từng ca vào ô thứ × khối theo phút phủ.
  const acc = new Map<string, { hours: number; gmv: number; views: number; orders: number; n: Set<string> }>();
  let totalW = 0;
  let totalGmvW = 0;
  const bucketAcc: Record<CampDayBucket, { h: number; g: number; n: number }> = {
    daily: { h: 0, g: 0, n: 0 }, dday: { h: 0, g: 0, n: 0 }, midmonth: { h: 0, g: 0, n: 0 }, payday: { h: 0, g: 0, n: 0 }
  };
  const byDate = new Map<string, LiveSession[]>();
  const eventAcc: Record<CalendarEventKind, { h: number; g: number; n: number }> = { holiday: { h: 0, g: 0, n: 0 }, mega_sale: { h: 0, g: 0, n: 0 }, event: { h: 0, g: 0, n: 0 } };
  const plainAcc = { h: 0, g: 0 };
  const schemeAcc = { h: 0, g: 0, n: 0 };
  const noSchemeAcc = { h: 0, g: 0 };
  for (const s of usable) {
    const hours = sessionDurationHours(s.startTime, s.endTime);
    const gph = Math.min(s.actualGmv / hours, cap);
    const gmvCapped = gph * hours;
    const w = weightOf(s);
    totalW += hours * w;
    totalGmvW += gmvCapped * w;
    const b = resolveCampBucketType(s.date);
    bucketAcc[b].h += hours * w;
    bucketAcc[b].g += gmvCapped * w;
    bucketAcc[b].n += 1;
    const ek = eventKindOf(s.date);
    if (ek) { eventAcc[ek].h += hours * w; eventAcc[ek].g += gmvCapped * w; eventAcc[ek].n += 1; }
    else { plainAcc.h += hours * w; plainAcc.g += gmvCapped * w; }
    if (inScheme(s.date)) { schemeAcc.h += hours * w; schemeAcc.g += gmvCapped * w; schemeAcc.n += 1; }
    else { noSchemeAcc.h += hours * w; noSchemeAcc.g += gmvCapped * w; }
    const list = byDate.get(s.date) ?? [];
    list.push(s);
    byDate.set(s.date, list);

    const wd = weekdayOf(s.date);
    let cur = toMin(s.startTime);
    let end = toMin(s.endTime);
    if (end <= cur) end += 24 * 60;
    const totalMin = end - cur;
    while (cur < end) {
      const blockEnd = (Math.floor(cur / (BLOCK_HOURS * 60)) + 1) * BLOCK_HOURS * 60;
      const seg = Math.min(blockEnd, end) - cur;
      const frac = seg / totalMin;
      const block = Math.floor((cur % (24 * 60)) / (BLOCK_HOURS * 60));
      const wdAdj = cur >= 24 * 60 ? (wd + 1) % 7 : wd;
      const key = `${wdAdj}|${block}`;
      const c = acc.get(key) ?? { hours: 0, gmv: 0, views: 0, orders: 0, n: new Set<string>() };
      c.hours += (seg / 60) * w;
      c.gmv += gmvCapped * frac * w;
      c.views += (s.totalViews || 0) * frac * w;
      c.orders += (s.totalOrders || 0) * frac * w;
      c.n.add(s.id);
      acc.set(key, c);
      cur += seg;
    }
  }
  const brandGmvPerHour = totalW > 0 ? totalGmvW / totalW : 0;

  const cells: HistoryCell[] = [];
  for (const [key, c] of acc) {
    const [wd, block] = key.split("|").map(Number);
    const raw = c.hours > 0 ? c.gmv / c.hours : 0;
    const n = c.n.size;
    const shrunk = (n * raw + SHRINK_K * brandGmvPerHour) / (n + SHRINK_K);
    const viewsPerHour = c.hours > 0 ? c.views / c.hours : 0;
    const conversion = c.views > 0 ? c.orders / c.views : 0;
    cells.push({ weekday: wd, block, hours: c.hours, gmv: c.gmv, views: c.views, orders: c.orders, n, gmvPerHour: shrunk, rawGmvPerHour: raw, viewsPerHour, conversion, tag: "thin" });
  }
  // Nhãn: so với trung vị brand.
  const medGph = percentile(cells.map((c) => c.gmvPerHour), 0.5);
  const medVph = percentile(cells.filter((c) => c.views > 0).map((c) => c.viewsPerHour), 0.5);
  const medConv = percentile(cells.filter((c) => c.views > 0).map((c) => c.conversion), 0.5);
  for (const c of cells) {
    if (c.n < 2) c.tag = "thin";
    else if (c.gmvPerHour >= medGph * 1.15) c.tag = "strong";
    else if (medVph > 0 && c.viewsPerHour >= medVph * 1.15 && c.conversion < medConv * 0.85) c.tag = "traffic_low_cvr";
    else c.tag = c.gmvPerHour < medGph * 0.85 ? "weak" : "thin";
  }

  // Hệ số camp học từ lịch sử — cần ≥ 3 ca trong khung và có ngày thường để so; clamp [0.8, 3].
  const dailyGph = bucketAcc.daily.h > 0 ? bucketAcc.daily.g / bucketAcc.daily.h : brandGmvPerHour;
  const defaults: Record<CampDayBucket, number> = { daily: 1, dday: 1.3, midmonth: 1.15, payday: 1.15 };
  const campMultipliers = { ...defaults };
  const campLearned: Record<CampDayBucket, boolean> = { daily: true, dday: false, midmonth: false, payday: false };
  for (const b of ["dday", "midmonth", "payday"] as CampDayBucket[]) {
    const a = bucketAcc[b];
    if (a.n >= 3 && a.h > 0 && dailyGph > 0) {
      campMultipliers[b] = Math.min(3, Math.max(0.8, a.g / a.h / dailyGph));
      campLearned[b] = true;
    }
  }

  // Giờ live/ngày theo loại ngày — median các ngày có ca (không trọng số: đây là thói quen vận hành,
  // không phải hiệu suất).
  const dayHoursByBucket: Record<CampDayBucket, number[]> = { daily: [], dday: [], midmonth: [], payday: [] };
  for (const [date, list] of byDate) {
    dayHoursByBucket[resolveCampBucketType(date)].push(list.reduce((a, x) => a + sessionDurationHours(x.startTime, x.endTime), 0));
  }
  const campHoursPerDay = { ...empty.campHoursPerDay };
  const campHoursLearned = { ...empty.campHoursLearned };
  for (const b of Object.keys(dayHoursByBucket) as CampDayBucket[]) {
    if (dayHoursByBucket[b].length >= 3) {
      campHoursPerDay[b] = percentile(dayHoursByBucket[b], 0.5);
      campHoursLearned[b] = true;
    }
  }

  // Lợi suất giảm dần: GMV/giờ của ca thứ k trong ngày so với ca thứ 1 (cùng ngày, thứ tự theo giờ).
  const byPos: { g: number; h: number }[] = [];
  for (const list of byDate.values()) {
    const sorted = [...list].sort((a, b) => a.startTime.localeCompare(b.startTime));
    sorted.forEach((s, i) => {
      const h = sessionDurationHours(s.startTime, s.endTime);
      byPos[i] = byPos[i] ?? { g: 0, h: 0 };
      byPos[i].g += Math.min(s.actualGmv / h, cap) * h;
      byPos[i].h += h;
    });
  }
  const diminishing = [...empty.diminishing];
  if (byPos[0] && byPos[0].h > 0) {
    const first = byPos[0].g / byPos[0].h;
    for (let k = 1; k < Math.min(byPos.length, 4); k++) {
      if (byPos[k].h >= 6 && first > 0) diminishing[k] = Math.min(1, Math.max(0.4, byPos[k].g / byPos[k].h / first));
    }
  }

  // Lớp 2: ngày lễ/sự kiện & scheme — so GMV/giờ ngày có vs không, cần ≥ 5 ca, clamp [0.6, 2.5].
  const plainGph = plainAcc.h > 0 ? plainAcc.g / plainAcc.h : brandGmvPerHour;
  const eventMultipliers: Record<CalendarEventKind, number> = { holiday: 1, mega_sale: 1, event: 1 };
  const eventLearned: Record<CalendarEventKind, boolean> = { holiday: false, mega_sale: false, event: false };
  for (const k of ["holiday", "mega_sale", "event"] as CalendarEventKind[]) {
    const a = eventAcc[k];
    if (a.n >= 5 && a.h > 0 && plainGph > 0) {
      eventMultipliers[k] = Math.min(2.5, Math.max(0.6, a.g / a.h / plainGph));
      eventLearned[k] = true;
    }
  }
  const noSchemeGph = noSchemeAcc.h > 0 ? noSchemeAcc.g / noSchemeAcc.h : brandGmvPerHour;
  let schemeMultiplier = 1;
  let schemeLearned = false;
  if (schemeAcc.n >= 5 && schemeAcc.h > 0 && noSchemeGph > 0) {
    schemeMultiplier = Math.min(2, Math.max(0.8, schemeAcc.g / schemeAcc.h / noSchemeGph));
    schemeLearned = true;
  }

  return {
    sessions: usable.length,
    months,
    firstDate,
    lastDate,
    brandGmvPerHour,
    campMultipliers,
    campLearned,
    diminishing,
    campHoursPerDay,
    campHoursLearned,
    cells: cells.sort((a, b) => b.gmvPerHour - a.gmvPerHour),
    enough: usable.length >= MIN_HISTORY_SESSIONS && months >= 2,
    eventMultipliers,
    eventLearned,
    schemeMultiplier,
    schemeLearned
  };
}

// ============ Lớp 3: tối ưu ============
interface Candidate {
  date: string;
  start: number; // phút
  end: number;
  hours: number;
  bucket: CampDayBucket;
  baseGph: number; // GMV/giờ kỳ vọng trung bình các ô phủ (đã shrink), chưa nhân camp
  cellRefs: HistoryCell[];
}

const fmtM = (v: number) => `${(v / 1_000_000).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}tr`;

function cellLookup(h: HistorySummary) {
  const m = new Map<string, HistoryCell>();
  for (const c of h.cells) m.set(`${c.weekday}|${c.block}`, c);
  return (wd: number, block: number) => m.get(`${wd}|${block}`);
}

function expectedGphFor(date: string, start: number, end: number, h: HistorySummary, get: ReturnType<typeof cellLookup>, calibration?: Map<string, number>): { gph: number; cells: HistoryCell[] } {
  const wd = weekdayOf(date);
  let cur = start;
  let sum = 0;
  const cells: HistoryCell[] = [];
  while (cur < end) {
    const blockEnd = (Math.floor(cur / (BLOCK_HOURS * 60)) + 1) * BLOCK_HOURS * 60;
    const seg = Math.min(blockEnd, end) - cur;
    const block = Math.floor((cur % (24 * 60)) / (BLOCK_HOURS * 60));
    const c = get(wd, block);
    const cal = calibration?.get(`${wd}|${block}`) ?? 1;
    // Ô chưa có lịch sử: 70% trung bình brand — vẫn chọn được nhưng thua ô đã chứng minh.
    sum += (c ? c.gmvPerHour : h.brandGmvPerHour * 0.7) * cal * (seg / 60);
    if (c) cells.push(c);
    cur += seg;
  }
  const hours = (end - start) / 60;
  return { gph: hours > 0 ? sum / hours : 0, cells };
}

export function suggestMonthPlan(history: HistorySummary, c: SuggestConstraints): SuggestResult {
  const notes: string[] = [];
  const [y, m] = c.month.split("-").map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const blackout = new Set(c.blackoutDates ?? []);
  const winStart = toMin(c.liveWindowStart);
  const winEnd = toMin(c.liveWindowEnd);
  const strategy: SuggestStrategy = c.strategy ?? "max";
  const slotHoursEff = strategy === "lean" ? c.defaultSlotHours + 1 : c.defaultSlotHours;
  const maxPerDay = strategy === "balanced" ? Math.min(c.maxSlotsPerDay, 2) : c.maxSlotsPerDay;
  const slotMin = Math.round(slotHoursEff * 60);
  // Ngày camp: trần ca/ngày nới theo giờ/ngày học từ lịch sử (không bao giờ thấp hơn trần ops đặt).
  const dayCapOf = (bucket: CampDayBucket) => {
    const goal = history.campHoursPerDay[bucket];
    if (bucket === "daily" || goal <= 0) return maxPerDay;
    return Math.max(maxPerDay, Math.round(goal / slotHoursEff));
  };
  // Lợi suất giảm dần chỉ áp NGOÀI khuôn giờ/ngày đã đo hệ số camp — trong khuôn thì hệ số camp đã
  // gồm cả giờ thứ 10–12 của ngày đó rồi, áp thêm là phạt hai lần.
  const dimFor = (cand: Candidate, before: Candidate[]) => {
    const goal = history.campHoursPerDay[cand.bucket];
    const hoursBefore = before.reduce((a, s) => a + s.hours, 0);
    if (goal > 0 && hoursBefore + cand.hours <= goal + 0.01) return 1;
    return history.diminishing[Math.min(before.length, history.diminishing.length - 1)];
  };
  // Lớp 2: hệ số theo ngày (lễ/sự kiện × scheme) + nhãn để giải thích.
  const eventByDate = new Map<string, CalendarEvent>();
  for (const e of c.events ?? []) if (!eventByDate.has(e.date)) eventByDate.set(e.date, e);
  const schemeOf = (date: string) => (c.schemes ?? []).find((r) => date >= r.start && date <= r.end);
  const dayFactor = (date: string) => {
    const e = eventByDate.get(date);
    const sch = schemeOf(date);
    return (e ? history.eventMultipliers[e.kind] : 1) * (sch ? history.schemeMultiplier : 1);
  };
  const dayLabelOf = (date: string) => {
    const e = eventByDate.get(date);
    const sch = schemeOf(date);
    return [e?.label, sch ? `KM: ${sch.label ?? "scheme"}` : ""].filter(Boolean).join(" · ") || undefined;
  };
  const get = cellLookup(history);
  const brandGph = history.brandGmvPerHour;

  if (!history.enough) {
    notes.push(
      history.sessions === 0
        ? "Brand chưa có ca đối soát nào — không có lịch sử để gợi ý. Dùng quy tắc lặp."
        : `Lịch sử mỏng (${history.sessions} ca, ${history.months} tháng; cần ≥ ${MIN_HISTORY_SESSIONS} ca và ≥ 2 tháng) — gợi ý chỉ để tham khảo.`
    );
  }
  if (brandGph <= 0) {
    return { slots: [], totalHours: 0, forecastGmv: 0, marginal: [], hoursToHitTarget: null, targetGapGmv: c.targetGmv, confidence: "none", notes };
  }

  // Ca ops đã đặt tay: giữ nguyên, chiếm chỗ + giờ.
  const chosen: Candidate[] = [];
  const fixedKeys = new Set<string>();
  for (const f of c.fixedSlots ?? []) {
    const start = toMin(f.startTime);
    const end = toMin(f.endTime);
    if (end <= start) continue;
    const { gph, cells } = expectedGphFor(f.date, start, end, history, get, c.calibration);
    chosen.push({ date: f.date, start, end, hours: (end - start) / 60, bucket: resolveCampBucketType(f.date, c.camp), baseGph: gph, cellRefs: cells });
    fixedKeys.add(`${f.date}|${f.startTime}`);
  }

  // Ứng viên: mọi ngày ≥ hôm nay, giờ bắt đầu bước 60' trong khung, dài = mặc định.
  const candidates: Candidate[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${y}-${pad2(m)}-${pad2(d)}`;
    if (date < c.today || blackout.has(date)) continue;
    const bucket = resolveCampBucketType(date, c.camp);
    for (let start = winStart; start + slotMin <= winEnd; start += 60) {
      const end = start + slotMin;
      const { gph, cells } = expectedGphFor(date, start, end, history, get, c.calibration);
      candidates.push({ date, start, end, hours: slotMin / 60, bucket, baseGph: gph, cellRefs: cells });
    }
  }

  const weeksInMonth = Math.ceil((daysInMonth + weekdayOf(`${y}-${pad2(m)}-01`)) / 7);
  const weekOf = (date: string) => Math.floor((Number(date.slice(-2)) - 1 + weekdayOf(`${y}-${pad2(m)}-01`)) / 7);

  const overlaps = (a: Candidate, b: Candidate) => a.date === b.date && a.start < b.end && b.start < a.end;

  // Điểm biên của 1 ứng viên trong trạng thái hiện tại.
  // GMV/giờ kỳ vọng thật của ứng viên trong trạng thái hiện tại (đã nhân camp + lợi suất giảm dần).
  const expectedGph = (cand: Candidate, state: Candidate[]) => {
    const dim = dimFor(cand, state.filter((s) => s.date === cand.date && s.start < cand.start));
    return cand.baseGph * history.campMultipliers[cand.bucket] * dim * dayFactor(cand.date);
  };

  // Điểm biên = kỳ vọng × các phạt/thưởng mềm — chỉ để XẾP HẠNG, không phải dự báo.
  const marginalScore = (cand: Candidate, state: Candidate[], targetHours: number) => {
    const sameDay = state.filter((s) => s.date === cand.date);
    if (sameDay.length >= dayCapOf(cand.bucket)) return -1;
    if (sameDay.some((s) => overlaps(s, cand))) return -1;
    const target = targetHours;
    let score = expectedGph(cand, state);
    // Phương án: "lean" dồn vào ngày đã có ca (mở ngày mới ×0.92); "balanced" phạt ngày ≥ 2 ca ×0.9.
    if (strategy === "lean" && sameDay.length === 0 && state.length > 0) score *= 0.92;
    if (strategy === "balanced" && sameDay.length >= 1) score *= 0.9;
    // Mềm: rải đều tuần — tuần đã > 130% mức trung bình thì giảm 10%.
    if (target > 0) {
      const wk = weekOf(cand.date);
      const weekHours = state.filter((s) => weekOf(s.date) === wk).reduce((a, s) => a + s.hours, 0);
      const cap = strategy === "balanced" ? 1.15 : 1.3;
      if ((weekHours + cand.hours) > (target / weeksInMonth) * cap) score *= strategy === "balanced" ? 0.75 : 0.9;
    }
    // Mềm: đều đặn — cùng giờ bắt đầu đã có ≥ 3 ngày khác → +5% (cân bằng: +10%).
    const anchors = state.filter((s) => s.start === cand.start && s.date !== cand.date).length;
    if (anchors >= 3) score *= strategy === "balanced" ? 1.1 : 1.05;
    return score;
  };

  const stopAtTarget = c.mode === "target" && c.targetGmv > 0;
  const greedy = (targetHours: number): { picked: Candidate[]; curve: MarginalPoint[] } => {
    const state = [...chosen];
    const picked: Candidate[] = [];
    let hours = state.reduce((a, s) => a + s.hours, 0);
    const curve: MarginalPoint[] = [];
    let cum = state.reduce((a, s) => a + expectedGph(s, state.filter((x) => x !== s)) * s.hours, 0);
    if (hours > 0) curve.push({ hours, gmv: cum });

    // Chọn ứng viên tốt nhất trong `pool` rồi đưa vào lưới; ca cuối cắt cho vừa giờ còn lại nếu ≥ 1h.
    const take = (pool: Candidate[]): boolean => {
      let best: Candidate | null = null;
      let bestScore = 0;
      for (const cand of pool) {
        const sc = marginalScore(cand, state, targetHours);
        if (sc > bestScore) {
          bestScore = sc;
          best = cand;
        }
      }
      if (!best) return false;
      const remaining = targetHours - hours;
      let pick = best;
      if (remaining < best.hours) {
        if (remaining < 1) return false;
        const end = best.start + Math.round(remaining * 60);
        const { gph, cells } = expectedGphFor(best.date, best.start, end, history, get, c.calibration);
        pick = { ...best, end, hours: remaining, baseGph: gph, cellRefs: cells };
      }
      const exp = expectedGph(pick, state) * pick.hours;
      state.push(pick);
      picked.push(pick);
      hours += pick.hours;
      cum += exp;
      curve.push({ hours, gmv: cum });
      return true;
    };

    // Pha 1 — khuôn ngày camp: lịch sử cho thấy brand live đủ ~N giờ mỗi ngày camp bất kể loại
    // (Mid-Month GMV/giờ thấp hơn ngày thường vẫn live 12h) và live LIỀN MẠCH (1–2 room kéo dài).
    // Đó là cách vận hành, không phải hiệu suất, nên lấp ngày camp đủ giờ TRƯỚC — bằng một khối ca
    // liên tục có tổng GMV/giờ cao nhất trong khung — rồi mới chia phần còn lại; nếu tổng giờ cam kết
    // không đủ cho mọi ngày camp thì co đều các ngày camp lại. Nhặt từng ca theo ô tốt nhất sẽ để
    // lại khe 1–2h không nhét ca nào được (10–13, 15–18, 20–23 → ngày chỉ 9h).
    const campDates = [...new Set(candidates.filter((x) => x.bucket !== "daily" && history.campHoursPerDay[x.bucket] > 0).map((x) => x.date))].sort();
    const campGoalTotal = campDates.reduce((a, d) => a + history.campHoursPerDay[resolveCampBucketType(d, c.camp)], 0);
    const campScale = campGoalTotal > 0 ? Math.min(1, Math.max(0, targetHours - hours) / campGoalTotal) : 0;
    const reached = () => stopAtTarget && cum >= c.targetGmv;
    for (const date of campDates) {
      if (hours + 0.01 >= targetHours || reached()) break;
      const bucket = resolveCampBucketType(date, c.camp);
      const goal = history.campHoursPerDay[bucket] * campScale;
      const already = state.filter((x) => x.date === date);
      const k = Math.min(Math.round(goal / slotHoursEff), Math.floor((winEnd - winStart) / slotMin), dayCapOf(bucket)) - already.length;
      if (k <= 0) continue;
      // Khối k ca liền nhau, không đè ca ops đã đặt, tổng GMV/giờ nền cao nhất.
      let bestBlock: Candidate[] | null = null;
      let bestSum = 0;
      for (let start = winStart; start + k * slotMin <= winEnd; start += 60) {
        const block: Candidate[] = [];
        for (let i = 0; i < k; i++) {
          const st = start + i * slotMin;
          const { gph, cells } = expectedGphFor(date, st, st + slotMin, history, get, c.calibration);
          block.push({ date, start: st, end: st + slotMin, hours: slotHoursEff, bucket, baseGph: gph, cellRefs: cells });
        }
        if (block.some((b) => already.some((a) => overlaps(a, b)))) continue;
        const sum = block.reduce((a, b) => a + b.baseGph, 0);
        if (sum > bestSum) {
          bestSum = sum;
          bestBlock = block;
        }
      }
      if (!bestBlock) continue;
      for (const slot of bestBlock) {
        if (hours + 0.01 >= targetHours || reached()) break;
        if (!take([slot])) break;
      }
    }

    // Pha 2 — phần còn lại theo điểm biên trên toàn tháng.
    let guard = 0;
    while (hours + 0.01 < targetHours && !reached() && guard++ < 400) {
      if (!take(candidates)) break;
    }
    return { picked, curve };
  };

  const committed = c.committedHours > 0 ? c.committedHours : 0;
  if (committed <= 0) notes.push("Chưa có giờ cam kết tháng này — nhập ở Cam Kết Hợp Đồng để engine biết phải xếp bao nhiêu giờ.");
  {
    const raised = (["dday", "midmonth", "payday"] as CampDayBucket[]).filter((b) => dayCapOf(b) > maxPerDay);
    if (raised.length > 0) {
      const label: Record<CampDayBucket, string> = { daily: "ngày thường", dday: "D-Day", midmonth: "Mid-Month", payday: "Pay-Day" };
      notes.push(`Khuôn ngày camp học từ lịch sử: ${raised.map((b) => `${label[b]} ~${history.campHoursPerDay[b].toFixed(0)}h/ngày`).join(", ")} → lấp đủ giờ ngày camp trước (tới ${raised.map((b) => `${dayCapOf(b)} ca`).join("/")}), phần còn lại mới chia cho ngày thường (tối đa ${maxPerDay} ca); tối đa ca/ngày của kế hoạch được nâng theo khi áp gợi ý.`);
    }
  }
  if (c.calibration && c.calibration.size > 0) notes.push(`Đã hiệu chỉnh GMV/giờ theo kế hoạch vs thực tế các tháng trước (${c.calibration.size} ô thứ × giờ có dữ liệu).`);
  // Chế độ target: trần giờ = sức chứa khung (mọi ngày còn lại × giờ khung), dừng khi dự báo chạm target.
  const capacityHours = [...new Set(candidates.map((x) => x.date))].length * ((winEnd - winStart) / 60);
  const main = greedy(stopAtTarget ? capacityHours : committed);

  // Dự báo + target/ca.
  const all = [...chosen, ...main.picked];
  const expected = all.map((s) => {
    const dim = dimFor(s, all.filter((x) => x.date === s.date && x.start < s.start));
    return s.baseGph * history.campMultipliers[s.bucket] * dim * dayFactor(s.date) * s.hours;
  });
  const forecastGmv = expected.reduce((a, b) => a + b, 0);
  const scale = c.targetGmv > 0 && forecastGmv > 0 ? c.targetGmv / forecastGmv : 0;

  const slots: SuggestedSlot[] = all.map((s, i) => {
    const exp = expected[i];
    const target = Math.round(exp * scale);
    const top = s.cellRefs[0];
    const reasonParts = [
      `GMV/giờ kỳ vọng ${fmtM(s.baseGph)} (${top ? `${top.n} ca lịch sử` : "ô chưa có lịch sử"}, ${history.months} tháng)`,
      brandGph > 0 ? `${s.baseGph >= brandGph ? "+" : "−"}${Math.abs(Math.round((s.baseGph / brandGph - 1) * 100))}% vs TB brand` : "",
      s.bucket !== "daily" ? `${s.bucket === "dday" ? "D-Day" : s.bucket === "midmonth" ? "Mid-Month" : "Pay-Day"} ×${history.campMultipliers[s.bucket].toFixed(2)}${history.campLearned[s.bucket] ? "" : " (mặc định)"}` : "",
      top?.tag === "traffic_low_cvr" ? "nhiều người xem, chuyển đổi yếu — ca kéo follow/giới thiệu SP" : "",
      eventByDate.get(s.date) ? `${eventByDate.get(s.date)!.label} ×${history.eventMultipliers[eventByDate.get(s.date)!.kind].toFixed(2)}${history.eventLearned[eventByDate.get(s.date)!.kind] ? "" : " (chưa có lịch sử, chỉ ghi nhãn)"}` : "",
      schemeOf(s.date) ? `trùng KM ×${history.schemeMultiplier.toFixed(2)}${history.schemeLearned ? "" : " (chưa học được)"}` : "",
      fixedKeys.has(`${s.date}|${toHhmm(s.start)}`) ? "ops đặt tay" : ""
    ].filter(Boolean);
    return {
      date: s.date,
      startTime: toHhmm(s.start),
      endTime: toHhmm(s.end),
      hours: s.hours,
      expectedGmv: Math.round(exp),
      targetGmv: target,
      bucket: s.bucket,
      reason: reasonParts.join(" · "),
      highExpectation: target > exp * 1.3,
      fixed: fixedKeys.has(`${s.date}|${toHhmm(s.start)}`),
      dayLabel: dayLabelOf(s.date)
    };
  }).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

  // Khả thi target: chạy tiếp thuật toán tới khi dự báo chạm target (tối đa 2× cam kết).
  let hoursToHitTarget: number | null = null;
  if (c.targetGmv > 0) {
    if (forecastGmv >= c.targetGmv) hoursToHitTarget = all.reduce((a, s) => a + s.hours, 0);
    else if (stopAtTarget) hoursToHitTarget = null; // đã chạy hết sức chứa mà chưa chạm
    else {
      const ext = greedy(Math.max(committed * 2, committed + 40));
      const hit = ext.curve.find((p) => p.gmv >= c.targetGmv);
      hoursToHitTarget = hit ? hit.hours : null;
    }
  }

  const totalHours = all.reduce((a, s) => a + s.hours, 0);
  if (stopAtTarget) {
    if (forecastGmv >= c.targetGmv) notes.push(`Xếp theo target: cần ${totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h để dự báo chạm ${fmtM(c.targetGmv)}${committed > 0 ? ` (cam kết ${committed}h → ${totalHours > committed ? "thiếu" : "dư"} ${Math.abs(totalHours - committed).toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h)` : ""}.`);
    else notes.push(`Xếp theo target: lấp hết chỗ (${totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h trong khung giờ / tối đa ca/ngày) vẫn chỉ dự báo ${fmtM(forecastGmv)} / ${fmtM(c.targetGmv)} — target vượt sức lịch sử; nới khung giờ, tăng CVR/AOV hoặc hạ target.`);
  } else if (committed > 0 && totalHours + 0.01 < committed) notes.push(`Chỉ xếp được ${totalHours.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}h / ${committed}h — hết chỗ trong khung giờ hoặc chạm tối đa ca/ngày; nới khung hoặc số ca/ngày.`);
  if (c.targetGmv > 0 && !stopAtTarget) {
    const gap = c.targetGmv - forecastGmv;
    if (gap > 0) notes.push(hoursToHitTarget ? `Dự báo thiếu ${fmtM(gap)} so với target — cần ~${Math.ceil(hoursToHitTarget)}h (thay vì ${committed}h) theo cùng cách xếp.` : `Dự báo thiếu ${fmtM(gap)} so với target — thêm giờ trong khung cũng không chạm được; cần tăng CVR/AOV hoặc hạ target.`);
    else notes.push(`Dự báo vượt target ${fmtM(-gap)} — có dư địa giảm giờ hoặc nâng target.`);
  }
  const confidence: SuggestResult["confidence"] = !history.enough ? (history.sessions > 0 ? "low" : "none") : history.sessions >= 100 && history.months >= 3 ? "high" : "medium";

  return {
    slots,
    totalHours,
    forecastGmv: Math.round(forecastGmv),
    marginal: main.curve,
    hoursToHitTarget,
    targetGapGmv: c.targetGmv > 0 ? Math.round(c.targetGmv - forecastGmv) : 0,
    confidence,
    notes
  };
}

// Dự báo GMV cho một lưới ca đã có (không xếp gì thêm) — cùng công thức với gợi ý, để "Chia target"
// trên lưới ops tự vẽ ra cùng một con số với lưới engine vẽ. Không có lịch sử → trả toàn 0, người
// gọi tự rơi về chia theo giờ.
export function estimateSlots(
  history: HistorySummary,
  slots: { date: string; startTime: string; endTime: string }[],
  ctx: Pick<SuggestConstraints, "camp" | "events" | "schemes" | "calibration">
): number[] {
  if (history.brandGmvPerHour <= 0) return slots.map(() => 0);
  const get = cellLookup(history);
  const eventByDate = new Map<string, CalendarEvent>();
  for (const e of ctx.events ?? []) if (!eventByDate.has(e.date)) eventByDate.set(e.date, e);
  const dayFactor = (date: string) => {
    const e = eventByDate.get(date);
    const sch = (ctx.schemes ?? []).some((r) => date >= r.start && date <= r.end);
    return (e ? history.eventMultipliers[e.kind] : 1) * (sch ? history.schemeMultiplier : 1);
  };
  const parsed = slots.map((s) => ({ ...s, start: toMin(s.startTime), end: toMin(s.endTime), bucket: resolveCampBucketType(s.date, ctx.camp) }));
  return parsed.map((s) => {
    const hours = (s.end - s.start) / 60;
    if (hours <= 0) return 0;
    const { gph } = expectedGphFor(s.date, s.start, s.end, history, get, ctx.calibration);
    const before = parsed.filter((x) => x.date === s.date && x.start < s.start);
    const hoursBefore = before.reduce((a, x) => a + Math.max(0, (x.end - x.start) / 60), 0);
    const goal = history.campHoursPerDay[s.bucket];
    const dim = goal > 0 && hoursBefore + hours <= goal + 0.01 ? 1 : history.diminishing[Math.min(before.length, history.diminishing.length - 1)];
    return gph * history.campMultipliers[s.bucket] * dim * dayFactor(s.date) * hours;
  });
}
