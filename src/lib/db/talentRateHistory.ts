import { supabase } from "../supabaseClient";
import { TalentRateHistoryEntry } from "../../types";

interface DbTalentRateHistoryEntry {
  id: string;
  talent_id: string;
  rate_per_session: number;
  rate_per_hour: number;
  commission_rate: number;
  effective_from: string;
  effective_to: string | null;
}

function fromDb(row: DbTalentRateHistoryEntry): TalentRateHistoryEntry {
  return {
    id: row.id,
    talentId: row.talent_id,
    ratePerSession: row.rate_per_session,
    ratePerHour: row.rate_per_hour ?? 0,
    commissionRate: row.commission_rate,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined
  };
}

// Read-only from the client: rows are written exclusively by the DB trigger
// (migration 0018) whenever talents.rate_per_session/rate_per_hour/commission_rate changes —
// including manual SQL edits, not just app writes via talents.ts.
export async function fetchTalentRateHistory(): Promise<TalentRateHistoryEntry[]> {
  const { data, error } = await supabase
    .from("talent_rate_history")
    .select("*")
    .order("effective_from", { ascending: true });
  if (error) throw error;
  return (data as DbTalentRateHistoryEntry[]).map(fromDb);
}
