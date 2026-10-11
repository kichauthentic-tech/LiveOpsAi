import type { LiveSession, ShiftSlot } from "../../types";
import type { CampDayBucket } from "../campaignDays";
import { addDays, dateTimeRangesOverlap, eachDay, type DateTimeRange } from "../dateUtils";
import { sessionDurationHours } from "../pnl";
import { effectiveSegments, personWindows } from "../staffSegments";
import { personClash, studioClash } from "../scheduling/conflicts";
import { assertOnePlatform } from "../platforms/perf";
import { glmWeights } from "./allocationModel";
import { normalCdf } from "./forecastCone";
import { hostPortions, isCountable, sessionHours } from "./hostPerformance";
import { buildMonthForecaster, inMonthProjection, slotForecasts, type ForecastParams, type MonthForecaster, type MonthItem } from "./monthForecast";

// PHÒNG ĐIỀU HÀNH (11/10/2026) — đề xuất + bản thử trên số thật: https://claude.ai/artifact/Hu2U23dfazeNpkbfJ518n9.
// Lõi tính toán thuần (không đụng Supabase). Mọi con số đi qua ĐÚNG engine dự báo v3 đang chia target và chiếu cuối tháng
// (monthForecast.ts) — một khái niệm, một hàm:
//   • GMV kỳ vọng của một ca   = slotForecasts (mức × trọng số giờ × loại ngày × khung giờ × vị trí trong camp) — "xG" của ca.
//   • Khả năng về đích        = P(GMV cuối tháng ≥ target), GMV cuối ~ chuẩn(dự phóng, σ), nửa dải 80% = band × phần chưa về —
//                                ĐÚNG công thức landingOf của Dashboard (coneCoef = forecaster.band).
//   • Đường khả năng theo ngày = cùng công thức, "nếu hôm nay là ngày d" (chỉ ca ngày ≤ d có số được tính là đã có).
//   • Ca xoay chuyển           = khả năng hiện tại − khả năng nếu ca đó chỉ đạt đúng kỳ vọng (bỏ số thật của riêng ca đó).
// Số đo backtest (11/10, 956 ca T7–T10, walk-forward): kỳ vọng từng ca sai 29% so với 34% của GMV/giờ 28 ngày × giờ; dải 80%
// chứa kết quả thật 82% số lần (445 lần đo). Tay nghề host sau khi trừ khung giờ chênh ±13%, một ca dao động ±56% (log) ⇒
// cần ~46 ca mới tin được một host; trợ live không có khác biệt bền (không chấm trợ bằng GMV).
// Mỗi hàm nhận ca của MỘT kênh (brand × sàn) — không cộng hiệu suất hai sàn (luật 07/10).

const Z80 = 1.2816;
/** Giờ thêm ra ít GMV hơn giờ sẵn có: co giãn giờ 0,82 (CROCS ngày thường, đo 09/10) ⇒ ca thêm tính 0,8 lần kỳ vọng. */
export const MARGINAL_SESSION_FACTOR = 0.8;
/** Độ lệch chuẩn tay nghề giữa các host (log GMV/giờ, sau khi trừ khung giờ) — đo 11/10 trên 942 ca có host, 49 cặp host-kênh. */
export const HOST_SKILL_SD = 0.13;
/** Host cần ít nhất ngần này ca trong kênh mới vào bảng tay nghề. */
export const HOST_MIN_SESSIONS = 8;
/** Giờ đứng tối đa một ngày khi gợi ý người cho ca thêm (host + trợ cộng lại). */
export const SUGGEST_DAY_HOURS_MAX = 9;

const monthEnd = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
};

/** P(GMV cuối ≥ target) — cùng phân phối với landingOf (forecastCone.ts). */
export function pHitOf(projected: number, actual: number, band: number, target: number | null): number | null {
  if (!target || target <= 0) return null;
  if (actual >= target) return 1;
  const sigma = (band * Math.max(0, projected - actual)) / Z80;
  if (!(sigma > 0)) return projected >= target ? 1 : 0;
  return 1 - normalCdf((target - projected) / sigma);
}

export interface RoomSession {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Giờ theo lịch (đơn vị của trọng số engine). */
  hours: number;
  bucket: CampDayBucket;
  /** GMV kỳ vọng của ca theo mức lúc lập (đầu tháng) — thước để nói "vượt / hụt kỳ vọng". */
  expected: number;
  /** GMV thật khi ca đã có số; null = chưa có. */
  actual: number | null;
  hostName: string;
  coHostName: string;
  studioId: string;
}

export interface DayPoint {
  /** Ngày "số tới" (ngày cuối được tính là đã có số); ngày trước ngày 1 = điểm đầu tháng. */
  asOf: string;
  pHit: number | null;
  projected: number;
  actual: number;
}

export interface SessionSwing {
  id: string;
  date: string;
  startTime: string;
  hostName: string;
  bucket: CampDayBucket;
  actual: number;
  /** Kỳ vọng của ca ở mức hiện tại (đã cập nhật theo số trong tháng). */
  expectedNow: number;
  /** Điểm xác suất ca này làm thay đổi (0..1, dương = kéo lên). null khi kênh chưa có target. */
  deltaP: number | null;
}

export interface ChannelRoom {
  month: string;
  today: string;
  target: number | null;
  band: number;
  forecaster: MonthForecaster;
  sessions: RoomSession[];
  /** GMV thật ÷ kỳ vọng của các ca đã có số (null = chưa có ca nào có số). */
  ratio: number | null;
  /** Mức đang chiếu cho phần còn lại ÷ mức lúc lập. */
  levelFactor: number;
  now: { projected: number; actual: number; pHit: number | null; lo: number; hi: number };
  /** Lúc đầu tháng: P50 của lịch, mức target 80% chắc, khả năng đạt target. */
  start: { p50: number; p80: number; pHit: number | null };
  curve: DayPoint[];
  swings: SessionSwing[];
  /** Tháng đã ngã ngũ: khả năng < 5% (hoặc ≥ 95%) — đo bằng vượt/hụt kỳ vọng thay vì điểm xác suất. */
  decided: boolean;
}

export interface ChannelRoomInput {
  /** Ca của MỘT kênh, đủ lịch sử (≥ 3 tháng trước) — engine học mức + hình dạng từ đây. */
  sessions: LiveSession[];
  month: string;
  today: string;
  target: number | null;
  bucketOf: (date: string) => CampDayBucket;
  params: ForecastParams;
  /** Ca chờ đăng ký còn mở (chưa có người) của kênh — vào phần còn lại như Dashboard. */
  openSlots?: Pick<ShiftSlot, "date" | "startTime" | "endTime" | "status" | "sessionId">[];
}

const countableBy = (s: LiveSession, asOf: string) => s.date <= asOf && isCountable(s);

/** Mọi thứ Phòng Điều Hành cần cho một kênh trong tháng. null khi kênh chưa đủ lịch sử để engine v3 chiếu (dưới 15 ca). */
export function buildChannelRoom(input: ChannelRoomInput): ChannelRoom | null {
  const { sessions, month, today, target, bucketOf, params } = input;
  assertOnePlatform(sessions, "buildChannelRoom");
  const f = buildMonthForecaster(sessions, month, params);
  if (!f) return null;
  const mStart = `${month}-01`, mEnd = monthEnd(month);
  const inMonth = sessions
    .filter((s) => s.date >= mStart && s.date <= mEnd && s.status !== "Cancelled" && !s.excludedFromReports)
    .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
  const open = (input.openSlots ?? []).filter((sl) => sl.status === "open" && !sl.sessionId && sl.date >= today && sl.date >= mStart && sl.date <= mEnd);
  const slots = [...inMonth.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime })), ...open.map((sl) => ({ date: sl.date, startTime: sl.startTime, endTime: sl.endTime }))];
  const expected = slotForecasts(f, slots, bucketOf);
  const asOfNow = today > mEnd ? mEnd : today;
  const itemsAt = (asOf: string, drop?: string): MonthItem[] => [
    ...inMonth.map((s) => ({ date: s.date, startTime: s.startTime, endTime: s.endTime, actual: s.id !== drop && countableBy(s, asOf) ? s.actualGmv ?? 0 : null })),
    ...open.map((sl) => ({ date: sl.date, startTime: sl.startTime, endTime: sl.endTime, actual: null }))
  ];
  const projectAt = (asOf: string, drop?: string) => inMonthProjection(f, itemsAt(asOf, drop), bucketOf);

  const nowP = projectAt(asOfNow);
  const pNow = pHitOf(nowP.projected, nowP.actual, f.band, target);
  const half = f.band * Math.max(0, nowP.projected - nowP.actual);

  const p50 = expected.reduce((a, v) => a + v, 0);
  const sigma0 = (f.band * p50) / Z80;
  const start = { p50, p80: Math.max(0, p50 - 0.8416 * sigma0), pHit: pHitOf(p50, 0, f.band, target) };

  // Đường khả năng: điểm đầu tháng (chưa có số) rồi từng ngày tới hôm nay.
  const curve: DayPoint[] = [{ asOf: addDays(mStart, -1), pHit: start.pHit, projected: p50, actual: 0 }];
  if (asOfNow >= mStart) {
    for (const d of eachDay(mStart, asOfNow)) {
      const pr = d === asOfNow ? nowP : projectAt(d);
      curve.push({ asOf: d, pHit: pHitOf(pr.projected, pr.actual, f.band, target), projected: pr.projected, actual: pr.actual });
    }
  }

  // Ca xoay chuyển: chỉ ca đã có số. Bỏ số thật của riêng ca đó ⇒ ca thành "đúng kỳ vọng ở mức hiện tại".
  const swings: SessionSwing[] = [];
  inMonth.forEach((s) => {
    if (!countableBy(s, asOfNow)) return;
    const pr = projectAt(asOfNow, s.id);
    const idx = inMonth.indexOf(s);
    const expectedNow = pr.perItem[idx];
    const pWithout = pHitOf(pr.projected, pr.actual, f.band, target);
    swings.push({
      id: s.id,
      date: s.date,
      startTime: s.startTime,
      hostName: s.hostName ?? "",
      bucket: bucketOf(s.date),
      actual: s.actualGmv ?? 0,
      expectedNow,
      deltaP: pNow != null && pWithout != null ? pNow - pWithout : null
    });
  });

  const roomSessions: RoomSession[] = inMonth.map((s, i) => ({
    id: s.id,
    date: s.date,
    startTime: s.startTime,
    endTime: s.endTime,
    hours: sessionDurationHours(s.startTime, s.endTime),
    bucket: bucketOf(s.date),
    expected: expected[i],
    actual: countableBy(s, asOfNow) ? s.actualGmv ?? 0 : null,
    hostName: s.hostName ?? "",
    coHostName: s.coHostName ?? "",
    studioId: s.studioId ?? ""
  }));

  return {
    month,
    today,
    target,
    band: f.band,
    forecaster: f,
    sessions: roomSessions,
    ratio: nowP.ratio,
    levelFactor: f.level > 0 ? nowP.level / f.level : 1,
    now: { projected: nowP.projected, actual: nowP.actual, pHit: pNow, lo: nowP.projected - half, hi: nowP.projected + half },
    start,
    curve,
    swings,
    decided: pNow != null && (pNow < 0.05 || pNow > 0.95)
  };
}

// ---------------------------------------------------------------------------
// Sa bàn: ca có thể thêm + khả năng về đích nếu thêm
// ---------------------------------------------------------------------------

export interface PersonRef {
  id: string;
  name: string;
}

export interface Candidate {
  key: string;
  channelKey: string;
  date: string;
  startTime: string;
  endTime: string;
  bucket: CampDayBucket;
  /** GMV kỳ vọng của ca thêm (mức hiện tại × hệ số giờ thêm). */
  expected: number;
  /** Host quen kênh đang rảnh, người có tay nghề ước tính cao nhất trước. */
  hosts: PersonRef[];
  /** Trợ live quen kênh đang rảnh, người ít giờ nhất tháng trước. */
  assistants: PersonRef[];
}

export interface CandidateInput {
  channelKey: string;
  room: ChannelRoom;
  /** Ca của kênh (để biết phòng của kênh đang bận giờ nào + ai quen kênh). */
  channelSessions: LiveSession[];
  /** Mọi ca của agency (mọi kênh, mọi sàn) — kiểm trùng người, trùng phòng. */
  allSessions: LiveSession[];
  shiftSlots: ShiftSlot[];
  /** Phòng mặc định của kênh (CRM). Rỗng = chỉ kiểm theo lịch của kênh. */
  studioId: string;
  bucketOf: (date: string) => CampDayBucket;
  /** Giờ bắt đầu các khung thử (mặc định 10h, 14h, 20h) và độ dài ca. */
  starts?: string[];
  hours?: number;
  /** Tay nghề ước tính (log) theo talentId — xếp host gợi ý. */
  skillOf?: (talentId: string) => number;
}

const addHours = (t: string, h: number) => {
  const [hh, mm] = t.split(":").map(Number);
  const m = (hh * 60 + mm + Math.round(h * 60)) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

function personDayHours(sessions: LiveSession[], talentId: string, date: string): number {
  let h = 0;
  for (const s of sessions) {
    if (s.status === "Cancelled" || s.date !== date) continue;
    for (const w of personWindows(s, talentId)) h += sessionDurationHours(w.startTime, w.endTime);
  }
  return h;
}

/** Khung ca 3 giờ còn trống từ ngày mai tới cuối tháng của một kênh, kèm người quen kênh đang rảnh. */
export function sandboxCandidates(input: CandidateInput): Candidate[] {
  const { channelKey, room, channelSessions, allSessions, shiftSlots, studioId, bucketOf } = input;
  const starts = input.starts ?? ["10:00", "14:00", "20:00"];
  const hours = input.hours ?? 3;
  const mEnd = monthEnd(room.month);
  const from = addDays(room.today, 1);
  if (from > mEnd) return [];
  const since = addDays(room.today, -90);
  const fam = { host: new Map<string, { name: string; n: number }>(), co_host: new Map<string, { name: string; n: number }>() };
  for (const s of channelSessions) {
    if (s.status === "Cancelled" || s.date < since || s.date > room.today) continue;
    for (const g of effectiveSegments(s)) {
      const m = fam[g.role];
      const cur = m.get(g.talentId) ?? { name: g.talentName, n: 0 };
      cur.n += 1;
      if (!cur.name && g.talentName) cur.name = g.talentName;
      m.set(g.talentId, cur);
    }
  }
  const familiar = (role: "host" | "co_host") => [...fam[role].entries()].filter(([, v]) => v.n >= 3).map(([id, v]) => ({ id, name: v.name }));
  const hostsAll = familiar("host");
  const asstAll = familiar("co_host");
  const monthHours = new Map<string, number>();
  for (const s of allSessions) {
    if (s.status === "Cancelled" || !s.date.startsWith(room.month)) continue;
    for (const g of effectiveSegments(s)) monthHours.set(g.talentId, (monthHours.get(g.talentId) ?? 0) + (g.toMin - g.fromMin) / 60);
  }
  const skill = input.skillOf ?? (() => 0);
  const f = room.forecaster;
  const out: Candidate[] = [];
  for (const date of eachDay(from, mEnd)) {
    for (const startTime of starts) {
      const want: DateTimeRange = { date, startTime, endTime: addHours(startTime, hours) };
      const roomBusy =
        channelSessions.some((s) => s.status !== "Cancelled" && dateTimeRangesOverlap(s, want)) ||
        shiftSlots.some((sl) => sl.status === "open" && !sl.sessionId && channelSessions.length > 0 && sl.brandId === channelSessions[0].brandId && sl.platform === channelSessions[0].platform && dateTimeRangesOverlap(sl, want)) ||
        (studioId ? studioClash(allSessions, shiftSlots, { ...want, studioId }) != null : false);
      if (roomBusy) continue;
      const free = (p: PersonRef) => personClash(allSessions, want, p.id) == null && personDayHours(allSessions, p.id, date) + hours <= SUGGEST_DAY_HOURS_MAX;
      const hosts = hostsAll.filter(free).sort((a, b) => skill(b.id) - skill(a.id));
      const assistants = asstAll.filter((p) => free(p) && !hosts.slice(0, 1).some((h) => h.id === p.id)).sort((a, b) => (monthHours.get(a.id) ?? 0) - (monthHours.get(b.id) ?? 0));
      if (hosts.length === 0 || assistants.length === 0) continue;
      const base = slotForecasts(f, [want], bucketOf)[0] ?? 0;
      out.push({
        key: `${channelKey}|${date}|${startTime}`,
        channelKey,
        date,
        startTime,
        endTime: want.endTime,
        bucket: bucketOf(date),
        expected: base * room.levelFactor * MARGINAL_SESSION_FACTOR,
        hosts: hosts.slice(0, 4),
        assistants: assistants.slice(0, 4)
      });
    }
  }
  return out;
}

/** Khả năng về đích của một kênh nếu thêm các ca `adds` (cộng kỳ vọng của chúng vào phần còn lại). */
export function pWithAdds(room: ChannelRoom, adds: Pick<Candidate, "expected">[]): { projected: number; pHit: number | null } {
  const projected = room.now.projected + adds.reduce((a, c) => a + c.expected, 0);
  return { projected, pHit: pHitOf(projected, room.now.actual, room.band, room.target) };
}

export type PlanObjective = "probability" | "gmv";

export interface PlannedSession {
  candidate: Candidate;
  host: PersonRef;
  assistant: PersonRef;
}

/**
 * Tự xếp tối đa `budget` ca: mỗi bước chọn ca tăng nhiều nhất (điểm xác suất về đích, hoặc GMV kỳ vọng), không xếp một người
 * vào hai ca cùng giờ. Kênh đã ngã ngũ tự rơi khỏi danh sách theo xác suất (thêm ca không đổi được gì) — đúng ý: đó là việc
 * nói chuyện target, không phải thêm giờ.
 */
export function autoPlan(rooms: Map<string, ChannelRoom>, candidates: Candidate[], budget: number, objective: PlanObjective): PlannedSession[] {
  const picked: PlannedSession[] = [];
  const busy = new Set<string>();
  const slotKey = (id: string, c: Candidate) => `${id}|${c.date}|${c.startTime}`;
  const addsOf = (ch: string) => picked.filter((p) => p.candidate.channelKey === ch).map((p) => p.candidate);
  for (let n = 0; n < budget; n++) {
    let best: { c: Candidate; gain: number; host: PersonRef; assistant: PersonRef } | null = null;
    for (const c of candidates) {
      if (picked.some((p) => p.candidate.key === c.key)) continue;
      const host = c.hosts.find((h) => !busy.has(slotKey(h.id, c)));
      const assistant = c.assistants.find((a) => a.id !== host?.id && !busy.has(slotKey(a.id, c)));
      if (!host || !assistant) continue;
      const room = rooms.get(c.channelKey);
      if (!room) continue;
      let gain: number;
      if (objective === "gmv") gain = c.expected;
      else {
        const before = pWithAdds(room, addsOf(c.channelKey)).pHit;
        const after = pWithAdds(room, [...addsOf(c.channelKey), c]).pHit;
        gain = before == null || after == null ? 0 : after - before;
      }
      if (!best || gain > best.gain) best = { c, gain, host, assistant };
    }
    if (!best || best.gain <= (objective === "probability" ? 0.002 : 0)) break;
    picked.push({ candidate: best.c, host: best.host, assistant: best.assistant });
    busy.add(slotKey(best.host.id, best.c));
    busy.add(slotKey(best.assistant.id, best.c));
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Tay nghề host: tách phần do được xếp ca tốt khỏi phần do người
// ---------------------------------------------------------------------------

export interface HostSkillRow {
  talentId: string;
  name: string;
  sessions: number;
  /** GMV/giờ so mặt bằng kênh (log) — cách xếp thô. */
  raw: number;
  /** Phần chênh do lịch đã cho sẵn (khung giờ, ngày camp, độ dài ca) — log. */
  slotLuck: number;
  /** Tay nghề ước tính, đã co về 0 theo số ca (log). */
  skill: number;
  /** Nửa khoảng tin cậy 90% của `skill` (log). */
  ci90: number;
  /** Khoảng tin cậy không chạm 0. */
  sure: boolean;
}

/**
 * Bảng tay nghề host của một kênh trên các tháng `months` (mỗi tháng engine học từ lịch sử TRƯỚC tháng đó — không nhìn trước).
 * Số theo người đi qua hostPortions (đổi host giữa ca chia đúng phần từng người). Kỳ vọng phần của một host = kỳ vọng ca × phần giờ.
 */
export function hostSkillTable(channelSessions: LiveSession[], months: string[], bucketOfMonth: (month: string) => (date: string) => CampDayBucket, params: ForecastParams): HostSkillRow[] {
  assertOnePlatform(channelSessions, "hostSkillTable");
  const parts: { id: string; name: string; res: number; raw: number; luck: number }[] = [];
  for (const m of months) {
    const f = buildMonthForecaster(channelSessions, m, params);
    if (!f) continue;
    const xs = channelSessions.filter((s) => s.date.startsWith(m) && !s.excludedFromReports && isCountable(s) && (s.actualGmv ?? 0) > 0);
    if (xs.length === 0) continue;
    const exp = slotForecasts(f, xs, bucketOfMonth(m));
    xs.forEach((s, i) => {
      const total = sessionHours(s);
      if (!(total > 0) || !(exp[i] > 0)) return;
      for (const p of hostPortions(s)) {
        if (!p.hostId) continue;
        const h = sessionHours(p);
        const g = p.actualGmv ?? 0;
        if (!(h > 0.25) || !(g > 0)) continue;
        const e = exp[i] * (h / total);
        parts.push({ id: p.hostId, name: p.hostName ?? "", res: Math.log(g / e), raw: Math.log(g / h), luck: Math.log(e / h) });
      }
    });
  }
  if (parts.length < 10) return [];
  const mean = (xs: number[]) => xs.reduce((a, v) => a + v, 0) / xs.length;
  const mRes = mean(parts.map((p) => p.res)), mRaw = mean(parts.map((p) => p.raw)), mLuck = mean(parts.map((p) => p.luck));
  const sw = Math.sqrt(mean(parts.map((p) => (p.res - mRes) ** 2)));
  const by = new Map<string, typeof parts>();
  for (const p of parts) (by.get(p.id) ?? by.set(p.id, []).get(p.id)!).push(p);
  const rows: HostSkillRow[] = [];
  for (const [id, xs] of by) {
    if (xs.length < HOST_MIN_SESSIONS) continue;
    const n = xs.length;
    const k = (n * HOST_SKILL_SD ** 2) / (n * HOST_SKILL_SD ** 2 + sw ** 2);
    const skill = k * (mean(xs.map((p) => p.res)) - mRes);
    const sdPost = Math.sqrt(1 / (1 / HOST_SKILL_SD ** 2 + n / Math.max(1e-6, sw ** 2)));
    const ci90 = 1.645 * sdPost;
    rows.push({
      talentId: id,
      name: xs.find((p) => p.name)?.name ?? id,
      sessions: n,
      raw: mean(xs.map((p) => p.raw)) - mRaw,
      slotLuck: mean(xs.map((p) => p.luck)) - mLuck,
      skill,
      ci90,
      sure: Math.abs(skill) > ci90
    });
  }
  return rows.sort((a, b) => b.raw - a.raw);
}

// ---------------------------------------------------------------------------
// Cầu GMV giữa hai tháng: giờ · cơ cấu ca · năng suất nền
// ---------------------------------------------------------------------------

export interface MonthBridge {
  monthA: string;
  monthB: string;
  gmvA: number;
  gmvB: number;
  hoursA: number;
  hoursB: number;
  /** Phần đổi do số giờ (ở năng suất + cơ cấu tháng A). */
  hours: number;
  /** Phần đổi do cơ cấu ca: tỷ lệ ca camp, khung giờ, vị trí trong camp, độ dài ca. */
  mix: number;
  /** Phần còn lại: năng suất nền (thị trường + đội live). */
  level: number;
}

/** GMV tháng B so tháng A của một kênh, tách theo trọng số của engine (học trên lịch sử tới hết tháng B). */
export function monthBridge(channelSessions: LiveSession[], monthA: string, monthB: string, bucketOf: (date: string) => CampDayBucket, params: ForecastParams): MonthBridge | null {
  assertOnePlatform(channelSessions, "monthBridge");
  const f = buildMonthForecaster(channelSessions, nextMonth(monthB), params);
  if (!f) return null;
  const pick = (m: string) => channelSessions.filter((s) => s.date.startsWith(m) && !s.excludedFromReports && isCountable(s));
  const a = pick(monthA), b = pick(monthB);
  if (a.length < 8 || b.length < 8) return null;
  const stats = (xs: LiveSession[]) => {
    const H = xs.reduce((s, x) => s + sessionDurationHours(x.startTime, x.endTime), 0);
    const W = glmWeights(xs, f.model, bucketOf).reduce((s, w) => s + w, 0);
    const G = xs.reduce((s, x) => s + (x.actualGmv ?? 0), 0);
    return { H, W, G };
  };
  const A = stats(a), B = stats(b);
  if (!(A.H > 0 && A.W > 0 && A.G > 0 && B.H > 0 && B.W > 0 && B.G > 0)) return null;
  const s1 = A.G * (B.H / A.H);
  const s2 = s1 * (B.W / B.H) / (A.W / A.H);
  return { monthA, monthB, gmvA: A.G, gmvB: B.G, hoursA: A.H, hoursB: B.H, hours: s1 - A.G, mix: s2 - s1, level: B.G - s2 };
}
