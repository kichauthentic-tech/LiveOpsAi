import { supabase } from "../supabaseClient";
import { PromoScheme } from "../../types";

interface DbPromoScheme {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  brand_id: string | null;
  category: string;
  created_at: string;
}

function fromDb(row: DbPromoScheme): PromoScheme {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startDate: row.start_date,
    endDate: row.end_date,
    brandId: row.brand_id,
    category: row.category,
    createdAt: row.created_at
  };
}

export async function fetchPromoSchemes(): Promise<PromoScheme[]> {
  const { data, error } = await supabase.from("promo_schemes").select("*").order("start_date", { ascending: true });
  if (error) throw error;
  return (data as DbPromoScheme[]).map(fromDb);
}

export async function createPromoScheme(
  scheme: Pick<PromoScheme, "title" | "description" | "startDate" | "endDate"> &
    Partial<Pick<PromoScheme, "brandId" | "category">> & { createdBy?: string }
): Promise<PromoScheme> {
  const { data, error } = await supabase
    .from("promo_schemes")
    .insert({
      title: scheme.title,
      description: scheme.description,
      start_date: scheme.startDate,
      end_date: scheme.endDate,
      brand_id: scheme.brandId ?? null,
      category: scheme.category ?? "Chung",
      created_by: scheme.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbPromoScheme);
}

export async function updatePromoScheme(
  id: string,
  patch: Partial<Pick<PromoScheme, "title" | "description" | "startDate" | "endDate" | "category">>
): Promise<PromoScheme> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) row.title = patch.title;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.endDate !== undefined) row.end_date = patch.endDate;
  if (patch.category !== undefined) row.category = patch.category;

  const { data, error } = await supabase.from("promo_schemes").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbPromoScheme);
}

export async function deletePromoScheme(id: string): Promise<void> {
  const { error } = await supabase.from("promo_schemes").delete().eq("id", id);
  if (error) throw error;
}
