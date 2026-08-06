import { supabase } from "../supabaseClient";
import { BrandSku } from "../../types";

interface DbBrandSku {
  id: string;
  brand_id: string;
  name: string;
  sku_code: string;
  flash_price: number;
  original_price: number;
  is_hero: boolean;
  pin_order: number;
  clearance_rate: number;
  status: BrandSku["status"];
  notes: string;
  created_by: string | null;
}

function fromDb(row: DbBrandSku): BrandSku {
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    skuCode: row.sku_code,
    flashPrice: row.flash_price,
    originalPrice: row.original_price,
    isHero: row.is_hero,
    pinOrder: row.pin_order,
    clearanceRate: row.clearance_rate,
    status: row.status,
    notes: row.notes,
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchBrandSkus(): Promise<BrandSku[]> {
  const { data, error } = await supabase.from("brand_skus").select("*").order("pin_order", { ascending: true });
  if (error) throw error;
  return (data as DbBrandSku[]).map(fromDb);
}

export async function createBrandSku(
  sku: Pick<BrandSku, "brandId" | "name" | "skuCode" | "flashPrice" | "originalPrice"> & { createdBy?: string }
): Promise<BrandSku> {
  const { data, error } = await supabase
    .from("brand_skus")
    .insert({
      brand_id: sku.brandId,
      name: sku.name,
      sku_code: sku.skuCode,
      flash_price: sku.flashPrice,
      original_price: sku.originalPrice,
      created_by: sku.createdBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbBrandSku);
}

export async function updateBrandSku(
  id: string,
  patch: Partial<
    Pick<BrandSku, "name" | "skuCode" | "flashPrice" | "originalPrice" | "isHero" | "pinOrder" | "clearanceRate" | "status" | "notes">
  >
): Promise<BrandSku> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.skuCode !== undefined) row.sku_code = patch.skuCode;
  if (patch.flashPrice !== undefined) row.flash_price = patch.flashPrice;
  if (patch.originalPrice !== undefined) row.original_price = patch.originalPrice;
  if (patch.isHero !== undefined) row.is_hero = patch.isHero;
  if (patch.pinOrder !== undefined) row.pin_order = patch.pinOrder;
  if (patch.clearanceRate !== undefined) row.clearance_rate = patch.clearanceRate;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await supabase.from("brand_skus").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbBrandSku);
}

export async function deleteBrandSku(id: string): Promise<void> {
  const { error } = await supabase.from("brand_skus").delete().eq("id", id);
  if (error) throw error;
}
