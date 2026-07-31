import { supabase } from "../supabaseClient";
import { BrandPlatformRate } from "../../types";

interface DbBrandPlatformRate {
  id: string;
  brand_id: string;
  platform: BrandPlatformRate["platform"];
  rate_per_hour: number;
}

function fromDb(row: DbBrandPlatformRate): BrandPlatformRate {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    ratePerHour: row.rate_per_hour
  };
}

export async function fetchBrandPlatformRates(): Promise<BrandPlatformRate[]> {
  const { data, error } = await supabase.from("brand_platform_rates").select("*");
  if (error) throw error;
  return (data as DbBrandPlatformRate[]).map(fromDb);
}

// One row per (brand, platform) — upsert instead of separate create/update, same
// reasoning as rolePermissions.ts: the set of valid keys is bounded, not free-form.
export async function upsertBrandPlatformRate(
  brandId: string,
  platform: BrandPlatformRate["platform"],
  ratePerHour: number
): Promise<BrandPlatformRate> {
  const { data, error } = await supabase
    .from("brand_platform_rates")
    .upsert({ brand_id: brandId, platform, rate_per_hour: ratePerHour }, { onConflict: "brand_id,platform" })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbBrandPlatformRate);
}

export async function deleteBrandPlatformRate(id: string): Promise<void> {
  const { error } = await supabase.from("brand_platform_rates").delete().eq("id", id);
  if (error) throw error;
}
