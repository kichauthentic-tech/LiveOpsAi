import { supabase } from "../supabaseClient";
import { SkuPlatformPrice } from "../../types";

interface DbSkuPlatformPrice {
  id: string;
  brand_id: string;
  sku_code: string;
  sku_name: string;
  platform: SkuPlatformPrice["platform"];
  rrp: number;
  markdown_price: number;
  is_eol: boolean;
  imported_at: string;
  created_by: string | null;
}

function fromDb(row: DbSkuPlatformPrice): SkuPlatformPrice {
  return {
    id: row.id,
    brandId: row.brand_id,
    skuCode: row.sku_code,
    skuName: row.sku_name,
    platform: row.platform,
    rrp: row.rrp,
    markdownPrice: row.markdown_price,
    isEol: row.is_eol,
    importedAt: row.imported_at,
    createdBy: row.created_by ?? undefined
  };
}

export async function fetchSkuPlatformPrices(): Promise<SkuPlatformPrice[]> {
  const { data, error } = await supabase.from("sku_platform_prices").select("*").order("sku_name", { ascending: true });
  if (error) throw error;
  return (data as DbSkuPlatformPrice[]).map(fromDb);
}

// Thay thế toàn bộ danh sách giá hiện tại của 1 brand bằng dữ liệu vừa parse từ file Excel —
// snapshot mới nhất, tránh tích luỹ dữ liệu cũ trùng SKU qua nhiều lần upload.
export async function importSkuPlatformPrices(
  brandId: string,
  rows: Array<Pick<SkuPlatformPrice, "skuCode" | "skuName" | "platform" | "rrp" | "markdownPrice" | "isEol">>,
  createdBy?: string
): Promise<SkuPlatformPrice[]> {
  const { error: deleteError } = await supabase.from("sku_platform_prices").delete().eq("brand_id", brandId);
  if (deleteError) throw deleteError;

  if (rows.length === 0) return [];

  const importedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("sku_platform_prices")
    .insert(
      rows.map((r) => ({
        brand_id: brandId,
        sku_code: r.skuCode,
        sku_name: r.skuName,
        platform: r.platform,
        rrp: r.rrp,
        markdown_price: r.markdownPrice,
        is_eol: r.isEol,
        imported_at: importedAt,
        created_by: createdBy ?? null
      }))
    )
    .select();
  if (error) throw error;
  return (data as DbSkuPlatformPrice[]).map(fromDb);
}

export async function deleteSkuPlatformPrice(id: string): Promise<void> {
  const { error } = await supabase.from("sku_platform_prices").delete().eq("id", id);
  if (error) throw error;
}
