import { supabase } from "../supabaseClient";
import { SessionFinance } from "../../types";

interface DbSessionFinance {
  session_id: string;
  agency_commission_rate: number;
  studio_cost: number;
  ads_cost: number;
  host_fix_rate_override: number | null;
  host_commission_rate_override: number | null;
  approval_status: SessionFinance["approvalStatus"];
  approved_by: string | null;
  approved_at: string | null;
  notes: string | null;
}

function fromDb(row: DbSessionFinance): SessionFinance {
  return {
    sessionId: row.session_id,
    agencyCommissionRate: row.agency_commission_rate,
    studioCost: row.studio_cost,
    adsCost: row.ads_cost,
    hostFixRateOverride: row.host_fix_rate_override ?? undefined,
    hostCommissionRateOverride: row.host_commission_rate_override ?? undefined,
    approvalStatus: row.approval_status,
    approvedByUserId: row.approved_by ?? undefined,
    approvedAt: row.approved_at ?? undefined,
    notes: row.notes ?? ""
  };
}

// session_finance is a sidecar 1-row-per-session table (like rolePermissions' 1-row-per-role) —
// rows are upserted, never freely created/deleted independent of their live_session.
export async function fetchSessionFinances(): Promise<SessionFinance[]> {
  const { data, error } = await supabase.from("session_finance").select("*");
  if (error) throw error;
  return (data as DbSessionFinance[]).map(fromDb);
}

export async function upsertSessionFinance(
  sessionId: string,
  patch: Partial<Omit<SessionFinance, "sessionId" | "approvalStatus" | "approvedByUserId" | "approvedAt">>
): Promise<SessionFinance> {
  const row: Record<string, unknown> = { session_id: sessionId, updated_at: new Date().toISOString() };
  if (patch.agencyCommissionRate !== undefined) row.agency_commission_rate = patch.agencyCommissionRate;
  if (patch.studioCost !== undefined) row.studio_cost = patch.studioCost;
  if (patch.adsCost !== undefined) row.ads_cost = patch.adsCost;
  if (patch.hostFixRateOverride !== undefined) row.host_fix_rate_override = patch.hostFixRateOverride;
  if (patch.hostCommissionRateOverride !== undefined) row.host_commission_rate_override = patch.hostCommissionRateOverride;
  if (patch.notes !== undefined) row.notes = patch.notes;

  const { data, error } = await supabase
    .from("session_finance")
    .upsert(row, { onConflict: "session_id" })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbSessionFinance);
}

// `approved_by`/`approved_at` are no longer set from here — a DB trigger (migration 0008)
// derives them from the caller's own auth.uid() whenever approval_status changes, so a client
// can no longer attribute an approval to an arbitrary user id.
export async function setSessionFinanceApproval(
  sessionId: string,
  approvalStatus: SessionFinance["approvalStatus"]
): Promise<SessionFinance> {
  const { data, error } = await supabase
    .from("session_finance")
    .upsert(
      {
        session_id: sessionId,
        approval_status: approvalStatus,
        updated_at: new Date().toISOString()
      },
      { onConflict: "session_id" }
    )
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbSessionFinance);
}
