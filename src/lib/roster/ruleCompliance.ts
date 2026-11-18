import type { LiveSession, Talent, TalentRateHistoryEntry } from "../../types";
import { sessionDurationHours } from "../pnl";
import { hasStaffSegments } from "../staffSegments";
import type { EngineParams } from "../scheduling/engineParams";
import { plannedCost } from "./candidates";
import { buildBandStrength, buildHostPerformancePrevMonth, SPORT_BRAND_PATTERN, shiftTier, type PersonCap, type PlanTuning } from "./monthPlanner";
import { channelKeyOf, type RosterShift } from "./rules";

// Đợt 3 (17/11): đo LỊCH THẬT của một tháng có tuân các luật Tự fill không, và giờ thực tế so với giờ cam kết từng người.
// Đo trên ca thực tế (kể cả ca Trainer xếp tay): không có lịch sử đăng ký để biết "luật không áp dụng được vì không có người". Hàm thuần.

export interface RuleLine {
  id: "cast_tiktok_regular" | "cast_shopee" | "male_sport" | "male_night";
  /** Giờ ca thuộc phạm vi luật (có đủ dữ liệu để đo). */
  hours: number;
  /** Trong đó giờ tuân luật. */
  okHours: number;
  /** Giờ không đo được (chưa có rate / chưa có giới tính). */
  unknownHours: number;
}
export interface PersonPlanRow {
  talentId: string;
  /** Giờ cam kết (trần) của tháng. */
  cap: number;
  /** Trần nửa đầu: ô ghi đè, hoặc trần × tỷ lệ giờ ca nửa đầu × (1 + dung sai). */
  halfCap: number;
  actual: number;
  actualHalf: number;
  note: string;
}
export interface ComplianceReport {
  month: string;
  /** Tổng giờ ca (không tính ca chia đoạn người) của tháng. */
  totalHours: number;
  lines: RuleLine[];
  /** PFM tháng trước (trung bình theo giờ) của host đứng ca camp/cao điểm và ca thường. null = không ai có số liệu. */
  perf: { peak: number | null; regular: number | null; peakHours: number; regularHours: number };
  people: PersonPlanRow[];
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
/** Ca đêm: qua nửa đêm hoặc kết thúc từ giờ khuya của luật Điều Phối. */
export function endsLate(start: string, end: string, lateEnd: string): boolean {
  const s = toMin(start);
  const e = toMin(end);
  return e <= s || e >= toMin(lateEnd);
}
const isMale = (g: string | undefined) => ["nam", "male", "m"].includes((g ?? "").trim().toLowerCase());

export interface ComplianceInput {
  month: string;
  sessions: readonly LiveSession[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  brandNames: ReadonlyMap<string, string>;
  params: PlanTuning["params"] & Pick<EngineParams, never>;
  lateEnd: string;
  caps: Readonly<Record<string, PersonCap & { note?: string }>>;
}

export function buildComplianceReport(input: ComplianceInput): ComplianceReport {
  const { month, sessions, talents, history, brandNames, params, lateEnd, caps } = input;
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const monthSessions = sessions.filter((s) => s.date.slice(0, 7) === month && s.status !== "Cancelled" && !hasStaffSegments(s));
  // Khung cao điểm / PFM như bộ xếp thấy lúc xếp tháng này: chỉ dùng dữ liệu TRƯỚC tháng.
  const monthStart = `${month}-01`;
  const tuning: PlanTuning = { params, bandStrength: buildBandStrength(sessions, monthStart) };
  const perfMap = buildHostPerformancePrevMonth(sessions, month, monthStart);

  const lines: RuleLine[] = (["cast_tiktok_regular", "cast_shopee", "male_sport", "male_night"] as const).map((id) => ({ id, hours: 0, okHours: 0, unknownHours: 0 }));
  const line = (id: RuleLine["id"]) => lines.find((l) => l.id === id)!;
  const perfAcc = { peak: { sum: 0, h: 0, all: 0 }, regular: { sum: 0, h: 0, all: 0 } };
  let totalHours = 0;
  let allHalf = 0;
  const personHours = new Map<string, { all: number; half: number }>();
  const bump = (id: string | undefined, h: number, half: boolean) => {
    if (!id) return;
    const o = personHours.get(id) ?? { all: 0, half: 0 };
    o.all += h;
    if (half) o.half += h;
    personHours.set(id, o);
  };

  for (const s of monthSessions) {
    const h = sessionDurationHours(s.startTime, s.endTime);
    if (!(h > 0)) continue;
    totalHours += h;
    const half = Number(s.date.slice(8, 10)) <= 15;
    if (half) allHalf += h;
    bump(s.hostId, h, half);
    bump(s.coHostId, h, half);
    const shift = { date: s.date, startTime: s.startTime, endTime: s.endTime, channelKey: channelKeyOf(s.brandId, s.platform) } as RosterShift;
    const tier = shiftTier(shift, tuning);

    const host = s.hostId ? talentById.get(s.hostId) : undefined;
    if (host) {
      const bucket = perfAcc[tier];
      bucket.all += h;
      const pf = perfMap.get(host.id);
      if (pf) {
        bucket.sum += pf.index * h;
        bucket.h += h;
      }
      // Theo sàn bằng Record (test platformProfiles cấm rẽ nhánh theo tên sàn).
      const cap = { Shopee: params.rosterShopeeCastCap, TikTok: tier === "regular" ? params.rosterRegularCastCap : 0 }[s.platform];
      const id: RuleLine["id"] | null = { Shopee: "cast_shopee" as const, TikTok: tier === "regular" ? ("cast_tiktok_regular" as const) : null }[s.platform];
      if (id && cap > 0) {
        const c = plannedCost(host, history, "host", s.date, 1);
        const l = line(id);
        if (c.missing || !c.hourly) l.unknownHours += h;
        else {
          l.hours += h;
          if (c.amount <= cap + 1) l.okHours += h;
        }
      }
    }

    const co = s.coHostId ? talentById.get(s.coHostId) : undefined;
    if (co) {
      const known = (co.gender ?? "").trim() !== "";
      const male = isMale(co.gender);
      const brandName = brandNames.get(s.brandId) ?? "";
      const targets: RuleLine["id"][] = [];
      if (SPORT_BRAND_PATTERN.test(brandName)) targets.push("male_sport");
      if (endsLate(s.startTime, s.endTime, lateEnd)) targets.push("male_night");
      for (const id of targets) {
        const l = line(id);
        if (!known) l.unknownHours += h;
        else {
          l.hours += h;
          if (male) l.okHours += h;
        }
      }
    }
  }

  const share = totalHours > 0 ? allHalf / totalHours : 0.5;
  const tol = params.rosterRangeTolerance;
  const people: PersonPlanRow[] = Object.entries(caps)
    .map(([talentId, c]) => {
      const ph = personHours.get(talentId) ?? { all: 0, half: 0 };
      return { talentId, cap: c.monthMax, halfCap: c.firstHalfMax ?? c.monthMax * share * (1 + tol), actual: ph.all, actualHalf: ph.half, note: c.note ?? "" };
    })
    .sort((a, b) => b.actual / b.cap - a.actual / a.cap);

  const mean = (b: { sum: number; h: number }) => (b.h > 0 ? b.sum / b.h : null);
  return { month, totalHours, lines, perf: { peak: mean(perfAcc.peak), regular: mean(perfAcc.regular), peakHours: perfAcc.peak.all, regularHours: perfAcc.regular.all }, people };
}
