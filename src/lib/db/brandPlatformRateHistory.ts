import { supabase } from "../supabaseClient";
import { BrandPlatformRateHistoryEntry } from "../../types";

interface DbBrandPlatformRateHistoryEntry {
  id: string;
  brand_id: string;
  platform: BrandPlatformRateHistoryEntry["platform"];
  rate_per_hour: number;
  effective_from: string;
  effective_to: string | null;
}

function fromDb(row: DbBrandPlatformRateHistoryEntry): BrandPlatformRateHistoryEntry {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    ratePerHour: row.rate_per_hour,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined
  };
}

// Read-only from the client — same reasoning as talentRateHistory.ts: written exclusively by
// the DB trigger (migration 0018) whenever brand_platform_rates.rate_per_hour changes.
export async function fetchBrandPlatformRateHistory(): Promise<BrandPlatformRateHistoryEntry[]> {
  const { data, error } = await supabase
    .from("brand_platform_rate_history")
    .select("*")
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return (data as DbBrandPlatformRateHistoryEntry[]).map(fromDb);
}
