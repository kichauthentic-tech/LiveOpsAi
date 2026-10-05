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
import { getCanonicalAdsCost } from "./metrics/adsCost";
import { hasLiveEvidence } from "./sessionStatus";
import { hasStaffSegments, segmentsOfRole, sessionMinutes, type StaffRole } from "./staffSegments";

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
  // Audit Module 3 (2026-09-18, user chốt): TRỢ LIVE CÓ ĐƯỢC TRẢ CÔNG. Trước đó P&L chỉ trả cho
  // host_id, co_host_id không xuất hiện ở đâu — Net Profit bị thổi phồng đúng bằng khoản này.
  // Trợ live trả theo rate card của CHÍNH HỌ (talent_rate_history tại ngày ca, rơi về talents),
  // cùng công thức với host: giờ × rate/giờ nếu có rate giờ, không thì rate/phiên; cộng % GMV
  // theo commission_rate của họ nếu có đặt. Không có override tay ở Finance cho trợ live.
  coHost?: Talent;
  coHostPayout: number;
  coHostPaidHourly: boolean;
  // true = lương trợ live tính bằng rate trợ riêng (0089); false = rơi về rate host của người đó.
  coHostUsesAssistantRate: boolean;
  // Đ3 (chạy thử workflow 2026-09-24): những ô rate mà công thức PHẢI có nhưng chưa ai nhập, và
  // hàm này đang lặng lẽ thay bằng 0 / bằng mặc định trong code. Đo trên production hôm đó: 33/33
  // talent rate = 0, `brand_platform_rates` đúng 1 dòng (JOCKEY, 0đ/h) — nên P&L in ra
  // "Net Profit 7.875.000đ (72.4%)" với chi phí nhân sự = 0 và doanh thu = 15% mặc định của
  // DEFAULT_FINANCE, không một chữ nào nói là đang thiếu. Số 0 ở đây KHÔNG phải "miễn phí", nó là
  // "chưa biết", và hai thứ đó không được hiện giống nhau trên màn tiền.
  missingInputs: PnlMissingInput[];
  // Ca đã "loại khỏi báo cáo" (0114): công người làm vẫn tính (ca đã diễn ra thật — audit workflow 2026-10-04
  // #6), nhưng phần theo GMV (doanh thu agency, hoa hồng host/trợ) = 0, vì GMV của ca đó bị coi là không dùng
  // được và brand không thấy ca đó trong số đã giao.
  excluded: boolean;
  // Công từng người (migration 0138): ca không đổi người có đúng host (+ trợ); ca đổi người giữa ca có một dòng mỗi
  // người. hostPayout / coHostPayout ở trên là TỔNG các dòng cùng vai.
  payouts: PersonPayout[];
  segmented: boolean;
}

export interface PersonPayout {
  talentId: string;
  name: string;
  role: StaffRole;
  /** Giờ tính lương của người này trong ca (đã cộng OT / trừ off sớm nếu họ là người cuối ca). */
  hours: number;
  payout: number;
  /** Rate theo giờ (true) hay theo phiên chia theo giờ làm (false). */
  paidHourly: boolean;
  /** Người này không có rate/hoa hồng nào ⇒ công 0 là "chưa biết". */
  missingRate: boolean;
}

export type PnlMissingInput =
  | "host_rate" // host của ca không có rate/giờ, rate/phiên lẫn commission
  | "cohost_rate" // ca có trợ live nhưng người đó không có rate nào
  | "brand_rate" // brand tính theo giờ mà chưa set rate/giờ ở Rate Card
  | "commission_default"; // brand tính %GMV mà chưa ai đặt tỷ lệ -> đang dùng DEFAULT_FINANCE

export const PNL_MISSING_LABEL: Record<PnlMissingInput, string> = {
  host_rate: "Host chưa có rate",
  cohost_rate: "Trợ live chưa có rate",
  brand_rate: "Brand chưa set rate/giờ",
  commission_default: `Chưa đặt % commission (đang dùng mặc định ${DEFAULT_FINANCE.agencyCommissionRate}%)`
};

// Giờ tính lương của 1 phiên = giờ ca theo lịch + OT − off sớm (host tự khai trong report sau
// phiên, ops duyệt). KHÔNG dùng thời lượng live thật từ TikTok: đối soát Giai đoạn 2 chỉ cảnh
// báo lệch giờ chứ không ghi đè, theo đúng quyết định đã chốt với user.
//
// OT là AGENCY CHỊU (user chốt 2026-09-18): brand hourly vẫn bị tính đúng giờ kế hoạch
// (`sessionDurationHours` trong computeSessionPnl), chỉ phía trả talent mới cộng OT. Đừng "sửa"
// cho hai bên khớp nhau.
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
  const excluded = !!session.excludedFromReports;
  const gmv = excluded ? 0 : session.actualGmv;
  const brandRateAtDate = findBrandRateAsOf(brandPlatformRateHistory, session.brandId, session.platform, session.date);
  const currentBrandRate = brandPlatformRates.find((r) => r.brandId === session.brandId && r.platform === session.platform);
  // % hoa hồng theo brand (0118) — chỉ thay mặc định 15% khi ca CHƯA có dòng session_finance; ops đã
  // chốt tay ở Finance thì số của ca thắng.
  const brandCommission = brandRateAtDate?.commissionRate ?? currentBrandRate?.commissionRate;
  const financeRow = financeBySessionId[session.id];
  const finance = financeRow ?? { sessionId: session.id, ...DEFAULT_FINANCE, agencyCommissionRate: brandCommission ?? DEFAULT_FINANCE.agencyCommissionRate };
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
  const hourlyRate = brandRateAtDate?.ratePerHour ?? currentBrandRate?.ratePerHour ?? 0;
  const returnRate = brandRateAtDate?.returnRate ?? currentBrandRate?.returnRate ?? 0;
  const estimatedNmv = gmv * (1 - returnRate / 100);
  const grossAgencyRev = excluded
    ? 0
    : isHourly
      ? sessionDurationHours(session.startTime, session.endTime) * hourlyRate
      : (estimatedNmv * finance.agencyCommissionRate) / 100;
  let hostPayout = hostFixRate + (gmv * hostCommRate) / 100;

  // OT/off sớm khai theo CA (report là của ca, không phải của từng người) nên giờ tính lương của
  // trợ live = giờ tính lương của host trong cùng ca.
  // Rate TRỢ LIVE riêng (0089) đứng trước: cùng một người làm trợ ăn rate trợ, làm host ăn rate
  // host. Chưa đặt rate trợ (= 0) thì rơi về rate host theo giờ rồi rate/phiên như trước.
  const coHost = session.coHostId ? talentById[session.coHostId] : undefined;
  const coHostRateAtDate = coHost ? findTalentRateAsOf(talentRateHistory, coHost.id, session.date) : undefined;
  const coHostAssistantRate = coHostRateAtDate?.assistantRatePerHour ?? coHost?.assistantRatePerHour ?? 0;
  const coHostHourRate = coHostAssistantRate > 0 ? coHostAssistantRate : coHostRateAtDate?.ratePerHour ?? coHost?.ratePerHour ?? 0;
  const coHostPaidHourly = !!coHost && coHostHourRate > 0;
  const coHostFixRate = coHost
    ? coHostPaidHourly
      ? coHostHourRate * billableHours
      : coHostRateAtDate?.ratePerSession ?? coHost.ratePerSession ?? 0
    : 0;
  const coHostCommRate = coHost ? coHostRateAtDate?.commissionRate ?? coHost.commissionRate ?? 0 : 0;
  let coHostPayout = coHost ? coHostFixRate + (gmv * coHostCommRate) / 100 : 0;

  const segmented = hasStaffSegments(session);
  let payouts: PersonPayout[];
  if (!segmented) {
    payouts = [];
    if (talent) {
      payouts.push({ talentId: talent.id, name: talent.name, role: "host", hours: billableHours, payout: hostPayout, paidHourly: hostPaidHourly, missingRate: hostFixRate <= 0 && hostCommRate <= 0 });
    }
    if (coHost) {
      payouts.push({ talentId: coHost.id, name: coHost.name, role: "co_host", hours: billableHours, payout: coHostPayout, paidHourly: coHostPaidHourly, missingRate: coHostFixRate <= 0 && coHostCommRate <= 0 });
    }
  } else {
    // Đổi người giữa ca (0138): mỗi người ăn công theo GIỜ CỦA MÌNH. Rate theo giờ ⇒ rate x giờ; rate theo phiên (hoặc
    // override tay ở Finance, vốn là số cố định cho cả ca) ⇒ chia theo phần giờ làm trong ca. OT/off sớm gắn vào người
    // đứng tới cuối ca của vai đó. Không có hoa hồng GMV theo người ở đây (user chốt 06/10) — phần % nếu có chỉ chia
    // theo phần giờ, giữ công thức cũ cho ca không đổi người.
    const durMin = sessionMinutes(session);
    const adjHours = ((session.report?.otMinutes ?? 0) - (session.report?.earlyLeaveMinutes ?? 0)) / 60;
    payouts = [];
    for (const role of ["host", "co_host"] as const) {
      const segs = segmentsOfRole(session, role);
      const byPerson = new Map<string, { name: string; minutes: number; endsAtEnd: boolean }>();
      for (const g of segs) {
        const cur = byPerson.get(g.talentId) ?? { name: g.talentName, minutes: 0, endsAtEnd: false };
        cur.minutes += g.toMin - g.fromMin;
        if (g.toMin >= durMin) cur.endsAtEnd = true;
        if (!cur.name && g.talentName) cur.name = g.talentName;
        byPerson.set(g.talentId, cur);
      }
      for (const [talentId, v] of byPerson) {
        const t = talentById[talentId];
        const r = t ? findTalentRateAsOf(talentRateHistory, talentId, session.date) : undefined;
        const hours = Math.max(0, v.minutes / 60 + (v.endsAtEnd ? adjHours : 0));
        const share = durMin > 0 ? v.minutes / durMin : 0;
        let hourRate: number;
        let comm: number;
        let override: number | undefined;
        if (role === "host") {
          hourRate = r?.ratePerHour ?? t?.ratePerHour ?? 0;
          comm = finance.hostCommissionRateOverride ?? r?.commissionRate ?? t?.commissionRate ?? 0;
          override = finance.hostFixRateOverride;
        } else {
          const assistantRate = r?.assistantRatePerHour ?? t?.assistantRatePerHour ?? 0;
          hourRate = assistantRate > 0 ? assistantRate : r?.ratePerHour ?? t?.ratePerHour ?? 0;
          comm = r?.commissionRate ?? t?.commissionRate ?? 0;
          override = undefined;
        }
        const paidHourly = override === undefined && hourRate > 0;
        const fix = paidHourly ? hourRate * hours : (override ?? r?.ratePerSession ?? t?.ratePerSession ?? 0) * share;
        const pay = fix + (gmv * comm * share) / 100;
        payouts.push({ talentId, name: t?.name ?? v.name, role, hours, payout: pay, paidHourly, missingRate: fix <= 0 && comm <= 0 });
      }
    }
    hostPayout = payouts.filter((x) => x.role === "host").reduce((sum, x) => sum + x.payout, 0);
    coHostPayout = payouts.filter((x) => x.role === "co_host").reduce((sum, x) => sum + x.payout, 0);
  }

  const totalCost = hostPayout + coHostPayout + finance.studioCost + getCanonicalAdsCost(session, finance);
  const netProfit = grossAgencyRev - totalCost;

  // Đ3: ghi nhận đúng những ô đang bị thay bằng 0/mặc định. Điều kiện bám sát ĐƯỜNG TÍNH thật ở
  // trên, không bám vào `talent.ratePerHour` thô — override tay ở Finance (hostFixRateOverride)
  // là ops đã chốt số nên KHÔNG coi là thiếu.
  const missingInputs: PnlMissingInput[] = [];
  const hostRateMissing = segmented
    ? !payouts.some((x) => x.role === "host") || payouts.some((x) => x.role === "host" && x.missingRate)
    : hostFixRate <= 0 && hostCommRate <= 0;
  const coHostRateMissing = segmented
    ? payouts.some((x) => x.role === "co_host" && x.missingRate)
    : !!coHost && coHostFixRate <= 0 && coHostCommRate <= 0;
  if (hostRateMissing) missingInputs.push("host_rate");
  if (coHostRateMissing) missingInputs.push("cohost_rate");
  if (isHourly && hourlyRate <= 0) missingInputs.push("brand_rate");
  // Chỉ là "mặc định" khi KHÔNG có dòng session_finance cho ca này VÀ brand chưa đặt % hoa hồng (0118) —
  // ops đã vào sửa thì con số 15% là do họ chọn giữ, không phải app tự bịa.
  if (!isHourly && !financeRow && brandCommission == null) missingInputs.push("commission_default");

  return {
    missingInputs,
    excluded,
    session, finance, talent, isHourly, grossAgencyRev, hostPayout, netProfit,
    hostPaidHourly,
    billableHours,
    otMinutes: session.report?.otMinutes ?? 0,
    earlyLeaveMinutes: session.report?.earlyLeaveMinutes ?? 0,
    coHost,
    coHostPayout,
    coHostPaidHourly,
    coHostUsesAssistantRate: !!coHost && coHostAssistantRate > 0,
    payouts,
    segmented
  };
}

export interface TalentIncomeRow {
  session: LiveSession;
  role: "host" | "co_host";
  payout: number;
  billableHours: number;
}

// Thu nhập 1 talent trong 1 tháng — dùng cho "Hồ Sơ Của Tôi" (talent tự xem). Tái dùng ĐÚNG
// công thức hostPayout/coHostPayout của computeSessionPnl (Finance & P&L dùng), không viết công
// thức lương thứ hai — hai màn không được ra hai số khác nhau cho cùng một ca. Chỉ phần
// grossAgencyRev/netProfit (doanh thu BRAND) không cần nên brandById/brandPlatformRates* truyền
// rỗng — hostPayout/coHostPayout không đọc tới các tham số đó.
//
// Lọc giống computeSessionPnl đang được gọi ở FinanceHr.tsx: chỉ ca Completed, không phải ca
// backfill (rate card tháng đó không chuẩn), đúng tháng đang xem — một talent có thể vừa là
// host vừa là trợ live của 2 ca khác nhau trong cùng tháng nên trả về DANH SÁCH, không phải 1 số.
// Ca nào vào phép tính TIỀN — một luật cho Finance & P&L, Thu nhập talent và Bản Tin CEO (audit 2026-09-28:
// Finance lọc `Completed`, Bản Tin CEO lọc "ca có số" nên ca đã chạy mà GMV = 0 — host vẫn nhận lương — rơi
// khỏi chi phí của CEO). Khác nhau DUY NHẤT ở ca nạp bù, và đó là quyết định có chủ ý: Finance/lương loại
// chúng (rate card tháng đó không chuẩn, lương tháng cũ đã trả ngoài app), Bản Tin CEO tính để thấy cả lịch sử.
//
// Audit workflow 2026-10-04 #5: ca quá giờ tự sang Completed (0096) dù có ai live hay không. Chỉ ca có BẰNG
// CHỨNG đã diễn ra (số / report / giờ live / nạp bù — `hasLiveEvidence`) mới vào tiền; ca còn lại là "chờ xác
// nhận" (FinanceHr đếm và nói ra) — ops up số/nhập report nếu ca có chạy, hoặc huỷ ca nếu không.
export function isPnlSession(s: LiveSession, opts: { includeBackfill: boolean }): boolean {
  return s.status === "Completed" && hasLiveEvidence(s) && (opts.includeBackfill || !s.isBackfill);
}

export function computeTalentMonthlyIncome(
  sessions: LiveSession[],
  talentId: string,
  month: string,
  financeBySessionId: Record<string, SessionFinance>,
  talentById: Record<string, Talent>,
  talentRateHistory: TalentRateHistoryEntry[]
): { rows: TalentIncomeRow[]; total: number; missingRate: boolean } {
  const rows: TalentIncomeRow[] = [];
  // Đ3: talent chưa được nhập rate sẽ thấy "0 đ" cho ca họ đã chạy thật — không phân biệt được với
  // "tháng này không có ca". Trả cờ ra để màn hồ sơ nói "chưa có rate" thay vì in số 0.
  let missingRate = false;
  for (const session of sessions) {
    if (!isPnlSession(session, { includeBackfill: false }) || !session.date.startsWith(month)) continue;
    const pnl = computeSessionPnl(session, financeBySessionId, talentById, {}, [], talentRateHistory, []);
    // Mỗi người một dòng công — ca đổi người giữa ca (0138) thì người này chỉ ăn phần giờ của mình.
    for (const p of pnl.payouts) {
      if (p.talentId !== talentId) continue;
      rows.push({ session, role: p.role, payout: p.payout, billableHours: p.hours });
      if (p.missingRate) missingRate = true;
    }
  }
  rows.sort((a, b) => (a.session.date < b.session.date ? 1 : -1));
  return { rows, total: rows.reduce((sum, r) => sum + r.payout, 0), missingRate };
}
