import { supabase } from "../supabaseClient";
import { cleanDayKinds, emptyMonthRule, type BrandRule, type MonthRule, type NightRule, type RuleRole } from "../roster/monthRules";

// Luật đặt giờ theo tháng × người × vai (0229). Bảng chưa có (migration chưa chạy) ⇒ fetch trả null, hook dùng bản lưu theo trình duyệt.
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);
export const monthRulesTableMissing = (e: unknown) => TABLE_MISSING.has((e as { code?: string })?.code ?? "");

interface DbRow {
  month: string;
  talent_id: string;
  role: string;
  max_hours: number | string | null;
  first_half_max: number | string | null;
  role_hours: number | string | null;
  day_kinds: unknown;
  night: string | null;
  brand_rules: unknown;
  lane_hours: unknown;
  note: string | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const asNight = (v: unknown): NightRule | null => (v === "any" || v === "only" || v === "no" ? v : null);

/** Đọc JSON an toàn: bỏ mọi thứ sai dạng thay vì làm hỏng cả màn hình. */
export function cleanBrandRules(raw: unknown): Record<string, BrandRule> {
  const out: Record<string, BrandRule> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as { hours?: unknown; days?: unknown; night?: unknown };
    out[id] = { hours: o.hours === "x" ? "x" : num(o.hours), days: Array.isArray(o.days) ? cleanDayKinds(o.days) : null, night: asNight(o.night) };
  }
  return out;
}
export function cleanLanes(raw: unknown): Record<string, number | "x"> {
  const out: Record<string, number | "x"> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === "x") out[k] = "x";
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

export function fromRow(r: DbRow): MonthRule {
  const role: RuleRole = r.role === "assistant" ? "assistant" : "host";
  return {
    ...emptyMonthRule(r.month, r.talent_id, role),
    maxHours: num(r.max_hours),
    firstHalfMax: num(r.first_half_max),
    roleHours: num(r.role_hours),
    dayKinds: cleanDayKinds(r.day_kinds),
    night: asNight(r.night) ?? "any",
    brands: cleanBrandRules(r.brand_rules),
    lanes: cleanLanes(r.lane_hours),
    note: r.note ?? ""
  };
}
const toRow = (r: MonthRule) => ({
  month: r.month,
  talent_id: r.talentId,
  role: r.role,
  max_hours: r.maxHours,
  first_half_max: r.firstHalfMax,
  role_hours: r.roleHours,
  day_kinds: r.dayKinds,
  night: r.night,
  brand_rules: r.brands,
  lane_hours: r.lanes,
  note: r.note,
  updated_at: new Date().toISOString()
});

export async function fetchMonthRules(month: string): Promise<MonthRule[] | null> {
  const { data, error } = await supabase.from("talent_month_rules").select("month,talent_id,role,max_hours,first_half_max,role_hours,day_kinds,night,brand_rules,lane_hours,note").eq("month", month).limit(2000);
  if (error) {
    if (monthRulesTableMissing(error)) return null;
    throw error;
  }
  return ((data as DbRow[]) ?? []).map(fromRow);
}

export async function upsertMonthRules(rows: readonly MonthRule[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("talent_month_rules").upsert(rows.map(toRow), { onConflict: "month,talent_id,role" });
  if (error) throw error;
}

export async function deleteMonthRule(month: string, talentId: string, role: RuleRole): Promise<void> {
  const { error } = await supabase.from("talent_month_rules").delete().eq("month", month).eq("talent_id", talentId).eq("role", role);
  if (error) throw error;
}
