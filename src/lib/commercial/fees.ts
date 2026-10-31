import type { LiveSession } from "../../types";
import { fmtNum, fmtVndFull } from "../format";
import { hasStaffSegments, segmentsOfRole } from "../staffSegments";
import { feeOf, type CommercialTerms, type FeeComponent, type RateRule } from "./terms";

// TÍNH PHÍ theo điều khoản (0191). Hai tầng:
//   sessionFee  — phần gắn với TỪNG CA (phí theo giờ + % doanh số); pnl.ts gọi để ra grossAgencyRev của ca.
//   settleMonth — cả tháng: cộng phí từng ca, rồi phí cố định, giờ vượt, Ads, booking, trừ hụt giờ/GMV, cộng thưởng GMV.
// Một hàm cho một khái niệm: P&L, Kế Toán và bản xem thử ở CRM đều đi qua đây, không ai tự nhân giờ × giá.

export interface SessionFeeInput {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string;
  hasCoHost: boolean;
  gmv: number;
  /** % hoàn huỷ dự kiến (0–100) để ra NMV. */
  returnRate: number;
}

export interface HourBreakdown {
  hours: number;
  rate: number;
  label: string;
}

export interface SessionFee {
  hours: number;
  perHour: number;
  coHostExtra: number;
  pct: number;
  nmv: number;
  total: number;
  /** Từng đoạn giờ theo đơn giá áp dụng (để giải thích vì sao ra số này). */
  breakdown: HourBreakdown[];
}

/** Ca có trợ live (kể cả đoạn trợ live khi đổi người giữa ca) — điều kiện phụ thu trợ live. */
export function sessionHasCoHost(s: LiveSession): boolean {
  return !!s.coHostId || (hasStaffSegments(s) && segmentsOfRole(s, "co_host").length > 0);
}

/** Đầu vào tính phí của một ca. `returnRate` = % hoàn huỷ (0–100) áp cho NMV. Ca loại khỏi báo cáo thì GMV = 0. */
export function feeInputOf(s: LiveSession, returnRate: number): SessionFeeInput {
  return { date: s.date, startTime: s.startTime, endTime: s.endTime, hasCoHost: sessionHasCoHost(s), gmv: s.excludedFromReports ? 0 : s.actualGmv, returnRate };
}

const toMin = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Cộng `days` ngày vào YYYY-MM-DD (UTC, không lệch múi giờ). */
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

const isWeekend = (date: string): boolean => {
  const [y, m, d] = date.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return dow === 0 || dow === 6;
};

/** Phút `minuteOfDay` (0–1439) của ngày `date` có nằm trong luật không. Khung giờ qua đêm (22:00–02:00) được hỗ trợ. */
function ruleMatches(rule: RateRule, date: string, minuteOfDay: number): boolean {
  if (rule.dates.length > 0) {
    if (!rule.dates.includes(date)) return false;
  } else if (rule.weekdays === "weekend" ? !isWeekend(date) : rule.weekdays === "weekday" ? isWeekend(date) : false) {
    return false;
  }
  if (!rule.from || !rule.to) return true;
  const a = toMin(rule.from);
  const b = toMin(rule.to);
  if (a === b) return true;
  return a < b ? minuteOfDay >= a && minuteOfDay < b : minuteOfDay >= a || minuteOfDay < b;
}

function ruleRate(rule: RateRule, base: number): number {
  return rule.mode === "rate" ? rule.value : rule.mode === "multiplier" ? base * rule.value : base + rule.value;
}

/**
 * Phí theo giờ của một ca: đi từng phút của ca, mỗi phút lấy đơn giá của luật khớp đầu tiên (không có thì đơn giá gốc).
 * Ca qua đêm: phần sau 00:00 thuộc NGÀY KẾ TIẾP (luật cuối tuần/ngày sale xét theo ngày thật của phút đó).
 * Giờ bắt đầu = giờ kết thúc ⇒ 0 giờ (giống sessionDurationHours).
 */
export function hourlyCharge(f: Extract<FeeComponent, { kind: "per_hour" }>, s: Pick<SessionFeeInput, "date" | "startTime" | "endTime" | "hasCoHost">) {
  const start = toMin(s.startTime);
  let len = toMin(s.endTime) - start;
  if (len < 0) len += 24 * 60;
  const buckets = new Map<string, { minutes: number; rate: number; label: string }>();
  for (let i = 0; i < len; i += 1) {
    const abs = start + i;
    const date = abs >= 24 * 60 ? addDays(s.date, Math.floor(abs / (24 * 60))) : s.date;
    const minute = abs % (24 * 60);
    const hit = f.rules.find((r) => ruleMatches(r, date, minute));
    const rate = hit ? ruleRate(hit, f.rate) : f.rate;
    const label = hit ? hit.label || "Luật giá" : "Giá gốc";
    const key = `${label}|${rate}`;
    const cur = buckets.get(key);
    if (cur) cur.minutes += 1;
    else buckets.set(key, { minutes: 1, rate, label });
  }
  const breakdown: HourBreakdown[] = [...buckets.values()].map((b) => ({ hours: b.minutes / 60, rate: b.rate, label: b.label }));
  const hours = len / 60;
  const main = breakdown.reduce((sum, b) => sum + b.hours * b.rate, 0);
  const extra = s.hasCoHost ? hours * f.coHostExtra : 0;
  return { hours, main, extra, breakdown };
}

export function sessionFee(terms: CommercialTerms, s: SessionFeeInput): SessionFee {
  let perHour = 0;
  let coHostExtra = 0;
  let pct = 0;
  let breakdown: HourBreakdown[] = [];
  let len = toMin(s.endTime) - toMin(s.startTime);
  if (len < 0) len += 24 * 60;
  const hours = len / 60; // giờ ca theo lịch, kể cả khi gói không có phí theo giờ (cần cho cam kết giờ)
  const nmv = s.gmv * (1 - s.returnRate / 100);
  for (const f of terms.fees) {
    if (f.kind === "per_hour") {
      const c = hourlyCharge(f, s);
      perHour += c.main;
      coHostExtra += c.extra;
      breakdown = breakdown.concat(c.breakdown);
    } else if (f.kind === "pct_nmv") {
      pct += ((f.basis === "gmv" ? s.gmv : nmv) * f.pct) / 100;
    }
  }
  return { hours, perHour, coHostExtra, pct, nmv, total: perHour + coHostExtra + pct, breakdown };
}

// ============================ CẢ THÁNG ============================

export interface SettlementInput {
  sessions: SessionFeeInput[];
  /** Giờ cam kết của tháng (brand_monthly_commitments). Vắng/0 = không cam kết giờ. */
  committedHours?: number;
  committedGmv?: number;
  /** % hoàn dùng cho cả tháng (vd hoàn thật từ file Shop Analytics); vắng ⇒ dùng returnRate từng ca. */
  returnRateOverride?: number;
  /** Số tháng cần nhập tay (chưa có nguồn tự động): chi tiêu Ads, số creator đã book, GMV affiliate. */
  adsSpend?: number;
  creatorsBooked?: number;
  affiliateGmv?: number;
}

export interface SettlementLine {
  key: string;
  label: string;
  /** Âm = giảm phí. */
  amount: number;
  detail: string;
}

export interface Settlement {
  lines: SettlementLine[];
  /** Phần cộng từ từng ca (phí giờ + %), chưa gồm khoản cả tháng. */
  sessionFees: number;
  /** Tổng các khoản cả tháng (cố định, vượt giờ, Ads, booking, thưởng, trừ hụt…) — có thể âm. */
  monthAdjustments: number;
  total: number;
  hours: number;
  gmv: number;
  nmv: number;
  /** Giờ phải bù (chế độ “bù giờ”). */
  owedHours: number;
  /** Số còn thiếu để tính đủ phí (người dùng cần nhập). */
  missing: string[];
  /** Số nhập tay của tháng mà điều khoản này dùng (để màn Kế Toán biết hiện ô nào). */
  needs: ("ads" | "creators" | "affiliate_gmv")[];
}

const fmt = fmtVndFull;

export function settleMonth(terms: CommercialTerms, input: SettlementInput): Settlement {
  const missing: string[] = [];
  const needs: Settlement["needs"] = [];
  const lines: SettlementLine[] = [];
  let hours = 0;
  let gmv = 0;
  let nmv = 0;
  let perHour = 0;
  let coHost = 0;
  let pct = 0;
  for (const s of input.sessions) {
    const r = sessionFee(terms, input.returnRateOverride === undefined ? s : { ...s, returnRate: input.returnRateOverride });
    hours += r.hours;
    gmv += s.gmv;
    nmv += r.nmv;
    perHour += r.perHour;
    coHost += r.coHostExtra;
    pct += r.pct;
  }
  const hourly = feeOf(terms, "per_hour");
  const pctFee = feeOf(terms, "pct_nmv");
  if (hourly) lines.push({ key: "per_hour", label: hourly.label || "Phí theo giờ live", amount: perHour, detail: `${fmtNum(hours, 2)} giờ ca × đơn giá ${fmt(hourly.rate)}/giờ${hourly.rules.length ? " (có luật giá)" : ""}` });
  if (hourly && hourly.coHostExtra > 0) lines.push({ key: "co_host", label: "Phụ thu trợ live", amount: coHost, detail: `+${fmt(hourly.coHostExtra)}/giờ cho ca có trợ live` });
  if (pctFee) lines.push({ key: "pct_nmv", label: pctFee.label || `${pctFee.pct}% ${pctFee.basis === "gmv" ? "GMV" : "NMV"}`, amount: pct, detail: `${fmt(pctFee.basis === "gmv" ? gmv : nmv)} × ${pctFee.pct}%` });
  const sessionFees = perHour + coHost + pct;

  let fixedTotal = 0;
  let baseFees = sessionFees;
  for (const f of terms.fees) {
    if (f.kind === "fixed_monthly") {
      lines.push({ key: `fixed:${f.id}`, label: f.label || "Phí cố định hằng tháng", amount: f.amount, detail: f.includedHours > 0 ? `gồm ${f.includedHours} giờ live` : "cố định mỗi tháng" });
      fixedTotal += f.amount;
      baseFees += f.amount;
      if (f.includedHours > 0 && f.overageRate > 0 && hours > f.includedHours) {
        const over = hours - f.includedHours;
        lines.push({ key: `overage:${f.id}`, label: "Giờ vượt gói", amount: over * f.overageRate, detail: `${fmtNum(over, 2)} giờ vượt × ${fmt(f.overageRate)}` });
        baseFees += over * f.overageRate;
      }
    } else if (f.kind === "ads_mgmt") {
      needs.push("ads");
      if (input.adsSpend === undefined) {
        missing.push("Chi tiêu Ads tháng này");
        lines.push({ key: `ads:${f.id}`, label: f.label || "Phí quản lý Ads", amount: f.minFee, detail: f.minFee > 0 ? `chưa nhập chi tiêu Ads — tạm lấy mức tối thiểu` : "chưa nhập chi tiêu Ads" });
        baseFees += f.minFee;
      } else {
        const fee = Math.max(f.minFee, (input.adsSpend * f.pct) / 100);
        lines.push({ key: `ads:${f.id}`, label: f.label || "Phí quản lý Ads", amount: fee, detail: `${fmt(input.adsSpend)} × ${f.pct}%${fee === f.minFee && f.minFee > 0 ? " (mức tối thiểu)" : ""} · ngân sách do ${terms.adsBudgetBy === "yfb" ? "YFB ứng" : "brand trả"}` });
        baseFees += fee;
      }
    } else if (f.kind === "affiliate_booking") {
      const needsCreators = f.perCreator > 0;
      const needsGmv = f.pctOfAffiliateGmv > 0;
      if (needsCreators) needs.push("creators");
      if (needsGmv) needs.push("affiliate_gmv");
      if (needsCreators && input.creatorsBooked === undefined) missing.push("Số creator đã book");
      if (needsGmv && input.affiliateGmv === undefined) missing.push("GMV affiliate tháng này");
      const fee = (needsCreators ? (input.creatorsBooked ?? 0) * f.perCreator : 0) + (needsGmv ? ((input.affiliateGmv ?? 0) * f.pctOfAffiliateGmv) / 100 : 0);
      lines.push({
        key: `aff:${f.id}`,
        label: f.label || "Phí booking creator",
        amount: fee,
        detail: [needsCreators ? `${input.creatorsBooked ?? "?"} creator × ${fmt(f.perCreator)}` : "", needsGmv ? `${fmt(input.affiliateGmv ?? 0)} GMV affiliate × ${f.pctOfAffiliateGmv}%` : ""].filter(Boolean).join(" + ")
      });
      baseFees += fee;
    }
  }

  // Hụt giờ cam kết
  const committed = input.committedHours ?? 0;
  let owedHours = 0;
  if (committed > 0 && hours < committed) {
    const gap = committed - hours;
    const sf = terms.shortfall;
    if (sf.mode === "makeup") {
      owedHours = gap;
      lines.push({ key: "makeup", label: "Giờ phải bù", amount: 0, detail: `thiếu ${fmtNum(gap, 2)} giờ so với cam kết ${fmtNum(committed, 2)}h — bù trong ${sf.months} tháng tới` });
    } else if (sf.mode === "prorate" && fixedTotal > 0) {
      const cut = -fixedTotal * (gap / committed);
      lines.push({ key: "prorate", label: "Giảm phí cố định theo giờ thiếu", amount: cut, detail: `thiếu ${fmtNum(gap, 2)}/${fmtNum(committed, 2)} giờ` });
      baseFees += cut;
    } else if (sf.mode === "credit" && sf.perHour > 0) {
      const cut = -gap * sf.perHour;
      lines.push({ key: "credit", label: "Trừ phí giờ thiếu", amount: cut, detail: `${fmtNum(gap, 2)} giờ × ${fmt(sf.perHour)}` });
      baseFees += cut;
    }
  }

  // GMV so với cam kết: hụt ⇒ giảm phí; vượt ⇒ thưởng
  const committedGmv = input.committedGmv ?? 0;
  const pen = terms.gmvPenalty;
  if (pen && pen.discountPct > 0) {
    if (committedGmv <= 0) missing.push("GMV cam kết của tháng (để xét giảm phí khi hụt)");
    else if (gmv < (committedGmv * pen.belowPctOfCommit) / 100) {
      const cut = -(Math.max(0, baseFees) * pen.discountPct) / 100;
      lines.push({ key: "gmv_penalty", label: "Giảm phí do hụt GMV", amount: cut, detail: `GMV ${fmt(gmv)} dưới ${pen.belowPctOfCommit}% cam kết (${fmt(committedGmv)}) → giảm ${pen.discountPct}%` });
    }
  }
  const bonus = terms.gmvBonus;
  if (bonus && bonus.tiers.length > 0) {
    const value = bonus.basis === "nmv" ? nmv : gmv;
    const tiers = bonus.tiers
      .map((t) => ({ from: t.fromAmount > 0 ? t.fromAmount : (committedGmv * t.fromPctOfCommit) / 100, pct: t.pct, needsCommit: t.fromAmount <= 0 }))
      .sort((a, b) => a.from - b.from);
    if (tiers.some((t) => t.needsCommit) && committedGmv <= 0) {
      missing.push("GMV cam kết của tháng (để tính thưởng GMV)");
    } else {
      let total = 0;
      tiers.forEach((t, i) => {
        const upper = i + 1 < tiers.length ? tiers[i + 1].from : Infinity;
        total += (Math.max(0, Math.min(value, upper) - t.from) * t.pct) / 100;
      });
      if (bonus.cap > 0) total = Math.min(total, bonus.cap);
      if (total > 0) lines.push({ key: "gmv_bonus", label: "Thưởng vượt GMV", amount: total, detail: `${bonus.basis === "nmv" ? "NMV" : "GMV"} ${fmt(value)} vượt ngưỡng ${fmt(tiers[0].from)}${bonus.cap > 0 ? ` (trần ${fmt(bonus.cap)})` : ""}` });
    }
  }

  if (terms.fees.length === 0) missing.push("Chưa khai khoản phí nào");
  const total = lines.reduce((sum, l) => sum + l.amount, 0);
  return { lines, sessionFees, monthAdjustments: total - sessionFees, total, hours, gmv, nmv, owedHours, missing: [...new Set(missing)], needs };
}
