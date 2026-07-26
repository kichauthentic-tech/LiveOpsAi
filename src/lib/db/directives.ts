import { supabase } from "../supabaseClient";
import { StrategicDirective } from "../../types";

interface DbStrategicDirective {
  id: string;
  code: string;
  title: string;
  description: string;
  department: StrategicDirective["department"];
  assigned_role: StrategicDirective["assignedRole"];
  assignee_name: string;
  priority: StrategicDirective["priority"];
  target_kpi: string;
  deadline: string | null;
  status: StrategicDirective["status"];
  progress_percent: number;
  notes_from_lead: string | null;
  created_at: string;
}

function fromDb(row: DbStrategicDirective): StrategicDirective {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description ?? "",
    department: row.department,
    assignedRole: row.assigned_role,
    assigneeName: row.assignee_name ?? "",
    priority: row.priority,
    targetKpi: row.target_kpi ?? "",
    deadline: row.deadline ?? "",
    status: row.status,
    progressPercent: row.progress_percent ?? 0,
    notesFromLead: row.notes_from_lead ?? undefined,
    createdAt: row.created_at
  };
}

function toDb(d: StrategicDirective) {
  return {
    code: d.code,
    title: d.title,
    description: d.description ?? "",
    department: d.department,
    assigned_role: d.assignedRole,
    assignee_name: d.assigneeName ?? "",
    priority: d.priority,
    target_kpi: d.targetKpi ?? "",
    deadline: d.deadline || null,
    status: d.status,
    progress_percent: d.progressPercent ?? 0,
    notes_from_lead: d.notesFromLead || null
  };
}

export async function fetchDirectives(): Promise<StrategicDirective[]> {
  const { data, error } = await supabase.from("strategic_directives").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbStrategicDirective[]).map(fromDb);
}

export async function createDirective(d: StrategicDirective): Promise<StrategicDirective> {
  const { data, error } = await supabase.from("strategic_directives").insert(toDb(d)).select().single();
  if (error) throw error;
  return fromDb(data as DbStrategicDirective);
}

export async function updateDirective(d: StrategicDirective): Promise<StrategicDirective> {
  const { data, error } = await supabase.from("strategic_directives").update(toDb(d)).eq("id", d.id).select().single();
  if (error) throw error;
  return fromDb(data as DbStrategicDirective);
}

export async function deleteDirective(id: string): Promise<void> {
  const { error } = await supabase.from("strategic_directives").delete().eq("id", id);
  if (error) throw error;
}
