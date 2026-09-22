import { supabase } from "../supabaseClient";
import { assertAffected } from "./assertAffected";
import { BrandStudio } from "../../types";

interface DbBrandStudio {
  brand_id: string;
  platform: BrandStudio["platform"];
  studio_id: string;
}

const fromDb = (r: DbBrandStudio): BrandStudio => ({ brandId: r.brand_id, platform: r.platform, studioId: r.studio_id });

export async function fetchBrandStudios(): Promise<BrandStudio[]> {
  const { data, error } = await supabase.from("brand_studios").select("brand_id, platform, studio_id");
  if (error) throw error;
  return (data as DbBrandStudio[]).map(fromDb);
}

// Một dòng mỗi (brand, nền tảng) — upsert như brandPlatformRates.ts. studioId rỗng = bỏ phòng mặc định.
export async function setBrandStudio(brandId: string, platform: BrandStudio["platform"], studioId: string): Promise<void> {
  if (!studioId) {
    const { data, error } = await supabase
      .from("brand_studios")
      .delete()
      .eq("brand_id", brandId)
      .eq("platform", platform)
      .select("brand_id");
    if (error) throw error;
    assertAffected(data, "bỏ gán phòng live");
    return;
  }
  const { error } = await supabase
    .from("brand_studios")
    .upsert({ brand_id: brandId, platform, studio_id: studioId }, { onConflict: "brand_id,platform" });
  if (error) throw error;
}

export const findBrandStudioId = (list: BrandStudio[], brandId: string, platform: BrandStudio["platform"] = "TikTok") =>
  list.find((b) => b.brandId === brandId && b.platform === platform)?.studioId ?? "";
