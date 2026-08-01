// P&L thật của 1 session — logic dùng chung giữa FinanceHr.tsx (báo cáo theo phiên, Giai đoạn
// 7/19) và MonthlyClose.tsx (gộp theo tháng, Giai đoạn 20). Tách ra 1 nơi duy nhất để 2 màn hình
// không bao giờ tính lệch nhau.
import {
  LiveSession,
  Talent,
  SessionFinance,
  Brand,
  BrandPlatformRate,
  TalentRateHistoryEntry,
  BrandPlatformRateHistoryEntry
} from "../types";

export const DEFAULT_FINANCE: Omit<SessionFinance, "sessionId"> = {
  agencyCommissionRate: 15,
  studioCost: 0,
  adsCost: 0,
  approvalStatus: "pending",
  notes: ""
};

// Giờ live thật của 1 phiên (ca qua đêm cộng thêm 24h) — giống hệt durationHours ở
// ShiftScheduling.tsx.
export function sessionDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins <= 0) mins += 24 * 60;
  return mins / 60;
}

// Giai đoạn 19 — rate tại đúng NGÀY session diễn ra, không phải rate hiện tại của Talent/Brand.
// effectiveFrom/effectiveTo là chuỗi "YYYY-MM-DD" nên so sánh lexicographic là đủ.
export function findTalentRateAsOf(history: TalentRateHistoryEntry[], talentId: string, date: string) {
  return history.find(
    (h) => h.talentId === talentId && h.effectiveFrom <= date && (!h.effectiveTo || h.effectiveTo >= date)
  );
}

export function findBrandRateAsOf(
  history: BrandPlatformRateHistoryEntry[],
  brandId: string,
  platform: BrandPlatformRateHistoryEntry["platform"],
  date: string
) {
  return history.find(
    (h) =>
      h.brandId === brandId &&
      h.platform === platform &&
      h.effectiveFrom <= date &&
      (!h.effectiveTo || h.effectiveTo >= date)
  );
}

export interface SessionPnl {
  session: LiveSession;
  finance: SessionFinance;
  talent?: Talent;
  isHourly: boolean;
  grossAgencyRev: number;
  hostPayout: number;
  netProfit: number;
}

export function computeSessionPnl(
  session: LiveSession,
  financeBySessionId: Record<string, SessionFinance>,
  talentById: Record<string, Talent>,
  brandById: Record<string, Brand>,
  brandPlatformRates: BrandPlatformRate[],
  talentRateHistory: TalentRateHistoryEntry[],
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[]
): SessionPnl {
  const finance = financeBySessionId[session.id] ?? { sessionId: session.id, ...DEFAULT_FINANCE };
  const talent = talentById[session.hostId];
  const brand = brandById[session.brandId];
  const talentRateAtDate = talent ? findTalentRateAsOf(talentRateHistory, talent.id, session.date) : undefined;
  const hostFixRate = finance.hostFixRateOverride ?? talentRateAtDate?.ratePerSession ?? talent?.ratePerSession ?? 0;
  const hostCommRate = finance.hostCommissionRateOverride ?? talentRateAtDate?.commissionRate ?? talent?.commissionRate ?? 0;
  const isHourly = brand?.billingModel === "hourly";
  const brandRateAtDate = findBrandRateAsOf(brandPlatformRateHistory, session.brandId, session.platform, session.date);
  const hourlyRate =
    brandRateAtDate?.ratePerHour ??
    brandPlatformRates.find((r) => r.brandId === session.brandId && r.platform === session.platform)?.ratePerHour ??
    0;
  const grossAgencyRev = isHourly
    ? sessionDurationHours(session.startTime, session.endTime) * hourlyRate
    : (session.actualGmv * finance.agencyCommissionRate) / 100;
  const hostPayout = hostFixRate + (session.actualGmv * hostCommRate) / 100;
  const totalCost = hostPayout + finance.studioCost + finance.adsCost;
  const netProfit = grossAgencyRev - totalCost;
  return { session, finance, talent, isHourly, grossAgencyRev, hostPayout, netProfit };
}
