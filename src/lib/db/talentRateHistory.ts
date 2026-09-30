import { supabase } from "../supabaseClient";
import { fetchAllPages } from "./fetchAllPages";
import { TalentRateHistoryEntry } from "../../types";

interface DbTalentRateHistoryEntry {
  id: string;
  talent_id: string;
  rate_per_session: number;
  rate_per_hour: number;
  assistant_rate_per_hour: number | null;
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
    assistantRatePerHour: row.assistant_rate_per_hour ?? 0,
    commissionRate: row.commission_rate,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? undefined
  };
}

// Read-only from the client: rows are written exclusively by the DB trigger
// (migration 0018) whenever talents.rate_per_session/rate_per_hour/commission_rate changes —
// including manual SQL edits, not just app writes via talents.ts.
export async function fetchTalentRateHistory(): Promise<TalentRateHistoryEntry[]> {
  // Bảng chỉ ghi thêm (trigger DB ghi mỗi lần đổi rate). Xem src/lib/db/fetchAllPages.ts.
  const rows = await fetchAllPages<DbTalentRateHistoryEntry>((from, to) =>
    supabase
      .from("talent_rate_history")
      .select("*")
      .order("effective_from", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map(fromDb);
}
