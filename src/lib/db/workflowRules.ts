import { supabase } from "../supabaseClient";
import { WorkflowRule } from "../../types";

interface DbWorkflowRule {
  id: string;
  name: string;
  trigger_desc: string;
  action_desc: string;
  enabled: boolean;
  last_run: string | null;
  executions_count: number;
}

function fromDb(row: DbWorkflowRule): WorkflowRule {
  return {
    id: row.id,
    name: row.name,
    trigger: row.trigger_desc,
    action: row.action_desc,
    enabled: row.enabled,
    lastRun: row.last_run ?? undefined,
    executionsCount: row.executions_count
  };
}

function toDb(r: WorkflowRule) {
  return {
    name: r.name,
    trigger_desc: r.trigger,
    action_desc: r.action,
    enabled: r.enabled,
    last_run: r.lastRun || null,
    executions_count: r.executionsCount ?? 0
  };
}

export async function fetchWorkflowRules(): Promise<WorkflowRule[]> {
  const { data, error } = await supabase.from("workflow_rules").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data as DbWorkflowRule[]).map(fromDb);
}

export async function createWorkflowRule(r: WorkflowRule): Promise<WorkflowRule> {
  const { data, error } = await supabase.from("workflow_rules").insert(toDb(r)).select().single();
  if (error) throw error;
  return fromDb(data as DbWorkflowRule);
}

export async function updateWorkflowRule(r: WorkflowRule): Promise<WorkflowRule> {
  const { data, error } = await supabase.from("workflow_rules").update(toDb(r)).eq("id", r.id).select().single();
  if (error) throw error;
  return fromDb(data as DbWorkflowRule);
}

export async function deleteWorkflowRule(id: string): Promise<void> {
  const { error } = await supabase.from("workflow_rules").delete().eq("id", id);
  if (error) throw error;
}
