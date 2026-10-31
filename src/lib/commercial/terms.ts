import type { BrandPlatformRate } from "../../types";
import { fmtVndShort } from "../format";

// ĐIỀU KHOẢN HỢP TÁC YFB × Brand (0191, 31/10) — một "gói" ghép từ các mảnh, thay cho công tắc billingModel hai giá trị.
// Ghép: (1) YFB làm dịch vụ nào, (2) tính phí bằng những khoản nào, (3) cam kết hụt/vượt thì sao. Chọn gói mẫu rồi chỉnh.
// Mô hình là DỮ LIỆU thuần (JSON ở brand_service_terms.terms) — thêm kiểu phí mới = thêm một biến thể ở đây + một nhánh ở
// fees.ts, không đổi bảng. Chỗ tính tiền là fees.ts; file này chỉ khai báo, chuẩn hoá JSON từ DB, chọn điều khoản theo ngày.

export type Platform = "TikTok" | "Shopee";

/** Việc YFB làm cho brand. "live" = YFB vận hành trọn ca; "host_supply" = chỉ cấp host cho brand tự vận hành. */
export type ServiceKey = "live" | "host_supply" | "studio_rental" | "training" | "ads" | "affiliate";

export const SERVICE_LABEL: Record<ServiceKey, string> = {
  live: "Vận hành livestream trọn ca",
  host_supply: "Chỉ cấp host (brand tự vận hành)",
  studio_rental: "Cho thuê phòng live / studio",
  training: "Đào tạo, tư vấn",
  ads: "Chạy Ads toàn shop",
  affiliate: "Book creator affiliate"
};

/** Giá theo giờ đổi theo điều kiện (khung giờ, cuối tuần, ngày sale). Luật khớp đầu tiên trong danh sách thắng. */
export interface RateRule {
  id: string;
  label: string;
  weekdays: "all" | "weekday" | "weekend";
  /** Ngày cụ thể (YYYY-MM-DD), vd 11.11. Có ngày ⇒ chỉ ngày đó, bỏ qua `weekdays`. */
  dates: string[];
  /** Khung giờ HH:MM–HH:MM, qua đêm được (22:00–02:00). Rỗng cả hai = cả ngày. */
  from: string;
  to: string;
  /** rate = đơn giá thay thế · multiplier = nhân đơn giá gốc · add = cộng thêm vào đơn giá gốc. */
  mode: "rate" | "multiplier" | "add";
  value: number;
}

export type FeeComponent =
  | { id: string; kind: "per_hour"; label?: string; rate: number; coHostExtra: number; rules: RateRule[] }
  | { id: string; kind: "pct_nmv"; label?: string; pct: number; basis: "nmv" | "gmv" }
  | { id: string; kind: "fixed_monthly"; label?: string; amount: number; includedHours: number; overageRate: number }
  | { id: string; kind: "ads_mgmt"; label?: string; pct: number; minFee: number }
  | { id: string; kind: "affiliate_booking"; label?: string; perCreator: number; pctOfAffiliateGmv: number };

export type FeeKind = FeeComponent["kind"];

export const FEE_LABEL: Record<FeeKind, string> = {
  per_hour: "Phí theo giờ live",
  pct_nmv: "% doanh số",
  fixed_monthly: "Phí cố định hằng tháng",
  ads_mgmt: "Phí quản lý Ads",
  affiliate_booking: "Phí booking creator"
};

/** Giờ cam kết thiếu thì xử lý ra sao. */
export type Shortfall =
  | { mode: "none" }
  | { mode: "makeup"; months: number }
  | { mode: "prorate" }
  | { mode: "credit"; perHour: number };

/** Thưởng khi GMV vượt: bậc luỹ tiến, mỗi bậc là % trên PHẦN GMV nằm trong bậc đó. */
export interface GmvBonus {
  basis: "gmv" | "nmv";
  tiers: { fromPctOfCommit: number; fromAmount: number; pct: number }[];
  cap: number;
}

/** GMV dưới ngưỡng cam kết thì giảm phí. */
export interface GmvPenalty {
  belowPctOfCommit: number;
  discountPct: number;
}

export interface CommercialTerms {
  v: 1;
  services: ServiceKey[];
  /** Brand cũng tự live trên cùng tài khoản shop (VERA, JOCKEY) — Report rút gọn trang Toàn shop. */
  inhouseLive: boolean;
  /** Ai trả ngân sách Ads — chỉ để ghi rõ trên bảng tính phí. */
  adsBudgetBy: "brand" | "yfb";
  fees: FeeComponent[];
  shortfall: Shortfall;
  gmvBonus: GmvBonus | null;
  gmvPenalty: GmvPenalty | null;
}

export type PeriodKind = "standard" | "trial" | "campaign";

export const PERIOD_LABEL: Record<PeriodKind, string> = {
  standard: "Điều khoản chính",
  trial: "Gói thử",
  campaign: "Chiến dịch"
};

/** Một giai đoạn điều khoản của brand × sàn. Chiến dịch/gói thử nằm đè lên điều khoản chính trong khoảng ngày của nó. */
export interface TermsPeriod {
  id: string;
  brandId: string;
  platform: Platform;
  kind: PeriodKind;
  label: string;
  startDate: string; // YYYY-MM-DD
  endDate?: string;
  terms: CommercialTerms;
  note?: string;
}

let idSeq = 0;
export function newId(prefix = "t"): string {
  idSeq += 1;
  const rnd = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}-${rnd}${idSeq}`;
}

export function emptyTerms(): CommercialTerms {
  return { v: 1, services: ["live"], inhouseLive: false, adsBudgetBy: "brand", fees: [], shortfall: { mode: "none" }, gmvBonus: null, gmvPenalty: null };
}

export function newFee(kind: FeeKind): FeeComponent {
  const id = newId("f");
  switch (kind) {
    case "per_hour":
      return { id, kind, rate: 0, coHostExtra: 0, rules: [] };
    case "pct_nmv":
      return { id, kind, pct: 0, basis: "nmv" };
    case "fixed_monthly":
      return { id, kind, amount: 0, includedHours: 0, overageRate: 0 };
    case "ads_mgmt":
      return { id, kind, pct: 0, minFee: 0 };
    case "affiliate_booking":
      return { id, kind, perCreator: 0, pctOfAffiliateGmv: 0 };
  }
}

export function newRateRule(): RateRule {
  return { id: newId("r"), label: "", weekdays: "all", dates: [], from: "", to: "", mode: "multiplier", value: 1.2 };
}

// ---- Gói mẫu: bấm một cái ra bộ khoản phí thường gặp, rồi chỉnh số. Thêm mẫu mới chỉ cần thêm một dòng. ----
export interface TermsTemplate {
  key: string;
  label: string;
  hint: string;
  build: () => CommercialTerms;
}

const base = (over: Partial<CommercialTerms>): CommercialTerms => ({ ...emptyTerms(), ...over });

export const TERMS_TEMPLATES: TermsTemplate[] = [
  { key: "hourly", label: "Theo giờ live", hint: "Thu đơn giá × giờ ca theo lịch", build: () => base({ fees: [newFee("per_hour")] }) },
  { key: "pct", label: "Theo % doanh số", hint: "Thu % NMV (hoặc GMV) của ca", build: () => base({ fees: [newFee("pct_nmv")] }) },
  {
    key: "retainer_pct",
    label: "Phí cố định + % doanh số",
    hint: "Retainer hằng tháng, cộng thêm % NMV",
    build: () => base({ fees: [newFee("fixed_monthly"), newFee("pct_nmv")] })
  },
  {
    key: "hourly_bonus",
    label: "Theo giờ + thưởng GMV",
    hint: "Giờ live, vượt GMV cam kết thì thưởng % phần vượt",
    build: () =>
      base({
        fees: [newFee("per_hour")],
        gmvBonus: { basis: "gmv", cap: 0, tiers: [{ fromPctOfCommit: 100, fromAmount: 0, pct: 3 }] }
      })
  },
  {
    key: "full_service",
    label: "Trọn gói (Live + Ads + Affiliate)",
    hint: "Giờ live, phí quản lý Ads, phí booking creator",
    build: () => base({ services: ["live", "ads", "affiliate"], fees: [newFee("per_hour"), newFee("ads_mgmt"), newFee("affiliate_booking")] })
  },
  {
    key: "ads_only",
    label: "Chỉ chạy Ads",
    hint: "Không có ca live; thu % ngân sách Ads",
    build: () => base({ services: ["ads"], fees: [newFee("ads_mgmt")] })
  },
  {
    key: "affiliate_only",
    label: "Chỉ book creator affiliate",
    hint: "Không có ca live; thu theo creator / % GMV affiliate",
    build: () => base({ services: ["affiliate"], fees: [newFee("affiliate_booking")] })
  },
  {
    key: "host_supply",
    label: "Cấp host (brand tự vận hành)",
    hint: "YFB đưa host theo giờ, brand lo phần còn lại",
    build: () => base({ services: ["host_supply"], inhouseLive: true, fees: [newFee("per_hour")] })
  },
  {
    key: "studio_rental",
    label: "Thuê phòng live",
    hint: "Thu theo giờ dùng phòng",
    build: () => base({ services: ["studio_rental"], fees: [newFee("per_hour")] })
  },
  {
    key: "training",
    label: "Đào tạo / tư vấn",
    hint: "Phí cố định hằng tháng, không gắn ca",
    build: () => base({ services: ["training"], fees: [newFee("fixed_monthly")] })
  }
];

/** Điều khoản tương đương cấu hình cũ (billingModel + đơn giá/% ở brand_platform_rates) — để tạo gói đầu tiên không phải gõ lại. */
export function termsFromLegacy(billingModel: "gmv_commission" | "hourly", rate: BrandPlatformRate | undefined): CommercialTerms {
  const t = emptyTerms();
  if (billingModel === "hourly") {
    t.fees = [{ ...(newFee("per_hour") as Extract<FeeComponent, { kind: "per_hour" }>), rate: rate?.ratePerHour ?? 0 }];
  } else {
    t.fees = [{ ...(newFee("pct_nmv") as Extract<FeeComponent, { kind: "pct_nmv" }>), pct: rate?.commissionRate ?? 0 }];
  }
  const services: ServiceKey[] = ["live"];
  if (rate?.scopeAds ?? true) services.push("ads");
  if (rate?.scopeAffiliate ?? true) services.push("affiliate");
  t.services = services;
  t.inhouseLive = rate?.hasInhouseLive ?? false;
  return t;
}

// ---- Chuẩn hoá JSON từ DB: thiếu/sai kiểu ⇒ mặc định, không bao giờ ném lỗi làm vỡ màn ----
const num = (v: unknown, d = 0, min = 0): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, v) : d);
const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : d);
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const SERVICES = Object.keys(SERVICE_LABEL) as ServiceKey[];

function normalizeRule(raw: unknown): RateRule | null {
  if (!isObj(raw)) return null;
  const weekdays = raw.weekdays === "weekday" || raw.weekdays === "weekend" ? raw.weekdays : "all";
  const mode = raw.mode === "rate" || raw.mode === "add" ? raw.mode : "multiplier";
  return {
    id: str(raw.id) || newId("r"),
    label: str(raw.label),
    weekdays,
    dates: Array.isArray(raw.dates) ? raw.dates.filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) : [],
    from: /^\d{2}:\d{2}$/.test(str(raw.from)) ? str(raw.from) : "",
    to: /^\d{2}:\d{2}$/.test(str(raw.to)) ? str(raw.to) : "",
    mode,
    value: num(raw.value, mode === "multiplier" ? 1 : 0)
  };
}

function normalizeFee(raw: unknown): FeeComponent | null {
  if (!isObj(raw)) return null;
  const id = str(raw.id) || newId("f");
  const label = str(raw.label) || undefined;
  switch (raw.kind) {
    case "per_hour":
      return {
        id, kind: "per_hour", label, rate: num(raw.rate), coHostExtra: num(raw.coHostExtra),
        rules: (Array.isArray(raw.rules) ? raw.rules : []).map(normalizeRule).filter((r): r is RateRule => !!r)
      };
    case "pct_nmv":
      return { id, kind: "pct_nmv", label, pct: Math.min(100, num(raw.pct)), basis: raw.basis === "gmv" ? "gmv" : "nmv" };
    case "fixed_monthly":
      return { id, kind: "fixed_monthly", label, amount: num(raw.amount), includedHours: num(raw.includedHours), overageRate: num(raw.overageRate) };
    case "ads_mgmt":
      return { id, kind: "ads_mgmt", label, pct: Math.min(100, num(raw.pct)), minFee: num(raw.minFee) };
    case "affiliate_booking":
      return { id, kind: "affiliate_booking", label, perCreator: num(raw.perCreator), pctOfAffiliateGmv: Math.min(100, num(raw.pctOfAffiliateGmv)) };
    default:
      return null;
  }
}

export function normalizeTerms(raw: unknown): CommercialTerms {
  const t = emptyTerms();
  if (!isObj(raw)) return t;
  const services = Array.isArray(raw.services) ? raw.services.filter((s): s is ServiceKey => SERVICES.includes(s as ServiceKey)) : t.services;
  t.services = [...new Set(services)];
  t.inhouseLive = raw.inhouseLive === true;
  t.adsBudgetBy = raw.adsBudgetBy === "yfb" ? "yfb" : "brand";
  t.fees = (Array.isArray(raw.fees) ? raw.fees : []).map(normalizeFee).filter((f): f is FeeComponent => !!f);
  const sf = isObj(raw.shortfall) ? raw.shortfall : {};
  t.shortfall =
    sf.mode === "makeup" ? { mode: "makeup", months: Math.max(1, Math.round(num(sf.months, 1))) }
    : sf.mode === "prorate" ? { mode: "prorate" }
    : sf.mode === "credit" ? { mode: "credit", perHour: num(sf.perHour) }
    : { mode: "none" };
  if (isObj(raw.gmvBonus)) {
    const tiers = (Array.isArray(raw.gmvBonus.tiers) ? raw.gmvBonus.tiers : [])
      .filter(isObj)
      .map((x) => ({ fromPctOfCommit: num(x.fromPctOfCommit), fromAmount: num(x.fromAmount), pct: Math.min(100, num(x.pct)) }));
    if (tiers.length > 0) t.gmvBonus = { basis: raw.gmvBonus.basis === "nmv" ? "nmv" : "gmv", tiers, cap: num(raw.gmvBonus.cap) };
  }
  if (isObj(raw.gmvPenalty)) {
    t.gmvPenalty = { belowPctOfCommit: Math.min(100, num(raw.gmvPenalty.belowPctOfCommit, 80)), discountPct: Math.min(100, num(raw.gmvPenalty.discountPct)) };
  }
  return t;
}

// ---- Chọn điều khoản theo NGÀY ----
const covers = (p: TermsPeriod, date: string) => p.startDate <= date && (!p.endDate || p.endDate >= date);

/**
 * Điều khoản hiệu lực của brand × sàn tại `date`: giai đoạn chiến dịch/gói thử đang phủ ngày đó (cái bắt đầu muộn nhất
 * thắng), không có thì điều khoản chính bắt đầu muộn nhất trước ngày đó. Chưa khai gì ⇒ undefined (nơi gọi dùng cấu hình
 * cũ billingModel + đơn giá — ca trước ngày bắt đầu điều khoản đầu tiên cũng vậy, lịch sử không bị tính lại).
 */
export function resolveTerms(periods: TermsPeriod[], brandId: string, platform: Platform, date: string): TermsPeriod | undefined {
  const mine = periods.filter((p) => p.brandId === brandId && p.platform === platform && covers(p, date));
  const overlay = mine.filter((p) => p.kind !== "standard").sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
  if (overlay) return overlay;
  return mine.filter((p) => p.kind === "standard").sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

/** Điều khoản chính đang chạy hôm nay (để hiện ở CRM / nhãn giá). */
export function currentStandard(periods: TermsPeriod[], brandId: string, platform: Platform, today: string): TermsPeriod | undefined {
  return periods
    .filter((p) => p.brandId === brandId && p.platform === platform && p.kind === "standard" && p.startDate <= today && (!p.endDate || p.endDate >= today))
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
}

export const feeOf = <K extends FeeKind>(t: CommercialTerms, kind: K): Extract<FeeComponent, { kind: K }> | undefined =>
  t.fees.find((f): f is Extract<FeeComponent, { kind: K }> => f.kind === kind);

/** Có khoản phí gắn với ca live (tính từng ca) hay không — quyết định P&L tính tiền theo ca. */
export const hasSessionFee = (t: CommercialTerms) => t.fees.some((f) => f.kind === "per_hour" || f.kind === "pct_nmv");

// ---- Kiểm tra: chỉ ra chỗ khai thiếu / mâu thuẫn, bằng lời ----
export interface TermsIssue {
  level: "error" | "warn";
  text: string;
}

export function validateTerms(t: CommercialTerms): TermsIssue[] {
  const out: TermsIssue[] = [];
  if (t.services.length === 0) out.push({ level: "error", text: "Chưa chọn dịch vụ nào YFB làm cho brand này." });
  if (t.fees.length === 0) out.push({ level: "error", text: "Chưa có khoản phí nào — app không tính được doanh thu." });
  for (const f of t.fees) {
    if (f.kind === "per_hour" && f.rate <= 0) out.push({ level: "error", text: "Phí theo giờ chưa có đơn giá." });
    if (f.kind === "fixed_monthly" && f.amount <= 0) out.push({ level: "error", text: "Phí cố định chưa có số tiền." });
    if (f.kind === "fixed_monthly" && f.overageRate > 0 && f.includedHours <= 0) out.push({ level: "warn", text: "Đã khai giá giờ vượt nhưng chưa khai số giờ đã gồm trong phí cố định." });
    if (f.kind === "ads_mgmt" && f.pct <= 0 && f.minFee <= 0) out.push({ level: "error", text: "Phí quản lý Ads chưa có % hoặc mức tối thiểu." });
    if (f.kind === "affiliate_booking" && f.perCreator <= 0 && f.pctOfAffiliateGmv <= 0) out.push({ level: "error", text: "Phí booking creator chưa có số." });
    if (f.kind === "per_hour") {
      for (const r of f.rules) {
        if (r.mode !== "multiplier" && r.value <= 0 && r.mode === "rate") out.push({ level: "warn", text: `Luật giá “${r.label || "chưa đặt tên"}” có đơn giá 0.` });
        if ((r.from && !r.to) || (!r.from && r.to)) out.push({ level: "error", text: `Luật giá “${r.label || "chưa đặt tên"}”: khung giờ cần cả giờ bắt đầu và kết thúc.` });
      }
    }
  }
  const needsSessions = t.services.some((s) => s === "live" || s === "host_supply" || s === "studio_rental");
  if (needsSessions && !hasSessionFee(t) && !t.fees.some((f) => f.kind === "fixed_monthly")) {
    out.push({ level: "warn", text: "Có ca live nhưng chưa có phí theo giờ, % doanh số hoặc phí cố định — ca sẽ không ra doanh thu." });
  }
  if (t.services.includes("ads") && !t.fees.some((f) => f.kind === "ads_mgmt")) out.push({ level: "warn", text: "YFB chạy Ads nhưng không thu phí quản lý Ads (chỉ đúng nếu đã gồm trong phí khác)." });
  if (t.services.includes("affiliate") && !t.fees.some((f) => f.kind === "affiliate_booking")) out.push({ level: "warn", text: "YFB book creator nhưng không thu phí booking (chỉ đúng nếu đã gồm trong phí khác)." });
  if (t.fees.some((f) => f.kind === "ads_mgmt") && !t.services.includes("ads")) out.push({ level: "warn", text: "Có phí quản lý Ads nhưng chưa chọn dịch vụ “Chạy Ads”." });
  if (t.fees.some((f) => f.kind === "affiliate_booking") && !t.services.includes("affiliate")) out.push({ level: "warn", text: "Có phí booking nhưng chưa chọn dịch vụ “Book creator affiliate”." });
  if (t.gmvBonus && t.gmvBonus.tiers.some((x) => x.fromAmount <= 0 && x.fromPctOfCommit <= 0)) out.push({ level: "error", text: "Bậc thưởng GMV cần một ngưỡng (số tiền hoặc % cam kết)." });
  if (t.gmvPenalty && t.gmvPenalty.discountPct <= 0) out.push({ level: "warn", text: "Giảm phí khi hụt GMV đang là 0%." });
  return out;
}

// ---- Nhãn ngắn ----
const vnd = fmtVndShort;

export function feeSummary(f: FeeComponent): string {
  switch (f.kind) {
    case "per_hour":
      return `${vnd(f.rate)}/giờ${f.rules.length ? ` (+${f.rules.length} luật giá)` : ""}${f.coHostExtra > 0 ? ` · trợ live +${vnd(f.coHostExtra)}/giờ` : ""}`;
    case "pct_nmv":
      return `${f.pct}% ${f.basis === "gmv" ? "GMV" : "NMV"}`;
    case "fixed_monthly":
      return `${vnd(f.amount)}/tháng${f.includedHours > 0 ? ` gồm ${f.includedHours}h` : ""}`;
    case "ads_mgmt":
      return `${f.pct}% ngân sách Ads${f.minFee > 0 ? ` (tối thiểu ${vnd(f.minFee)})` : ""}`;
    case "affiliate_booking":
      return [f.perCreator > 0 ? `${vnd(f.perCreator)}/creator` : "", f.pctOfAffiliateGmv > 0 ? `${f.pctOfAffiliateGmv}% GMV affiliate` : ""].filter(Boolean).join(" + ");
  }
}

/** Nhãn giá một dòng cho danh sách brand ("350K/giờ + 5% NMV"). */
export function termsLabel(t: CommercialTerms): string {
  return t.fees.length === 0 ? "chưa có phí" : t.fees.map(feeSummary).join(" + ");
}

/** Số một tháng chưa có nguồn tự động để tính phí (nhập ở CRM → Tính phí tháng). */
export interface MonthFeeInputs {
  id: string;
  brandId: string;
  platform: Platform;
  periodMonth: string; // YYYY-MM-01
  adsSpend?: number;
  creatorsBooked?: number;
  affiliateGmv?: number;
  note?: string;
}

export type TalentRuleKind = "preferred" | "blocked" | "exclusive";

export const TALENT_RULE_LABEL: Record<TalentRuleKind, string> = {
  preferred: "Ưu tiên xếp",
  blocked: "Brand không nhận",
  exclusive: "Độc quyền cho brand"
};

export interface BrandTalentRule {
  id: string;
  brandId: string;
  talentId: string;
  rule: TalentRuleKind;
  note?: string;
}

const SERVICE_ORDER: ServiceKey[] = ["live", "host_supply", "studio_rental", "training", "ads", "affiliate"];

/** Điều khoản bằng lời, từng dòng — để người ký/duyệt đọc lại đúng cái mình đã chọn. */
export function describeTerms(t: CommercialTerms): string[] {
  const out: string[] = [];
  const svc = SERVICE_ORDER.filter((s) => t.services.includes(s)).map((s) => SERVICE_LABEL[s].toLowerCase());
  out.push(svc.length ? `YFB làm: ${svc.join("; ")}${t.inhouseLive ? ". Brand cũng tự live trên cùng tài khoản" : ""}.` : "Chưa chọn dịch vụ.");
  for (const f of t.fees) out.push(`${f.label || FEE_LABEL[f.kind]}: ${feeSummary(f)}.`);
  const sf = t.shortfall;
  if (sf.mode === "makeup") out.push(`Thiếu giờ cam kết: bù trong ${sf.months} tháng tiếp theo, không đổi phí.`);
  if (sf.mode === "prorate") out.push("Thiếu giờ cam kết: giảm phí cố định theo tỷ lệ giờ thiếu.");
  if (sf.mode === "credit") out.push(`Thiếu giờ cam kết: trừ ${vnd(sf.perHour)} cho mỗi giờ thiếu.`);
  if (t.gmvBonus) out.push(`Vượt GMV: thưởng luỹ tiến ${t.gmvBonus.tiers.map((x) => `${x.pct}% từ ${x.fromAmount > 0 ? vnd(x.fromAmount) : `${x.fromPctOfCommit}% cam kết`}`).join(", ")}${t.gmvBonus.cap > 0 ? `, tối đa ${vnd(t.gmvBonus.cap)}` : ""}.`);
  if (t.gmvPenalty) out.push(`GMV dưới ${t.gmvPenalty.belowPctOfCommit}% cam kết: giảm ${t.gmvPenalty.discountPct}% phí.`);
  return out;
}
