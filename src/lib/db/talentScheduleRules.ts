import { supabase } from "../supabaseClient";
import { DAY_KINDS, type DayKind, type PersonRule, type RuleClause } from "../roster/placementRules";

// Quy luật đặt giờ từng người (0224). Bảng chưa có (migration chưa chạy) ⇒ fetch trả null, màn hình dùng bản lưu theo trình duyệt.
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);
export const scheduleRulesTableMissing = (e: unknown) => TABLE_MISSING.has((e as { code?: string })?.code ?? "");

interface DbRow {
  talent_id: string;
  clauses: unknown;
  night: boolean | null;
  note: string | null;
}

/** Đọc `clauses` an toàn: bỏ mọi thứ không đúng dạng thay vì làm hỏng cả màn hình. */
export function cleanClauses(raw: unknown): RuleClause[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleClause[] = [];
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const o = c as { brandId?: unknown; days?: unknown };
    const days = Array.isArray(o.days) ? (o.days.filter((d): d is DayKind => (DAY_KINDS as readonly unknown[]).includes(d)) as DayKind[]) : [];
    out.push({ ...(typeof o.brandId === "string" && o.brandId ? { brandId: o.brandId } : {}), days: [...new Set(days)] });
  }
  return out;
}

export async function fetchScheduleRules(): Promise<PersonRule[] | null> {
  const { data, error } = await supabase.from("talent_schedule_rules").select("talent_id,clauses,night,note");
  if (error) {
    if (scheduleRulesTableMissing(error)) return null;
    throw error;
  }
  return ((data as DbRow[]) ?? []).map((r) => ({ talentId: r.talent_id, clauses: cleanClauses(r.clauses), night: !!r.night, note: r.note ?? "" }));
}

export async function upsertScheduleRules(rows: readonly PersonRule[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("talent_schedule_rules").upsert(
    rows.map((r) => ({ talent_id: r.talentId, clauses: r.clauses, night: r.night, note: r.note ?? "", updated_at: new Date().toISOString() })),
    { onConflict: "talent_id" }
  );
  if (error) throw error;
}

export async function deleteScheduleRule(talentId: string): Promise<void> {
  const { error } = await supabase.from("talent_schedule_rules").delete().eq("talent_id", talentId);
  if (error) throw error;
}
