import { supabase } from "../supabaseClient";
import type { TalentBrandRole, TalentBrandRoleKind } from "../roster/talentBrandRoles";

// Vai được xếp theo brand (0221). Bảng chưa có (migration chưa chạy) ⇒ fetch trả null, app giữ cách xếp cũ.
const TABLE_MISSING = new Set(["PGRST205", "42P01"]);
const missing = (e: unknown) => TABLE_MISSING.has((e as { code?: string })?.code ?? "");

interface DbRow {
  id: string;
  talent_id: string;
  brand_id: string;
  role: TalentBrandRoleKind;
}
const fromDb = (r: DbRow): TalentBrandRole => ({ id: r.id, talentId: r.talent_id, brandId: r.brand_id, role: r.role });

export async function fetchTalentBrandRoles(): Promise<TalentBrandRole[] | null> {
  const { data, error } = await supabase.from("talent_brand_roles").select("*");
  if (error) {
    if (missing(error)) return null;
    throw error;
  }
  return ((data as DbRow[]) ?? []).map(fromDb);
}

/** Ghi nhiều brand một lần cho một talent (đặt nhanh). */
export async function upsertTalentBrandRoles(talentId: string, rows: { brandId: string; role: TalentBrandRoleKind }[]): Promise<TalentBrandRole[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from("talent_brand_roles")
    .upsert(rows.map((r) => ({ talent_id: talentId, brand_id: r.brandId, role: r.role })), { onConflict: "talent_id,brand_id" })
    .select();
  if (error) throw error;
  return ((data as DbRow[]) ?? []).map(fromDb);
}

export async function deleteTalentBrandRole(id: string): Promise<void> {
  const { error } = await supabase.from("talent_brand_roles").delete().eq("id", id);
  if (error) throw error;
}
