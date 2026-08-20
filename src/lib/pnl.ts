// P&L thật của 1 session — logic dùng chung cho báo cáo Finance & P&L.
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
// FIX L8 (audit 2026-08-21): điều kiện cũ `mins <= 0` gộp chung 2 trường hợp khác nhau — ca qua
// đêm thật (end < start, vd 22:00 -> 00:30, mins âm) và gõ nhầm giờ kết thúc = giờ bắt đầu (mins
// đúng bằng 0). Cả 2 đều bị +1440 nên start===end ra 24 giờ công, không có kiểm tra nào chặn lại.
// Chỉ ca qua đêm thật (mins < 0) mới cộng thêm 24h; start===end phải ra 0 giờ.
export function sessionDurationHours(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
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
  // LƯU Ý dễ nhầm: isHourly là mô hình tính DOANH THU AGENCY của BRAND (grossAgencyRev), hoàn
  // toàn tách biệt với việc talent hưởng lương theo giờ hay theo phiên (hostPaidHourly bên dưới).
  isHourly: boolean;
  grossAgencyRev: number;
  hostPayout: number;
  netProfit: number;
  // Giai đoạn 3 — chi tiết cách ra hostPayout, để UI Finance giải thích được con số.
  hostPaidHourly: boolean;
  billableHours: number;
  otMinutes: number;
  earlyLeaveMinutes: number;
}

// Giờ tính lương của 1 phiên = giờ ca theo lịch + OT − off sớm (host tự khai trong report sau
// phiên, ops duyệt). KHÔNG dùng thời lượng live thật từ TikTok: đối soát Giai đoạn 2 chỉ cảnh
// báo lệch giờ chứ không ghi đè, theo đúng quyết định đã chốt với user.
export function billableSessionHours(session: LiveSession): number {
  const scheduled = sessionDurationHours(session.startTime, session.endTime);
  const otMinutes = session.report?.otMinutes ?? 0;
  const earlyLeaveMinutes = session.report?.earlyLeaveMinutes ?? 0;
  return Math.max(0, scheduled + (otMinutes - earlyLeaveMinutes) / 60);
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
  const hostCommRate = finance.hostCommissionRateOverride ?? talentRateAtDate?.commissionRate ?? talent?.commissionRate ?? 0;

  // Rate theo giờ (Giai đoạn 3) chỉ áp dụng khi talent thực sự có đặt > 0 — talent chưa chuyển
  // sang mô hình giờ vẫn ăn công thức flat cũ, nên P&L các session cũ không đổi sau migration.
  const talentHourRate = talentRateAtDate?.ratePerHour ?? talent?.ratePerHour ?? 0;
  // Override tay ở Finance vẫn thắng tất cả (ops chốt số cuối), và luôn hiểu là số tiền cố định
  // cho cả phiên — không nhân với giờ, giống hành vi trước Giai đoạn 3.
  const hostPaidHourly = finance.hostFixRateOverride === undefined && talentHourRate > 0;
  const billableHours = billableSessionHours(session);
  const hostFixRate = hostPaidHourly
    ? talentHourRate * billableHours
    : finance.hostFixRateOverride ?? talentRateAtDate?.ratePerSession ?? talent?.ratePerSession ?? 0;
  const isHourly = brand?.billingModel === "hourly";
  const brandRateAtDate = findBrandRateAsOf(brandPlatformRateHistory, session.brandId, session.platform, session.date);
  const hourlyRate =
    brandRateAtDate?.ratePerHour ??
    brandPlatformRates.find((r) => r.brandId === session.brandId && r.platform === session.platform)?.ratePerHour ??
    0;
  const returnRate =
    brandRateAtDate?.returnRate ??
    brandPlatformRates.find((r) => r.brandId === session.brandId && r.platform === session.platform)?.returnRate ??
    0;
  const estimatedNmv = session.actualGmv * (1 - returnRate / 100);
  const grossAgencyRev = isHourly
    ? sessionDurationHours(session.startTime, session.endTime) * hourlyRate
    : (estimatedNmv * finance.agencyCommissionRate) / 100;
  const hostPayout = hostFixRate + (session.actualGmv * hostCommRate) / 100;
  const totalCost = hostPayout + finance.studioCost + finance.adsCost;
  const netProfit = grossAgencyRev - totalCost;
  return {
    session, finance, talent, isHourly, grossAgencyRev, hostPayout, netProfit,
    hostPaidHourly,
    billableHours,
    otMinutes: session.report?.otMinutes ?? 0,
    earlyLeaveMinutes: session.report?.earlyLeaveMinutes ?? 0
  };
}
