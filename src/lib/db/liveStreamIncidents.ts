import { supabase } from "../supabaseClient";
import { LiveStreamIncident } from "../../types";

interface DbLiveStreamIncident {
  id: string;
  session_id: string;
  category: LiveStreamIncident["category"];
  severity: LiveStreamIncident["severity"];
  description: string;
  resolution: string;
  status: LiveStreamIncident["status"];
  reported_by: string | null;
}

function fromDb(row: DbLiveStreamIncident): LiveStreamIncident {
  return {
    id: row.id,
    sessionId: row.session_id,
    category: row.category,
    severity: row.severity,
    description: row.description,
    resolution: row.resolution,
    status: row.status,
    reportedBy: row.reported_by ?? undefined
  };
}

export async function fetchLiveStreamIncidents(): Promise<LiveStreamIncident[]> {
  const { data, error } = await supabase.from("live_stream_incidents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbLiveStreamIncident[]).map(fromDb);
}

export async function createLiveStreamIncident(
  incident: Pick<LiveStreamIncident, "sessionId" | "category" | "severity" | "description"> & { reportedBy?: string }
): Promise<LiveStreamIncident> {
  const { data, error } = await supabase
    .from("live_stream_incidents")
    .insert({
      session_id: incident.sessionId,
      category: incident.category,
      severity: incident.severity,
      description: incident.description,
      reported_by: incident.reportedBy ?? null
    })
    .select()
    .single();
  if (error) throw error;
  return fromDb(data as DbLiveStreamIncident);
}

export async function updateLiveStreamIncident(
  id: string,
  patch: Partial<Pick<LiveStreamIncident, "category" | "severity" | "description" | "resolution" | "status">>
): Promise<LiveStreamIncident> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.severity !== undefined) row.severity = patch.severity;
  if (patch.description !== undefined) row.description = patch.description;
  if (patch.resolution !== undefined) row.resolution = patch.resolution;
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await supabase.from("live_stream_incidents").update(row).eq("id", id).select().single();
  if (error) throw error;
  return fromDb(data as DbLiveStreamIncident);
}

export async function deleteLiveStreamIncident(id: string): Promise<void> {
  const { error } = await supabase.from("live_stream_incidents").delete().eq("id", id);
  if (error) throw error;
}
