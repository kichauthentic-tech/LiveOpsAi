import { supabase } from "../supabaseClient";
import { AgencyProject } from "../../types";

// `users`/profiles is a real Supabase table now (Phase 4) and the team-lead picker in
// CrmProjects.tsx only offers real profile IDs, so a plain empty-string-to-null
// coercion is enough — no more UUID sniffing needed (see Phase 5 in PROJECT_STATUS.md).
const orNull = (v: string | undefined | null) => (v ? v : null);

interface DbAgencyProject {
  id: string;
  name: string;
  brand_id: string | null;
  budget: number;
  kpi_gmv: number;
  actual_gmv: number;
  start_date: string | null;
  end_date: string | null;
  status: AgencyProject["status"];
  total_sessions_planned: number;
  team_lead: string;
  team_lead_user_id: string | null;
}

function fromDb(row: DbAgencyProject, brandName: string): AgencyProject {
  return {
    id: row.id,
    name: row.name,
    brandId: row.brand_id ?? "",
    brandName,
    budget: row.budget,
    kpiGmv: row.kpi_gmv,
    actualGmv: row.actual_gmv,
    startDate: row.start_date ?? "",
    endDate: row.end_date ?? "",
    status: row.status,
    totalSessionsPlanned: row.total_sessions_planned,
    sessionsCompleted: 0, // computed client-side from the sessions list
    teamLead: row.team_lead,
    teamLeadUserId: row.team_lead_user_id ?? undefined
  };
}

function toDb(p: AgencyProject) {
  return {
    name: p.name,
    brand_id: p.brandId || null,
    budget: p.budget,
    kpi_gmv: p.kpiGmv,
    actual_gmv: p.actualGmv,
    start_date: p.startDate || null,
    end_date: p.endDate || null,
    status: p.status,
    total_sessions_planned: p.totalSessionsPlanned,
    team_lead: p.teamLead,
    team_lead_user_id: orNull(p.teamLeadUserId)
  };
}

export async function fetchProjects(): Promise<AgencyProject[]> {
  const { data, error } = await supabase
    .from("agency_projects")
    .select("*, brands(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as (DbAgencyProject & { brands: { name: string } | null })[]).map((row) =>
    fromDb(row, row.brands?.name ?? "")
  );
}

export async function createProject(p: AgencyProject): Promise<AgencyProject> {
  const { data, error } = await supabase
    .from("agency_projects")
    .insert(toDb(p))
    .select("*, brands(name)")
    .single();
  if (error) throw error;
  const row = data as DbAgencyProject & { brands: { name: string } | null };
  return fromDb(row, row.brands?.name ?? p.brandName);
}

export async function updateProject(p: AgencyProject): Promise<AgencyProject> {
  const { data, error } = await supabase
    .from("agency_projects")
    .update(toDb(p))
    .eq("id", p.id)
    .select("*, brands(name)")
    .single();
  if (error) throw error;
  const row = data as DbAgencyProject & { brands: { name: string } | null };
  return fromDb(row, row.brands?.name ?? p.brandName);
}

export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from("agency_projects").delete().eq("id", id);
  if (error) throw error;
}
