import type { LiveSession, Talent, TalentRateHistoryEntry } from "../../types";
import { fmtFixed } from "../format";
import { computeSessionPnl, isPnlSession } from "../pnl";
import { platformOf, REPORT_PLATFORMS, type ReportPlatform } from "../reportPlatform";
import { personRoleMinutes, roleShares, segmentsOfRole, type StaffRole } from "../staffSegments";
import { plannedCost } from "./candidates";

// Điều Phối Lịch Live — TỔNG KẾT THÁNG THEO NGƯỜI (13/11, trainer gửi bảng nghiệm thu T9 của chị ấy): mỗi host (hoặc trợ) một dòng —
// mức cast/giờ, giờ Plan so với giờ Nghiệm thu, tiền cast Plan so với Nghiệm thu, và GMV họ mang về để so với tiền cast, kèm lý do
// tự tính khi lệch so với tháng trước. Hàm thuần, không đụng DB.
//
//  - PLAN = mọi ca của tháng chưa huỷ, theo giờ lịch của người đó (đoạn đứng riêng nếu ca đổi người). Tiền = rate tại ngày ca × giờ.
//  - NGHIỆM THU = ca đã diễn ra có bằng chứng (`isPnlSession`, kể cả ca nạp bù vì T9 trở về trước là nạp bù) — giờ tính lương và
//    tiền công lấy từ `computeSessionPnl` (một công thức duy nhất với Finance, đã gồm OT / off sớm / đổi người).
//  - GMV chỉ có ở vai HOST, chia theo phần giờ đứng của host trong ca, và TÁCH THEO SÀN: không bao giờ cộng TikTok với Shopee.
//    Tiền cast thì cộng được nên cast % cũng tách theo sàn (cast của ca sàn đó ÷ GMV của sàn đó).

export type ReviewRole = StaffRole;

export interface PlatformShare {
  gmv: number;
  cast: number;
  hours: number;
}
const emptyPlatforms = (): Record<ReportPlatform, PlatformShare> => ({ TikTok: { gmv: 0, cast: 0, hours: 0 }, Shopee: { gmv: 0, cast: 0, hours: 0 } });

export interface ReviewRow {
  talentId: string;
  name: string;
  planHours: number;
  actualHours: number;
  planCost: number;
  actualCost: number;
  /** Có ca chưa có rate nên tiền thấp hơn thật (không phải 0). */
  costMissing: boolean;
  actualSessions: number;
  rateMin: number;
  rateMax: number;
  /** Có ca trả theo phiên (không theo giờ) — mức cast/giờ không áp dụng cho các ca đó. */
  perSession: boolean;
  /** Chỉ vai host mới có GMV; vai trợ để trống. */
  byPlatform: Record<ReportPlatform, PlatformShare>;
  reasons: string[];
}

export interface ReviewTotals {
  planHours: number;
  actualHours: number;
  planCost: number;
  actualCost: number;
  byPlatform: Record<ReportPlatform, PlatformShare>;
}

export interface MonthReview {
  rows: ReviewRow[];
  totals: ReviewTotals;
  /** Có ca của tháng chưa diễn ra (Plan còn hơn Nghiệm thu là chuyện bình thường). */
  hasUpcoming: boolean;
}

export interface ReviewInput {
  sessions: readonly LiveSession[];
  talents: readonly Talent[];
  history: readonly TalentRateHistoryEntry[];
  month: string;
  role: ReviewRole;
  /** Ngày hôm nay (YYYY-MM-DD) — chỉ để biết còn ca chưa diễn ra. */
  today: string;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

interface Acc {
  talentId: string;
  name: string;
  planMin: number;
  planCost: number;
  planMissing: boolean;
  actualHours: number;
  actualCost: number;
  actualMissing: boolean;
  actualSessions: number;
  rates: number[];
  perSession: boolean;
  byPlatform: Record<ReportPlatform, PlatformShare>;
}

function collect(input: Pick<ReviewInput, "sessions" | "talents" | "history" | "month" | "role">): Map<string, Acc> {
  const { sessions, talents, history, month, role } = input;
  const talentById = new Map(talents.map((t) => [t.id, t]));
  const talentRec = Object.fromEntries(talentById) as Record<string, Talent>;
  const hist = history as TalentRateHistoryEntry[];
  const accs = new Map<string, Acc>();
  const get = (id: string, fallbackName: string): Acc => {
    let a = accs.get(id);
    if (!a) {
      a = {
        talentId: id,
        name: talentById.get(id)?.name ?? fallbackName,
        planMin: 0,
        planCost: 0,
        planMissing: false,
        actualHours: 0,
        actualCost: 0,
        actualMissing: false,
        actualSessions: 0,
        rates: [],
        perSession: false,
        byPlatform: emptyPlatforms()
      };
      accs.set(id, a);
    }
    return a;
  };

  for (const s of sessions) {
    if (!s.date.startsWith(month)) continue;
    // PLAN: mọi ca chưa huỷ.
    if (s.status !== "Cancelled") {
      const segs = segmentsOfRole(s, role);
      for (const id of new Set(segs.map((g) => g.talentId))) {
        const a = get(id, segs.find((g) => g.talentId === id)?.talentName ?? "?");
        const minutes = personRoleMinutes(s, id, role);
        a.planMin += minutes;
        const c = plannedCost(talentById.get(id), hist, role, s.date, minutes / 60);
        if (c.missing) a.planMissing = true;
        else a.planCost += c.amount;
      }
    }
    // NGHIỆM THU: ca đã diễn ra có bằng chứng.
    if (!isPnlSession(s, { includeBackfill: true })) continue;
    const pnl = computeSessionPnl(s, {}, talentRec, {}, [], hist, []);
    const platform = platformOf(s);
    const gmv = s.excludedFromReports ? 0 : s.actualGmv;
    const hostShare = role === "host" ? new Map(roleShares(s, "host").map((x) => [x.talentId, x.share])) : undefined;
    for (const p of pnl.payouts) {
      if (p.role !== role) continue;
      const a = get(p.talentId, p.name);
      a.actualHours += p.hours;
      a.actualCost += p.payout;
      a.actualSessions += 1;
      if (p.missingRate) a.actualMissing = true;
      if (p.paidHourly && p.hours > 0) a.rates.push(Math.round(p.payout / p.hours / 100) * 100); // làm tròn 100đ: tránh "200K–200K" do sai số số thực
      else if (!p.missingRate) a.perSession = true;
      const slot = a.byPlatform[platform];
      slot.cast += p.payout;
      slot.hours += p.hours;
      if (hostShare) slot.gmv += gmv * (hostShare.get(p.talentId) ?? 0);
    }
  }
  return accs;
}

const pct = (a: number, b: number) => (b > 0 ? (a - b) / b : 0);
const fmtH = (h: number) => `${round1(h).toLocaleString("vi-VN")}h`;

/** Lý do tự tính (không bắt ai nhập thêm): chỉ nêu khi lệch đủ lớn, tối đa 2 ý. */
function reasonsOf(cur: Acc, prev: Acc | undefined, role: ReviewRole, prevLabel: string): string[] {
  const out: string[] = [];
  const planH = cur.planMin / 60;
  if (planH >= 8 && cur.actualHours < planH * 0.85) out.push(`Làm ít hơn plan ${fmtH(planH - cur.actualHours)} (${Math.round((1 - cur.actualHours / planH) * 100)}%)`);
  else if (planH >= 8 && cur.actualHours > planH * 1.15) out.push(`Làm nhiều hơn plan ${fmtH(cur.actualHours - planH)}`);
  if (prev && prev.actualHours >= 8) {
    const d = pct(cur.actualHours, prev.actualHours);
    if (Math.abs(d) >= 0.25) out.push(`Giờ ${d > 0 ? "tăng" : "giảm"} ${Math.round(Math.abs(d) * 100)}% so ${prevLabel} (${fmtH(prev.actualHours)} → ${fmtH(cur.actualHours)})`);
  } else if (!prev && cur.actualHours > 0) {
    out.push(`Chưa có giờ ${prevLabel}`);
  }
  if (role === "host" && prev) {
    for (const pf of REPORT_PLATFORMS) {
      const c = cur.byPlatform[pf];
      const p = prev.byPlatform[pf];
      if (c.gmv > 0 && p.gmv > 0 && c.hours >= 8 && p.hours >= 8) {
        const a = c.cast / c.gmv;
        const b = p.cast / p.gmv;
        if (Math.abs(a - b) >= 0.005) out.push(`Cast/GMV ${pf} ${a > b ? "tăng" : "giảm"} ${fmtFixed(b * 100, 1)}% → ${fmtFixed(a * 100, 1)}%`);
      }
    }
  }
  return out.slice(0, 2);
}

export const prevMonthOf = (month: string): string => {
  const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 2, 1));
  return d.toISOString().slice(0, 7);
};

export function buildMonthReview(input: ReviewInput): MonthReview {
  const cur = collect(input);
  const prev = collect({ ...input, month: prevMonthOf(input.month) });
  const prevLabel = `T${Number(prevMonthOf(input.month).slice(5))}`;
  const rows: ReviewRow[] = [];
  const totals: ReviewTotals = { planHours: 0, actualHours: 0, planCost: 0, actualCost: 0, byPlatform: emptyPlatforms() };
  for (const a of cur.values()) {
    if (a.planMin <= 0 && a.actualHours <= 0) continue;
    const planHours = a.planMin / 60;
    rows.push({
      talentId: a.talentId,
      name: a.name,
      planHours,
      actualHours: a.actualHours,
      planCost: a.planCost,
      actualCost: a.actualCost,
      costMissing: a.planMissing || a.actualMissing,
      actualSessions: a.actualSessions,
      rateMin: a.rates.length ? Math.min(...a.rates) : 0,
      rateMax: a.rates.length ? Math.max(...a.rates) : 0,
      perSession: a.perSession,
      byPlatform: a.byPlatform,
      reasons: reasonsOf(a, prev.get(a.talentId), input.role, prevLabel)
    });
    totals.planHours += planHours;
    totals.actualHours += a.actualHours;
    totals.planCost += a.planCost;
    totals.actualCost += a.actualCost;
    for (const pf of REPORT_PLATFORMS) {
      totals.byPlatform[pf].gmv += a.byPlatform[pf].gmv;
      totals.byPlatform[pf].cast += a.byPlatform[pf].cast;
      totals.byPlatform[pf].hours += a.byPlatform[pf].hours;
    }
  }
  rows.sort((x, y) => y.actualHours - x.actualHours || y.planHours - x.planHours);
  const hasUpcoming = input.sessions.some((s) => s.date.startsWith(input.month) && s.status !== "Cancelled" && s.status !== "Completed" && s.date >= input.today);
  return { rows, totals, hasUpcoming };
}

/** Cast ÷ GMV của một sàn; null khi chưa đủ giờ làm căn cứ (< 3 giờ) hoặc không có GMV. */
export const castPctOf = (p: PlatformShare): number | null => (p.gmv > 0 && p.hours >= 3 ? p.cast / p.gmv : null);
