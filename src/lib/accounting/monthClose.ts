// Kế Toán — số tháng để đưa kế toán (K1, 23/10). KHÔNG có công thức riêng: mọi số tiền của ca đi qua computeSessionPnl
// (cùng nguồn với Finance & P&L); file này chỉ gom theo hợp đồng / theo người và đổi doanh thu hợp đồng % NMV từ
// "ước tính" sang "chính thức" khi đã có % hoàn thật.
//
// Luật (user chốt 23/10): doanh thu tách theo HỢP ĐỒNG (brand × sàn × hợp đồng hiệu lực phủ tháng). Hợp đồng thu % NMV:
// NMV thật chờ ~15 ngày sau ngày cuối tháng nên đến lúc đó dùng % hoàn dự kiến của CRM (ước tính); sau đó NMV suy từ
// % hoàn thật của CẢ SHOP trong file Seller Center (Hoàn tiền ÷ GMV) — xấp xỉ, vì file không tách riêng live.
import type {
  Brand,
  BrandContract,
  BrandMonthlyCommitment,
  BrandPlatformRate,
  BrandPlatformRateHistoryEntry,
  LiveSession,
  SessionFinance,
  Talent,
  TalentRateHistoryEntry
} from "../../types";
import { computeSessionPnl, isPnlSession, sessionDurationHours, type PnlMissingInput, type SessionPnl } from "../pnl";
import { sessionAdsCost } from "../metrics/adsCost";
import { contractCovering, monthCommitmentOf } from "../performance/brandCommitment";
import { isUnconfirmedPast } from "../sessionStatus";
import { platformOf, type ReportPlatform } from "../reportPlatform";
import { profileOf } from "../platforms/profiles";

/** Số ngày sau ngày cuối tháng mà sàn mới chốt hoàn/huỷ (user: ~15 ngày). */
export const NMV_SETTLE_DAYS = 15;

/** Hoàn tiền + GMV của CẢ SHOP trong tháng (file Seller Center, `shop_analytics`), theo brand. */
export interface ShopRefundMonth {
  gmv: number;
  refunds: number;
  /** Ngày cuối có dòng trong file ("YYYY-MM-DD"). */
  lastDate: string;
}

export type RevenueBasis =
  | { kind: "hourly"; ratePerHour: number }
  | { kind: "nmv_estimate"; commissionRate: number; returnRate: number }
  | { kind: "nmv_final"; commissionRate: number; returnRate: number };

export interface ContractRevenueRow {
  key: string;
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  contract?: BrandContract;
  basis: RevenueBasis;
  /** Số ca đủ dữ liệu tiền / tổng ca tính tiền của hợp đồng trong tháng. */
  counted: number;
  total: number;
  /** Giờ lịch của các ca đã tính — chính là số giờ nhân với đơn giá ở hợp đồng thu theo giờ. */
  hours: number;
  committedHours: number;
  /** GMV các ca đã tính (không gồm ca loại khỏi báo cáo). */
  gmv: number;
  revenue: number;
  /** Doanh thu theo cách ước tính, để hiện chênh lệch khi đã có số chính thức. */
  revenueEstimate: number;
  hostPay: number;
  coHostPay: number;
  studioCost: number;
  adsCost: number;
  grossProfit: number;
}

/** Giờ + công của một người ở MỘT brand × sàn (để biết giờ của họ đến từ brand nào). */
export interface TalentBrandRow {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  hostHours: number;
  coHostHours: number;
  hostPay: number;
  coHostPay: number;
  sessions: number;
}

/** Đối chiếu giờ của MỘT brand × sàn: giờ live của brand (cộng giờ tính lương từng ca) so với tổng giờ host / trợ live của mọi người. */
export interface HourCheckRow {
  brandId: string;
  brandName: string;
  platform: ReportPlatform;
  sessions: number;
  /** Σ giờ tính lương của các ca (giờ live thật, cộng OT / trừ off sớm). */
  brandHours: number;
  hostHours: number;
  coHostHours: number;
  /** brandHours − hostHours: phải bằng 0; khác 0 ⇒ ca chưa gán host hoặc đoạn đổi người bị hở. */
  hostGap: number;
  /** brandHours − coHostHours: giờ không có trợ live (không bắt buộc bằng 0). */
  coHostGap: number;
  sessionsNoHost: number;
  sessionsNoAssistant: number;
}

export const HOUR_TOLERANCE = 0.02;

export interface TalentPayRow {
  talentId: string;
  name: string;
  /** Vai chính (user chốt 23/10): ai có làm host trong tháng thì là host, dù cũng làm trợ live; còn lại là trợ live. */
  primaryRole: "host" | "co_host";
  byBrand: TalentBrandRow[];
  hostHours: number;
  coHostHours: number;
  hostPay: number;
  coHostPay: number;
  total: number;
  sessions: number;
  /** Có ca của người này chưa có rate ⇒ số tiền chưa đủ, không phải 0. */
  missingRate: boolean;
}

export interface MonthCloseSummary {
  revenue: number;
  talentPay: number;
  sessionCosts: number;
  grossProfit: number;
  counted: number;
  total: number;
}

export interface MonthClose {
  month: string;
  contracts: ContractRevenueRow[];
  /** Người có làm host trong tháng (giờ trợ live của họ nằm ở cột riêng cùng dòng). */
  hosts: TalentPayRow[];
  /** Đối chiếu giờ theo brand × sàn (xem HourCheckRow). */
  hourCheck: HourCheckRow[];
  /** Người chỉ làm trợ live trong tháng. */
  assistants: TalentPayRow[];
  summary: MonthCloseSummary;
  /** Ca thiếu rate/giá theo loại — những ca này KHÔNG cộng vào doanh thu/chi phí. */
  missing: { sessions: number; byKind: [PnlMissingInput, number][] };
  /** Ca đã qua giờ nhưng chưa có bằng chứng diễn ra — chưa vào tiền. */
  unconfirmed: LiveSession[];
  /** Ca nạp bù cùng tháng — không vào tiền (rate tháng đó không chuẩn). */
  backfillCount: number;
  /** Hợp đồng % NMV còn ở dạng ước tính + lý do (để ghi chú dưới bảng). */
  estimateNotes: string[];
}

export interface MonthCloseInput {
  /** "YYYY-MM" */
  month: string;
  /** "YYYY-MM-DD" hôm nay (giờ VN) — quyết định đã qua ngày chốt hoàn/huỷ hay chưa. */
  today: string;
  sessions: LiveSession[];
  talents: Talent[];
  brands: Brand[];
  financeRecords: SessionFinance[];
  brandPlatformRates: BrandPlatformRate[];
  talentRateHistory: TalentRateHistoryEntry[];
  brandPlatformRateHistory: BrandPlatformRateHistoryEntry[];
  contracts: BrandContract[];
  commitments: BrandMonthlyCommitment[];
  /** Theo brandId; thiếu = chưa có file Seller Center của tháng. */
  shopRefunds: Record<string, ShopRefundMonth | undefined>;
}

export function monthEndOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}

/** Ngày đầu tiên được coi là đã chốt hoàn/huỷ của tháng (ngày cuối tháng + 15). */
export function nmvSettledFrom(month: string): string {
  return addDays(monthEndOf(month), NMV_SETTLE_DAYS);
}

/** % hoàn thật của cả shop (0–100), hoặc undefined khi chưa dùng được: chưa đủ ngày chờ, file chưa phủ hết tháng hoặc GMV = 0. */
export function settledReturnRate(month: string, today: string, shop: ShopRefundMonth | undefined): number | undefined {
  if (!shop || shop.gmv <= 0) return undefined;
  if (today < nmvSettledFrom(month)) return undefined;
  if (shop.lastDate < monthEndOf(month)) return undefined;
  return (shop.refunds / shop.gmv) * 100;
}

export function buildMonthClose(input: MonthCloseInput): MonthClose {
  const { month, today } = input;
  const financeBySessionId: Record<string, SessionFinance> = {};
  for (const f of input.financeRecords) financeBySessionId[f.sessionId] = f;
  const talentById: Record<string, Talent> = {};
  for (const t of input.talents) talentById[t.id] = t;
  const brandById: Record<string, Brand> = {};
  for (const b of input.brands) brandById[b.id] = b;

  const periodMonth = `${month}-01`;
  const inMonth = (s: LiveSession) => s.date.startsWith(month);
  const pnlSessions = input.sessions.filter((s) => isPnlSession(s, { includeBackfill: false }) && inMonth(s));
  const rows: SessionPnl[] = pnlSessions.map((s) =>
    computeSessionPnl(s, financeBySessionId, talentById, brandById, input.brandPlatformRates, input.talentRateHistory, input.brandPlatformRateHistory)
  );

  // ---- doanh thu theo hợp đồng ----
  const byContract = new Map<string, ContractRevenueRow>();
  const estimateNotes: string[] = [];
  for (const r of rows) {
    const s = r.session;
    const platform = platformOf(s);
    const contract = contractCovering(input.contracts, s.brandId, platform, periodMonth);
    const key = `${s.brandId}|${platform}|${contract?.id ?? "none"}`;
    let e = byContract.get(key);
    if (!e) {
      const commit = monthCommitmentOf(input.commitments, input.contracts, s.brandId, platform, periodMonth);
      e = {
        key,
        brandId: s.brandId,
        brandName: s.brandName,
        platform,
        contract,
        basis: r.isHourly
          ? { kind: "hourly", ratePerHour: 0 }
          : { kind: "nmv_estimate", commissionRate: r.agencyCommissionRate, returnRate: 0 },
        counted: 0,
        total: 0,
        hours: 0,
        committedHours: commit.hours,
        gmv: 0,
        revenue: 0,
        revenueEstimate: 0,
        hostPay: 0,
        coHostPay: 0,
        studioCost: 0,
        adsCost: 0,
        grossProfit: 0
      };
      byContract.set(key, e);
    }
    e.total += 1;
    if (r.missingInputs.length > 0) continue;
    e.counted += 1;
    e.hours += sessionDurationHours(s.startTime, s.endTime);
    const gmv = r.excluded ? 0 : s.actualGmv;
    e.gmv += gmv;
    e.revenueEstimate += r.grossAgencyRev;
    e.revenue += r.grossAgencyRev;
    e.hostPay += r.hostPayout;
    e.coHostPay += r.coHostPayout;
    e.studioCost += r.finance.studioCost;
    e.adsCost += sessionAdsCost(s);
  }

  const rateOf = (brandId: string, platform: ReportPlatform) =>
    input.brandPlatformRates.find((x) => x.brandId === brandId && x.platform === platform);

  for (const e of byContract.values()) {
    const rate = rateOf(e.brandId, e.platform);
    if (e.basis.kind === "hourly") {
      e.basis = { kind: "hourly", ratePerHour: rate?.ratePerHour ?? 0 };
    } else {
      const expected = rate?.returnRate ?? 0;
      const commissionRate = e.basis.commissionRate;
      // Hoàn thật lấy từ file Shop Analytics: sàn nào không có loại file này (Shopee) thì luôn ước tính.
      const hasRefundFile = profileOf(e.platform).dataRawTypes.includes("shop_analytics");
      const settled = hasRefundFile ? settledReturnRate(month, today, input.shopRefunds[e.brandId]) : undefined;
      if (settled != null) {
        e.basis = { kind: "nmv_final", commissionRate, returnRate: settled };
        // Tính lại từ GMV các ca đã tính: ca đã loại khỏi báo cáo đã có GMV 0 ở trên.
        e.revenue = (e.gmv * (1 - settled / 100) * commissionRate) / 100;
      } else {
        e.basis = { kind: "nmv_estimate", commissionRate, returnRate: expected };
        const sf = input.shopRefunds[e.brandId];
        const pName = profileOf(e.platform).label;
        if (!hasRefundFile) {
          estimateNotes.push(`${e.brandName} · ${pName}: chưa có file hoàn tiền của sàn nên giữ ước tính theo % hoàn dự kiến ${expected}%.`);
        } else if (today < nmvSettledFrom(month)) {
          estimateNotes.push(`${e.brandName} · ${pName}: sàn chốt hoàn/huỷ từ ${nmvSettledFrom(month)}, tới lúc đó dùng % hoàn dự kiến ${expected}%.`);
        } else if (!sf) {
          estimateNotes.push(`${e.brandName} · ${pName}: chưa có file Shop Analytics của tháng ở Dữ Liệu Gốc nên giữ ước tính (hoàn dự kiến ${expected}%).`);
        } else {
          estimateNotes.push(`${e.brandName} · ${pName}: file Shop Analytics mới tới ${sf.lastDate}, chưa phủ hết tháng nên giữ ước tính (hoàn dự kiến ${expected}%).`);
        }
      }
    }
    e.grossProfit = e.revenue - e.hostPay - e.coHostPay - e.studioCost - e.adsCost;
  }

  const contracts = [...byContract.values()].sort(
    (a, b) => a.brandName.localeCompare(b.brandName) || a.platform.localeCompare(b.platform) || (a.contract?.contractCode ?? "").localeCompare(b.contract?.contractCode ?? "")
  );

  // ---- công theo người (mọi ca tính tiền, kể cả ca thiếu giá brand — công người không phụ thuộc giá brand) ----
  const byTalent = new Map<string, TalentPayRow>();
  for (const r of rows) {
    const platform = platformOf(r.session);
    const seen = new Set<string>();
    for (const p of r.payouts) {
      let t = byTalent.get(p.talentId);
      if (!t) {
        t = { talentId: p.talentId, name: p.name, primaryRole: "co_host", byBrand: [], hostHours: 0, coHostHours: 0, hostPay: 0, coHostPay: 0, total: 0, sessions: 0, missingRate: false };
        byTalent.set(p.talentId, t);
      }
      let b = t.byBrand.find((x) => x.brandId === r.session.brandId && x.platform === platform);
      if (!b) {
        b = { brandId: r.session.brandId, brandName: r.session.brandName, platform, hostHours: 0, coHostHours: 0, hostPay: 0, coHostPay: 0, sessions: 0 };
        t.byBrand.push(b);
      }
      if (p.role === "host") {
        t.hostHours += p.hours;
        t.hostPay += p.payout;
        b.hostHours += p.hours;
        b.hostPay += p.payout;
        t.primaryRole = "host";
      } else {
        t.coHostHours += p.hours;
        t.coHostPay += p.payout;
        b.coHostHours += p.hours;
        b.coHostPay += p.payout;
      }
      t.total += p.payout;
      if (!seen.has(p.talentId)) {
        seen.add(p.talentId);
        t.sessions += 1;
        b.sessions += 1;
      }
      if (p.missingRate) t.missingRate = true;
    }
  }
  const checks = new Map<string, HourCheckRow>();
  for (const r of rows) {
    const platform = platformOf(r.session);
    const k = `${r.session.brandId}|${platform}`;
    let c = checks.get(k);
    if (!c) {
      c = { brandId: r.session.brandId, brandName: r.session.brandName, platform, sessions: 0, brandHours: 0, hostHours: 0, coHostHours: 0, hostGap: 0, coHostGap: 0, sessionsNoHost: 0, sessionsNoAssistant: 0 };
      checks.set(k, c);
    }
    c.sessions += 1;
    c.brandHours += r.billableHours;
    const h = r.payouts.filter((p) => p.role === "host").reduce((a, p) => a + p.hours, 0);
    const a = r.payouts.filter((p) => p.role === "co_host").reduce((x, p) => x + p.hours, 0);
    c.hostHours += h;
    c.coHostHours += a;
    if (h <= 0) c.sessionsNoHost += 1;
    if (a <= 0) c.sessionsNoAssistant += 1;
  }
  const hourCheck = [...checks.values()].sort((a, b) => a.brandName.localeCompare(b.brandName) || a.platform.localeCompare(b.platform));
  for (const c of hourCheck) {
    c.hostGap = c.brandHours - c.hostHours;
    c.coHostGap = c.brandHours - c.coHostHours;
  }
  const people = [...byTalent.values()];
  for (const t of people) t.byBrand.sort((a, b) => a.brandName.localeCompare(b.brandName) || a.platform.localeCompare(b.platform));
  const order = (a: TalentPayRow, b: TalentPayRow) => Number(b.missingRate) - Number(a.missingRate) || b.total - a.total;
  const hosts = people.filter((t) => t.primaryRole === "host").sort(order);
  const assistants = people.filter((t) => t.primaryRole === "co_host").sort(order);

  const byKind = new Map<PnlMissingInput, number>();
  let missingSessions = 0;
  for (const r of rows) {
    if (r.missingInputs.length === 0) continue;
    missingSessions += 1;
    for (const m of r.missingInputs) byKind.set(m, (byKind.get(m) ?? 0) + 1);
  }

  const summary: MonthCloseSummary = contracts.reduce(
    (acc, c) => ({
      revenue: acc.revenue + c.revenue,
      talentPay: acc.talentPay + c.hostPay + c.coHostPay,
      sessionCosts: acc.sessionCosts + c.studioCost + c.adsCost,
      grossProfit: acc.grossProfit + c.grossProfit,
      counted: acc.counted + c.counted,
      total: acc.total + c.total
    }),
    { revenue: 0, talentPay: 0, sessionCosts: 0, grossProfit: 0, counted: 0, total: 0 }
  );

  return {
    month,
    contracts,
    hosts,
    hourCheck,
    assistants,
    summary,
    missing: { sessions: missingSessions, byKind: [...byKind.entries()] },
    unconfirmed: input.sessions.filter((s) => inMonth(s) && !s.isBackfill && isUnconfirmedPast(s)).sort((a, b) => (a.date < b.date ? -1 : 1)),
    backfillCount: input.sessions.filter((s) => isPnlSession(s, { includeBackfill: true }) && s.isBackfill && inMonth(s)).length,
    estimateNotes
  };
}
