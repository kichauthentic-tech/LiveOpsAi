import { supabase } from "../supabaseClient";
import type { PersonCap } from "../roster/monthPlanner";

// Giờ cam kết theo tháng (0223) = trần giờ của người trong tháng. Bảng chưa có (migration chưa chạy) ⇒ fetch trả null, màn hình dùng bản
// lưu theo trình duyệt như trước.
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);
export const commitmentsTableMissing = (e: unknown) => TABLE_MISSING.has((e as { code?: string })?.code ?? "");

interface DbRow {
  talent_id: string;
  max_hours: number | string;
  first_half_max: number | string | null;
  note: string | null;
}
export interface CommitmentRow {
  talentId: string;
  maxHours: number;
  firstHalfMax?: number;
  note?: string;
}

export const capsOf = (rows: readonly CommitmentRow[]): Record<string, PersonCap> =>
  Object.fromEntries(rows.map((r) => [r.talentId, { monthMax: r.maxHours, ...(r.firstHalfMax !== undefined ? { firstHalfMax: r.firstHalfMax } : {}) }]));

export async function fetchMonthCommitments(month: string): Promise<CommitmentRow[] | null> {
  const { data, error } = await supabase.from("talent_month_commitments").select("talent_id,max_hours,first_half_max,note").eq("month", month);
  if (error) {
    if (commitmentsTableMissing(error)) return null;
    throw error;
  }
  return ((data as DbRow[]) ?? []).map((r) => ({
    talentId: r.talent_id,
    maxHours: Number(r.max_hours),
    firstHalfMax: r.first_half_max === null ? undefined : Number(r.first_half_max),
    note: r.note ?? ""
  }));
}

export async function upsertMonthCommitments(month: string, rows: readonly CommitmentRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from("talent_month_commitments").upsert(
    rows.map((r) => ({ month, talent_id: r.talentId, max_hours: r.maxHours, first_half_max: r.firstHalfMax ?? null, note: r.note ?? "", updated_at: new Date().toISOString() })),
    { onConflict: "month,talent_id" }
  );
  if (error) throw error;
}

export async function deleteMonthCommitment(month: string, talentId: string): Promise<void> {
  const { error } = await supabase.from("talent_month_commitments").delete().eq("month", month).eq("talent_id", talentId);
  if (error) throw error;
}
