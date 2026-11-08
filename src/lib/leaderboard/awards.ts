import type { LiveSession } from "../../types";
import { resolveCampBucketType, type CampaignDayType, type CampOverrides } from "../campaignDays";
import { planTargetOf } from "../performance/targetAllocation";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { effectiveSegments, sessionMinutes, type StaffRole } from "../staffSegments";

// Leader Board (06/11) — ba giải user chốt, MỖI giải xét riêng từng account (brand × sàn), không xếp chung hai account:
//   1. Ca đạt target — ca Campaign (D-Day / Mid-Month / Pay Day theo khung camp hiệu lực của Kế Hoạch Tháng) đạt ≥ 100% target ca
//      ⇒ Mức 1, ≥ 120% ⇒ Mức 2. Suất thưởng chia theo PHÚT từng người có mặt (staffSegments), không theo GMV.
//   2. Host hiệu suất — GMV/giờ ÷ trung vị cùng account × tháng × khung giờ, co về 1,00 (K = 6), cần ≥ 8 ca.
//   3. Trợ live xuất sắc — tỷ lệ ca đạt target (≥ 100% target ca, mọi ngày trong tháng) theo phần phút, co về tỷ lệ chung của account,
//      cần ≥ 8 ca có target (user chốt 06/11: tính theo ca đạt target, không cần chấm điểm tay).
// Đo 06/11 (T6–T10, 1.602 ca): Top GMV thô trùng người nhiều giờ nhất ở 18/23 account-tháng ⇒ KHÔNG xếp theo GMV tổng. Chỉ số host
// theo khung giờ trong tháng: tháng này → tháng sau r = 0,35–0,62 tuỳ thang đo (40 cặp, mẫu nhỏ); trợ live r = 0,08 ⇒ trợ không xếp theo GMV.
// So 4 cách (06/11): GMV/h thô dính khung giờ r = 0,66, chia trung vị khung còn 0,32, thêm Campaign/cuối tuần hay hồi quy chỉ còn 0,27–0,31 mà kém
// ổn định hơn ⇒ giữ cách chia trung vị khung (đơn giản, giải thích được). Phần còn dính một phần là thật: host giỏi được xếp giờ đẹp.
// Không có hoa hồng GMV (user chốt 06/10): thưởng là mức cố định theo suất.

export const TARGET_TIER_MIN = { 1: 1, 2: 1.2 } as const;
export type TargetTier = 1 | 2;
export const MIN_AWARD_SHIFTS = 8;
export const AWARD_SHRINK_K = 6;
/** Khung giờ của chỉ số — cùng bốn khung với bộ xếp lịch (roster/monthPlanner). */
export const timeBand = (start: string) => {
  const h = Number(start.slice(0, 2));
  return h < 12 ? "am" : h < 17 ? "pm" : h < 22 ? "eve" : "late";
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export interface AwardAccount {
  key: string;
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
}

/** Người trong một ca theo vai, phút có mặt và phần của ca (0–1). */
export interface ShiftPerson {
  talentId: string;
  name: string;
  role: StaffRole;
  minutes: number;
  share: number;
}

function peopleOf(s: LiveSession): ShiftPerson[] {
  const dur = sessionMinutes(s);
  const byKey = new Map<string, ShiftPerson>();
  for (const g of effectiveSegments(s)) {
    const k = `${g.role}|${g.talentId}`;
    const p = byKey.get(k) ?? { talentId: g.talentId, name: g.talentName, role: g.role, minutes: 0, share: 0 };
    p.minutes += Math.max(0, g.toMin - g.fromMin);
    byKey.set(k, p);
  }
  return [...byKey.values()].map((p) => ({ ...p, share: dur > 0 ? Math.min(1, p.minutes / dur) : 0 }));
}

const accountKey = (s: Pick<LiveSession, "brandId" | "platform">) => `${s.brandId}|${platformOf(s)}`;

/** Các account có ca trong tháng — thứ tự theo tên brand rồi sàn. */
export function accountsOf(sessions: readonly LiveSession[], month: string): AwardAccount[] {
  const out = new Map<string, AwardAccount>();
  for (const s of sessions) {
    if (!s.date.startsWith(month) || s.status === "Cancelled" || !s.brandId) continue;
    const key = accountKey(s);
    if (!out.has(key)) out.set(key, { key, brandId: s.brandId, brandName: s.brandName, platform: platformOf(s) });
  }
  return [...out.values()].sort((a, b) => a.brandName.localeCompare(b.brandName, "vi") || a.platform.localeCompare(b.platform));
}

// ---------------------------------------------------------------------------------------------------------------------------
// 1. Ca đạt target
// ---------------------------------------------------------------------------------------------------------------------------

export interface TargetShift {
  session: LiveSession;
  campaign: CampaignDayType;
  target: number;
  /** GMV ÷ target ca. Ca đang live = số tới lúc này. */
  ratio: number;
  tier: TargetTier | null;
  live: boolean;
  /** Ca chưa live (đã xếp) — hiện trước để biết ai đứng ca Campaign, chưa xét giải. */
  upcoming: boolean;
  people: ShiftPerson[];
}

export interface CampaignEvent {
  type: CampaignDayType;
  from: string;
  to: string;
  shifts: TargetShift[];
  /** Ca có target (ca không có target không xét giải). */
  withTarget: number;
  hit: number;
  tier2: number;
  noTarget: number;
  upcoming: number;
  /** Σ GMV ÷ Σ target của các ca ĐÃ XONG có target trong đợt (ca đang live không tính). null khi chưa có ca nào xong. */
  ratio: number | null;
  actual: number;
  targetDone: number;
  /** Đợt đã xong hết (không còn ca sắp live / đang live) — chỉ khi đó mới chốt mức của đợt. */
  final: boolean;
  /** Mức của CẢ ĐỢT (chấm theo đợt) — null khi chưa đạt hoặc chưa xong. */
  tier: TargetTier | null;
}

/**
 * Cách chấm giải "Ca đạt target" (07/11, user chốt "làm cả 5" theo đề xuất dự báo):
 *   "event" (mặc định) — chấm CẢ ĐỢT: Σ GMV ÷ Σ target các ca đã xong của đợt ≥ 100% ⇒ mọi ca có target của đợt được Mức 1, ≥ 120% ⇒ Mức 2.
 *            Lý do: một ca chỉ ~20 đơn nên riêng may rủi đã lệch ±16% — ca kỳ vọng 90% target vẫn có ~30% khả năng "đạt" (CROCS 1–5/11:
 *            12/14 ca "hụt" nhưng chỉ 4 ca dưới khoảng bình thường). Gộp cả đợt thì may rủi triệt tiêu, cả đội cùng hướng về một con số.
 *   "shift" — như 06/11: từng ca tự đạt/hụt.
 */
export type TargetScoring = "event" | "shift";

export interface TargetPayout {
  talentId: string;
  name: string;
  role: StaffRole;
  tier1: number;
  tier2: number;
  /** Suất thưởng = Σ phần phút của ca đạt (Mức 1 = 1 suất, Mức 2 = 2 suất). */
  units: number;
}

export interface TargetBoard {
  events: CampaignEvent[];
  payouts: TargetPayout[];
}

export const tierOf = (ratio: number): TargetTier | null => (ratio >= TARGET_TIER_MIN[2] ? 2 : ratio >= TARGET_TIER_MIN[1] ? 1 : null);

/**
 * Ca Campaign của một account trong tháng. `camp` = khung camp hiệu lực (effectiveCamp của Kế Hoạch Tháng); không có thì lịch cố định.
 * Target = `planTargetOf` (target ca của kế hoạch đã chốt — ca tăng cường không có target kế hoạch nên không xét).
 */
export function campaignTargetBoard(sessions: readonly LiveSession[], account: AwardAccount, month: string, camp?: CampOverrides, scoring: TargetScoring = "shift"): TargetBoard {
  const events = new Map<CampaignDayType, CampaignEvent>();
  for (const s of sessions) {
    if (!s.date.startsWith(month) || accountKey(s) !== account.key) continue;
    if (s.status === "Cancelled") continue;
    const bucket = resolveCampBucketType(s.date, camp);
    if (bucket === "daily") continue;
    const ev: CampaignEvent = events.get(bucket) ?? { type: bucket, from: s.date, to: s.date, shifts: [], withTarget: 0, hit: 0, tier2: 0, noTarget: 0, upcoming: 0, ratio: null, actual: 0, targetDone: 0, final: false, tier: null };
    if (s.date < ev.from) ev.from = s.date;
    if (s.date > ev.to) ev.to = s.date;
    const target = planTargetOf(s);
    if (s.status === "Upcoming") {
      ev.upcoming += 1;
      ev.shifts.push({ session: s, campaign: bucket, target, ratio: 0, tier: null, live: false, upcoming: true, people: peopleOf(s) });
    } else if (target > 0) {
      const ratio = (s.actualGmv || 0) / target;
      const live = s.status === "Live Now";
      // Ca đang live chỉ báo "đã chạm", suất thưởng tính khi ca xong.
      const tier = tierOf(ratio);
      ev.shifts.push({ session: s, campaign: bucket, target, ratio, tier, live, upcoming: false, people: peopleOf(s) });
      ev.withTarget += 1;
      if (tier && !live) ev.hit += 1;
      if (tier === 2 && !live) ev.tier2 += 1;
      if (!live) {
        ev.actual += s.actualGmv || 0;
        ev.targetDone += target;
      }
    } else ev.noTarget += 1;
    events.set(bucket, ev);
  }
  const list = [...events.values()].sort((a, b) => a.from.localeCompare(b.from));
  for (const ev of list) {
    ev.ratio = ev.targetDone > 0 ? ev.actual / ev.targetDone : null;
    ev.final = ev.upcoming === 0 && !ev.shifts.some((x) => x.live) && ev.targetDone > 0;
    ev.tier = ev.final && ev.ratio !== null ? tierOf(ev.ratio) : null;
  }
  // Đang live trước, rồi ca đã xong theo % giảm dần, ca sắp live theo giờ.
  const order = (x: TargetShift) => (x.live ? 0 : x.upcoming ? 2 : 1);
  for (const ev of list)
    ev.shifts.sort((a, b) => order(a) - order(b) || (a.upcoming ? `${a.session.date}${a.session.startTime}`.localeCompare(`${b.session.date}${b.session.startTime}`) : b.ratio - a.ratio));
  const pay = new Map<string, TargetPayout>();
  for (const ev of list) {
    for (const sh of ev.shifts) {
      // Chấm theo đợt: mọi ca đã xong có target của đợt nhận mức của CẢ ĐỢT; chấm theo ca: mức của chính ca.
      const t = scoring === "event" ? (sh.target > 0 ? ev.tier : null) : sh.tier;
      if (!t || sh.live || sh.upcoming) continue;
      for (const p of sh.people) {
        const k = `${p.role}|${p.talentId}`;
        const o = pay.get(k) ?? { talentId: p.talentId, name: p.name, role: p.role, tier1: 0, tier2: 0, units: 0 };
        if (t === 2) o.tier2 += 1;
        else o.tier1 += 1;
        o.units += t * p.share;
        pay.set(k, o);
      }
    }
  }
  const payouts = [...pay.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name, "vi"));
  return { events: list, payouts };
}

// ---------------------------------------------------------------------------------------------------------------------------
// 2. Host hiệu suất
// ---------------------------------------------------------------------------------------------------------------------------

export interface PerfRow {
  talentId: string;
  name: string;
  /** Chỉ số đã co về 1,00 (1,00 = bằng trung vị cùng account × khung giờ trong tháng). */
  index: number;
  /** Trung bình thô (chưa co) — để tính "vượt rõ". */
  raw: number;
  /** Số ca có mặt (kể cả ca chia đoạn). */
  shifts: number;
  /** Số ca quy đổi theo phút (Σ phần phút) — trọng số của chỉ số. */
  weight: number;
  hours: number;
  eligible: boolean;
  /** Cận dưới 80% của trung bình thô > 1,00. */
  clearlyAbove: boolean;
  rank: number | null;
}

/**
 * Chỉ số GMV/giờ của từng host trong một account-tháng, gỡ HAI thứ host không tự chọn (user 06/11: "công bằng nhất"):
 *   1. Ngày Campaign — GMV/giờ ca Campaign chia hệ số Campaign ÷ Daily của chính account-tháng đó (trung vị, cần ≥ 5 ca mỗi bên, thiếu
 *      thì 1). Đo T6–T10: ca Campaign cao gấp ~1,55 lần, tỷ lệ ca Campaign của host 0–100% ⇒ không gỡ thì người được xếp nhiều ngày sale
 *      tự lên hạng (điểm lệch tới 0,35; hạng 1 đổi ở 4/15 account-tháng khi gỡ).
 *   2. Khung giờ — chia trung vị cùng khung (khung < 5 ca ⇒ trung vị cả account).
 * Chia cho host theo phần phút. Chỉ ca đã xong, có GMV và giờ. Xếp hạng chỉ trong số người đủ `MIN_AWARD_SHIFTS` ca.
 * Hồi quy thêm cuối tuần đã thử: gần như không bớt thiên lệch mà xếp hạng kém ổn định hơn — không dùng.
 */
export function hostPerformanceBoard(sessions: readonly LiveSession[], account: AwardAccount, month: string, camp?: CampOverrides): PerfRow[] {
  const raw: { s: LiveSession; rate: number; band: string; hours: number; campaign: boolean }[] = [];
  for (const s of sessions) {
    if (!s.date.startsWith(month) || accountKey(s) !== account.key || s.status !== "Completed") continue;
    const hours = sessionMinutes(s) / 60;
    if (!(hours > 0) || !((s.actualGmv || 0) > 0)) continue;
    raw.push({ s, rate: s.actualGmv / hours, band: timeBand(s.startTime), hours, campaign: resolveCampBucketType(s.date, camp) !== "daily" });
  }
  const campRates = raw.filter((r) => r.campaign).map((r) => r.rate);
  const dailyRates = raw.filter((r) => !r.campaign).map((r) => r.rate);
  const uplift = campRates.length >= 5 && dailyRates.length >= 5 && median(dailyRates) > 0 ? median(campRates) / median(dailyRates) : 1;
  const rows = raw.map((r) => (r.campaign ? { ...r, rate: r.rate / uplift } : r));
  const byBand = new Map<string, number[]>();
  for (const r of rows) byBand.set(r.band, [...(byBand.get(r.band) ?? []), r.rate]);
  const all = median(rows.map((r) => r.rate));
  const acc = new Map<string, { name: string; sw: number; swr: number; swr2: number; shifts: number; hours: number }>();
  for (const r of rows) {
    const cell = byBand.get(r.band) ?? [];
    const expect = cell.length >= 5 ? median(cell) : all;
    if (!(expect > 0)) continue;
    const ratio = r.rate / expect;
    for (const p of peopleOf(r.s)) {
      if (p.role !== "host" || p.share <= 0) continue;
      const o = acc.get(p.talentId) ?? { name: p.name, sw: 0, swr: 0, swr2: 0, shifts: 0, hours: 0 };
      o.sw += p.share;
      o.swr += p.share * ratio;
      o.swr2 += p.share * ratio * ratio;
      o.shifts += 1;
      o.hours += p.minutes / 60;
      if (!o.name && p.name) o.name = p.name;
      acc.set(p.talentId, o);
    }
  }
  const out: PerfRow[] = [];
  for (const [id, o] of acc) {
    const raw = o.swr / o.sw;
    const variance = Math.max(0, o.swr2 / o.sw - raw * raw);
    const lower = raw - 1.28 * Math.sqrt(variance / Math.max(1, o.sw));
    const eligible = o.shifts >= MIN_AWARD_SHIFTS;
    out.push({
      talentId: id,
      name: o.name,
      index: (o.swr + AWARD_SHRINK_K) / (o.sw + AWARD_SHRINK_K),
      raw,
      shifts: o.shifts,
      weight: o.sw,
      hours: o.hours,
      eligible,
      clearlyAbove: eligible && lower > 1,
      rank: null
    });
  }
  return rankRows(out, (r) => r.index);
}

/** Xếp người đủ điều kiện trước (theo điểm giảm dần, đồng điểm theo số ca), người chưa đủ ca sau, không có hạng. */
export function rankRows<T extends { eligible: boolean; rank: number | null; shifts: number; name: string }>(rows: T[], score: (r: T) => number): T[] {
  const sorted = [...rows].sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || score(b) - score(a) || b.shifts - a.shifts || a.name.localeCompare(b.name, "vi")
  );
  let rank = 0;
  return sorted.map((r) => (r.eligible ? { ...r, rank: ++rank } : { ...r, rank: null }));
}

/** Hạng tháng trước theo talentId (đổi hạng ▲▼). */
export const rankMap = (rows: readonly { talentId: string; rank: number | null }[]) =>
  new Map(rows.flatMap((r) => (r.rank ? [[r.talentId, r.rank] as const] : [])));

// ---------------------------------------------------------------------------------------------------------------------------
// 3. Trợ live xuất sắc
// ---------------------------------------------------------------------------------------------------------------------------

export interface AssistantRow {
  talentId: string;
  name: string;
  /** Tỷ lệ ca đạt target theo phần phút, đã co về tỷ lệ chung của account (K = 6). */
  index: number;
  /** Tỷ lệ thô (chưa co). */
  raw: number;
  /** Ca có target mà trợ có mặt / trong đó số ca đạt. */
  shifts: number;
  hits: number;
  hours: number;
  eligible: boolean;
  rank: number | null;
}

/** Tỷ lệ ca đạt target của cả account trong tháng — mốc so cho bảng trợ live. */
export interface AssistantBoard {
  rows: AssistantRow[];
  accountRate: number;
  shiftsWithTarget: number;
}

export function assistantBoard(sessions: readonly LiveSession[], account: AwardAccount, month: string): AssistantBoard {
  let accHit = 0;
  let accN = 0;
  const acc = new Map<string, { name: string; sw: number; swHit: number; shifts: number; hits: number; hours: number }>();
  for (const s of sessions) {
    if (!s.date.startsWith(month) || accountKey(s) !== account.key || s.status !== "Completed") continue;
    const target = planTargetOf(s);
    if (!(target > 0)) continue;
    const hit = (s.actualGmv || 0) >= target ? 1 : 0;
    accN += 1;
    accHit += hit;
    for (const p of peopleOf(s)) {
      if (p.role !== "co_host" || p.share <= 0) continue;
      const o = acc.get(p.talentId) ?? { name: p.name, sw: 0, swHit: 0, shifts: 0, hits: 0, hours: 0 };
      o.sw += p.share;
      o.swHit += p.share * hit;
      o.shifts += 1;
      o.hits += hit;
      o.hours += p.minutes / 60;
      if (!o.name && p.name) o.name = p.name;
      acc.set(p.talentId, o);
    }
  }
  const base = accN > 0 ? accHit / accN : 0;
  const rows: AssistantRow[] = [...acc].map(([id, o]) => ({
    talentId: id,
    name: o.name,
    index: (o.swHit + AWARD_SHRINK_K * base) / (o.sw + AWARD_SHRINK_K),
    raw: o.sw > 0 ? o.swHit / o.sw : 0,
    shifts: o.shifts,
    hits: o.hits,
    hours: o.hours,
    eligible: o.shifts >= MIN_AWARD_SHIFTS,
    rank: null
  }));
  return { rows: rankRows(rows, (r) => r.index), accountRate: base, shiftsWithTarget: accN };
}
