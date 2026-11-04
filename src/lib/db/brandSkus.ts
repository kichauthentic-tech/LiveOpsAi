import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { BrandSku } from "../../types";
import { platformOf } from "../reportPlatform";

interface DbBrandSku {
  id: string;
  brand_id: string;
  platform: BrandSku["platform"];
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
    platform: row.platform,
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

// PostgREST cắt im lặng ở 1.000 dòng — sau khi nhập danh mục từ file Sản Phẩm (CROCS ~830 SKU, cộng các brand khác > 1.000) nên PHẢI
// đọc theo trang, nếu không SKU xếp cuối (đang ghim trong giỏ live) biến mất khỏi màn.
export async function fetchBrandSkus(): Promise<BrandSku[]> {
  const PAGE = 1000;
  const out: BrandSku[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("brand_skus")
      .select("*")
      .order("pin_order", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data as DbBrandSku[]).map(fromDb));
    if (data.length < PAGE) return out;
  }
}

export async function createBrandSku(
  sku: Pick<BrandSku, "brandId" | "name" | "skuCode" | "flashPrice" | "originalPrice"> & { platform?: BrandSku["platform"]; createdBy?: string }
): Promise<BrandSku> {
  const { data, error } = await supabase
    .from("brand_skus")
    .insert({
      brand_id: sku.brandId,
      platform: platformOf({ platform: sku.platform }),
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

/** Nhập hàng loạt từ dữ liệu đã tải. Khoá duy nhất (brand, sàn, tên) ⇒ SKU đã có thì bỏ qua, chạy lại không sinh dòng trùng. */
export async function importBrandSkus(
  skus: Pick<BrandSku, "brandId" | "platform" | "name" | "flashPrice">[],
  createdBy?: string
): Promise<BrandSku[]> {
  const out: BrandSku[] = [];
  for (let i = 0; i < skus.length; i += 400) {
    const { data, error } = await supabase
      .from("brand_skus")
      .upsert(
        skus.slice(i, i + 400).map((s) => ({
          brand_id: s.brandId,
          platform: s.platform,
          name: s.name,
          flash_price: s.flashPrice,
          created_by: createdBy ?? null
        })),
        { onConflict: "brand_id,platform,name", ignoreDuplicates: true }
      )
      .select();
    if (error) throw error;
    out.push(...(data as DbBrandSku[]).map(fromDb));
  }
  return out;
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
  const { data, error } = await supabase.from("brand_skus").delete().eq("id", id).select("id");
  if (error) throw error;
  assertAffected(data, "xoá SKU");
}
