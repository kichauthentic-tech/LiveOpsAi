import { supabase } from "../supabaseClient";
import { AuditLogEntry } from "../../types";

interface DbAuditLog {
  id: string;
  performed_by: string | null;
  performed_by_name: string;
  action: string;
  details: string;
  category: AuditLogEntry["category"];
  created_at: string;
}

function fromDb(row: DbAuditLog): AuditLogEntry {
  return {
    id: row.id,
    timestamp: row.created_at,
    performedBy: row.performed_by_name,
    action: row.action,
    details: row.details ?? "",
    category: row.category
  };
}

export interface CreateAuditLogInput {
  performedByUserId?: string;
  performedByName: string;
  action: string;
  details: string;
  category: AuditLogEntry["category"];
}

// Audit logs are an append-only trail — there is intentionally no update/delete here,
// unlike the 4-function CRUD pattern used for the other entities.
export async function fetchAuditLogs(): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase.from("audit_logs").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbAuditLog[]).map(fromDb);
}

export async function createAuditLog(input: CreateAuditLogInput): Promise<AuditLogEntry> {
  const { data, error } = await supabase
    .from("audit_logs")
    .insert({
      performed_by: input.performedByUserId || null,
      performed_by_name: input.performedByName,
      action: input.action,
      details: input.details ?? "",
      category: input.category
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbAuditLog);
}
