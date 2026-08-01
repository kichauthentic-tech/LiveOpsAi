import { supabase } from "../supabaseClient";
import { MonthlyClose } from "../../types";

interface DbMonthlyClose {
  month: string;
  status: MonthlyClose["status"];
  locked_by: string | null;
  locked_at: string | null;
  notes: string;
}

function fromDb(row: DbMonthlyClose): MonthlyClose {
  return {
    month: row.month,
    status: row.status,
    lockedByUserId: row.locked_by ?? undefined,
    lockedAt: row.locked_at ?? undefined,
    notes: row.notes
  };
}

// monthly_closes is a sidecar table keyed by month (1 row per "YYYY-MM" once touched) — rows are
// upserted, never freely created/deleted, same pattern as session_finance/role_permissions.
export async function fetchMonthlyCloses(): Promise<MonthlyClose[]> {
  const { data, error } = await supabase.from("monthly_closes").select("*");
  if (error) throw error;
  return (data as DbMonthlyClose[]).map(fromDb);
}

export async function closeMonth(month: string, notes: string, lockedByUserId?: string): Promise<MonthlyClose> {
  const { data, error } = await supabase
    .from("monthly_closes")
    .upsert(
      {
        month,
        status: "locked",
        notes,
        locked_by: lockedByUserId ?? null,
        locked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: "month" }
    )
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbMonthlyClose);
}

export async function reopenMonth(month: string): Promise<MonthlyClose> {
  const { data, error } = await supabase
    .from("monthly_closes")
    .upsert(
      {
        month,
        status: "open",
        locked_by: null,
        locked_at: null,
        updated_at: new Date().toISOString()
      },
      { onConflict: "month" }
    )
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbMonthlyClose);
}
