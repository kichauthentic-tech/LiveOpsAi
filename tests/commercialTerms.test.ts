// Điều khoản hợp tác YFB × Brand (0191): gói ghép từ các khoản phí, luật giá theo giờ, hệ quả cam kết, giai đoạn đè.
import { describe, expect, test } from "vitest";
import { sessionFee, settleMonth, type SessionFeeInput } from "../src/lib/commercial/fees";
import { emptyTerms, newFee, newRateRule, normalizeTerms, resolveTerms, termsFromLegacy, termsLabel, validateTerms, TERMS_TEMPLATES, type CommercialTerms, type FeeComponent, type TermsPeriod } from "../src/lib/commercial/terms";

const perHour = (rate: number, extra: Partial<Extract<FeeComponent, { kind: "per_hour" }>> = {}) => ({ ...(newFee("per_hour") as Extract<FeeComponent, { kind: "per_hour" }>), rate, ...extra });
const pctFee = (pct: number, basis: "nmv" | "gmv" = "nmv") => ({ ...(newFee("pct_nmv") as Extract<FeeComponent, { kind: "pct_nmv" }>), pct, basis });
const fixed = (amount: number, extra: Partial<Extract<FeeComponent, { kind: "fixed_monthly" }>> = {}) => ({ ...(newFee("fixed_monthly") as Extract<FeeComponent, { kind: "fixed_monthly" }>), amount, ...extra });
const withFees = (fees: FeeComponent[], over: Partial<CommercialTerms> = {}): CommercialTerms => ({ ...emptyTerms(), fees, ...over });
// 2026-10-10 là thứ Bảy; 2026-10-12 là thứ Hai.
const ca = (over: Partial<SessionFeeInput> = {}): SessionFeeInput => ({ date: "2026-10-12", startTime: "19:00", endTime: "21:00", hasCoHost: false, gmv: 100_000_000, returnRate: 0, ...over });

describe("phí từng ca", () => {
  test("theo giờ: giờ ca × đơn giá — giống công thức cũ", () => {
    expect(sessionFee(withFees([perHour(300_000)]), ca()).total).toBe(600_000);
  });
  test("theo % NMV: trừ hoàn rồi nhân %; theo GMV thì không trừ hoàn", () => {
    expect(sessionFee(withFees([pctFee(10)]), ca({ returnRate: 20 })).total).toBe(8_000_000);
    expect(sessionFee(withFees([pctFee(10, "gmv")]), ca({ returnRate: 20 })).total).toBe(10_000_000);
  });
  test("lai: giờ + % cộng dồn", () => {
    expect(sessionFee(withFees([perHour(300_000), pctFee(5)]), ca()).total).toBe(600_000 + 5_000_000);
  });
  test("ca start = end ⇒ 0 giờ; ca qua đêm cộng 24h phần âm", () => {
    expect(sessionFee(withFees([perHour(300_000)]), ca({ startTime: "20:00", endTime: "20:00" })).total).toBe(0);
    expect(sessionFee(withFees([perHour(300_000)]), ca({ startTime: "22:00", endTime: "00:30" })).hours).toBe(2.5);
  });
  test("phụ thu trợ live chỉ khi ca có trợ", () => {
    const t = withFees([perHour(300_000, { coHostExtra: 50_000 })]);
    expect(sessionFee(t, ca()).total).toBe(600_000);
    expect(sessionFee(t, ca({ hasCoHost: true })).total).toBe(700_000);
  });
});

describe("luật giá theo giờ", () => {
  const rule = (over: Partial<ReturnType<typeof newRateRule>>) => ({ ...newRateRule(), ...over });
  test("khung giờ vàng nhân 1.5: chỉ phần giờ nằm trong khung bị nhân (ca 19–22, vàng 20–22)", () => {
    const t = withFees([perHour(300_000, { rules: [rule({ label: "Giờ vàng", from: "20:00", to: "22:00", mode: "multiplier", value: 1.5 })] })]);
    const r = sessionFee(t, ca({ startTime: "19:00", endTime: "22:00" }));
    expect(r.total).toBe(300_000 + 2 * 450_000);
    expect(r.breakdown.map((b) => b.label).sort()).toEqual(["Giá gốc", "Giờ vàng"]);
  });
  test("cuối tuần cộng thêm; ngày thường không đổi", () => {
    const t = withFees([perHour(300_000, { rules: [rule({ label: "Cuối tuần", weekdays: "weekend", mode: "add", value: 100_000 })] })]);
    expect(sessionFee(t, ca({ date: "2026-10-10" })).total).toBe(2 * 400_000);
    expect(sessionFee(t, ca({ date: "2026-10-12" })).total).toBe(2 * 300_000);
  });
  test("ngày sale đặt giá thay thế, thắng cuối tuần nếu đứng trước", () => {
    const t = withFees([perHour(300_000, { rules: [rule({ label: "11.11", dates: ["2026-11-11"], mode: "rate", value: 500_000 }), rule({ label: "Cuối tuần", weekdays: "weekend", mode: "multiplier", value: 1.2 })] })]);
    expect(sessionFee(t, ca({ date: "2026-11-11" })).total).toBe(1_000_000);
  });
  test("khung giờ qua đêm; phần sau 00:00 xét theo ngày kế tiếp (thứ Sáu 23:00–01:00, luật cuối tuần)", () => {
    const t = withFees([perHour(300_000, { rules: [rule({ label: "Cuối tuần", weekdays: "weekend", mode: "multiplier", value: 2 })] })]);
    // 2026-10-09 là thứ Sáu: 1h đầu (23–24) ngày thường, 1h sau (00–01) là thứ Bảy.
    expect(sessionFee(t, ca({ date: "2026-10-09", startTime: "23:00", endTime: "01:00" })).total).toBe(300_000 + 600_000);
    const night = withFees([perHour(300_000, { rules: [rule({ label: "Đêm", from: "22:00", to: "02:00", mode: "add", value: 100_000 })] })]);
    expect(sessionFee(night, ca({ startTime: "21:00", endTime: "01:00" })).total).toBe(300_000 + 3 * 400_000);
  });
});

describe("tính tháng", () => {
  const sessions = [ca(), ca({ date: "2026-10-13" })]; // 4 giờ, 200tr GMV
  test("chỉ phí theo giờ: tổng = tổng các ca, không khoản phụ", () => {
    const s = settleMonth(withFees([perHour(300_000)]), { sessions });
    expect(s.total).toBe(1_200_000);
    expect(s.monthAdjustments).toBe(0);
  });
  test("phí cố định + %: retainer cộng vào, vượt giờ gói tính theo giá giờ vượt", () => {
    const t = withFees([fixed(20_000_000, { includedHours: 3, overageRate: 400_000 }), pctFee(5)]);
    const s = settleMonth(t, { sessions });
    expect(s.sessionFees).toBe(10_000_000); // 5% × 200tr
    expect(s.total).toBe(10_000_000 + 20_000_000 + 400_000); // 1 giờ vượt
    expect(s.monthAdjustments).toBe(20_400_000);
  });
  test("hụt giờ — bù giờ: không đổi tiền, ghi giờ nợ", () => {
    const t = withFees([perHour(300_000)], { shortfall: { mode: "makeup", months: 2 } });
    const s = settleMonth(t, { sessions, committedHours: 10 });
    expect(s.owedHours).toBe(6);
    expect(s.total).toBe(1_200_000);
  });
  test("hụt giờ — giảm phí cố định theo tỷ lệ", () => {
    const t = withFees([fixed(10_000_000)], { shortfall: { mode: "prorate" } });
    const s = settleMonth(t, { sessions, committedHours: 8 }); // làm 4/8 giờ
    expect(s.total).toBe(5_000_000);
  });
  test("hụt giờ — trừ tiền mỗi giờ thiếu", () => {
    const t = withFees([perHour(300_000)], { shortfall: { mode: "credit", perHour: 100_000 } });
    expect(settleMonth(t, { sessions, committedHours: 6 }).total).toBe(1_200_000 - 200_000);
  });
  test("không cam kết giờ ⇒ không có hệ quả hụt", () => {
    const t = withFees([perHour(300_000)], { shortfall: { mode: "credit", perHour: 100_000 } });
    expect(settleMonth(t, { sessions }).total).toBe(1_200_000);
  });
  test("thưởng GMV luỹ tiến theo % cam kết; có trần", () => {
    const t = withFees([perHour(300_000)], { gmvBonus: { basis: "gmv", cap: 0, tiers: [{ fromPctOfCommit: 100, fromAmount: 0, pct: 2 }, { fromPctOfCommit: 150, fromAmount: 0, pct: 4 }] } });
    // cam kết 100tr, GMV 200tr: bậc 1 = (150-100)tr×2% = 1tr; bậc 2 = (200-150)tr×4% = 2tr
    expect(settleMonth(t, { sessions, committedGmv: 100_000_000 }).total).toBe(1_200_000 + 3_000_000);
    const capped = { ...t, gmvBonus: { ...t.gmvBonus!, cap: 1_500_000 } };
    expect(settleMonth(capped, { sessions, committedGmv: 100_000_000 }).total).toBe(1_200_000 + 1_500_000);
  });
  test("thưởng cần GMV cam kết: thiếu thì báo thiếu, không tự đoán", () => {
    const t = withFees([perHour(300_000)], { gmvBonus: { basis: "gmv", cap: 0, tiers: [{ fromPctOfCommit: 100, fromAmount: 0, pct: 2 }] } });
    const s = settleMonth(t, { sessions });
    expect(s.total).toBe(1_200_000);
    expect(s.missing.join(" ")).toMatch(/GMV cam kết/);
  });
  test("GMV dưới ngưỡng cam kết ⇒ giảm % trên phí", () => {
    const t = withFees([perHour(300_000)], { gmvPenalty: { belowPctOfCommit: 80, discountPct: 10 } });
    expect(settleMonth(t, { sessions, committedGmv: 400_000_000 }).total).toBe(1_080_000); // 200tr < 80%×400tr
    expect(settleMonth(t, { sessions, committedGmv: 200_000_000 }).total).toBe(1_200_000); // đạt
  });
  test("phí quản lý Ads: % chi tiêu, có mức tối thiểu; chưa nhập chi tiêu thì báo thiếu", () => {
    const t = withFees([{ ...(newFee("ads_mgmt") as Extract<FeeComponent, { kind: "ads_mgmt" }>), pct: 10, minFee: 3_000_000 }], { services: ["ads"] });
    expect(settleMonth(t, { sessions: [], adsSpend: 100_000_000 }).total).toBe(10_000_000);
    expect(settleMonth(t, { sessions: [], adsSpend: 10_000_000 }).total).toBe(3_000_000);
    const none = settleMonth(t, { sessions: [] });
    expect(none.missing).toContain("Chi tiêu Ads tháng này");
  });
  test("phí booking creator: theo đầu creator + % GMV affiliate", () => {
    const t = withFees([{ ...(newFee("affiliate_booking") as Extract<FeeComponent, { kind: "affiliate_booking" }>), perCreator: 500_000, pctOfAffiliateGmv: 3 }], { services: ["affiliate"] });
    expect(settleMonth(t, { sessions: [], creatorsBooked: 20, affiliateGmv: 100_000_000 }).total).toBe(10_000_000 + 3_000_000);
  });
  test("returnRateOverride thay % hoàn từng ca (hoàn thật từ file)", () => {
    const s = settleMonth(withFees([pctFee(10)]), { sessions: [ca({ returnRate: 0 })], returnRateOverride: 50 });
    expect(s.total).toBe(5_000_000);
  });
});

describe("chọn điều khoản theo ngày", () => {
  const period = (over: Partial<TermsPeriod>): TermsPeriod => ({ id: "p", brandId: "b", platform: "TikTok", kind: "standard", label: "", startDate: "2026-01-01", terms: emptyTerms(), ...over });
  test("chiến dịch đè điều khoản chính trong khoảng ngày; hết thì trả lại", () => {
    const std = period({ id: "std" });
    const camp = period({ id: "camp", kind: "campaign", startDate: "2026-11-09", endDate: "2026-11-12" });
    expect(resolveTerms([std, camp], "b", "TikTok", "2026-11-11")?.id).toBe("camp");
    expect(resolveTerms([std, camp], "b", "TikTok", "2026-11-13")?.id).toBe("std");
  });
  test("điều khoản chính mới hơn thay cũ từ ngày bắt đầu của nó; ca trước đó vẫn theo bản cũ", () => {
    const a = period({ id: "a", startDate: "2026-01-01", endDate: "2026-09-30" });
    const b = period({ id: "b2", startDate: "2026-10-01" });
    expect(resolveTerms([a, b], "b", "TikTok", "2026-09-15")?.id).toBe("a");
    expect(resolveTerms([a, b], "b", "TikTok", "2026-10-15")?.id).toBe("b2");
  });
  test("ca trước điều khoản đầu tiên, hoặc sàn khác ⇒ không có (dùng cấu hình cũ)", () => {
    const std = period({ startDate: "2026-10-01" });
    expect(resolveTerms([std], "b", "TikTok", "2026-09-30")).toBeUndefined();
    expect(resolveTerms([std], "b", "Shopee", "2026-10-15")).toBeUndefined();
  });
});

describe("chuẩn hoá và kiểm tra", () => {
  test("JSON hỏng/thiếu ⇒ điều khoản rỗng hợp lệ, không ném lỗi", () => {
    expect(normalizeTerms(null).fees).toEqual([]);
    expect(normalizeTerms({ fees: [{ kind: "lạ" }, { kind: "pct_nmv", pct: 500 }], services: ["live", "x"] }).fees).toHaveLength(1);
    expect(normalizeTerms({ fees: [{ kind: "pct_nmv", pct: 500 }] }).fees[0]).toMatchObject({ pct: 100 });
    expect(normalizeTerms({ services: ["live", "x"] }).services).toEqual(["live"]);
  });
  test("khứ hồi qua JSON giữ nguyên", () => {
    const t = withFees([perHour(300_000, { rules: [newRateRule()] }), pctFee(5)], { shortfall: { mode: "credit", perHour: 1 }, gmvPenalty: { belowPctOfCommit: 80, discountPct: 5 } });
    expect(normalizeTerms(JSON.parse(JSON.stringify(t)))).toEqual(t);
  });
  test("mọi gói mẫu dựng được và chỉ còn lỗi 'chưa nhập số'", () => {
    for (const tpl of TERMS_TEMPLATES) {
      const issues = validateTerms(tpl.build());
      expect(issues.every((i) => /chưa có (đơn giá|số tiền|% hoặc|số)/i.test(i.text) || i.level === "warn"), tpl.key).toBe(true);
    }
  });
  test("cảnh báo mâu thuẫn: phí Ads mà chưa chọn dịch vụ Ads; chưa có khoản phí", () => {
    expect(validateTerms(emptyTerms()).some((i) => i.level === "error" && /khoản phí/.test(i.text))).toBe(true);
    const t = withFees([{ ...(newFee("ads_mgmt") as Extract<FeeComponent, { kind: "ads_mgmt" }>), pct: 10 }]);
    expect(validateTerms(t).some((i) => /dịch vụ “Chạy Ads”/.test(i.text))).toBe(true);
  });
  test("từ cấu hình cũ: theo giờ → per_hour; theo % → pct_nmv; phạm vi cũ thành dịch vụ", () => {
    const rate = { id: "r", brandId: "b", platform: "TikTok" as const, ratePerHour: 350_000, returnRate: 0, commissionRate: 12, scopeAds: false, scopeAffiliate: false, hasInhouseLive: true };
    const h = termsFromLegacy("hourly", rate);
    expect(termsLabel(h)).toBe("350K/giờ");
    expect(h.services).toEqual(["live"]);
    expect(h.inhouseLive).toBe(true);
    expect(termsLabel(termsFromLegacy("gmv_commission", rate))).toBe("12% NMV");
  });
});

// ---- Nối vào P&L từng ca và Kế Toán ----
import { vi } from "vitest";
vi.mock("../src/lib/supabaseClient", () => ({ supabase: {} }));
import { computeSessionPnl } from "../src/lib/pnl";
import { buildMonthClose, type MonthCloseInput } from "../src/lib/accounting/monthClose";
import { brandPriceLabel, brandPriceSet } from "../src/lib/brandPricing";
import { reportScopeOf } from "../src/lib/report/reportScope";
import type { Brand, LiveSession, Talent } from "../src/types";

const brandOf = (billingModel: Brand["billingModel"]) => ({ id: "b", name: "B", billingModel }) as Brand;
const live = (over: Partial<LiveSession> = {}): LiveSession =>
  ({ id: "s1", brandId: "b", brandName: "B", platform: "TikTok", date: "2026-10-12", startTime: "19:00", endTime: "21:00", status: "Completed", dataSource: "live_snapshot", actualGmv: 100_000_000, hostId: "h1", isBackfill: false, ...over }) as LiveSession;
const stdPeriod = (terms: CommercialTerms, over: Partial<TermsPeriod> = {}): TermsPeriod => ({ id: "std", brandId: "b", platform: "TikTok", kind: "standard", label: "Hợp đồng 2026", startDate: "2026-10-01", terms, ...over });

describe("P&L từng ca theo điều khoản", () => {
  test("không có điều khoản ⇒ đường cũ y nguyên (theo giờ: giờ × đơn giá)", () => {
    const rate = { id: "r", brandId: "b", platform: "TikTok" as const, ratePerHour: 400_000, returnRate: 0 };
    const p = computeSessionPnl(live(), {}, {}, { b: brandOf("hourly") }, [rate], [], []);
    expect(p.grossAgencyRev).toBe(800_000);
    expect(p.termsPeriod).toBeUndefined();
  });
  test("có điều khoản lai (giờ + %): doanh thu ca = cả hai khoản, bất kể billingModel cũ", () => {
    const t = withFees([perHour(300_000), pctFee(5, "gmv")]);
    const p = computeSessionPnl(live(), {}, {}, { b: brandOf("gmv_commission") }, [], [], [], [stdPeriod(t)]);
    expect(p.grossAgencyRev).toBe(600_000 + 5_000_000);
    expect(p.isHourly).toBe(true);
    expect(p.termsPeriod?.id).toBe("std");
    expect(p.missingInputs).not.toContain("brand_rate");
    expect(p.missingInputs).not.toContain("commission_default");
  });
  test("ca trước ngày bắt đầu điều khoản vẫn tính theo cấu hình cũ", () => {
    const t = withFees([perHour(300_000)]);
    const rate = { id: "r", brandId: "b", platform: "TikTok" as const, ratePerHour: 400_000, returnRate: 0 };
    const p = computeSessionPnl(live({ date: "2026-09-20" }), {}, {}, { b: brandOf("hourly") }, [rate], [], [], [stdPeriod(t)]);
    expect(p.grossAgencyRev).toBe(800_000);
  });
  test("chiến dịch ngày 11.11 đè giá; ca có trợ live bị phụ thu", () => {
    const std = stdPeriod(withFees([perHour(300_000)]));
    const camp = stdPeriod(withFees([perHour(500_000, { coHostExtra: 50_000 })]), { id: "camp", kind: "campaign", label: "11.11", startDate: "2026-11-11", endDate: "2026-11-11" });
    const p = computeSessionPnl(live({ date: "2026-11-11", coHostId: "h2" }), {}, {}, { b: brandOf("hourly") }, [], [], [], [std, camp]);
    expect(p.grossAgencyRev).toBe(2 * 550_000);
    expect(p.termsPeriod?.id).toBe("camp");
  });
  test("khoản theo giờ chưa có đơn giá ⇒ báo thiếu giá; % = 0 vẫn là đã đặt", () => {
    const missing = computeSessionPnl(live(), {}, {}, { b: brandOf("hourly") }, [], [], [], [stdPeriod(withFees([perHour(0)]))]);
    expect(missing.missingInputs).toContain("brand_rate");
    const zeroPct = computeSessionPnl(live(), {}, {}, { b: brandOf("hourly") }, [], [], [], [stdPeriod(withFees([pctFee(0)]))]);
    expect(zeroPct.missingInputs).not.toContain("commission_default");
  });
  test("ca loại khỏi báo cáo ⇒ doanh thu 0", () => {
    const p = computeSessionPnl(live({ excludedFromReports: true }), {}, {}, { b: brandOf("hourly") }, [], [], [], [stdPeriod(withFees([perHour(300_000)]))]);
    expect(p.grossAgencyRev).toBe(0);
  });
});

describe("Kế Toán: doanh thu hợp đồng theo điều khoản", () => {
  const talent = { id: "h1", name: "H", ratePerHour: 100_000, ratePerSession: 0, commissionRate: 0, assistantRatePerHour: 0 } as unknown as Talent;
  const closeInput = (terms: CommercialTerms, sessions: LiveSession[], over: Partial<MonthCloseInput> = {}): MonthCloseInput => ({
    month: "2026-10", today: "2026-10-31", sessions, talents: [talent], brands: [brandOf("hourly")], financeRecords: [],
    brandPlatformRates: [], talentRateHistory: [], brandPlatformRateHistory: [],
    contracts: [{ id: "C", brandId: "b", platform: "TikTok", startMonth: "2026-01-01", monthlyHours: 10, status: "active", contractCode: "C" }],
    commitments: [], shopRefunds: {}, termPeriods: [stdPeriod(terms)], monthFeeInputs: [], ...over
  });
  const two = [live({ id: "a" }), live({ id: "b2", date: "2026-10-13" })]; // 4 giờ, 200tr

  test("phí cố định + giờ: doanh thu = tổng ca + phí cố định; có bảng tính", () => {
    const m = buildMonthClose(closeInput(withFees([perHour(300_000), fixed(10_000_000)]), two));
    const c = m.contracts[0];
    expect(c.revenue).toBe(1_200_000 + 10_000_000);
    expect(c.basis).toMatchObject({ kind: "terms", state: "none" });
    expect(c.settlement?.lines.map((l) => l.key)).toContain("per_hour");
  });
  test("hụt giờ cam kết kiểu giảm phí cố định: 4/10 giờ ⇒ giữ 40% phí cố định", () => {
    const t = withFees([fixed(10_000_000)], { shortfall: { mode: "prorate" } });
    expect(buildMonthClose(closeInput(t, two)).contracts[0].revenue).toBe(4_000_000);
  });
  test("% NMV: chưa có file hoàn ⇒ ước tính theo % hoàn mặc định, có ghi chú", () => {
    const m = buildMonthClose(closeInput(withFees([pctFee(10)]), [live()]));
    expect(m.contracts[0].basis).toMatchObject({ kind: "terms", state: "estimate", returnRate: 40 });
    expect(m.contracts[0].revenue).toBe(6_000_000); // 100tr × (1-40%) × 10%
  });
  test("phí Ads cần chi tiêu tháng: chưa nhập thì ghi thiếu, nhập rồi thì tính", () => {
    const t = withFees([{ ...(newFee("ads_mgmt") as Extract<FeeComponent, { kind: "ads_mgmt" }>), pct: 10 }], { services: ["ads"] });
    const none = buildMonthClose(closeInput(t, []));
    expect(none.contracts).toHaveLength(0); // không có ca ⇒ chưa có dòng hợp đồng (phí Ads không gắn ca)
    const withCa = buildMonthClose(closeInput(t, [live()]));
    expect(withCa.estimateNotes.join(" ")).toMatch(/thiếu Chi tiêu Ads/);
    const filled = buildMonthClose(closeInput(t, [live()], { monthFeeInputs: [{ id: "i", brandId: "b", platform: "TikTok", periodMonth: "2026-10-01", adsSpend: 50_000_000 }] }));
    expect(filled.contracts[0].revenue).toBe(5_000_000);
  });
  test("tháng đổi điều khoản giữa chừng: doanh thu từng ca theo điều khoản của ca, kèm ghi chú", () => {
    const early = stdPeriod(withFees([perHour(300_000)]), { id: "old", startDate: "2026-10-01", endDate: "2026-10-12" });
    const late = stdPeriod(withFees([perHour(500_000)]), { id: "new", startDate: "2026-10-13" });
    const m = buildMonthClose(closeInput(withFees([]), [live({ id: "a" }), live({ id: "b2", date: "2026-10-13" })], { termPeriods: [early, late] }));
    expect(m.contracts[0].revenue).toBe(600_000 + 1_000_000);
    expect(m.estimateNotes.join(" ")).toMatch(/nhiều giai đoạn/);
  });
});

describe("nhãn giá, việc cần làm và phạm vi đọc điều khoản trước", () => {
  const t = withFees([perHour(350_000), pctFee(5)], { services: ["live", "ads"], inhouseLive: true });
  test("có điều khoản ⇒ nhãn giá và 'đã có giá' theo điều khoản, không theo billingModel", () => {
    expect(brandPriceLabel(brandOf("gmv_commission"), [], "TikTok", [stdPeriod(t)], "2026-10-20")).toBe("350K/giờ + 5% NMV");
    expect(brandPriceSet(brandOf("hourly"), [], "TikTok", [stdPeriod(withFees([perHour(0)]))], "2026-10-20")).toBe(false);
    expect(brandPriceSet(brandOf("hourly"), [], "TikTok", [], "2026-10-20")).toBe(false);
  });
  test("phạm vi report lấy từ dịch vụ trong điều khoản tại ngày cuối tháng; chưa có thì cột cũ", () => {
    expect(reportScopeOf([], "b", "TikTok", [stdPeriod(t)], "2026-10-31")).toEqual({ ads: true, affiliate: false, inhouseLive: true });
    expect(reportScopeOf([], "b", "TikTok", [stdPeriod(t)], "2026-09-30")).toEqual({ ads: true, affiliate: true, inhouseLive: false }); // trước ngày bắt đầu ⇒ mặc định cũ
  });
});
