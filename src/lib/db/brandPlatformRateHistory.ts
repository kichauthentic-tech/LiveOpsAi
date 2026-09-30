import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { BrandPlatformRateHistoryEntry } from "../../types";

interface DbBrandPlatformRateHistoryEntry {
  id: string;
  brand_id: string;
  platform: BrandPlatformRateHistoryEntry["platform"];
  rate_per_hour: number;
  return_rate: number;
  commission_rate?: number | null;
  effective_from: string;
  effective_to: string | null;
}

function fromDb(row: DbBrandPlatformRateHistoryEntry): BrandPlatformRateHistoryEntry {
  return {
    id: row.id,
    brandId: row.brand_id,
    platform: row.platform,
    ratePerHour: row.rate_per_hour,
    returnRate: row.return_rate,
    commissionRate: row.commission_rate ?? undefined,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined
  };
}

// Read-only from the client — same reasoning as talentRateHistory.ts: written exclusively by
// the DB trigger (migration 0018) whenever brand_platform_rates.rate_per_hour changes.
export async function fetchBrandPlatformRateHistory(): Promise<BrandPlatformRateHistoryEntry[]> {
  // Bảng chỉ ghi thêm (trigger DB ghi mỗi lần đổi rate). Xem src/lib/db/fetchAllPages.ts.
  const rows = await fetchAllPages<DbBrandPlatformRateHistoryEntry>((from, to) =>
    supabase
      .from("brand_platform_rate_history")
      .select("*")
      .order("effective_from", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map(fromDb);
}
