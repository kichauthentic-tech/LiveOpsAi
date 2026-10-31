import { supabase } from "../supabaseClient";
import { normalizeTerms, type BrandTalentRule, type CommercialTerms, type MonthFeeInputs, type PeriodKind, type Platform, type TalentRuleKind, type TermsPeriod } from "../commercial/terms";

// Điều khoản hợp tác (0191). Bảng chưa có (migration chưa chạy) ⇒ fetch trả null để App quay về cấu hình cũ
// (billing_model + đơn giá ở brand_platform_rates) và CRM nói rõ, như cách brand_channels (0149) đã làm.

const TABLE_MISSING = new Set(["PGRST205", "42P01"]);
const missing = (e: unknown) => TABLE_MISSING.has((e as { code?: string })?.code ?? "");

interface DbTerms {
  id: string;
  brand_id: string;
  platform: Platform;
  kind: PeriodKind;
  label: string;
  start_date: string;
  end_date: string | null;
  terms: unknown;
  note: string | null;
}

const fromDb = (r: DbTerms): TermsPeriod => ({
  id: r.id,
  brandId: r.brand_id,
  platform: r.platform,
  kind: r.kind,
  label: r.label,
  startDate: r.start_date,
  endDate: r.end_date ?? undefined,
  terms: normalizeTerms(r.terms),
  note: r.note ?? undefined
});

export async function fetchTermsPeriods(): Promise<TermsPeriod[] | null> {
  const { data, error } = await supabase.from("brand_service_terms").select("*").order("start_date", { ascending: false });
  if (error) {
    if (missing(error)) return null;
    throw error;
  }
  return ((data as DbTerms[]) ?? []).map(fromDb);
}

export interface TermsPeriodInput {
  brandId: string;
  platform: Platform;
  kind: PeriodKind;
  label: string;
  startDate: string;
  endDate?: string;
  terms: CommercialTerms;
  note?: string;
}

const toRow = (p: TermsPeriodInput) => ({
  brand_id: p.brandId,
  platform: p.platform,
  kind: p.kind,
  label: p.label.trim(),
  start_date: p.startDate,
  end_date: p.endDate || null,
  terms: p.terms,
  note: p.note?.trim() ?? ""
});

export async function createTermsPeriod(p: TermsPeriodInput): Promise<TermsPeriod> {
  const { data, error } = await supabase.from("brand_service_terms").insert(toRow(p)).select().single();
  if (error) throw error;
  return fromDb(data as DbTerms);
}

export async function updateTermsPeriod(id: string, p: TermsPeriodInput): Promise<TermsPeriod> {
  const { data, error } = await supabase.from("brand_service_terms").update(toRow(p)).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbTerms);
}

export async function deleteTermsPeriod(id: string): Promise<void> {
  const { error } = await supabase.from("brand_service_terms").delete().eq("id", id);
  if (error) throw error;
}

// ---- số nhập tháng ----
interface DbMonthInputs {
  id: string;
  brand_id: string;
  platform: Platform;
  period_month: string;
  ads_spend: number | null;
  creators_booked: number | null;
  affiliate_gmv: number | null;
  note: string | null;
}

const inputsFromDb = (r: DbMonthInputs): MonthFeeInputs => ({
  id: r.id,
  brandId: r.brand_id,
  platform: r.platform,
  periodMonth: r.period_month,
  adsSpend: r.ads_spend ?? undefined,
  creatorsBooked: r.creators_booked ?? undefined,
  affiliateGmv: r.affiliate_gmv ?? undefined,
  note: r.note ?? undefined
});

export async function fetchMonthFeeInputs(): Promise<MonthFeeInputs[] | null> {
  const { data, error } = await supabase.from("brand_month_fee_inputs").select("*");
  if (error) {
    if (missing(error)) return null;
    throw error;
  }
  return ((data as DbMonthInputs[]) ?? []).map(inputsFromDb);
}

export async function upsertMonthFeeInputs(
  brandId: string,
  platform: Platform,
  periodMonth: string,
  v: { adsSpend?: number; creatorsBooked?: number; affiliateGmv?: number; note?: string }
): Promise<MonthFeeInputs> {
  const { data, error } = await supabase
    .from("brand_month_fee_inputs")
    .upsert(
      { brand_id: brandId, platform, period_month: periodMonth, ads_spend: v.adsSpend ?? null, creators_booked: v.creatorsBooked ?? null, affiliate_gmv: v.affiliateGmv ?? null, note: v.note ?? "" },
      { onConflict: "brand_id,platform,period_month" }
    )
    .select()
    .single();
  if (error) throw error;
  return inputsFromDb(data as DbMonthInputs);
}

// ---- điều khoản về người ----
interface DbRule {
  id: string;
  brand_id: string;
  talent_id: string;
  rule: TalentRuleKind;
  note: string | null;
}

const ruleFromDb = (r: DbRule): BrandTalentRule => ({ id: r.id, brandId: r.brand_id, talentId: r.talent_id, rule: r.rule, note: r.note ?? undefined });

export async function fetchTalentRules(): Promise<BrandTalentRule[] | null> {
  const { data, error } = await supabase.from("brand_talent_rules").select("*");
  if (error) {
    if (missing(error)) return null;
    throw error;
  }
  return ((data as DbRule[]) ?? []).map(ruleFromDb);
}

export async function upsertTalentRule(brandId: string, talentId: string, rule: TalentRuleKind, note = ""): Promise<BrandTalentRule> {
  const { data, error } = await supabase
    .from("brand_talent_rules")
    .upsert({ brand_id: brandId, talent_id: talentId, rule, note }, { onConflict: "brand_id,talent_id" })
    .select()
    .single();
  if (error) throw error;
  return ruleFromDb(data as DbRule);
}

export async function deleteTalentRule(id: string): Promise<void> {
  const { error } = await supabase.from("brand_talent_rules").delete().eq("id", id);
  if (error) throw error;
}
