import { supabase } from "../supabaseClient";
import { ProductSample } from "../../types";

interface DbProductSample {
  id: string;
  brand_id: string;
  studio_id: string | null;
  product_name: string;
  sample_code: string;
  quantity: number;
  status: ProductSample["status"];
  location_note: string;
  notes: string;
  created_by: string | null;
}

function fromDb(row: DbProductSample): ProductSample {
  return {
    id: row.id,
    brandId: row.brand_id,
    studioId: row.studio_id ?? undefined,
    productName: row.product_name,
    sampleCode: row.sample_code,
    quantity: row.quantity,
    status: row.status,
    locationNote: row.location_note,
    notes: row.notes,
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchProductSamples(): Promise<ProductSample[]> {
  const { data, error } = await supabase.from("product_samples").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbProductSample[]).map(fromDb);
}

export async function createProductSample(
  sample: Pick<ProductSample, "brandId" | "productName" | "sampleCode" | "quantity"> & { studioId?: string; createdBy?: string }
): Promise<ProductSample> {
  const { data, error } = await supabase
    .from("product_samples")
    .insert({
      brand_id: sample.brandId,
      studio_id: sample.studioId ?? null,
      product_name: sample.productName,
      sample_code: sample.sampleCode,
      quantity: sample.quantity,
      created_by: sample.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbProductSample);
}

export async function updateProductSample(
  id: string,
  patch: Partial<Pick<ProductSample, "studioId" | "productName" | "sampleCode" | "quantity" | "status" | "locationNote" | "notes">>
): Promise<ProductSample> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.studioId !== undefined) row.studio_id = patch.studioId ?? null;
  if (patch.productName !== undefined) row.product_name = patch.productName;
  if (patch.sampleCode !== undefined) row.sample_code = patch.sampleCode;
  if (patch.quantity !== undefined) row.quantity = patch.quantity;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.locationNote !== undefined) row.location_note = patch.locationNote;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await supabase.from("product_samples").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbProductSample);
}

export async function deleteProductSample(id: string): Promise<void> {
  const { error } = await supabase.from("product_samples").delete().eq("id", id);
  if (error) throw error;
}
